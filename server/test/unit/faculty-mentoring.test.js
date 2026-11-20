/**
 * faculty-mentoring.test.js — Unit and Integration Suite for Mentoring Portal
 * Verifies:
 *   1. GET /api/faculty/me/mentees returns all mentees assigned to logged-in faculty
 *   2. Mentee status calculation, overall clearance stats, and blockers enrichment
 *   3. Filter support (status, classId, search)
 *   4. Isolation: Students belonging to other mentors are excluded
 *   5. GET /api/faculty/me/mentees/:studentId/clearance returns categorized approvals
 *   6. Security: Rejects non-mentors from accessing student clearance details with 403
 *   7. Full lifecycle: Approve, Flag Due, and Clear Due for a mentee
 */

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

describe('Faculty Mentoring Portal & Mentee Clearance Oversight', () => {
  let mentorFaculty;
  let otherFaculty;
  let mentorToken;
  let otherToken;
  let dept;
  let testClass;
  let batch;
  let mentee1;
  let mentee2;
  let otherStudent;
  let request1;
  let request2;
  let approvalMentor1;
  let approvalSubject1;
  let approvalMentor2;

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

    mentorFaculty = await Faculty.create({
      name: 'Dr. Alan Turing',
      email: 'turing@mits.ac.in',
      employeeId: 'EMP-CSD-001',
      password: 'TestPassword123!',
      departmentId: dept._id,
      roleTags: ['faculty', 'mentor'],
      isActive: true,
    });

    otherFaculty = await Faculty.create({
      name: 'Dr. Ada Lovelace',
      email: 'lovelace@mits.ac.in',
      employeeId: 'EMP-CSD-002',
      password: 'TestPassword123!',
      departmentId: dept._id,
      roleTags: ['faculty', 'mentor'],
      isActive: true,
    });

    mentorToken = signTestToken({
      userId: mentorFaculty._id.toString(),
      role: 'faculty',
      departmentId: dept._id.toString(),
    });

    otherToken = signTestToken({
      userId: otherFaculty._id.toString(),
      role: 'faculty',
      departmentId: dept._id.toString(),
    });

    testClass = await Class.create({
      name: 'CSD-A',
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      classTeacherId: otherFaculty._id,
      isActive: true,
    });

    batch = await NodueBatch.create({
      name: 'CSD 2026-27 Sem 5 No Dues',
      className: 'CSD-A',
      classId: testClass._id,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      status: 'active',
    });

    // Mentee 1: Assigned to Dr. Turing
    mentee1 = await Student.create({
      name: 'Alice Johnson',
      rollNo: '24CSD001',
      email: 'alice@student.mits.ac.in',
      classId: testClass._id,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      mentorId: mentorFaculty._id,
      isActive: true,
    });

    // Mentee 2: Assigned to Dr. Turing
    mentee2 = await Student.create({
      name: 'Bob Smith',
      rollNo: '24CSD002',
      email: 'bob@student.mits.ac.in',
      classId: testClass._id,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      mentorId: mentorFaculty._id,
      isActive: true,
    });

    // Student 3: Assigned to Dr. Lovelace
    otherStudent = await Student.create({
      name: 'Charlie Brown',
      rollNo: '24CSD003',
      email: 'charlie@student.mits.ac.in',
      classId: testClass._id,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      mentorId: otherFaculty._id,
      isActive: true,
    });

    // Requests
    request1 = await NodueRequest.create({
      batchId: batch._id,
      studentId: mentee1._id,
      departmentId: dept._id,
      status: 'pending',
    });

    request2 = await NodueRequest.create({
      batchId: batch._id,
      studentId: mentee2._id,
      departmentId: dept._id,
      status: 'pending',
    });

    // Approvals for Mentee 1
    approvalMentor1 = await NodueApproval.create({
      requestId: request1._id,
      batchId: batch._id,
      studentId: mentee1._id,
      studentRollNo: mentee1.rollNo,
      studentName: mentee1.name,
      facultyId: mentorFaculty._id,
      approvalType: 'mentor',
      roleTag: 'mentor',
      action: 'pending',
    });

    approvalSubject1 = await NodueApproval.create({
      requestId: request1._id,
      batchId: batch._id,
      studentId: mentee1._id,
      studentRollNo: mentee1.rollNo,
      studentName: mentee1.name,
      facultyId: otherFaculty._id,
      approvalType: 'subject',
      subjectName: 'Artificial Intelligence',
      roleTag: 'faculty',
      action: 'due_marked',
      dueType: 'lab',
      remarks: 'Incomplete lab record',
      amount: 0,
    });

    // Approvals for Mentee 2
    approvalMentor2 = await NodueApproval.create({
      requestId: request2._id,
      batchId: batch._id,
      studentId: mentee2._id,
      studentRollNo: mentee2.rollNo,
      studentName: mentee2.name,
      facultyId: mentorFaculty._id,
      approvalType: 'mentor',
      roleTag: 'mentor',
      action: 'approved',
    });
  });

  it('1. GET /api/faculty/me/mentees returns all mentees for logged-in mentor and excludes others', async () => {
    const res = await request(app)
      .get('/api/faculty/me/mentees')
      .set('Authorization', `Bearer ${mentorToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data);

    const { mentees, summary, classes } = res.body.data;
    assert.equal(mentees.length, 2);
    assert.ok(mentees.some((m) => m.rollNo === '24CSD001'));
    assert.ok(mentees.some((m) => m.rollNo === '24CSD002'));
    assert.equal(mentees.some((m) => m.rollNo === '24CSD003'), false); // Other mentor's student excluded

    assert.equal(summary.total, 2);
    assert.equal(summary.pendingMyApproval, 1); // mentee1 is pending
    assert.equal(classes.length, 1);
    assert.equal(classes[0].name, 'CSD-A');
  });

  it('2. GET /api/faculty/me/mentees enriches external blockers and clearance stats', async () => {
    const res = await request(app)
      .get('/api/faculty/me/mentees')
      .set('Authorization', `Bearer ${mentorToken}`);

    assert.equal(res.status, 200);
    const mentee1Data = res.body.data.mentees.find((m) => m.rollNo === '24CSD001');
    assert.ok(mentee1Data);
    assert.equal(mentee1Data.stats.total, 2);
    assert.equal(mentee1Data.stats.due, 1);
    assert.equal(mentee1Data.blockers.length, 1);
    assert.equal(mentee1Data.blockers[0].subjectName, 'Artificial Intelligence');
    assert.equal(mentee1Data.blockers[0].remarks, 'Incomplete lab record');
    assert.equal(mentee1Data.blockers[0].isSelf, false);
  });

  it('3. GET /api/faculty/me/mentees supports status filter (pending_my_approval)', async () => {
    const res = await request(app)
      .get('/api/faculty/me/mentees?status=pending_my_approval')
      .set('Authorization', `Bearer ${mentorToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.mentees.length, 1);
    assert.equal(res.body.data.mentees[0].rollNo, '24CSD001');
  });

  it('4. GET /api/faculty/me/mentees/:studentId/clearance returns categorized breakdown', async () => {
    const res = await request(app)
      .get(`/api/faculty/me/mentees/${mentee1._id}/clearance`)
      .set('Authorization', `Bearer ${mentorToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.student);
    assert.equal(res.body.data.student.rollNo, '24CSD001');
    assert.equal(res.body.data.approvals.length, 2);
    assert.equal(res.body.data.summary.total, 2);
    assert.equal(res.body.data.summary.due, 1);
  });

  it('5. GET /api/faculty/me/mentees/:studentId/clearance rejects non-mentor access with 403', async () => {
    // Dr. Lovelace tries to access Dr. Turing's mentee clearance details
    const res = await request(app)
      .get(`/api/faculty/me/mentees/${mentee1._id}/clearance`)
      .set('Authorization', `Bearer ${otherToken}`);

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  });

  it('6. Full lifecycle: Mentor can flag due, clear due, and approve mentee clearance', async () => {
    // 1. Mark Due on pending approvalMentor1
    const dueRes = await request(app)
      .post('/api/approvals/mark-due')
      .set('Authorization', `Bearer ${mentorToken}`)
      .send({
        approvalId: approvalMentor1._id,
        dueType: 'library',
        remarks: 'Handbook not returned',
        amount: 250,
      });

    assert.equal(dueRes.status, 200);
    let updatedApproval = await NodueApproval.findById(approvalMentor1._id);
    assert.equal(updatedApproval.action, 'due_marked');
    assert.equal(updatedApproval.dueType, 'library');
    assert.equal(updatedApproval.remarks, 'Handbook not returned');

    // 2. Clear Due via PATCH
    const clearRes = await request(app)
      .patch(`/api/approvals/${approvalMentor1._id}`)
      .set('Authorization', `Bearer ${mentorToken}`)
      .send({ action: 'approved' });

    assert.equal(clearRes.status, 200);
    updatedApproval = await NodueApproval.findById(approvalMentor1._id);
    assert.equal(updatedApproval.action, 'approved');

    // 3. Create fresh mentee and request to verify direct POST /api/approvals/approve
    const mentee3 = await Student.create({
      name: 'Daisy Miller',
      rollNo: '24CSD004',
      email: 'daisy@student.mits.ac.in',
      classId: testClass._id,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      mentorId: mentorFaculty._id,
      isActive: true,
    });

    const request3 = await NodueRequest.create({
      batchId: batch._id,
      studentId: mentee3._id,
      departmentId: dept._id,
      status: 'pending',
    });

    const freshApproval = await NodueApproval.create({
      requestId: request3._id,
      batchId: batch._id,
      studentId: mentee3._id,
      studentRollNo: mentee3.rollNo,
      studentName: mentee3.name,
      facultyId: mentorFaculty._id,
      approvalType: 'mentor',
      roleTag: 'mentor',
      action: 'pending',
    });

    const approveRes = await request(app)
      .post('/api/approvals/approve')
      .set('Authorization', `Bearer ${mentorToken}`)
      .send({ approvalId: freshApproval._id });

    assert.equal(approveRes.status, 200);
    const approvedDoc = await NodueApproval.findById(freshApproval._id);
    assert.equal(approvedDoc.action, 'approved');
  });

  it('Edge Case: Regex special characters in search do not crash backend or cause ReDoS', async () => {
    // Unescaped chars that normally break RegExp: [, *, +, (, \, ?, ^, $
    const maliciousSearchStrings = ['CSD(A)+*[', 'Alice?', 'EMP\\001', 'Bob++', '([a-z]+)*'];

    for (const searchStr of maliciousSearchStrings) {
      const resMentees = await request(app)
        .get(`/api/faculty/me/mentees?search=${encodeURIComponent(searchStr)}`)
        .set('Authorization', `Bearer ${mentorToken}`);
      assert.equal(resMentees.status, 200, `Failed for search: ${searchStr}`);
      assert.ok(Array.isArray(resMentees.body.data.mentees));

      const resPending = await request(app)
        .get(`/api/approvals/pending?search=${encodeURIComponent(searchStr)}`)
        .set('Authorization', `Bearer ${mentorToken}`);
      assert.equal(resPending.status, 200, `Failed for pending search: ${searchStr}`);

      const resHistory = await request(app)
        .get(`/api/approvals/history?search=${encodeURIComponent(searchStr)}`)
        .set('Authorization', `Bearer ${mentorToken}`);
      assert.equal(resHistory.status, 200, `Failed for history search: ${searchStr}`);
    }
  });

  it('Edge Case: Invalid ObjectId parameters return clean 400 VAL_001 instead of CastError 500', async () => {
    const invalidIdRes = await request(app)
      .get('/api/faculty/me/mentees/not-a-valid-hex-id/clearance')
      .set('Authorization', `Bearer ${mentorToken}`);

    assert.equal(invalidIdRes.status, 400);
    assert.equal(invalidIdRes.body.error?.code || invalidIdRes.body.code, 'VAL_001');

    // Query with invalid classId safely yields 0 results instead of 500
    const invalidClassRes = await request(app)
      .get('/api/faculty/me/mentees?classId=invalid_class_123')
      .set('Authorization', `Bearer ${mentorToken}`);

    assert.equal(invalidClassRes.status, 200);
    assert.equal(invalidClassRes.body.data.mentees.length, 0);
  });

  it('Edge Case: Mentor Reassignment allows newly assigned mentor to approve clearance', async () => {
    // Mentee originally had Dr. Ada Lovelace as mentor
    const reassignMentee = await Student.create({
      name: 'Edward Norton',
      rollNo: '24CSD005',
      email: 'edward@student.mits.ac.in',
      classId: testClass._id,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      mentorId: otherFaculty._id, // Lovelace initially
      isActive: true,
    });

    const reassignReq = await NodueRequest.create({
      batchId: batch._id,
      studentId: reassignMentee._id,
      departmentId: dept._id,
      status: 'pending',
    });

    const reassignApproval = await NodueApproval.create({
      requestId: reassignReq._id,
      batchId: batch._id,
      studentId: reassignMentee._id,
      studentRollNo: reassignMentee.rollNo,
      studentName: reassignMentee.name,
      facultyId: otherFaculty._id, // Lovelace's facultyId
      approvalType: 'mentor',
      roleTag: 'mentor',
      action: 'pending',
    });

    // Department reassigns mentor to Dr. Alan Turing
    await Student.findByIdAndUpdate(reassignMentee._id, { mentorId: mentorFaculty._id });

    // Dr. Turing (mentorFaculty) now approves clearance
    const approveRes = await request(app)
      .post('/api/approvals/approve')
      .set('Authorization', `Bearer ${mentorToken}`)
      .send({ approvalId: reassignApproval._id });

    assert.equal(approveRes.status, 200);
    const updatedApproval = await NodueApproval.findById(reassignApproval._id);
    assert.equal(updatedApproval.action, 'approved');
    assert.equal(updatedApproval.facultyId.toString(), mentorFaculty._id.toString());
  });

  it('Edge Case: Closed batch rejects approval/due actions with 400 BATCH_CLOSED', async () => {
    // Close the batch
    await NodueBatch.findByIdAndUpdate(batch._id, { status: 'closed' });

    const closedApproveRes = await request(app)
      .post('/api/approvals/approve')
      .set('Authorization', `Bearer ${mentorToken}`)
      .send({ approvalId: approvalMentor1._id });

    assert.equal(closedApproveRes.status, 400);
    assert.equal(closedApproveRes.body.error?.code || closedApproveRes.body.code, 'BATCH_CLOSED');

    const closedDueRes = await request(app)
      .post('/api/approvals/mark-due')
      .set('Authorization', `Bearer ${mentorToken}`)
      .send({ approvalId: approvalMentor1._id, dueType: 'lab', remarks: 'Late return' });

    assert.equal(closedDueRes.status, 400);
    assert.equal(closedDueRes.body.error?.code || closedDueRes.body.code, 'BATCH_CLOSED');
  });

  it('Edge Case: Flagging due preserves amount and reflects in mentee enrichment', async () => {
    // Create new class, batch & mentee for clean state
    const testClass2 = await Class.create({
      name: 'CSD-B',
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      section: 'B',
      isActive: true,
    });

    const cleanMentee = await Student.create({
      name: 'Fiona Apple',
      rollNo: '24CSD006',
      email: 'fiona@student.mits.ac.in',
      classId: testClass2._id,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      mentorId: mentorFaculty._id,
      isActive: true,
    });

    const activeBatch = await NodueBatch.create({
      className: 'CSD-B Active',
      classId: testClass2._id,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      status: 'active',
      deadline: new Date(Date.now() + 86400000),
    });

    const cleanReq = await NodueRequest.create({
      batchId: activeBatch._id,
      studentId: cleanMentee._id,
      departmentId: dept._id,
      status: 'pending',
    });

    const cleanApproval = await NodueApproval.create({
      requestId: cleanReq._id,
      batchId: activeBatch._id,
      studentId: cleanMentee._id,
      studentRollNo: cleanMentee.rollNo,
      studentName: cleanMentee.name,
      facultyId: mentorFaculty._id,
      approvalType: 'mentor',
      roleTag: 'mentor',
      action: 'pending',
    });

    // Mark due with amount: 450
    const markDueRes = await request(app)
      .post('/api/approvals/mark-due')
      .set('Authorization', `Bearer ${mentorToken}`)
      .send({
        approvalId: cleanApproval._id,
        dueType: 'fees',
        remarks: 'Exam lab kit replacement fee',
        amount: 450,
      });

    assert.equal(markDueRes.status, 200);
    const updatedApproval = await NodueApproval.findById(cleanApproval._id);
    assert.equal(updatedApproval.amount, 450);
    assert.equal(updatedApproval.dueType, 'fees');

    // Verify enrichment returns the amount
    const menteesRes = await request(app)
      .get(`/api/faculty/me/mentees?search=24CSD006`)
      .set('Authorization', `Bearer ${mentorToken}`);

    assert.equal(menteesRes.status, 200);
    const menteeData = menteesRes.body.data.mentees[0];
    assert.equal(menteeData.mentorApproval?.amount, 450);
    assert.equal(menteeData.mentorApproval?.dueType, 'fees');
  });

  it('Edge Case: Student assigned to mentor without active batch/request returns clean no_request state', async () => {
    const uninitiatedMentee = await Student.create({
      name: 'George Weasley',
      rollNo: '24CSD007',
      email: 'george@student.mits.ac.in',
      classId: testClass._id,
      departmentId: dept._id,
      semester: 5,
      academicYear: '2026-27',
      mentorId: mentorFaculty._id,
      isActive: true,
    });

    const menteesRes = await request(app)
      .get(`/api/faculty/me/mentees?search=24CSD007`)
      .set('Authorization', `Bearer ${mentorToken}`);

    assert.equal(menteesRes.status, 200);
    const menteeData = menteesRes.body.data.mentees[0];
    assert.equal(menteeData.overallStatus, 'no_request');
    assert.equal(menteeData.mentorApproval, null);
    assert.equal(menteeData.stats.total, 0);
    assert.equal(menteeData.hasActiveBatch, false);

    const clearanceRes = await request(app)
      .get(`/api/faculty/me/mentees/${uninitiatedMentee._id}/clearance`)
      .set('Authorization', `Bearer ${mentorToken}`);

    assert.equal(clearanceRes.status, 200);
    assert.equal(clearanceRes.body.data.batch, null);
    assert.equal(clearanceRes.body.data.request, null);
    assert.equal(clearanceRes.body.data.approvals.length, 0);
  });
});
