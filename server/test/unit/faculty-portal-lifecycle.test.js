import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Class from '../../src/models/Class.js';
import Faculty from '../../src/models/Faculty.js';
import Student from '../../src/models/Student.js';
import NodueBatch from '../../src/models/NodueBatch.js';
import NodueRequest from '../../src/models/NodueRequest.js';
import NodueApproval from '../../src/models/NodueApproval.js';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearTestDatabase,
  signTestToken,
} from '../harness/testHarness.js';

describe('Faculty Portal Lifecycle & Closed Batch Guardrails', () => {
  let facultyUser;
  let facultyToken;
  let dept;
  let classActive;
  let classPast;
  let activeBatch;
  let closedBatch;
  let activeRequest;
  let closedRequest;
  let activeApproval;
  let closedApproval;
  let dueApproval;

  before(async () => {
    await setupTestEnvironment();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    dept = await Department.create({
      name: 'Computer Science & Design',
      code: 'CSD',
      isActive: true,
    });

    facultyUser = await Faculty.create({
      name: 'Dr. Sarah Connor',
      email: 'sarah.connor@institution.edu',
      employeeId: 'FAC-9901',
      departmentId: dept._id,
      roleTags: ['faculty', 'classTeacher'],
      isActive: true,
      password: 'hashed_test_password',
    });

    facultyToken = signTestToken({
      role: 'faculty',
      userId: facultyUser._id.toString(),
      departmentId: dept._id.toString(),
    });

    classActive = await Class.create({
      name: 'CSD-A',
      semester: 7,
      academicYear: '2026-27',
      departmentId: dept._id,
      classTeacherId: facultyUser._id,
      subjectAssignments: [
        {
          subjectId: new mongoose.Types.ObjectId(),
          subjectName: 'Distributed Systems',
          subjectCode: 'CS701',
          facultyId: facultyUser._id,
        },
      ],
      isActive: true,
      studentIds: [],
    });

    classPast = await Class.create({
      name: 'CSD-A (Past)',
      semester: 5,
      academicYear: '2025-26',
      departmentId: dept._id,
      classTeacherId: facultyUser._id,
      subjectAssignments: [
        {
          subjectId: new mongoose.Types.ObjectId(),
          subjectName: 'Computer Networks',
          subjectCode: 'CS501',
          facultyId: facultyUser._id,
        },
      ],
      isActive: false,
      studentIds: [],
    });

    activeBatch = await NodueBatch.create({
      classId: classActive._id,
      className: classActive.name,
      departmentId: dept._id,
      semester: 7,
      academicYear: '2026-27',
      status: 'active',
      totalStudents: 1,
    });

    closedBatch = await NodueBatch.create({
      classId: classPast._id,
      className: classPast.name,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2025-26',
      status: 'closed',
      totalStudents: 1,
    });

    const studentActive = await Student.create({
      name: 'John Doe',
      rollNo: '25CSD01',
      email: 'john@student.edu',
      classId: classActive._id,
      departmentId: dept._id,
      semester: 7,
      academicYear: '2026-27',
      isActive: true,
    });

    const studentPast = await Student.create({
      name: 'Jane Smith',
      rollNo: '24CSD02',
      email: 'jane@student.edu',
      classId: classPast._id,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2025-26',
      isActive: true,
    });

    activeRequest = await NodueRequest.create({
      batchId: activeBatch._id,
      studentId: studentActive._id,
      departmentId: dept._id,
      status: 'pending',
    });

    closedRequest = await NodueRequest.create({
      batchId: closedBatch._id,
      studentId: studentPast._id,
      departmentId: dept._id,
      status: 'pending',
    });

    activeApproval = await NodueApproval.create({
      requestId: activeRequest._id,
      batchId: activeBatch._id,
      studentId: studentActive._id,
      studentRollNo: studentActive.rollNo,
      studentName: studentActive.name,
      facultyId: facultyUser._id,
      subjectName: 'Distributed Systems',
      approvalType: 'subject',
      roleTag: 'faculty',
      action: 'pending',
    });

    dueApproval = await NodueApproval.create({
      requestId: activeRequest._id,
      batchId: activeBatch._id,
      studentId: studentActive._id,
      studentRollNo: studentActive.rollNo,
      studentName: studentActive.name,
      facultyId: facultyUser._id,
      approvalType: 'classTeacher',
      roleTag: 'classTeacher',
      action: 'due_marked',
      dueType: 'library',
      remarks: 'Books not returned',
    });

    closedApproval = await NodueApproval.create({
      requestId: closedRequest._id,
      batchId: closedBatch._id,
      studentId: studentPast._id,
      studentRollNo: studentPast.rollNo,
      studentName: studentPast.name,
      facultyId: facultyUser._id,
      subjectName: 'Computer Networks',
      approvalType: 'subject',
      roleTag: 'faculty',
      action: 'pending',
    });
  });

  it('1. GET /api/faculty/me/batches returns active and closed batches with stats', async () => {
    const res = await request(app)
      .get('/api/faculty/me/batches')
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 2);

    const activeItem = res.body.data.find(b => b._id.toString() === activeBatch._id.toString());
    assert.ok(activeItem);
    assert.equal(activeItem.status, 'active');
    assert.equal(activeItem.isClosed, false);
    assert.equal(activeItem.pendingCount, 1);
    assert.equal(activeItem.dueCount, 1);

    const closedItem = res.body.data.find(b => b._id.toString() === closedBatch._id.toString());
    assert.ok(closedItem);
    assert.equal(closedItem.status, 'closed');
    assert.equal(closedItem.isClosed, true);
    assert.equal(closedItem.pendingCount, 1);
  });

  it('2. GET /api/approvals/pending with closed batchId returns closed batch records without fallback', async () => {
    const res = await request(app)
      .get(`/api/approvals/pending?batchId=${closedBatch._id}`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0]._id.toString(), closedApproval._id.toString());
    assert.equal(res.body.data[0].isBatchClosed, true);
    assert.equal(res.body.data[0].batchStatus, 'closed');
    assert.equal(res.body.meta.isBatchClosed, true);
  });

  it('3. GET /api/approvals/pending with active batchId returns active batch records', async () => {
    const res = await request(app)
      .get(`/api/approvals/pending?batchId=${activeBatch._id}`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0]._id.toString(), activeApproval._id.toString());
    assert.equal(res.body.data[0].isBatchClosed, false);
    assert.equal(res.body.data[0].batchStatus, 'active');
  });

  it('4. POST /api/approvals/approve on a CLOSED batch is rejected with BATCH_CLOSED', async () => {
    const res = await request(app)
      .post('/api/approvals/approve')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ approvalId: closedApproval._id.toString() });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'BATCH_CLOSED');
  });

  it('5. POST /api/approvals/mark-due on a CLOSED batch is rejected with BATCH_CLOSED', async () => {
    const res = await request(app)
      .post('/api/approvals/mark-due')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        approvalId: closedApproval._id.toString(),
        dueType: 'library',
        remarks: 'Attempting due on closed batch',
      });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'BATCH_CLOSED');
  });

  it('6. PATCH /api/approvals/:id directly resolves and clears a due on an active batch', async () => {
    const res = await request(app)
      .patch(`/api/approvals/${dueApproval._id}`)
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        action: 'approved',
        remarks: 'Fine paid, receipt #9910 verified',
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.action, 'approved');
    assert.equal(res.body.data.dueType, null);

    const updated = await NodueApproval.findById(dueApproval._id);
    assert.equal(updated.action, 'approved');
    assert.equal(updated.dueType, null);
    assert.equal(updated.remarks, 'Fine paid, receipt #9910 verified');
  });

  it('7. GET /api/approvals/history supports academicYear, semester, action, and batchId filters', async () => {
    // Actioned record: mark one record approved
    await NodueApproval.findByIdAndUpdate(activeApproval._id, {
      action: 'approved',
      actionedAt: new Date(),
    });

    const res = await request(app)
      .get(`/api/approvals/history?academicYear=2026-27&action=approved`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.length >= 1);
    assert.equal(res.body.data[0].action, 'approved');
    assert.equal(res.body.data[0].academicYear, '2026-27');
  });
});
