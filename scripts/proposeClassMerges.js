#!/usr/bin/env node

/**
 * proposeClassMerges.js — Proposes class mergers by computing student roster overlap
 * TRD Reference: TRD §5 Phase 3 (Steps 3.1, 3.2) | Constraints: NC-4
 *
 * Algorithm:
 *   1. Extracts base section name (e.g. "CSE-A Sem 3" -> "CSE-A")
 *   2. Compares student sets across same-named-prefix classes in the same department
 *   3. Calculates roster overlap: |A ∩ B| / min(|A|, |B|)
 *   4. Outputs structured proposal JSON for human review (NC-4)
 *
 * Safe: Read-only. Does NOT mutate the database.
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
 * Normalizes class names into canonical section names
 * e.g. "CSE-A Sem 3" -> "CSE-A", "CSD - B (2025)" -> "CSD-B"
 * @param {string} rawName
 * @returns {string}
 */
export function extractCanonicalClassName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  return rawName
    .replace(/\s*\([^)]*\)/g, '') // remove parenthetical expressions first e.g. (2024-25)
    .replace(/\s*[-–—]?\s*\b(sem|semester|sec|section)\s*\d+\b/gi, '') // remove "Sem 3", "Semester 5", "Section 2"
    .replace(/\s*[-–—]?\s*\b\d+\b/g, '') // remove standalone numbers
    .replace(/\s*[-–—]\s*/g, '-') // normalize dashes with surrounded spaces e.g. "CSD - A" -> "CSD-A"
    .replace(/\s+/g, '-') // spaces to single dash
    .replace(/-+/g, '-') // collapse multiple dashes
    .replace(/^-|-$/g, '') // trim leading and trailing dashes
    .trim()
    .toUpperCase();
}

/**
 * Computes overlap score between two sets of student IDs
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} 0.0 to 1.0
 */
export function computeRosterOverlap(setA, setB) {
  if (!setA || !setB || setA.size === 0 || setB.size === 0) return 0;
  let intersectionCount = 0;
  for (const id of setA) {
    if (setB.has(id)) intersectionCount++;
  }
  const minSize = Math.min(setA.size, setB.size);
  return minSize > 0 ? Number((intersectionCount / minSize).toFixed(4)) : 0;
}

export async function generateMergeProposals(db) {
  const classesColl = db.collection('classes');
  const studentsColl = db.collection('students');
  const departmentsColl = db.collection('departments');

  const classes = await classesColl.find({}).toArray();
  const departments = await departmentsColl.find({}).toArray();
  const deptMap = new Map(departments.map(d => [d._id.toString(), d.name || d.code]));

  // Build map of classId -> Set of student IDs (roll numbers or _id)
  const classStudentMap = new Map();
  for (const cls of classes) {
    const studentsInClass = await studentsColl
      .find({ classId: cls._id })
      .project({ _id: 1, rollNo: 1 })
      .toArray();

    const studentIds = new Set(
      studentsInClass.map(s => s.rollNo || s._id.toString())
    );
    classStudentMap.set(cls._id.toString(), studentIds);
  }

  // Group classes by department and canonical section name
  const groups = new Map(); // key: "deptId::canonicalName" -> [classes]
  for (const cls of classes) {
    const deptId = cls.departmentId ? cls.departmentId.toString() : 'unknown';
    const canonical = extractCanonicalClassName(cls.name);
    const key = `${deptId}::${canonical}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(cls);
  }

  const proposals = [];

  for (const [key, groupClasses] of groups.entries()) {
    const [deptId, canonicalName] = key.split('::');
    const deptName = deptMap.get(deptId) || 'Unknown Department';

    // If only one class in group, already single persistent doc
    if (groupClasses.length <= 1) {
      continue;
    }

    // Sort classes by semester descending (most recent/highest semester first)
    groupClasses.sort((a, b) => (b.semester || 0) - (a.semester || 0));

    const primaryClass = groupClasses[0];
    const secondaryClasses = groupClasses.slice(1);

    // Compute pairwise overlaps with primary class
    const primaryRoster = classStudentMap.get(primaryClass._id.toString()) || new Set();
    const contributingSemesters = [];
    let totalOverlapScore = 0;

    contributingSemesters.push({
      classId: primaryClass._id.toString(),
      originalName: primaryClass.name,
      semester: primaryClass.semester,
      academicYear: primaryClass.academicYear,
      studentCount: primaryRoster.size,
      subjectCount: (primaryClass.subjectAssignments || []).length,
      isPrimary: true,
    });

    for (const sec of secondaryClasses) {
      const secRoster = classStudentMap.get(sec._id.toString()) || new Set();
      const overlap = computeRosterOverlap(primaryRoster, secRoster);
      totalOverlapScore += overlap;

      contributingSemesters.push({
        classId: sec._id.toString(),
        originalName: sec.name,
        semester: sec.semester,
        academicYear: sec.academicYear,
        studentCount: secRoster.size,
        subjectCount: (sec.subjectAssignments || []).length,
        overlapScore: overlap,
        isPrimary: false,
      });
    }

    const avgConfidence = secondaryClasses.length > 0
      ? Number((totalOverlapScore / secondaryClasses.length).toFixed(2))
      : 1.0;

    proposals.push({
      canonicalName,
      departmentId: deptId,
      departmentName: deptName,
      primaryClassId: primaryClass._id.toString(),
      primaryClassName: primaryClass.name,
      confidenceScore: avgConfidence,
      approved: avgConfidence >= 0.70, // Default to true if high confidence, but human must review (NC-4)
      contributingClasses: contributingSemesters,
    });
  }

  return proposals;
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Error: No MongoDB URI provided.');
    process.exit(1);
  }

  console.log(`Connecting to: ${redact(uri)}...`);
  await mongoose.connect(uri);

  const db = mongoose.connection.db;
  console.log(`Analyzing classes in ${db.databaseName} for merger proposals...`);

  const proposals = await generateMergeProposals(db);

  const outputDir = path.resolve(__dirname, '../merges');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'proposed-class-merges.json');

  fs.writeFileSync(outputPath, JSON.stringify(proposals, null, 2), 'utf8');

  await mongoose.disconnect();

  console.log('\n======================================================');
  console.log(`✅ Generated ${proposals.length} class consolidation proposals.`);
  console.log(`📁 File written to: ${outputPath}`);
  console.log(`⚠️  ACTION REQUIRED (NC-4): Review ${outputPath} before running commitClassMerge.js.`);
  console.log('======================================================\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Error proposing class merges:', err);
    process.exit(1);
  });
}
