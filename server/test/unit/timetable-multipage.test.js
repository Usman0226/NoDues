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
import { inspectPdfPages, parseTimetablePdf } from '../../src/services/timetableParser.js';

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
  });
});
