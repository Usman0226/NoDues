#!/usr/bin/env node

/**
 * commitClassMerge.js — Commits approved class mergers into persistent Class documents
 * TRD Reference: TRD §5 Phase 3 (Step 3.3) | Constraints: NC-4, NC-5, NC-6, FR-B1 to FR-B4
 *
 * Enforces:
 *   1. Human Review Gate (NC-4): Only proposals marked "approved: true" are executed.
 *   2. Persistent Class Update (FR-B1): Updates primary class into the persistent document.
 *   3. Semester Subjects Archive (FR-B2, FR-B3): Populates semesterSubjects per semester.
 *   4. Referential Integrity (NC-6): Secondary classes marked isActive: false, mergedIntoClassId set.
 *   5. Student Relinking: Updates student.classId to the persistent primary class document.
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mongoose;
try {
  const serverMongoose = path.resolve(__dirname, '../server/node_modules/mongoose/index.js').replace(/\\/g, '/');
  const m = await import(`file:///${serverMongoose}`);
  mongoose = m.default || m;
} catch (e) {
  try {
    const m = await import('mongoose');
    mongoose = m.default || m;
  } catch (e2) {
    console.error('Error: Could not locate mongoose. Run npm install in ./server first.');
    process.exit(1);
  }
}

function getMongoUri() {
  if (process.argv[2] && !process.argv[2].startsWith('-')) {
    return process.argv[2];
  }
  const envPath = path.resolve(__dirname, '../server/.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('MONGODB_URI=') && !trimmed.startsWith('#')) {
        return trimmed.substring('MONGODB_URI='.length).trim();
      }
    }
  }
  return process.env.STAGING_URI || process.env.MONGODB_URI;
}

function redact(uri) {
  if (!uri) return '';
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
}

/**
 * Commits a single approved proposal or an array of proposals
 * @param {Object} db - MongoDB database connection
 * @param {Array<Object>} proposals - Array of proposals from proposed-class-merges.json
 * @returns {Promise<Object>}
 */
export async function executeClassMerges(db, proposals) {
  const classesColl = db.collection('classes');
  const studentsColl = db.collection('students');
  const migrationLogsColl = db.collection('migrationLogs');

  const approvedProposals = proposals.filter(p => p.approved === true);
  if (approvedProposals.length === 0) {
    throw new Error('NC-4 SAFETY HALT: No proposals marked "approved: true". Review and approve proposals in proposed-class-merges.json first.');
  }

  console.log(`Executing ${approvedProposals.length} approved class consolidation(s)...`);

  let totalClassesMerged = 0;
  let totalStudentsRelinked = 0;
  let totalSubjectsCataloged = 0;

  for (const proposal of approvedProposals) {
    const { canonicalName, primaryClassId, contributingClasses } = proposal;
    const primaryId = new mongoose.Types.ObjectId(primaryClassId);

    const primaryDoc = await classesColl.findOne({ _id: primaryId });
    if (!primaryDoc) {
      console.warn(`[CommitMerge] Warning: Primary class ${primaryClassId} not found. Skipping.`);
      continue;
    }

    // Determine current/highest semester across contributing classes
    const highestSemester = Math.max(
      ...contributingClasses.map(c => c.semester || 1)
    );

    // Initialize or load semesterSubjects map
    const semesterSubjectsMap = {};

    // Collect secondary class IDs for student relinking
    const secondaryClassIds = [];

    for (const contrib of contributingClasses) {
      const cId = new mongoose.Types.ObjectId(contrib.classId);
      const isPrimary = contrib.classId === primaryClassId;
      if (!isPrimary) {
        secondaryClassIds.push(cId);
      }

      const contributingDoc = await classesColl.findOne({ _id: cId });
      if (!contributingDoc) continue;

      const semNum = String(contributingDoc.semester || contrib.semester || 1);
      const isCurrentActive = (contributingDoc.semester || contrib.semester) === highestSemester;

      const rawSubjects = contributingDoc.subjectAssignments || [];
      const formattedSubjects = rawSubjects.map(s => ({
        subjectId: s.subjectId,
        subjectName: s.subjectName || '',
        subjectCode: s.subjectCode || '',
        facultyId: s.facultyId || null,
        facultyName: s.facultyName || null,
        source: s.source || 'cloned',
      }));

      totalSubjectsCataloged += formattedSubjects.length;

      semesterSubjectsMap[semNum] = {
        subjects: formattedSubjects,
        status: isCurrentActive ? 'active' : 'archived',
        setAt: contributingDoc.createdAt || new Date(),
        archivedAt: isCurrentActive ? null : new Date(),
      };
    }

    // Update primary class document to be the persistent section document (FR-B1 to FR-B4)
    await classesColl.updateOne(
      { _id: primaryId },
      {
        $set: {
          name: canonicalName,
          semester: highestSemester,
          semesterSubjects: semesterSubjectsMap,
          isActive: true,
          updatedAt: new Date(),
        },
      }
    );

    // Relink students from secondary classes to primary class
    if (secondaryClassIds.length > 0) {
      const studentUpdateRes = await studentsColl.updateMany(
        { classId: { $in: secondaryClassIds } },
        { $set: { classId: primaryId } }
      );
      totalStudentsRelinked += studentUpdateRes.modifiedCount;

      // Mark secondary classes as merged/inactive while preserving records (NC-6)
      const classRetireRes = await classesColl.updateMany(
        { _id: { $in: secondaryClassIds } },
        {
          $set: {
            isActive: false,
            mergedIntoClassId: primaryId,
            mergedAt: new Date(),
          },
        }
      );
      totalClassesMerged += classRetireRes.modifiedCount;
    }
  }

  // Record audit log entry (NFR-4)
  await migrationLogsColl.insertOne({
    migration: 'phase3-class-consolidation',
    direction: 'commit',
    timestamp: new Date(),
    proposalsExecuted: approvedProposals.length,
    classesRetired: totalClassesMerged,
    studentsRelinked: totalStudentsRelinked,
    subjectsCataloged: totalSubjectsCataloged,
  });

  return {
    proposalsExecuted: approvedProposals.length,
    classesMerged: totalClassesMerged,
    studentsRelinked: totalStudentsRelinked,
    subjectsCataloged: totalSubjectsCataloged,
  };
}

async function main() {
  const uri = getMongoUri();
  const proposalFilePath = process.argv[3] || path.resolve(__dirname, '../merges/proposed-class-merges.json');

  if (!fs.existsSync(proposalFilePath)) {
    console.error(`Error: Proposals file not found at: ${proposalFilePath}`);
    console.error('Run "node scripts/proposeClassMerges.js" first.');
    process.exit(1);
  }

  const proposals = JSON.parse(fs.readFileSync(proposalFilePath, 'utf8'));

  console.log(`Connecting to database: ${redact(uri)}...`);
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  const result = await executeClassMerges(db, proposals);

  await mongoose.disconnect();

  console.log('\n======================================================');
  console.log(`✅ Class Consolidation successfully committed!`);
  console.log(`  - Proposals executed: ${result.proposalsExecuted}`);
  console.log(`  - Secondary classes retired: ${result.classesMerged}`);
  console.log(`  - Students relinked: ${result.studentsRelinked}`);
  console.log(`  - Semester subject lists cataloged: ${result.subjectsCataloged}`);
  console.log('======================================================\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal error during class merge commit:', err);
    process.exit(1);
  });
}
