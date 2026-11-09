/**
 * phase1-features.test.js — Unit and Integration Tests for Phase 1 Additive Features
 * TRD References: FR-A1 to FR-A7, FR-B1 to FR-B5, FR-C1 to FR-C8, FR-D1 to FR-D4, FR-F1 to FR-F5
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';

import app from '../../src/app.js';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearTestDatabase,
  signTestToken,
} from '../harness/testHarness.js';

// Models
import Batch from '../../src/models/Batch.js';
import Class from '../../src/models/Class.js';
import Student from '../../src/models/Student.js';
import Faculty from '../../src/models/Faculty.js';
import Subject from '../../src/models/Subject.js';
import Department from '../../src/models/Department.js';
import FeatureFlag from '../../src/models/FeatureFlag.js';
import TimetableUpload from '../../src/models/TimetableUpload.js';

// Utilities & Services
import {
  isFeatureEnabled,
  setFeatureFlag,
  clearFeatureFlagCache,
} from '../../src/utils/featureFlags.js';
import {
  normalizeFacultyName,
  isWithoutTeacher,
  extractTableRowsFromText,
} from '../../src/services/timetableParser.js';
import registry from '../../src/registry/actionRegistry.js';

describe('TRD Phase 1: Additive Schemas, Timetable Parser & Action Registry', () => {
  let adminToken;
  let department;
  let testFaculty;
  let testSubject;
  let testClass;

  before(async () => {
    await setupTestEnvironment();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    clearFeatureFlagCache();

    department = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true,
    });

    testFaculty = await Faculty.create({
      name: 'Dr. Alan Turing',
      email: 'alan.turing@test.edu',
      employeeId: 'EMP_TUR_01',
      password: 'password123',
      departmentId: department._id,
      roleTags: ['faculty'],
    });

    testSubject = await Subject.create({
      name: 'Data Structures and Algorithms',
      code: '23CS301',
      semester: 3,
      departmentId: department._id,
      isActive: true,
    });

    testClass = await Class.create({
      name: 'CSE-A',
      departmentId: department._id,
      semester: 3,
      academicYear: '2026-2027',
      classTeacherId: testFaculty._id,
    });

    adminToken = signTestToken({
      _id: new mongoose.Types.ObjectId(),
      name: 'System Admin',
      role: 'admin',
      roleTags: ['admin'],
    });
  });

  // ── 1. Batch Model & Constraints (FR-A1 to FR-A7) ───────────────────────────
  describe('Batch Model (FR-A1 to FR-A7)', () => {
    it('creates a batch with label, startYear, endYear, and currentSemester', async () => {
      const batch = await Batch.create({
        label: '2024-2028',
        startYear: 2024,
        endYear: 2028,
        currentSemester: 3,
      });

      assert.equal(batch.label, '2024-2028');
      assert.equal(batch.startYear, 2024);
      assert.equal(batch.endYear, 2028);
      assert.equal(batch.currentSemester, 3);
      assert.equal(batch.isActive, true);
    });

    it('rejects batch creation when endYear is not greater than startYear', async () => {
      await assert.rejects(
        async () => {
          await Batch.create({
            label: '2024-2023',
            startYear: 2024,
            endYear: 2023,
            currentSemester: 1,
          });
        },
        /End year must be greater than start year/
      );
    });

    it('rejects duplicate batch labels with unique constraint', async () => {
      await Batch.create({
        label: '2025-2029',
        startYear: 2025,
        endYear: 2029,
        currentSemester: 1,
      });

      await assert.rejects(
        async () => {
          await Batch.create({
            label: '2025-2029',
            startYear: 2025,
            endYear: 2029,
            currentSemester: 1,
          });
        },
        /E11000 duplicate key error/
      );
    });
  });

  // ── 2. Feature Flags (FR-F3 to FR-F5) ───────────────────────────────────────
  describe('Feature Flags (FR-F3 to FR-F5)', () => {
    it('defaults setup_wizard_enabled to false when queried', async () => {
      const enabled = await isFeatureEnabled('setup_wizard_enabled');
      assert.equal(enabled, false);
    });

    it('reflects updated flag state within cache cycle and allows dynamic toggle', async () => {
      await setFeatureFlag('setup_wizard_enabled', true, 'Enabling wizard for testing');
      const enabled = await isFeatureEnabled('setup_wizard_enabled');
      assert.equal(enabled, true);

      await setFeatureFlag('setup_wizard_enabled', false);
      const disabled = await isFeatureEnabled('setup_wizard_enabled');
      assert.equal(disabled, false);
    });
  });

  // ── 3. Persistent Class Semester Subjects & Additive Fields (FR-B1 to FR-B4, NC-5)
  describe('Persistent Class & Additive Schema (FR-B1 to FR-B4, NC-5)', () => {
    it('persists semesterSubjects map without breaking existing flat subjectAssignments', async () => {
      const batch = await Batch.create({
        label: '2024-2028',
        startYear: 2024,
        endYear: 2028,
        currentSemester: 3,
      });

      // Update class with batchId and semesterSubjects for semester 3
      testClass.batchId = batch._id;
      testClass.semesterSubjects.set('3', {
        subjects: [
          {
            subjectId: testSubject._id,
            subjectName: testSubject.name,
            subjectCode: testSubject.code,
            facultyId: testFaculty._id,
            facultyName: testFaculty.name,
            source: 'manual',
          },
        ],
        status: 'active',
        setAt: new Date(),
      });

      await testClass.save();

      const reloadedClass = await Class.findById(testClass._id);
      assert.equal(reloadedClass.batchId.toString(), batch._id.toString());
      assert.ok(reloadedClass.semesterSubjects.has('3'));

      const sem3 = reloadedClass.semesterSubjects.get('3');
      assert.equal(sem3.status, 'active');
      assert.equal(sem3.subjects.length, 1);
      assert.equal(sem3.subjects[0].subjectCode, '23CS301');

      // Verify legacy fields remain functional (NC-5)
      assert.equal(reloadedClass.semester, 3);
      assert.equal(reloadedClass.academicYear, '2026-2027');
    });

    it('archives previous semester subject entries when new semester subjects are set', async () => {
      testClass.semesterSubjects.set('3', {
        subjects: [
          {
            subjectId: testSubject._id,
            subjectName: testSubject.name,
            subjectCode: testSubject.code,
            facultyId: testFaculty._id,
            facultyName: testFaculty.name,
          },
        ],
        status: 'active',
        setAt: new Date(),
      });
      await testClass.save();

      // Execute class.setSemesterSubjects action for semester 4
      const newSubject = await Subject.create({
        name: 'Database Management Systems',
        code: '23CS401',
        semester: 4,
        departmentId: department._id,
      });

      await registry.execute('class.setSemesterSubjects', {
        classId: testClass._id.toString(),
        semester: 4,
        subjects: [
          {
            subjectId: newSubject._id.toString(),
            subjectName: newSubject.name,
            subjectCode: newSubject.code,
            facultyId: testFaculty._id.toString(),
            facultyName: testFaculty.name,
          },
        ],
      });

      const reloadedClass = await Class.findById(testClass._id);
      assert.equal(reloadedClass.semesterSubjects.get('3').status, 'archived');
      assert.ok(reloadedClass.semesterSubjects.get('3').archivedAt instanceof Date);

      assert.equal(reloadedClass.semesterSubjects.get('4').status, 'active');
      assert.equal(reloadedClass.semesterSubjects.get('4').subjects[0].subjectCode, '23CS401');

      // Verify legacy subjectAssignments reflects current semester (NC-5)
      assert.equal(reloadedClass.semester, 4);
      assert.equal(reloadedClass.subjectAssignments.length, 1);
      assert.equal(reloadedClass.subjectAssignments[0].subjectCode, '23CS401');
    });
  });

  // ── 4. Timetable Parser Unit Logic (FR-C1 to FR-C8) ─────────────────────────
  describe('Timetable Parser Normalization & Row Extraction (FR-C1 to FR-C8)', () => {
    it('normalizes faculty names by stripping honorifics, dots, and case-folding (FR-C5)', () => {
      assert.equal(normalizeFacultyName('Dr. Alan Turing'), 'alan turing');
      assert.equal(normalizeFacultyName('Prof. Jane A. Smith, Ph.D.'), 'jane a smith phd');
      assert.equal(normalizeFacultyName('Mr.  John   Doe '), 'john doe');
      assert.equal(normalizeFacultyName('Er. K. V. Raman'), 'k v raman');
    });

    it('identifies "without teacher" variations correctly (FR-C3)', () => {
      assert.equal(isWithoutTeacher('Without Teacher'), true);
      assert.equal(isWithoutTeacher('without   teacher'), true);
      assert.equal(isWithoutTeacher('No Teacher'), true);
      assert.equal(isWithoutTeacher('Dr. Alan Turing'), false);
    });

    it('extracts table rows with subject code, names, and faculty from text lines (FR-C1)', () => {
      const sampleText = `
        DEPARTMENT OF COMPUTER SCIENCE AND ENGINEERING
        TIMETABLE SUMMARY TABLE:
        23CS301 - Data Structures and Algorithms - Dr. Alan Turing - 4
        23CS302 - Operating Systems - Without Teacher - 3
        23CS303 - Database Systems - Prof. Ada Lovelace, Charles Babbage - 4
      `;

      const rows = extractTableRowsFromText(sampleText);
      assert.equal(rows.length, 3);

      assert.equal(rows[0].subjectCode, '23CS301');
      assert.equal(rows[0].hours, 4);

      assert.equal(rows[1].subjectCode, '23CS302');
      assert.equal(isWithoutTeacher(rows[1].facultyField), true);

      assert.equal(rows[2].subjectCode, '23CS303');
      assert.ok(rows[2].facultyField.includes('Ada Lovelace'));
      assert.ok(rows[2].facultyField.includes('Charles Babbage'));
    });
  });

  // ── 5. Action Registry (FR-D1 to FR-D4) ──────────────────────────────────────
  describe('Action Registry & Execution (FR-D1 to FR-D4)', () => {
    it('executes batch.create action with schema validation and audit logging', async () => {
      const batch = await registry.execute(
        'batch.create',
        {
          label: '2026-2030',
          startYear: 2026,
          endYear: 2030,
          currentSemester: 1,
        },
        { actor: 'admin_test' }
      );

      assert.equal(batch.label, '2026-2030');
      assert.equal(batch.isActive, true);
    });

    it('rejects action execution when input schema validation fails (VAL_001)', async () => {
      await assert.rejects(
        async () => {
          await registry.execute('batch.create', {
            label: 'abc', // less than min(4)
            startYear: 1990, // less than min(2000)
            endYear: 'invalid',
          });
        },
        (err) => err.code === 'VAL_001' && err.statusCode === 400
      );
    });

    it('executes batch.advanceSemester and cascades in single bulk operation (FR-A4, FR-A6, NFR-3)', async () => {
      const batch = await Batch.create({
        label: '2024-2028',
        startYear: 2024,
        endYear: 2028,
        currentSemester: 3,
      });

      // Link class to batch
      testClass.batchId = batch._id;
      testClass.semester = 3;
      await testClass.save();

      // Create students: one normal, one with semesterOverride
      const normalStudent = await Student.create({
        rollNo: '24CS001',
        name: 'Regular Student',
        email: 'regular@test.edu',
        departmentId: department._id,
        classId: testClass._id,
        batchId: batch._id,
        currentSemester: 3,
        semester: 3,
      });

      const overrideStudent = await Student.create({
        rollNo: '24CS099',
        name: 'Backlog Student',
        email: 'backlog@test.edu',
        departmentId: department._id,
        classId: testClass._id,
        batchId: batch._id,
        currentSemester: 2,
        semester: 2,
        semesterOverride: 2, // Must NOT advance (FR-A4, FR-A6)
      });

      // Execute Advance Semester
      const result = await registry.execute('batch.advanceSemester', {
        batchId: batch._id.toString(),
      });

      assert.equal(result.newSemester, 4);
      assert.equal(result.classesUpdated, 1);
      assert.equal(result.studentsUpdated, 1); // only normalStudent updated

      // Verify normal student advanced
      const reloadedNormal = await Student.findById(normalStudent._id);
      assert.equal(reloadedNormal.currentSemester, 4);
      assert.equal(reloadedNormal.semester, 4);

      // Verify override student stayed at semester 2
      const reloadedOverride = await Student.findById(overrideStudent._id);
      assert.equal(reloadedOverride.currentSemester, 2);
      assert.equal(reloadedOverride.semesterOverride, 2);

      // Verify class advanced
      const reloadedClass = await Class.findById(testClass._id);
      assert.equal(reloadedClass.semester, 4);
    });

    it('marks batch graduated (isActive: false) when advancing past semester 8 (FR-A5)', async () => {
      const batch = await Batch.create({
        label: '2020-2024',
        startYear: 2020,
        endYear: 2024,
        currentSemester: 8,
      });

      const result = await registry.execute('batch.advanceSemester', {
        batchId: batch._id.toString(),
      });

      assert.equal(result.graduated, true);
      assert.equal(result.isActive, false);

      const reloadedBatch = await Batch.findById(batch._id);
      assert.equal(reloadedBatch.isActive, false);

      // Further advancement is rejected
      await assert.rejects(
        async () => {
          await registry.execute('batch.advanceSemester', {
            batchId: batch._id.toString(),
          });
        },
        /Cannot advance a graduated\/inactive batch/
      );
    });
  });

  // ── 6. Timetable Endpoints Integration (FR-C1 to FR-C8) ─────────────────────
  describe('Timetable Routes API (POST /api/timetable/preview & /commit)', () => {
    it('rejects PDF without text layer with 400 INVALID_PDF_TEXT_LAYER (FR-C2)', async () => {
      // Create a minimal synthetic buffer without extractable text
      const emptyBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\nxref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n102\n%%EOF');

      const res = await request(app)
        .post('/api/timetable/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('classId', testClass._id.toString())
        .field('targetSemester', '3')
        .attach('file', emptyBuffer, 'scanned_image.pdf');

      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'INVALID_PDF_TEXT_LAYER');
    });

    it('commits confirmed timetable rows and records TimetableUpload audit entry (FR-C7, MON-4)', async () => {
      const uploadAudit = await TimetableUpload.create({
        classId: testClass._id,
        targetSemester: 3,
        uploadedBy: new mongoose.Types.ObjectId(),
        originalFileName: 'sample_timetable.pdf',
        parsedRowCount: 1,
        matchedRowCount: 1,
      });

      const commitRes = await request(app)
        .post('/api/timetable/commit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          uploadId: uploadAudit._id.toString(),
          classId: testClass._id.toString(),
          targetSemester: 3,
          confirmedRows: [
            {
              subjectId: testSubject._id.toString(),
              subjectName: testSubject.name,
              subjectCode: testSubject.code,
              facultyId: testFaculty._id.toString(),
              facultyName: testFaculty.name,
              status: 'matched',
            },
          ],
        });

      assert.equal(commitRes.status, 200);
      assert.equal(commitRes.body.success, true);
      assert.equal(commitRes.body.data.committedCount, 1);

      // Verify audit upload record is marked committed
      const reloadedAudit = await TimetableUpload.findById(uploadAudit._id);
      assert.equal(reloadedAudit.committed, true);
      assert.ok(reloadedAudit.committedAt instanceof Date);

      // Verify class subject history endpoint (FR-B5)
      const histRes = await request(app)
        .get(`/api/timetable/history/${testClass._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(histRes.status, 200);
      assert.ok(histRes.body.data.semesterSubjects['3']);
      assert.equal(histRes.body.data.semesterSubjects['3'].status, 'active');
      assert.equal(histRes.body.data.semesterSubjects['3'].subjects[0].subjectCode, '23CS301');
    });
  });
});
