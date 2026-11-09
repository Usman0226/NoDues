/**
 * 20260415-infer-batches.js — Batch Inference Migration
 * TRD Reference: TRD §5 Phase 2 (Step 2.1) | Requirements: FR-A1 to FR-A7, FR-F1, FR-F2, NC-3, NC-5, NFR-4
 *
 * Infers batchStartYear from academicYear + semester:
 *   academicStartYear = parseInt(academicYear.slice(0, 4))
 *   yearOffset = Math.floor((semester - 1) / 2)
 *   batchStartYear = academicStartYear - yearOffset
 *   batchEndYear = batchStartYear + 4
 *   label = `${batchStartYear}-${batchEndYear}`
 *
 * Idempotent: safe to run multiple times without corrupting or duplicating data.
 * Reversible: down() unsets batchId and currentSemester while keeping legacy fields untouched (NC-5).
 */

/**
 * Extracts numeric 4-digit academic start year from strings like '2025-26', '2025-2026'
 * @param {string} academicYear
 * @returns {number|null}
 */
function extractAcademicStartYear(academicYear) {
  if (!academicYear || typeof academicYear !== 'string') return null;
  const match = academicYear.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Fallback to roll number prefix if academicYear is absent (e.g., '21A91A0501' -> 2021)
 * @param {string} rollNo
 * @returns {number|null}
 */
function inferStartYearFromRollNo(rollNo) {
  if (!rollNo || typeof rollNo !== 'string') return null;
  const match = rollNo.trim().match(/^(\d{2})/);
  if (match) {
    const prefix = parseInt(match[1], 10);
    if (prefix >= 15 && prefix <= 40) {
      return 2000 + prefix;
    }
  }
  return null;
}

export const up = async (db, client) => {
  const startTime = Date.now();
  console.log('[Migration 20260415] Starting Batch Inference Migration (up)...');

  const studentsColl = db.collection('students');
  const classesColl = db.collection('classes');
  const batchesColl = db.collection('batches');
  const migrationLogsColl = db.collection('migrationLogs');

  // Pre-load all classes for quick parent lookup
  const allClasses = await classesColl.find({}).toArray();
  const classMap = new Map();
  for (const c of allClasses) {
    classMap.set(c._id.toString(), c);
  }

  // Pre-load existing batches
  const existingBatches = await batchesColl.find({}).toArray();
  const batchByLabel = new Map();
  for (const b of existingBatches) {
    batchByLabel.set(b.label, b);
  }

  // Fetch all active and inactive students
  const students = await studentsColl.find({}).toArray();
  console.log(`[Migration 20260415] Processing ${students.length} students...`);

  let matchedBatchCount = 0;
  let createdBatchCount = 0;
  let updatedStudentCount = 0;
  let skippedStudentCount = 0;
  const createdBatchIds = [];

  const studentOperations = [];
  const classBatchMap = new Map(); // classId -> batchId

  for (const student of students) {
    const sem = student.semester || 1;
    const parentClass = student.classId ? classMap.get(student.classId.toString()) : null;

    // Determine academic start year: student.academicYear -> class.academicYear -> rollNo
    let academicStartYear = extractAcademicStartYear(student.academicYear);
    if (!academicStartYear && parentClass) {
      academicStartYear = extractAcademicStartYear(parentClass.academicYear);
    }
    if (!academicStartYear && student.rollNo) {
      academicStartYear = inferStartYearFromRollNo(student.rollNo);
    }

    if (!academicStartYear) {
      console.warn(`[Migration 20260415] Warning: Unable to determine start year for student ${student.rollNo} (${student._id}). Skipping.`);
      skippedStudentCount++;
      continue;
    }

    // Formula per Features Guide §2 & TRD §5 Phase 2
    const yearOffset = Math.floor((Math.max(1, Math.min(8, sem)) - 1) / 2);
    const batchStartYear = academicStartYear - yearOffset;
    const batchEndYear = batchStartYear + 4;
    const batchLabel = `${batchStartYear}-${batchEndYear}`;

    // Get or create batch document
    let batch = batchByLabel.get(batchLabel);
    if (!batch) {
      const newBatchDoc = {
        label: batchLabel,
        startYear: batchStartYear,
        endYear: batchEndYear,
        currentSemester: sem,
        isActive: sem <= 8,
        source: 'migration_20260415',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const insertResult = await batchesColl.insertOne(newBatchDoc);
      batch = { ...newBatchDoc, _id: insertResult.insertedId };
      batchByLabel.set(batchLabel, batch);
      createdBatchIds.push(batch._id);
      createdBatchCount++;
      console.log(`[Migration 20260415] Created new batch: ${batchLabel} (currentSem: ${sem})`);
    } else {
      matchedBatchCount++;
      // If batch exists and current semester is higher, update batch currentSemester
      if (sem > (batch.currentSemester || 0) && sem <= 8) {
        await batchesColl.updateOne(
          { _id: batch._id },
          { $set: { currentSemester: sem, updatedAt: new Date() } }
        );
        batch.currentSemester = sem;
      }
    }

    // Queue student bulk update
    studentOperations.push({
      updateOne: {
        filter: { _id: student._id },
        update: {
          $set: {
            batchId: batch._id,
            currentSemester: sem,
          },
        },
      },
    });

    if (student.classId) {
      classBatchMap.set(student.classId.toString(), batch._id);
    }
  }

  // Execute student bulk writes in batches of 500 for optimal performance
  if (studentOperations.length > 0) {
    const CHUNK_SIZE = 500;
    for (let i = 0; i < studentOperations.length; i += CHUNK_SIZE) {
      const chunk = studentOperations.slice(i, i + CHUNK_SIZE);
      const res = await studentsColl.bulkWrite(chunk, { ordered: false });
      updatedStudentCount += res.modifiedCount;
    }
  }

  // Update classes with inferred batchId
  let updatedClassCount = 0;
  for (const [classIdStr, batchId] of classBatchMap.entries()) {
    const res = await classesColl.updateOne(
      { _id: classMap.get(classIdStr)._id },
      { $set: { batchId: batchId } }
    );
    if (res.modifiedCount > 0) updatedClassCount++;
  }

  const durationMs = Date.now() - startTime;

  // Log execution outcome for auditing (NFR-4)
  await migrationLogsColl.insertOne({
    migration: '20260415-infer-batches',
    direction: 'up',
    timestamp: new Date(),
    durationMs,
    studentsTotal: students.length,
    studentsUpdated: updatedStudentCount,
    studentsSkipped: skippedStudentCount,
    batchesCreated: createdBatchCount,
    classesUpdated: updatedClassCount,
  });

  console.log(`[Migration 20260415] ✅ Batch inference complete in ${durationMs}ms:`);
  console.log(`  - Students updated: ${updatedStudentCount}`);
  console.log(`  - Batches created: ${createdBatchCount}`);
  console.log(`  - Classes updated: ${updatedClassCount}`);
  console.log(`  - Students skipped: ${skippedStudentCount}`);
};

export const down = async (db, client) => {
  const startTime = Date.now();
  console.log('[Migration 20260415] Rolling back Batch Inference Migration (down)...');

  const studentsColl = db.collection('students');
  const classesColl = db.collection('classes');
  const batchesColl = db.collection('batches');
  const migrationLogsColl = db.collection('migrationLogs');

  // Unset inferred fields on students while preserving old fields (NC-5)
  const studentRes = await studentsColl.updateMany(
    {},
    { $unset: { batchId: '', currentSemester: '' } }
  );

  // Unset batchId on classes
  const classRes = await classesColl.updateMany(
    {},
    { $unset: { batchId: '' } }
  );

  // Delete only the batches created by this migration
  const batchRes = await batchesColl.deleteMany({
    source: 'migration_20260415',
  });

  const durationMs = Date.now() - startTime;

  await migrationLogsColl.insertOne({
    migration: '20260415-infer-batches',
    direction: 'down',
    timestamp: new Date(),
    durationMs,
    studentsReverted: studentRes.modifiedCount,
    classesReverted: classRes.modifiedCount,
    batchesDeleted: batchRes.deletedCount,
  });

  console.log(`[Migration 20260415] ✅ Rollback complete in ${durationMs}ms:`);
  console.log(`  - Students reverted: ${studentRes.modifiedCount}`);
  console.log(`  - Classes reverted: ${classRes.modifiedCount}`);
  console.log(`  - Batches deleted: ${batchRes.deletedCount}`);
};
