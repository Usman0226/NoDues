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
  let otherFaculty;
  let facultyToken;
  let otherFacultyToken;
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
  let mentorApproval;
  let studentActive;
  let studentMentee2;
  let mentee2Request;
  let mentee2Approval;

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

    otherFaculty = await Faculty.create({
      name: 'Dr. Miles Dyson',
      email: 'miles.dyson@institution.edu',
      employeeId: 'FAC-9902',
      departmentId: dept._id,
      roleTags: ['faculty'],
      isActive: true,
      password: 'hashed_test_password',
    });

    otherFacultyToken = signTestToken({
      role: 'faculty',
      userId: otherFaculty._id.toString(),
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
      totalStudents: 2,
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

    studentActive = await Student.create({
      name: 'John Doe',
      rollNo: '25CSD01',
      email: 'john@student.edu',
      classId: classActive._id,
      departmentId: dept._id,
      semester: 7,
      academicYear: '2026-27',
      mentorId: facultyUser._id,
      isActive: true,
    });

    studentMentee2 = await Student.create({
      name: 'Bob Martin',
      rollNo: '25CSD02',
      email: 'bob@student.edu',
      classId: classActive._id,
      departmentId: dept._id,
      semester: 7,
      academicYear: '2026-27',
      mentorId: facultyUser._id,
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

    mentee2Request = await NodueRequest.create({
      batchId: activeBatch._id,
      studentId: studentMentee2._id,
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

    mentorApproval = await NodueApproval.create({
      requestId: activeRequest._id,
      batchId: activeBatch._id,
      studentId: studentActive._id,
      studentRollNo: studentActive.rollNo,
      studentName: studentActive.name,
      facultyId: facultyUser._id,
      subjectName: 'Mentor Sign-Off',
      approvalType: 'mentor',
      roleTag: 'mentor',
      action: 'pending',
    });

    mentee2Approval = await NodueApproval.create({
      requestId: mentee2Request._id,
      batchId: activeBatch._id,
      studentId: studentMentee2._id,
      studentRollNo: studentMentee2.rollNo,
      studentName: studentMentee2.name,
      facultyId: otherFaculty._id, // assigned to previous mentor, student now mentored by facultyUser
      subjectName: 'Mentor Sign-Off',
      approvalType: 'mentor',
      roleTag: 'mentor',
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
    assert.equal(activeItem.pendingCount, 2);
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
    assert.equal(res.body.data.length, 2);
    const item = res.body.data.find(d => d._id.toString() === activeApproval._id.toString());
    assert.ok(item);
    assert.equal(item.isBatchClosed, false);
    assert.equal(item.batchStatus, 'active');
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

  it('8. GET /api/faculty/me/mentees returns assigned mentees with accurate summary and classes', async () => {
    const res = await request(app)
      .get('/api/faculty/me/mentees')
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.mentees.length, 2);
    assert.equal(res.body.data.summary.total, 2);
    assert.equal(res.body.data.summary.pendingMyApproval, 2);
    assert.equal(res.body.data.classes.length, 1);
    assert.equal(res.body.data.classes[0].name, 'CSD-A');

    const m1 = res.body.data.mentees.find((m) => m.rollNo === '25CSD01');
    assert.ok(m1);
    assert.equal(m1.name, 'John Doe');
    assert.equal(m1.isMyActionPending, true);
    assert.ok(m1.mentorApproval);
    assert.equal(m1.mentorApproval.action, 'pending');
  });

  it('9. GET /api/faculty/me/mentees filters correctly by status and search queries', async () => {
    // Filter by pending_my_approval
    const pendingRes = await request(app)
      .get('/api/faculty/me/mentees?status=pending_my_approval')
      .set('Authorization', `Bearer ${facultyToken}`);
    assert.equal(pendingRes.status, 200);
    assert.equal(pendingRes.body.data.mentees.length, 2);

    // Filter by my_due_marked (currently 0)
    const dueRes = await request(app)
      .get('/api/faculty/me/mentees?status=my_due_marked')
      .set('Authorization', `Bearer ${facultyToken}`);
    assert.equal(dueRes.status, 200);
    assert.equal(dueRes.body.data.mentees.length, 0);

    // Search by roll number
    const searchRoll = await request(app)
      .get('/api/faculty/me/mentees?search=25CSD02')
      .set('Authorization', `Bearer ${facultyToken}`);
    assert.equal(searchRoll.status, 200);
    assert.equal(searchRoll.body.data.mentees.length, 1);
    assert.equal(searchRoll.body.data.mentees[0].rollNo, '25CSD02');

    // Search by class name (CSD-A)
    const searchClass = await request(app)
      .get('/api/faculty/me/mentees?search=CSD-A')
      .set('Authorization', `Bearer ${facultyToken}`);
    assert.equal(searchClass.status, 200);
    assert.equal(searchClass.body.data.mentees.length, 2);
  });

  it('10. GET /api/faculty/me/mentees/:studentId/clearance enforces mentor authorization and returns full breakdown', async () => {
    // Mentor access (authorized)
    const mentorRes = await request(app)
      .get(`/api/faculty/me/mentees/${studentActive._id}/clearance`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(mentorRes.status, 200);
    assert.equal(mentorRes.body.success, true);
    assert.equal(mentorRes.body.data.student.rollNo, '25CSD01');
    assert.ok(mentorRes.body.data.summary.total >= 2);
    assert.ok(Array.isArray(mentorRes.body.data.approvals));

    // Non-mentor faculty access (forbidden 403)
    const unauthorizedRes = await request(app)
      .get(`/api/faculty/me/mentees/${studentActive._id}/clearance`)
      .set('Authorization', `Bearer ${otherFacultyToken}`);

    assert.equal(unauthorizedRes.status, 403);
    assert.equal(unauthorizedRes.body.success, false);

    // Non-existent student (404)
    const nonExistentId = new mongoose.Types.ObjectId();
    const notFoundRes = await request(app)
      .get(`/api/faculty/me/mentees/${nonExistentId}/clearance`)
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(notFoundRes.status, 404);

    // Invalid ObjectId format (400 VAL_001)
    const invalidIdRes = await request(app)
      .get('/api/faculty/me/mentees/invalid-student-id/clearance')
      .set('Authorization', `Bearer ${facultyToken}`);

    assert.equal(invalidIdRes.status, 400);
    assert.equal(invalidIdRes.body.error.code, 'VAL_001');
  });

  it('11. POST /api/approvals/approve records mentor clearance and updates mentee status', async () => {
    const res = await request(app)
      .post('/api/approvals/approve')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ approvalId: mentorApproval._id.toString() });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.action, 'approved');

    const updated = await NodueApproval.findById(mentorApproval._id);
    assert.equal(updated.action, 'approved');
  });

  it('12. POST /api/approvals/mark-due flags mentor deficiency with proper validation', async () => {
    // Missing required remarks/dueType
    const failRes = await request(app)
      .post('/api/approvals/mark-due')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({ approvalId: mentorApproval._id.toString() });

    assert.equal(failRes.status, 400);

    // Valid mark due
    const res = await request(app)
      .post('/api/approvals/mark-due')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        approvalId: mentorApproval._id.toString(),
        dueType: 'lab',
        remarks: 'Component replacement pending',
        amount: 250,
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.action, 'due_marked');
    assert.equal(res.body.data.dueType, 'lab');

    const updated = await NodueApproval.findById(mentorApproval._id);
    assert.equal(updated.action, 'due_marked');
    assert.equal(updated.remarks, 'Component replacement pending');
    assert.equal(updated.amount, 250);
  });

  it('13. POST /api/approvals/bulk-approve successfully processes mentor clearances even with unassigned facultyId', async () => {
    const res = await request(app)
      .post('/api/approvals/bulk-approve')
      .set('Authorization', `Bearer ${facultyToken}`)
      .send({
        approvalIds: [mentorApproval._id.toString(), mentee2Approval._id.toString()],
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.processed, 2);

    const a1 = await NodueApproval.findById(mentorApproval._id);
    assert.equal(a1.action, 'approved');

    const a2 = await NodueApproval.findById(mentee2Approval._id);
    assert.equal(a2.action, 'approved');
    assert.equal(a2.facultyId.toString(), facultyUser._id.toString());
  });
});
