/**
 * phase2-migration.test.js — Unit & Integration Tests for Batch Inference Migration
 * TRD Reference: TRD §5 Phase 2 (Steps 2.1 – 2.3) | Constraints: NC-1, NC-3, NC-5, NFR-4
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearTestDatabase,
} from '../harness/testHarness.js';

// Models
import Batch from '../../src/models/Batch.js';
import Class from '../../src/models/Class.js';
import Student from '../../src/models/Student.js';
import Department from '../../src/models/Department.js';

// Migration under test
import { up, down } from '../../migrations/20260415-infer-batches.js';

describe('TRD Phase 2: Batch Inference Migration (20260415-infer-batches)', () => {
  let department;
  let class1stYear, class2ndYear, class3rdYear, class4thYear;
  let students = [];

  before(async () => {
    await setupTestEnvironment();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    department = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true,
    });

    // Create classes across all 4 years with old academicYear model
    class1stYear = await Class.create({
      name: 'CSE-1stYear',
      departmentId: department._id,
      semester: 1,
      academicYear: '2025-26',
    });

    class2ndYear = await Class.create({
      name: 'CSE-2ndYear',
      departmentId: department._id,
      semester: 3,
      academicYear: '2025-26',
    });

    class3rdYear = await Class.create({
      name: 'CSE-3rdYear',
      departmentId: department._id,
      semester: 5,
      academicYear: '2025-26',
    });

    class4thYear = await Class.create({
      name: 'CSE-4thYear',
      departmentId: department._id,
      semester: 7,
      academicYear: '2025-26',
    });

    // Seed students in each cohort
    students = await Student.create([
      // 1st Year (Sem 1) -> Batch 2025-2029
      {
        rollNo: '25CS001',
        name: 'First Year Student A',
        email: 'first.a@test.edu',
        departmentId: department._id,
        classId: class1stYear._id,
        semester: 1,
        academicYear: '2025-26',
      },
      // 2nd Year (Sem 3) -> Batch 2024-2028
      {
        rollNo: '24CS001',
        name: 'Second Year Student A',
        email: 'second.a@test.edu',
        departmentId: department._id,
        classId: class2ndYear._id,
        semester: 3,
        academicYear: '2025-26',
      },
      // 3rd Year (Sem 5) -> Batch 2023-2027
      {
        rollNo: '23CS001',
        name: 'Third Year Student A',
        email: 'third.a@test.edu',
        departmentId: department._id,
        classId: class3rdYear._id,
        semester: 5,
        academicYear: '2025-26',
      },
      // 4th Year (Sem 7) -> Batch 2022-2026
      {
        rollNo: '22CS001',
        name: 'Fourth Year Student A',
        email: 'fourth.a@test.edu',
        departmentId: department._id,
        classId: class4thYear._id,
        semester: 7,
        academicYear: '2025-26',
      },
    ]);
  });

  // ── 1. Batch Inference Mathematical Accuracy (TRD Step 2.1) ─────────────────
  it('accurately infers batch labels and years across all cohorts', async () => {
    const db = mongoose.connection.db;

    // Run up migration
    await up(db);

    const batches = await Batch.find({}).sort({ startYear: 1 });
    assert.equal(batches.length, 4, 'Must create exactly 4 batches for 4 cohorts');

    const labels = batches.map(b => b.label);
    assert.deepEqual(labels, ['2022-2026', '2023-2027', '2024-2028', '2025-2029']);

    // Check 1st year student
    const s1 = await Student.findOne({ rollNo: '25CS001' }).populate('batchId');
    assert.equal(s1.batchId.label, '2025-2029');
    assert.equal(s1.currentSemester, 1);
    assert.equal(s1.semester, 1, 'Legacy semester must remain untouched (NC-5)');
    assert.equal(s1.academicYear, '2025-26', 'Legacy academicYear must remain untouched (NC-5)');

    // Check 2nd year student
    const s2 = await Student.findOne({ rollNo: '24CS001' }).populate('batchId');
    assert.equal(s2.batchId.label, '2024-2028');
    assert.equal(s2.currentSemester, 3);

    // Check 3rd year student
    const s3 = await Student.findOne({ rollNo: '23CS001' }).populate('batchId');
    assert.equal(s3.batchId.label, '2023-2027');
    assert.equal(s3.currentSemester, 5);

    // Check 4th year student
    const s4 = await Student.findOne({ rollNo: '22CS001' }).populate('batchId');
    assert.equal(s4.batchId.label, '2022-2026');
    assert.equal(s4.currentSemester, 7);

    // Check class batch links
    const c2 = await Class.findById(class2ndYear._id);
    assert.equal(c2.batchId.toString(), s2.batchId._id.toString());
  });

  // ── 2. Idempotency Verification (NC-3, TRD Step 2.3) ─────────────────────────
  it('confirms idempotency: re-running up produces zero duplicate batches or corruptions', async () => {
    const db = mongoose.connection.db;

    // Run first time
    await up(db);
    const countAfterFirst = await Batch.countDocuments({});
    const studentsAfterFirst = await Student.find({}).lean();

    // Run second time (idempotency check)
    await up(db);
    const countAfterSecond = await Batch.countDocuments({});
    const studentsAfterSecond = await Student.find({}).lean();

    assert.equal(countAfterSecond, countAfterFirst, 'Batch count must not increase on re-run');
    for (let i = 0; i < studentsAfterFirst.length; i++) {
      assert.equal(
        studentsAfterSecond[i].batchId.toString(),
        studentsAfterFirst[i].batchId.toString(),
        'Student batchId must remain identical on re-run'
      );
      assert.equal(
        studentsAfterSecond[i].currentSemester,
        studentsAfterFirst[i].currentSemester
      );
    }
  });

  // ── 3. Rollback (down) Verification (FR-F1, TRD Step 2.3) ────────────────────
  it('confirms rollback (down): cleanly removes inferred fields and deletes migration batches', async () => {
    const db = mongoose.connection.db;

    // Apply migration
    await up(db);
    assert.equal(await Batch.countDocuments({ source: 'migration_20260415' }), 4);

    // Execute rollback
    await down(db);

    // Verify batches created by migration are removed
    const batchCountAfterRollback = await Batch.countDocuments({ source: 'migration_20260415' });
    assert.equal(batchCountAfterRollback, 0, 'Migration batches must be deleted on rollback');

    // Verify students have batchId and currentSemester unset
    const rolledBackStudents = await Student.find({}).lean();
    for (const student of rolledBackStudents) {
      assert.equal(student.batchId, undefined, 'Student batchId must be unset');
      assert.equal(student.currentSemester, undefined, 'Student currentSemester must be unset');
      // Assert old fields are intact (NC-5)
      assert.ok(student.semester >= 1, 'Legacy semester must remain intact');
      assert.equal(student.academicYear, '2025-26', 'Legacy academicYear must remain intact');
    }

    // Verify classes have batchId unset
    const rolledBackClasses = await Class.find({}).lean();
    for (const cls of rolledBackClasses) {
      assert.equal(cls.batchId, undefined, 'Class batchId must be unset');
    }

    // Verify re-applying up after down works cleanly
    await up(db);
    assert.equal(await Batch.countDocuments({ source: 'migration_20260415' }), 4);
    const reMigratedStudent = await Student.findOne({ rollNo: '24CS001' }).populate('batchId');
    assert.equal(reMigratedStudent.batchId.label, '2024-2028');
  });

  // ── 4. Audit Logging Verification (NFR-4) ───────────────────────────────────
  it('records audit log entries in migrationLogs collection for both up and down', async () => {
    const db = mongoose.connection.db;

    await up(db);
    const upLog = await db.collection('migrationLogs').findOne({
      migration: '20260415-infer-batches',
      direction: 'up',
    });
    assert.ok(upLog, 'up() migration must record an audit log');
    assert.equal(upLog.studentsTotal, 4);
    assert.equal(upLog.batchesCreated, 4);

    await down(db);
    const downLog = await db.collection('migrationLogs').findOne({
      migration: '20260415-infer-batches',
      direction: 'down',
    });
    assert.ok(downLog, 'down() migration must record an audit log');
    assert.equal(downLog.batchesDeleted, 4);
  });
});
