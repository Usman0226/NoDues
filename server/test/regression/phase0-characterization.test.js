/**
 * phase0-characterization.test.js — Phase 0 Characterization Regression Suite
 * TRD Reference: TRD §5 Phase 0 (Step 0.4) | Non-Negotiable Constraints: NC-1, NC-2, NC-6, NFR-5
 *
 * This test suite asserts and locks down the CURRENT behavior of the NoDues engine:
 *   - Status computation & recalculation
 *   - Batch initiation (facultySnapshot generation)
 *   - Student status endpoint response shape
 *   - Approvals, rejections, overrides, and concurrency
 *
 * Rules:
 *   - Assert current behavior as-is. Do NOT fix discovered bugs; document them instead.
 *   - Deterministic seed data with synthetic IDs.
 *   - Enforce test database safety (^test_ prefix, no production hosts).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';

import app from '../../src/app.js';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearTestDatabase,
  signTestToken,
  validateConnectionSafety
} from '../harness/testHarness.js';

// Models
import Department from '../../src/models/Department.js';
import Faculty from '../../src/models/Faculty.js';
import Class from '../../src/models/Class.js';
import Subject from '../../src/models/Subject.js';
import Student from '../../src/models/Student.js';
import NodueBatch from '../../src/models/NodueBatch.js';
import NodueRequest from '../../src/models/NodueRequest.js';
import NodueApproval from '../../src/models/NodueApproval.js';
import CoCurricularType from '../../src/models/CoCurricularType.js';

describe('TRD Step 0.4: Characterization Regression Suite', () => {
  let adminUser, adminToken;
  let hodUser, hodToken;
  let facultyA, facultyAToken;
  let facultyB, facultyBToken;
  let studentUser, studentToken;
  let department;
  let subject1, subject2, electiveSubject;
  let testClass;

  before(async () => {
    await setupTestEnvironment();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    // ── Deterministic Seed Setup ──────────────────────────────────────────────
    department = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true,
    });

    adminUser = {
      _id: new mongoose.Types.ObjectId(),
      name: 'System Admin',
      email: 'admin@test.local',
      role: 'admin',
      roleTags: ['admin'],
    };
    adminToken = signTestToken(adminUser);

    hodUser = await Faculty.create({
      name: 'Dr. HoD CSE',
      email: 'hod.cse@test.edu',
      employeeId: 'EMP001',
      password: 'password123',
      departmentId: department._id,
      roleTags: ['hod', 'faculty'],
      role: 'hod',
      isActive: true,
    });
    hodToken = signTestToken({ ...hodUser.toObject(), role: 'hod' });

    facultyA = await Faculty.create({
      name: 'Prof. Alice Faculty',
      email: 'alice@test.edu',
      employeeId: 'EMP002',
      password: 'password123',
      departmentId: department._id,
      roleTags: ['faculty', 'classTeacher'],
      role: 'faculty',
      isActive: true,
    });
    facultyAToken = signTestToken({ ...facultyA.toObject(), role: 'faculty' });

    facultyB = await Faculty.create({
      name: 'Prof. Bob Faculty',
      email: 'bob@test.edu',
      employeeId: 'EMP003',
      password: 'password123',
      departmentId: department._id,
      roleTags: ['faculty', 'mentor'],
      role: 'faculty',
      isActive: true,
    });
    facultyBToken = signTestToken({ ...facultyB.toObject(), role: 'faculty' });

    subject1 = await Subject.create({
      name: 'Data Structures',
      code: 'CS301',
      departmentId: department._id,
      semester: 3,
      isActive: true,
    });

    subject2 = await Subject.create({
      name: 'Database Systems',
      code: 'CS302',
      departmentId: department._id,
      semester: 3,
      isActive: true,
    });

    electiveSubject = await Subject.create({
      name: 'Cloud Computing',
      code: 'CS305E',
      departmentId: department._id,
      semester: 3,
      isActive: true,
    });

    testClass = await Class.create({
      name: 'CSE-3A',
      departmentId: department._id,
      semester: 3,
      academicYear: '2026-2027',
      classTeacherId: facultyA._id, // Faculty A is Class Teacher
      subjectAssignments: [
        {
          subjectId: subject1._id,
          subjectName: subject1.name,
          subjectCode: subject1.code,
          facultyId: facultyA._id, // Faculty A also teaches Subject 1
          facultyName: facultyA.name,
          isElective: false,
        },
        {
          subjectId: subject2._id,
          subjectName: subject2.name,
          subjectCode: subject2.code,
          facultyId: facultyB._id, // Faculty B teaches Subject 2
          facultyName: facultyB.name,
          isElective: false,
        },
      ],
      isActive: true,
    });

    studentUser = await Student.create({
      rollNo: '24CS001',
      name: 'John Student',
      email: 'john@student.edu',
      departmentId: department._id,
      classId: testClass._id,
      semester: 3,
      academicYear: '2026-2027',
      mentorId: facultyB._id, // Faculty B is Mentor
      electiveSubjects: [],
      isActive: true,
    });
    studentToken = signTestToken({ ...studentUser.toObject(), role: 'student' });
  });

  // ── Scenario 0: Safety Harness Gate ─────────────────────────────────────────
  describe('Safety Harness Verification', () => {
    it('refuses to run if database name does NOT start with test_', () => {
      assert.throws(
        () => validateConnectionSafety('mongodb://127.0.0.1:27017/nodues_production'),
        /SAFETY VIOLATION REFUSED: Target database "nodues_production" does not start with "test_"/
      );
    });

    it('refuses to run if host matches production host pattern', () => {
      assert.throws(
        () =>
          validateConnectionSafety(
            'mongodb+srv://user:pass@cluster0.lgbf0fe.mongodb.net/test_something'
          ),
        /matches production pattern "cluster0\.lgbf0fe\.mongodb\.net"/
      );
    });

    it('accepts valid test URI with test_ prefix and safe host', () => {
      const res = validateConnectionSafety('mongodb://127.0.0.1:27017/test_nodues_verification');
      assert.equal(res.safe, true);
      assert.equal(res.dbName, 'test_nodues_verification');
    });
  });

  // ── Scenario 1: Approval Types Matrix ───────────────────────────────────────
  describe('Scenario 1: Approval Types & Snapshot Generation', () => {
    it('generates approval records for subject, classTeacher, mentor, elective, and coCurricular', async () => {
      // Add coCurricular item to department
      const ccType = await CoCurricularType.create({
        name: 'NSS Clearance',
        code: 'NSS01',
        departmentId: department._id,
        coordinatorId: facultyB._id,
        applicableYears: [2], // 3rd sem = Year 2
        isOptional: true,
        isActive: true,
      });

      // Update student with elective
      await Student.updateOne(
        { _id: studentUser._id },
        {
          $set: {
            electiveSubjects: [
              {
                subjectId: electiveSubject._id,
                subjectName: electiveSubject.name,
                subjectCode: electiveSubject.code,
                facultyId: facultyB._id,
                facultyName: facultyB.name,
              },
            ],
          },
        }
      );

      const res = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id, deadline: '2026-12-31T23:59:59.000Z' });

      assert.equal(res.status, 201, `Initiation failed: ${JSON.stringify(res.body)}`);

      const approvals = await NodueApproval.find({ studentId: studentUser._id }).lean();
      const approvalTypes = approvals.map((a) => a.approvalType);

      assert.ok(approvalTypes.includes('subject'), 'Missing subject approval');
      assert.ok(approvalTypes.includes('classTeacher'), 'Missing classTeacher approval');
      assert.ok(approvalTypes.includes('mentor'), 'Missing mentor approval');
      assert.ok(approvalTypes.includes('coCurricular'), 'Missing coCurricular approval');

      // Check elective subject is created under approvalType 'subject'
      const electiveAppr = approvals.find(
        (a) => a.subjectId?.toString() === electiveSubject._id.toString()
      );
      assert.ok(electiveAppr, 'Missing elective subject approval');
      assert.equal(electiveAppr.facultyId.toString(), facultyB._id.toString());
    });
  });

  // ── Scenario 2: Same Faculty Teaching Two Subjects ──────────────────────────
  describe('Scenario 2: Same Faculty Teaching Two Subjects in a Class', () => {
    it('creates two distinct approval records with distinct subjectIds for the same faculty', async () => {
      // Assign both subject1 and subject2 to Faculty A
      await Class.updateOne(
        { _id: testClass._id },
        {
          $set: {
            subjectAssignments: [
              {
                subjectId: subject1._id,
                subjectName: subject1.name,
                subjectCode: subject1.code,
                facultyId: facultyA._id,
                facultyName: facultyA.name,
              },
              {
                subjectId: subject2._id,
                subjectName: subject2.name,
                subjectCode: subject2.code,
                facultyId: facultyA._id, // Faculty A teaches both
                facultyName: facultyA.name,
              },
            ],
          },
        }
      );

      const res = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      assert.equal(res.status, 201);

      const approvals = await NodueApproval.find({
        studentId: studentUser._id,
        facultyId: facultyA._id,
        approvalType: 'subject',
      }).lean();

      assert.equal(approvals.length, 2, 'Should create 2 distinct subject approvals for Faculty A');
      const subjectIds = approvals.map((a) => a.subjectId.toString());
      assert.ok(subjectIds.includes(subject1._id.toString()));
      assert.ok(subjectIds.includes(subject2._id.toString()));
    });
  });

  // ── Scenario 3: Class Teacher who also teaches a Subject ─────────────────────
  describe('Scenario 3: Class Teacher Who Also Teaches a Subject', () => {
    it('creates two distinct records: one classTeacher and one subject approval', async () => {
      // In seed: Faculty A is Class Teacher and also assigned to Subject 1
      const res = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      assert.equal(res.status, 201);

      const approvals = await NodueApproval.find({
        studentId: studentUser._id,
        facultyId: facultyA._id,
      }).lean();

      const ctApproval = approvals.find((a) => a.approvalType === 'classTeacher');
      const subApproval = approvals.find(
        (a) => a.approvalType === 'subject' && a.subjectId?.toString() === subject1._id.toString()
      );

      assert.ok(ctApproval, 'Faculty A must have a classTeacher approval record');
      assert.ok(subApproval, 'Faculty A must have a subject approval record');
      assert.notEqual(
        ctApproval._id.toString(),
        subApproval._id.toString(),
        'Records must have distinct IDs'
      );
    });
  });

  // ── Scenario 4: HoD Who Teaches a Subject ───────────────────────────────────
  describe('Scenario 4: HoD Who Teaches a Subject', () => {
    it('creates subject approval for HoD; HoD override remains a separate action', async () => {
      // Assign Subject 1 to HoD
      await Class.updateOne(
        { _id: testClass._id, 'subjectAssignments.subjectId': subject1._id },
        {
          $set: {
            'subjectAssignments.$.facultyId': hodUser._id,
            'subjectAssignments.$.facultyName': hodUser.name,
          },
        }
      );

      const res = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      assert.equal(res.status, 201);

      // Verify HoD has a subject approval record
      const hodSubjectApproval = await NodueApproval.findOne({
        studentId: studentUser._id,
        facultyId: hodUser._id,
        approvalType: 'subject',
      }).lean();

      assert.ok(hodSubjectApproval, 'HoD must have a subject approval record for teaching subject');

      // Verify no automatic "hodApproval" clearance record is in the batch (removed per 2026-04-29 change)
      const hodClearanceRecord = await NodueApproval.findOne({
        studentId: studentUser._id,
        approvalType: 'hodApproval',
      }).lean();
      assert.equal(hodClearanceRecord, null, 'No automatic hodApproval item should exist');
    });
  });

  // ── Scenario 5: Elective & Student with No Mentor ────────────────────────────
  describe('Scenario 5: Elective and Student With No Mentor Assigned', () => {
    it('initiates cleanly when student has an elective and no mentor assigned', async () => {
      // Create student with no mentor
      const studentNoMentor = await Student.create({
        rollNo: '24CS099',
        name: 'No Mentor Student',
        email: 'nomentor@student.edu',
        departmentId: department._id,
        classId: testClass._id,
        semester: 3,
        academicYear: '2026-2027',
        mentorId: null, // No mentor
        electiveSubjects: [
          {
            subjectId: electiveSubject._id,
            subjectName: electiveSubject.name,
            subjectCode: electiveSubject.code,
            facultyId: facultyB._id,
            facultyName: facultyB.name,
          },
        ],
        isActive: true,
      });

      const res = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      assert.equal(res.status, 201);

      const approvals = await NodueApproval.find({ studentId: studentNoMentor._id }).lean();
      const mentorApproval = approvals.find((a) => a.approvalType === 'mentor');
      const electiveApproval = approvals.find(
        (a) => a.subjectId?.toString() === electiveSubject._id.toString()
      );

      assert.equal(mentorApproval, undefined, 'Student with no mentor should have no mentor approval');
      assert.ok(electiveApproval, 'Student must have elective approval');
    });
  });

  // ── Scenario 6: Status Lifecycle Flow ────────────────────────────────────────
  describe('Scenario 6: Status Flow (pending -> has_dues -> edited to approved -> cleared)', () => {
    it('progresses request status correctly through due marking, editing, and final clearing', async () => {
      await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      const requestDoc = await NodueRequest.findOne({ studentId: studentUser._id }).lean();
      assert.equal(requestDoc.status, 'pending', 'Initial status must be pending');

      const approvals = await NodueApproval.find({ requestId: requestDoc._id }).lean();
      const approval1 = approvals[0];
      const otherApprovals = approvals.slice(1);

      // 1. Mark due on first approval
      const markDueRes = await request(app)
        .post('/api/approvals/mark-due')
        .set('Authorization', `Bearer ${approval1.facultyId.toString() === facultyA._id.toString() ? facultyAToken : facultyBToken}`)
        .send({
          approvalId: approval1._id,
          dueType: 'library',
          remarks: 'Fine pending Rs. 50',
        });

      assert.equal(markDueRes.status, 200);
      const reqAfterDue = await NodueRequest.findById(requestDoc._id).lean();
      assert.equal(reqAfterDue.status, 'has_dues', 'Status must transition to has_dues');

      // 2. Approve all other approvals
      for (const a of otherApprovals) {
        const token = a.facultyId.toString() === facultyA._id.toString() ? facultyAToken : facultyBToken;
        await request(app)
          .post('/api/approvals/approve')
          .set('Authorization', `Bearer ${token}`)
          .send({ approvalId: a._id });
      }

      // Status should still be has_dues because approval1 has due
      const reqStillDue = await NodueRequest.findById(requestDoc._id).lean();
      assert.equal(reqStillDue.status, 'has_dues');

      // 3. Edit approval1 from due_marked to approved via PATCH
      const patchRes = await request(app)
        .patch(`/api/approvals/${approval1._id}`)
        .set('Authorization', `Bearer ${approval1.facultyId.toString() === facultyA._id.toString() ? facultyAToken : facultyBToken}`)
        .send({ action: 'approved' });

      assert.equal(patchRes.status, 200);

      // 4. Request status must now be 'cleared'
      const reqCleared = await NodueRequest.findById(requestDoc._id).lean();
      assert.equal(reqCleared.status, 'cleared', 'Status must transition to cleared when all approvals are approved');
    });
  });

  // ── Scenario 7: HoD Override Allowed Only From has_dues ─────────────────────
  describe('Scenario 7: HoD Override Pre-conditions', () => {
    it('rejects override when request status is pending', async () => {
      await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      const requestDoc = await NodueRequest.findOne({ studentId: studentUser._id }).lean();
      assert.equal(requestDoc.status, 'pending');

      const res = await request(app)
        .post('/api/hod/override')
        .set('Authorization', `Bearer ${hodToken}`)
        .send({
          requestId: requestDoc._id,
          overrideRemark: 'Premature override',
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.error?.code, 'OVERRIDE_NOT_APPLICABLE');
    });

    it('allows override when request status is has_dues', async () => {
      await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      const approval = await NodueApproval.findOne({
        studentId: studentUser._id,
        facultyId: facultyA._id,
      }).lean();

      // Mark due
      await request(app)
        .post('/api/approvals/mark-due')
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ approvalId: approval._id, dueType: 'lab', remarks: 'Broken beaker' });

      const reqDoc = await NodueRequest.findOne({ studentId: studentUser._id }).lean();
      assert.equal(reqDoc.status, 'has_dues');

      // HoD Override
      const res = await request(app)
        .post('/api/hod/override')
        .set('Authorization', `Bearer ${hodToken}`)
        .send({
          requestId: reqDoc._id,
          overrideRemark: 'Sanctioned by Dean Academic',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data?.status, 'hod_override');

      const updated = await NodueRequest.findById(reqDoc._id).lean();
      assert.equal(updated.status, 'hod_override');
      assert.equal(updated.overrideRemark, 'Sanctioned by Dean Academic');
      assert.equal(updated.overriddenBy.toString(), hodUser._id.toString());
    });
  });

  // ── Scenario 8: Action on a Closed Batch Rejected ───────────────────────────
  describe('Scenario 8: Closed Batch Lockout', () => {
    it('rejects approval action with 400 BATCH_CLOSED when batch is closed', async () => {
      const initRes = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      assert.equal(initRes.status, 201, `Initiation failed: ${JSON.stringify(initRes.body)}`);
      const batchId = initRes.body.data.batchId;

      const approval = await NodueApproval.findOne({
        studentId: studentUser._id,
        facultyId: facultyA._id,
      }).lean();

      // Mark due while batch is active so request transitions to 'has_dues'
      await request(app)
        .post('/api/approvals/mark-due')
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ approvalId: approval._id, dueType: 'fees', remarks: 'Tuition dues' });

      // Close the batch
      const closeRes = await request(app)
        .patch(`/api/batch/${batchId}/close`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(closeRes.status, 200);

      // Attempt to update approval on closed batch
      const approveRes = await request(app)
        .patch(`/api/approvals/${approval._id}`)
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ action: 'approved' });

      assert.equal(approveRes.status, 400);
      assert.equal(approveRes.body.error?.code, 'BATCH_CLOSED');

      // Attempt HoD override on closed batch (status is has_dues, but batch is closed)
      const overrideRes = await request(app)
        .post('/api/hod/override')
        .set('Authorization', `Bearer ${hodToken}`)
        .send({ requestId: approval.requestId, overrideRemark: 'Late override' });

      assert.equal(overrideRes.status, 400);
      assert.equal(overrideRes.body.error?.code, 'BATCH_CLOSED');
    });
  });

  // ── Scenario 9: Duplicate Batch Initiation & Empty Class Validation ─────────
  describe('Scenario 9: Duplicate Batch Initiation & Initiation Guardrails', () => {
    it('returns 409 Conflict when initiating a batch for a class with an already-active batch', async () => {
      const first = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });
      assert.equal(first.status, 201);

      const second = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      assert.equal(second.status, 409);
      assert.ok(second.body.error?.message?.includes('Active session already exists'));
    });

    it('rejects initiation with 400 when class has no active students', async () => {
      const emptyClass = await Class.create({
        name: 'EMPTY-CLASS',
        departmentId: department._id,
        semester: 1,
        academicYear: '2026-2027',
        isActive: true,
      });

      const res = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: emptyClass._id });

      assert.equal(res.status, 400);
      assert.ok(res.body.error?.message?.includes('No active students found'));
    });

    it('characterizes behavior: class with students but no subjects assigned', async () => {
      // In current code, initiateBatch proceeds if students exist, even if 0 subjects
      const noSubjectsClass = await Class.create({
        name: 'NO-SUBJECTS',
        departmentId: department._id,
        semester: 1,
        academicYear: '2026-2027',
        classTeacherId: facultyA._id,
        subjectAssignments: [], // No subjects
        isActive: true,
      });

      await Student.create({
        rollNo: '24CS888',
        name: 'Student In No-Subject Class',
        email: 'nosubject@student.edu',
        departmentId: department._id,
        classId: noSubjectsClass._id,
        semester: 1,
        academicYear: '2026-2027',
        isActive: true,
      });

      const res = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: noSubjectsClass._id });

      // Characterization: Current code allows initiation (returns 201) with warnings in preview only
      assert.equal(res.status, 201);
    });
  });

  // ── Scenario 10: Authorization & Double Approval ────────────────────────────
  describe('Scenario 10: Approval Authorization & Double Action Guardrails', () => {
    it('rejects Faculty B attempting to approve Faculty A approval record with 403 Access Denied', async () => {
      await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      const facultyAApproval = await NodueApproval.findOne({
        studentId: studentUser._id,
        facultyId: facultyA._id,
        approvalType: 'subject',
      }).lean();

      // Faculty B attempts to approve Faculty A's record
      const res = await request(app)
        .post('/api/approvals/approve')
        .set('Authorization', `Bearer ${facultyBToken}`)
        .send({ approvalId: facultyAApproval._id });

      assert.equal(res.status, 403);
    });

    it('rejects double-approving an already actioned approval record with 400 APPROVAL_ALREADY_ACTIONED', async () => {
      await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      const approval = await NodueApproval.findOne({
        studentId: studentUser._id,
        facultyId: facultyA._id,
        approvalType: 'subject',
      }).lean();

      // First approval
      const first = await request(app)
        .post('/api/approvals/approve')
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ approvalId: approval._id });
      assert.equal(first.status, 200);

      // Second approval attempt
      const second = await request(app)
        .post('/api/approvals/approve')
        .set('Authorization', `Bearer ${facultyAToken}`)
        .send({ approvalId: approval._id });

      assert.equal(second.status, 400);
      assert.equal(second.body.error?.code, 'APPROVAL_ALREADY_ACTIONED');
    });
  });

  // ── Scenario 11: Concurrent Approvals Consistency ───────────────────────────
  describe('Scenario 11: Concurrent Approvals Final Status Consistency', () => {
    it('results in consistent cleared status when two faculty approve concurrently', async () => {
      await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      const approvals = await NodueApproval.find({ studentId: studentUser._id }).lean();
      assert.ok(approvals.length >= 2, 'Need at least 2 approvals for concurrent test');

      // Execute approvals in parallel
      const approvalPromises = approvals.map((a) => {
        const token =
          a.facultyId.toString() === facultyA._id.toString() ? facultyAToken : facultyBToken;
        return request(app)
          .post('/api/approvals/approve')
          .set('Authorization', `Bearer ${token}`)
          .send({ approvalId: a._id });
      });

      const results = await Promise.all(approvalPromises);
      for (const res of results) {
        assert.equal(res.status, 200);
      }

      const finalRequest = await NodueRequest.findOne({ studentId: studentUser._id }).lean();
      assert.equal(finalRequest.status, 'cleared', 'Final status must be cleared after all approvals');
    });
  });

  // ── Scenario 12: Late Student & Faculty Removal ─────────────────────────────
  describe('Scenario 12: Active Batch Mutation (Late Student & Faculty Removal)', () => {
    it('adds a late student to an active batch with all approval records created', async () => {
      const initRes = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      assert.equal(initRes.status, 201, `Initiation failed: ${JSON.stringify(initRes.body)}`);
      const batchId = initRes.body.data.batchId;

      // Late student
      const lateStudent = await Student.create({
        rollNo: '24CS555',
        name: 'Late Joining Student',
        email: 'late@student.edu',
        departmentId: department._id,
        classId: testClass._id,
        semester: 3,
        academicYear: '2026-2027',
        mentorId: facultyA._id,
        isActive: true,
      });

      const addRes = await request(app)
        .post(`/api/batch/${batchId}/students`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ studentId: lateStudent._id });

      assert.equal(addRes.status, 201);

      const requestDoc = await NodueRequest.findOne({
        batchId,
        studentId: lateStudent._id,
      }).lean();
      assert.ok(requestDoc, 'NodueRequest must be created for late student');
      assert.equal(requestDoc.status, 'pending');

      const approvals = await NodueApproval.find({
        batchId,
        studentId: lateStudent._id,
      }).lean();
      assert.ok(approvals.length > 0, 'Approvals must be generated for late student');
    });

    it('removes pending approvals when a faculty member is removed from an active batch', async () => {
      const initRes = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id });

      assert.equal(initRes.status, 201, `Initiation failed: ${JSON.stringify(initRes.body)}`);
      const batchId = initRes.body.data.batchId;

      const beforeApprovals = await NodueApproval.countDocuments({
        batchId,
        facultyId: facultyB._id,
        action: 'pending',
      });
      assert.ok(beforeApprovals > 0);

      // Remove Faculty B from batch
      const removeRes = await request(app)
        .delete(`/api/batch/${batchId}/faculty/${facultyB._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(removeRes.status, 200);
      assert.equal(removeRes.body.data.pendingApprovalsRemoved, beforeApprovals);

      const afterApprovals = await NodueApproval.countDocuments({
        batchId,
        facultyId: facultyB._id,
      });
      assert.equal(afterApprovals, 0, 'Pending approvals for Faculty B should be removed');
    });
  });

  // ── Scenario 13: Student Status Response Shape ──────────────────────────────
  describe('Scenario 13: Student Status Endpoint Response Shape (GET /api/student/status)', () => {
    it('returns exact expected response shape with metadata and approvals breakdown', async () => {
      const initRes = await request(app)
        .post('/api/batch/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ classId: testClass._id, deadline: '2026-12-31T23:59:59.000Z' });
      assert.equal(initRes.status, 201, `Initiation failed: ${JSON.stringify(initRes.body)}`);

      const res = await request(app)
        .get('/api/student/status')
        .set('Authorization', `Bearer ${studentToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data, 'Missing data payload');

      const { data } = res.body;
      assert.equal(typeof data.status, 'string');
      assert.equal(data.rollNo, studentUser.rollNo);
      assert.equal(data.studentName, studentUser.name);
      assert.ok(data.metadata, 'Missing metadata');
      assert.equal(data.metadata.batchName, testClass.name);
      assert.equal(data.metadata.semester, testClass.semester);
      assert.ok(Array.isArray(data.approvals), 'approvals must be an array');

      // Verify shape of approval items in student status
      const item = data.approvals[0];
      assert.ok('id' in item);
      assert.ok('facultyName' in item);
      assert.ok('subjectName' in item);
      assert.ok('action' in item);
      assert.ok('approvalType' in item);
      assert.ok('roleTag' in item);
      assert.ok('isOptional' in item);
    });
  });
});
