/**
 * bulk-remove-subjects.test.js — Integration & Unit tests for Atomic Bulk Removal of Subject Mappings
 * Ensures write conflict prevention and atomic batch sync.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';

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
import NodueBatch from '../../src/models/NodueBatch.js';
import NodueRequest from '../../src/models/NodueRequest.js';
import NodueApproval from '../../src/models/NodueApproval.js';
import Student from '../../src/models/Student.js';

describe('Bulk Remove Subject Assignments & Write Conflict Prevention', () => {
  let adminToken;
  let hodToken;
  let testDepartment;
  let testClass;
  let subject1;
  let subject2;
  let subject3;
  let faculty1;

  before(async () => {
    await setupTestEnvironment();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    testDepartment = await Department.create({
      name: 'Computer Science and Design',
      code: 'CSD',
      isActive: true,
    });

    faculty1 = await Faculty.create({
      name: 'Dr. Alan Turing',
      email: 'turing@mits.ac.in',
      employeeId: 'EMP_TURING_01',
      password: 'password123',
      departmentId: testDepartment._id,
      roleTags: ['faculty'],
      isActive: true,
    });

    subject1 = await Subject.create({
      name: 'Artificial Intelligence',
      code: '23CSD301',
      departmentId: testDepartment._id,
      isActive: true,
    });

    subject2 = await Subject.create({
      name: 'Database Systems',
      code: '23CSD302',
      departmentId: testDepartment._id,
      isActive: true,
    });

    subject3 = await Subject.create({
      name: 'Operating Systems',
      code: '23CSD303',
      departmentId: testDepartment._id,
      isActive: true,
    });

    testClass = await Class.create({
      name: 'CSD-A',
      semester: 5,
      academicYear: '2026-27',
      departmentId: testDepartment._id,
      isActive: true,
      subjectAssignments: [
        {
          subjectId: subject1._id,
          facultyId: faculty1._id,
          subjectCode: subject1.code,
          subjectName: subject1.name,
          facultyName: faculty1.name,
          isElective: false,
        },
        {
          subjectId: subject2._id,
          facultyId: faculty1._id,
          subjectCode: subject2.code,
          subjectName: subject2.name,
          facultyName: faculty1.name,
          isElective: false,
        },
        {
          subjectId: subject3._id,
          facultyId: null,
          subjectCode: subject3.code,
          subjectName: subject3.name,
          facultyName: 'Unassigned',
          isElective: false,
        },
      ],
    });

    adminToken = signTestToken({
      userId: new mongoose.Types.ObjectId(),
      role: 'admin',
    });

    hodToken = signTestToken({
      userId: faculty1._id,
      role: 'hod',
      departmentId: testDepartment._id.toString(),
    });
  });

  it('validates assignmentIds array input', async () => {
    const res = await request(app)
      .post(`/api/classes/${testClass._id}/subjects/bulk-remove`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignmentIds: 'invalid' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'VAL_001');
  });

  it('atomically removes multiple subject assignments in a single request', async () => {
    const [assign1, assign2] = testClass.subjectAssignments;
    const assignmentIds = [assign1._id.toString(), assign2._id.toString()];

    const res = await request(app)
      .post(`/api/classes/${testClass._id}/subjects/bulk-remove`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignmentIds });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.removedCount, 2);

    const updatedCls = await Class.findById(testClass._id);
    assert.equal(updatedCls.subjectAssignments.length, 1);
    assert.equal(updatedCls.subjectAssignments[0].subjectCode, '23CSD303');
  });

  it('syncs active batch student requests and deletes approvals in bulk', async () => {
    const student = await Student.create({
      name: 'John Doe',
      rollNo: '23CSD001',
      email: 'john@mits.ac.in',
      departmentId: testDepartment._id,
      classId: testClass._id,
      isActive: true,
    });

    const activeBatch = await NodueBatch.create({
      academicYear: '2026-27',
      semester: 5,
      departmentId: testDepartment._id,
      classId: testClass._id,
      status: 'active',
      initiatedBy: faculty1._id,
    });

    const nodueRequest = await NodueRequest.create({
      studentId: student._id,
      batchId: activeBatch._id,
      status: 'pending',
      facultySnapshot: {
        [subject1._id.toString()]: { facultyId: faculty1._id, name: faculty1.name, status: 'pending' },
        [subject2._id.toString()]: { facultyId: faculty1._id, name: faculty1.name, status: 'pending' },
        [subject3._id.toString()]: { facultyId: null, name: 'Unassigned', status: 'pending' },
      },
    });

    await NodueApproval.create([
      {
        requestId: nodueRequest._id,
        batchId: activeBatch._id,
        studentId: student._id,
        facultyId: faculty1._id,
        approvalType: 'subject',
        subjectId: subject1._id,
        action: 'pending',
      },
      {
        requestId: nodueRequest._id,
        batchId: activeBatch._id,
        studentId: student._id,
        facultyId: faculty1._id,
        approvalType: 'subject',
        subjectId: subject2._id,
        action: 'pending',
      },
    ]);

    const [assign1, assign2] = testClass.subjectAssignments;
    const assignmentIds = [assign1._id.toString(), assign2._id.toString()];

    const res = await request(app)
      .post(`/api/classes/${testClass._id}/subjects/bulk-remove`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignmentIds });

    assert.equal(res.status, 200);

    // Verify approvals for removed subjects were deleted
    const remainingApprovals = await NodueApproval.find({ batchId: activeBatch._id });
    assert.equal(remainingApprovals.length, 0);

    // Verify facultySnapshot was cleaned up
    const updatedReq = await NodueRequest.findById(nodueRequest._id);
    assert.equal(updatedReq.facultySnapshot[subject1._id.toString()], undefined);
    assert.equal(updatedReq.facultySnapshot[subject2._id.toString()], undefined);
    assert.notEqual(updatedReq.facultySnapshot[subject3._id.toString()], undefined);
  });
});
