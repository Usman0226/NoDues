/**
 * timetable-multipage.test.js — Unit and Integration tests for Multi-Page PDF Timetable Ingestion
 * TRD Reference: TRD §3.5 (FR-C1 to FR-C8), Setup Wizard Multi-Page Timetable Ingestion
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearTestDatabase,
  signTestToken,
} from '../harness/testHarness.js';

import app from '../../src/app.js';
import Class from '../../src/models/Class.js';
import Department from '../../src/models/Department.js';
import Faculty from '../../src/models/Faculty.js';
import Subject from '../../src/models/Subject.js';
import TimetableUpload from '../../src/models/TimetableUpload.js';
import {
  extractTableRowsFromText,
  inspectPdfPages,
  parseTimetablePdf,
  parseTimetablePageFromText,
} from '../../src/services/timetableParser.js';
import { setFeatureFlag } from '../../src/utils/featureFlags.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../../../test/fixtures');

describe('Timetable Multi-Page PDF Ingestion & Targeted Parsing', () => {
  let adminToken;
  let adminUser;
  let testDepartment;
  let testClassA;
  let testClassB;
  let singlePagePdfBuffer;
  let multiPagePdfBuffer;

  before(async () => {
    await setupTestEnvironment();
    singlePagePdfBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'timetable_sample.pdf'));
    multiPagePdfBuffer = fs.readFileSync(path.join(FIXTURES_DIR, 'timetable_multipage_sample.pdf'));
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    testDepartment = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true,
    });

    adminUser = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Admin Officer',
      email: 'admin.timetable@test.edu',
      role: 'admin',
      roleTags: ['admin'],
    };
    adminToken = signTestToken(adminUser);

    await Faculty.create({
      name: 'Dr. S. Kusuma',
      email: 'kusuma.cs@test.edu',
      employeeId: 'EMP_KUSUMA_01',
      password: 'password123',
      departmentId: testDepartment._id,
      roleTags: ['faculty'],
    });

    await Subject.create({
      name: 'Digital Logic',
      code: '23CSD103',
      semester: 3,
      departmentId: testDepartment._id,
    });

    await Subject.create({
      name: 'Data Engineering',
      code: '23CSD106',
      semester: 3,
      departmentId: testDepartment._id,
    });

    await Subject.create({
      name: 'Operating Systems',
      code: '23CS302',
      semester: 3,
      departmentId: testDepartment._id,
    });

    await Subject.create({
      name: 'DevOps',
      code: '23CSD603',
      semester: 3,
      departmentId: testDepartment._id,
    });

    testClassA = await Class.create({
      name: 'CSE-A',
      departmentId: testDepartment._id,
      semester: 3,
      academicYear: '2025-26',
    });

    testClassB = await Class.create({
      name: 'CSE-B',
      departmentId: testDepartment._id,
      semester: 3,
      academicYear: '2025-26',
    });
  });

  // ── 1. inspectPdfPages Service Tests ─────────────────────────────────────────
  describe('inspectPdfPages() Service', () => {
    it('accurately identifies single-page PDF', async () => {
      const result = await inspectPdfPages(singlePagePdfBuffer, {
        targetClassName: 'CSE-A',
        semester: 3,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.pageCount, 1);
      assert.strictEqual(result.data.isMultiPage, false);
      assert.strictEqual(result.data.recommendedPage, 1);
      assert.strictEqual(result.data.pages.length, 1);
      assert.strictEqual(result.data.pages[0].hasTextLayer, true);
    });

    it('accurately discovers multi-page PDF and recommends section matching targetClassName', async () => {
      const result = await inspectPdfPages(multiPagePdfBuffer, {
        targetClassName: 'CSE-B',
        semester: 3,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.pageCount, 3);
      assert.strictEqual(result.data.isMultiPage, true);
      assert.strictEqual(result.data.recommendedPage, 2); // Page 2 contains CSE-B!
      assert.strictEqual(result.data.pages.length, 3);

      const p2 = result.data.pages.find((p) => p.pageNumber === 2);
      assert.ok(p2);
      assert.strictEqual(p2.isRecommended, true);
      assert.ok(p2.header.includes('CSE-B'));
      assert.ok(p2.detectedSubjectCodes.includes('23CS302'));
      assert.ok(p2.detectedSubjectCodes.includes('23CSD603'));
    });

    it('rejects invalid or corrupted buffer with VAL_001', async () => {
      const badBuffer = Buffer.from('NOT_A_VALID_PDF_HEADER');
      await assert.rejects(
        async () => {
          await inspectPdfPages(badBuffer);
        },
        (err) => {
          assert.strictEqual(err.code, 'VAL_001');
          return true;
        }
      );
    });
  });

  // ── 2. parseTimetablePdf Targeted Page Parsing ───────────────────────────────
  describe('parseTimetablePdf() Targeted Page Extraction', () => {
    it('extracts only Page 1 subjects when page: 1 is specified', async () => {
      const result = await parseTimetablePdf(multiPagePdfBuffer, {
        departmentId: testDepartment._id,
        semester: 3,
        page: 1,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.selectedPage, 1);
      assert.strictEqual(result.data.pageCount, 3);
      const codes = result.data.rows.map((r) => r.subjectCode);
      assert.ok(codes.includes('23CSD103'));
      assert.ok(codes.includes('23CSD106'));
      assert.ok(!codes.includes('23CSD603')); // 23CSD603 is only on Page 2
    });

    it('extracts only Page 2 subjects when page: 2 is specified', async () => {
      const result = await parseTimetablePdf(multiPagePdfBuffer, {
        departmentId: testDepartment._id,
        semester: 3,
        page: 2,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.selectedPage, 2);
      const codes = result.data.rows.map((r) => r.subjectCode);
      assert.ok(codes.includes('23CS302'));
      assert.ok(codes.includes('23CSD603'));
      assert.ok(!codes.includes('23CSD103')); // 23CSD103 is only on Page 1
    });

    it('rejects requested page exceeding total document pageCount with VAL_001', async () => {
      await assert.rejects(
        async () => {
          await parseTimetablePdf(multiPagePdfBuffer, {
            departmentId: testDepartment._id,
            semester: 3,
            page: 99,
          });
        },
        (err) => {
          assert.strictEqual(err.code, 'VAL_001');
          assert.ok(err.message.includes('exceeds total document pages'));
          return true;
        }
      );
    });
  });

  // ── 3. API Endpoints: /api/timetable/inspect & /api/timetable/preview ────────
  describe('API Endpoints (POST /api/timetable/inspect & preview)', () => {
    it('returns 400 VAL_001 when inspect is called without a file', async () => {
      const res = await request(app)
        .post('/api/timetable/inspect')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.error.code, 'VAL_001');
    });

    it('returns 200 with inspection metadata when inspecting multi-page timetable', async () => {
      const res = await request(app)
        .post('/api/timetable/inspect')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('classId', testClassB._id.toString())
        .attach('file', path.join(FIXTURES_DIR, 'timetable_multipage_sample.pdf'));

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.pageCount, 3);
      assert.strictEqual(res.body.data.isMultiPage, true);
      assert.strictEqual(res.body.data.recommendedPage, 2);
      assert.strictEqual(res.body.data.pages.length, 3);
    });

    it('previews targeted page 2 and persists selectedPage in TimetableUpload audit', async () => {
      const res = await request(app)
        .post('/api/timetable/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('classId', testClassB._id.toString())
        .field('targetSemester', '3')
        .field('page', '2')
        .attach('file', path.join(FIXTURES_DIR, 'timetable_multipage_sample.pdf'));

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.selectedPage, 2);
      assert.strictEqual(res.body.data.pageCount, 3);
      assert.strictEqual(res.body.data.summary.totalRows, 2);

      // Verify TimetableUpload audit record
      const uploadRecord = await TimetableUpload.findById(res.body.data.uploadId).lean();
      assert.ok(uploadRecord);
      assert.strictEqual(uploadRecord.parsedData.selectedPage, 2);
      assert.strictEqual(uploadRecord.parsedData.pageCount, 3);
      assert.strictEqual(uploadRecord.parsedData.isMultiPage, true);
    });

    it('successfully previews without upfront classId by auto-resolving class from page metadata', async () => {
      const res = await request(app)
        .post('/api/timetable/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('departmentId', testDepartment._id.toString())
        .field('page', '1')
        .attach('file', path.join(FIXTURES_DIR, 'timetable_multipage_sample.pdf'));

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.data.classId, 'Auto-provisioned or found classId should be returned');
      assert.ok(res.body.data.className, 'Class name should be returned');
      assert.strictEqual(res.body.data.selectedPage, 1);
      assert.ok(Array.isArray(res.body.data.rows));
    });

    it('batch imports all detected sections and hydrates master curriculum', async () => {
      const res = await request(app)
        .post('/api/timetable/batch-import')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('departmentId', testDepartment._id.toString())
        .attach('file', path.join(FIXTURES_DIR, 'timetable_multipage_sample.pdf'));

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.data.totalSections, 3);
      assert.ok(res.body.data.provisionedCount >= 1);
      assert.ok(Array.isArray(res.body.data.sections));

      // Verify Master Curriculum was created
      const masterClass = await Class.findOne({
        departmentId: testDepartment._id,
        isMaster: true,
      }).lean();
      assert.ok(masterClass, 'Master curriculum should be hydrated');
      assert.ok(masterClass.subjectAssignments.length > 0, 'Master curriculum should contain subjects');
    });

    it('creates fresh active classes rather than reusing soft-deleted (isActive: false) classes in preview and batch-import', async () => {
      await Class.updateMany({ departmentId: testDepartment._id }, { $set: { isActive: false } });

      const previewRes = await request(app)
        .post('/api/timetable/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('departmentId', testDepartment._id.toString())
        .field('page', '1')
        .attach('file', path.join(FIXTURES_DIR, 'timetable_multipage_sample.pdf'));

      assert.strictEqual(previewRes.statusCode, 200);
      const previewClassId = previewRes.body.data.classId;
      assert.ok(previewClassId);
      assert.notStrictEqual(previewClassId, testClassA._id.toString());

      const getPreviewClassRes = await request(app)
        .get(`/api/classes/${previewClassId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.strictEqual(getPreviewClassRes.statusCode, 200);
      assert.strictEqual(getPreviewClassRes.body.data.isActive, true);

      const batchRes = await request(app)
        .post('/api/timetable/batch-import')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('departmentId', testDepartment._id.toString())
        .attach('file', path.join(FIXTURES_DIR, 'timetable_multipage_sample.pdf'));

      assert.strictEqual(batchRes.statusCode, 200);
      for (const sec of batchRes.body.data.sections) {
        const clsRes = await request(app)
          .get(`/api/classes/${sec.classId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        assert.strictEqual(clsRes.statusCode, 200, `Provisioned section ${sec.classId} must be active and fetchable`);
      }
    });

    it('keeps previewOnly non-mutating on Class collection and commits new section cleanly once with electives', async () => {
      await Class.updateMany({ departmentId: testDepartment._id }, { $set: { isActive: false } });

      // 1. Preview without creating any Class document
      const previewRes = await request(app)
        .post('/api/timetable/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('departmentId', testDepartment._id.toString())
        .field('page', '2')
        .field('previewOnly', 'true')
        .attach('file', path.join(FIXTURES_DIR, 'timetable_multipage_sample.pdf'));

      assert.strictEqual(previewRes.statusCode, 200);
      assert.strictEqual(previewRes.body.data.classId, null);
      assert.strictEqual(previewRes.body.data.existingClassFound, false);
      assert.ok(previewRes.body.data.rows.length > 0);

      const activeAfterPreview = await Class.countDocuments({
        departmentId: testDepartment._id,
        isActive: true,
        isMaster: { $ne: true },
      });
      assert.strictEqual(activeAfterPreview, 0, 'previewOnly must not create unconfirmed Class records');

      // 2. Confirm/commit creates exactly one Class and persists isElective flag
      const commitRes = await request(app)
        .post('/api/timetable/commit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          uploadId: previewRes.body.data.uploadId,
          className: 'CSE-C',
          academicYear: '2026-27',
          departmentId: testDepartment._id.toString(),
          targetSemester: 5,
          confirmedRows: [
            {
              subjectCode: '23CSD4M01',
              subjectName: 'Operating Systems',
              facultyId: null,
              facultyName: 'Unassigned',
              hours: 3,
              isElective: true,
              status: 'flagged',
            },
          ],
        });

      assert.strictEqual(commitRes.statusCode, 200);
      const committedId = commitRes.body.data.classId;
      assert.ok(committedId);

      const createdCls = await Class.findById(committedId).lean();
      assert.strictEqual(createdCls.name, 'CSE-C');
      assert.strictEqual(createdCls.subjectAssignments[0].subjectCode, '23CSD4M01');
      assert.strictEqual(createdCls.subjectAssignments[0].isElective, true);

      // 3. Re-committing with Roman prefix "III CSE-C" matches same Class without creating duplicate
      const recomRes = await request(app)
        .post('/api/timetable/commit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          uploadId: previewRes.body.data.uploadId,
          className: 'III CSE-C',
          academicYear: '2026-27',
          departmentId: testDepartment._id.toString(),
          targetSemester: 5,
          confirmedRows: [
            {
              subjectCode: '23CSD4M05',
              subjectName: 'Fundamentals of Machine Learning',
              facultyId: null,
              facultyName: 'Unassigned',
              hours: 4,
              isElective: true,
              status: 'flagged',
            },
          ],
        });

      assert.strictEqual(recomRes.statusCode, 200);
      assert.strictEqual(recomRes.body.data.classId, committedId);

      const totalActive = await Class.countDocuments({
        departmentId: testDepartment._id,
        isActive: true,
        isMaster: { $ne: true },
      });
      assert.strictEqual(totalActive, 1, 'Canonical Roman-prefix re-commit must reuse existing Class');
    });

    it('rejects duplicate canonical section creation on POST /api/classes with 409 DB_003', async () => {
      await Class.updateMany({ departmentId: testDepartment._id }, { $set: { isActive: false } });

      const firstRes = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'CSD-A',
          semester: 5,
          departmentId: testDepartment._id.toString(),
          academicYear: '2026-27',
        });
      assert.strictEqual(firstRes.statusCode, 201);

      const dupRes = await request(app)
        .post('/api/classes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'III CSD-A',
          semester: 5,
          departmentId: testDepartment._id.toString(),
          academicYear: '2026-27',
        });
      assert.strictEqual(dupRes.statusCode, 409);
      assert.strictEqual(dupRes.body.error.code, 'DB_003');
    });
  });

  // ── 4. Alphanumeric Elective Code Extraction ────────────────────────────────
  describe('extractTableRowsFromText() Alphanumeric Elective Codes', () => {
    it('extracts codes like 23CSD4M01 and 23CSD4M05 completely without slicing into subject titles', () => {
      const text = [
        'Subject Name\tFaculty Name\tHours',
        '23CSD4M01 Operating Systems\tDr. Alice\t3',
        '23CSD4M05 Fundamentals of Machine Learning\tProf. Bob\t4',
        'Time Table Incharge',
      ].join('\n');

      const rows = extractTableRowsFromText(text);
      assert.strictEqual(rows.length, 2);
      assert.strictEqual(rows[0].subjectCode, '23CSD4M01');
      assert.strictEqual(rows[0].subjectName, 'Operating Systems');
      assert.strictEqual(rows[0].isElective, true);
      assert.strictEqual(rows[1].subjectCode, '23CSD4M05');
      assert.strictEqual(rows[1].subjectName, 'Fundamentals of Machine Learning');
      assert.strictEqual(rows[1].isElective, true);

      // Verify parseTimetablePageFromText preserves isElective and fixes truncated Subject name
      const parsedPage = parseTimetablePageFromText(text, {
        pageNumber: 1,
        pageCount: 1,
        allFaculties: [],
        allSubjects: [
          {
            _id: new mongoose.Types.ObjectId(),
            code: '23CSD4M01',
            name: '23CSD4M01 Opera',
            isElective: false,
          },
        ],
      });
      assert.strictEqual(parsedPage.rows[0].subjectName, 'Operating Systems');
      assert.strictEqual(parsedPage.rows[0].isElective, true);
    });
  });

  // ── 5. Bulk Multi-Page Provisioning & Wizard Bulk Progress ──────────────────
  describe('POST /api/timetable/bulk-commit & PUT /api/wizard/classes/bulk-progress', () => {
    it('provisions ALL reviewed + unvisited PDF sections, preserves isElective in Master Curriculum, repairs truncated Subject, and syncs bulk progress', async () => {
      await Class.updateMany({ departmentId: testDepartment._id }, { $set: { isActive: false } });

      // Seed a legacy truncated subject to verify automatic repair via bulkUpsertSubjects
      await Subject.findOneAndUpdate(
        { code: '23CSD4M01' },
        { code: '23CSD4M01', name: '23CSD4M01 Opera', semester: 5, isElective: false, isActive: true },
        { upsert: true, new: true }
      );

      // Mixed selection: Page 1 user-reviewed with custom edit (Sem 5) + Page 2 unvisited auto-parsed (CSE-B) + CSE-C (Sem 7) + Page 3 (General Instructions non-table) & Page 99 skipped safely
      const sectionsSpec = [
        {
          pageNumber: 1,
          className: 'CSE-A',
          semester: 5,
          academicYear: '2026-27',
          departmentId: testDepartment._id.toString(),
          confirmedRows: [
            {
              subjectCode: '23CSD4M01',
              subjectName: 'Operating Systems',
              facultyId: null,
              facultyName: 'Dr. S. Kusuma',
              isElective: true,
              status: 'flagged',
            },
          ],
        },
        { pageNumber: 2 },
        {
          className: 'CSE-C',
          semester: 7,
          academicYear: '2026-27',
          departmentId: testDepartment._id.toString(),
          confirmedRows: [
            {
              subjectCode: '23CSD4M05',
              subjectName: 'Fundamentals of Machine Learning',
              facultyId: null,
              facultyName: 'Prof. Bob',
              isElective: true,
              status: 'flagged',
            },
          ],
        },
        { pageNumber: 3 },
        { pageNumber: 99 },
      ];

      const bulkRes = await request(app)
        .post('/api/timetable/bulk-commit')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('defaultDepartmentId', testDepartment._id.toString())
        .field('sections', JSON.stringify(sectionsSpec))
        .attach('file', path.join(FIXTURES_DIR, 'timetable_multipage_sample.pdf'));

      assert.strictEqual(bulkRes.statusCode, 200);
      assert.strictEqual(bulkRes.body.data.provisionedCount, 3);
      assert.strictEqual(bulkRes.body.data.sections.length, 3);
      assert.strictEqual(bulkRes.body.data.skippedPages.length, 2);
      assert.ok(bulkRes.body.data.skippedPages.some((p) => p.pageNumber === 3));
      assert.ok(bulkRes.body.data.skippedPages.some((p) => p.pageNumber === 99));

      // All 3 active operational classes must exist in MongoDB (no only-1-saved bug)
      const activeClasses = await Class.find({
        departmentId: testDepartment._id,
        isActive: true,
        isMaster: { $ne: true },
      }).lean();
      assert.strictEqual(activeClasses.length, 3);
      assert.ok(activeClasses.some((c) => c.name === 'CSE-B'), 'Unvisited PDF Page 2 must auto-detect CSE-B cleanly');

      // Verify Master Curricula hydrated across multiple semesters with isElective: true preserved
      const masterSem5 = await Class.findOne({
        departmentId: testDepartment._id,
        semester: 5,
        isMaster: true,
        isActive: true,
      }).lean();
      assert.ok(masterSem5, 'Semester 5 Master Curriculum must be created');
      const electiveMaster = masterSem5.subjectAssignments.find((s) => s.subjectCode === '23CSD4M01');
      assert.ok(electiveMaster);
      assert.strictEqual(electiveMaster.isElective, true);

      const masterSem7 = await Class.findOne({
        departmentId: testDepartment._id,
        semester: 7,
        isMaster: true,
        isActive: true,
      }).lean();
      assert.ok(masterSem7, 'Semester 7 Master Curriculum must be created');
      assert.strictEqual(masterSem7.subjectAssignments[0].subjectCode, '23CSD4M05');
      assert.strictEqual(masterSem7.subjectAssignments[0].isElective, true);

      // Verify Subject record repaired cleanly from '23CSD4M01 Opera' -> 'Operating Systems'
      const repairedSub = await Subject.findOne({ code: '23CSD4M01' }).lean();
      assert.strictEqual(repairedSub.name, 'Operating Systems');
      assert.strictEqual(repairedSub.isElective, true);

      // Verify bulk-commit idempotency with Roman prefixes doesn't create duplicate active classes
      const repeatRes = await request(app)
        .post('/api/timetable/bulk-commit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          defaultDepartmentId: testDepartment._id.toString(),
          sections: [
            {
              className: 'III CSE-A',
              semester: 5,
              academicYear: '2026-27',
              departmentId: testDepartment._id.toString(),
              confirmedRows: [
                {
                  subjectCode: '23CSD4M01',
                  subjectName: 'Operating Systems',
                  facultyId: null,
                  facultyName: 'Dr. S. Kusuma',
                  isElective: true,
                  status: 'flagged',
                },
              ],
            },
          ],
        });
      assert.strictEqual(repeatRes.statusCode, 200);
      const activeAfterRepeat = await Class.countDocuments({
        departmentId: testDepartment._id,
        isActive: true,
        isMaster: { $ne: true },
      });
      assert.strictEqual(activeAfterRepeat, 3, 'Canonical Roman-prefix re-commit must not duplicate classes');

      // Verify PUT /api/wizard/classes/bulk-progress advances all 3 classes together
      await setFeatureFlag('setup_wizard_enabled', true, 'test bulk progress');
      const allIds = activeClasses.map((c) => c._id.toString());
      const bulkProgRes = await request(app)
        .put('/api/wizard/classes/bulk-progress')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          classIds: allIds,
          step: 'students',
          markCompleted: true,
          data: { skipped: true },
        });
      assert.strictEqual(bulkProgRes.statusCode, 200);
      assert.strictEqual(bulkProgRes.body.data.updatedCount, 3);

      const syncedClasses = await Class.find({ _id: { $in: allIds } }).lean();
      for (const cls of syncedClasses) {
        assert.ok(cls.wizardProgress.completedSteps.includes('students'));
        assert.strictEqual(cls.wizardProgress.stepData?.students?.skipped, true);
      }
    });
  });
});
