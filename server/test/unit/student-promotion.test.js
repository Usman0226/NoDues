/**
 * student-promotion.test.js — Production-grade Unit and Integration tests for Student Promotion & Class Migration
 * Verifies:
 * 1. GET /api/classes/:id/promotion-candidates (target class recommendation, student list, active batch detection)
 * 2. POST /api/classes/:id/promote (atomic transaction, detained student exclusion, history immutability)
 * 3. Closed historical batch preservation in batchSync.js
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
import Student from '../../src/models/Student.js';
import NodueBatch from '../../src/models/NodueBatch.js';
import NodueRequest from '../../src/models/NodueRequest.js';
import NodueApproval from '../../src/models/NodueApproval.js';

describe('Student Promotion & Historical Record Preservation', () => {
  let adminToken;
  let adminUser;
  let hodToken;
  let hodUser;
  let testDept;
  let sourceClass;
  let targetClass;
  let student1;
  let student2;
  let student3;

  before(async () => {
    await setupTestEnvironment();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    // 1. Department
    testDept = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true,
    });

    // 2. Admin & HoD Users
    adminUser = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Super Admin',
      email: 'admin@test.edu',
      role: 'admin',
      roleTags: ['admin'],
    };
    adminToken = signTestToken(adminUser);

    hodUser = await Faculty.create({
      name: 'HoD CSE',
      email: 'hod@test.edu',
      employeeId: 'EMP_HOD_99',
      password: 'password123',
      departmentId: testDept._id,
      roleTags: ['hod'],
      isActive: true,
    });
    hodToken = signTestToken(hodUser);

    // 3. Source Class (II CSD E - Sem 4)
    sourceClass = await Class.create({
      name: 'CSD-E',
      departmentId: testDept._id,
      semester: 4,
      academicYear: '2024-2028',
      isActive: true,
      studentIds: [],
    });

    // 4. Target Class (III CSD E - Sem 5)
    targetClass = await Class.create({
      name: 'CSD-E',
      departmentId: testDept._id,
      semester: 5,
      academicYear: '2024-2028',
      isActive: true,
      studentIds: [],
    });

    // 5. Students in Source Class
    student1 = await Student.create({
      rollNo: '24CSD001',
      name: 'Aarav Kumar',
      email: 'aarav@test.edu',
      classId: sourceClass._id,
      departmentId: testDept._id,
      semester: 4,
      academicYear: '2024-2028',
      isActive: true,
    });

    student2 = await Student.create({
      rollNo: '24CSD002',
      name: 'Bhavna Sharma',
      email: 'bhavna@test.edu',
      classId: sourceClass._id,
      departmentId: testDept._id,
      semester: 4,
      academicYear: '2024-2028',
      isActive: true,
    });

    student3 = await Student.create({
      rollNo: '24CSD003',
      name: 'Chetan Patel',
      email: 'chetan@test.edu',
      classId: sourceClass._id,
      departmentId: testDept._id,
      semester: 4,
      academicYear: '2024-2028',
      isActive: true,
    });

    // Sync studentIds to source class
    sourceClass.studentIds = [student1._id, student2._id, student3._id];
    await sourceClass.save();
  });

  describe('GET /api/classes/:id/promotion-candidates', () => {
    it('returns candidates with recommended next semester target class', async () => {
      const res = await request(app)
        .get(`/api/classes/${sourceClass._id}/promotion-candidates`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.sourceClass.name, 'CSD-E');
      assert.equal(res.body.data.sourceClass.totalStudents, 3);
      assert.equal(res.body.data.students.length, 3);
      assert.equal(res.body.data.targetClasses.length, 1);
      assert.equal(res.body.data.recommendedTargetClassId, targetClass._id.toString());
      assert.equal(res.body.data.sourceClass.hasActiveBatch, false);
    });

    it('flags hasActiveBatch = true if clearance batch is in progress', async () => {
      await NodueBatch.create({
        classId: sourceClass._id,
        departmentId: testDept._id,
        semester: 4,
        academicYear: '2024-2028',
        status: 'active',
      });

      const res = await request(app)
        .get(`/api/classes/${sourceClass._id}/promotion-candidates`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.sourceClass.hasActiveBatch, true);
    });
  });

  describe('POST /api/classes/:id/promote', () => {
    it('blocks promotion if source class has an active clearance batch', async () => {
      await NodueBatch.create({
        classId: sourceClass._id,
        departmentId: testDept._id,
        semester: 4,
        academicYear: '2024-2028',
        status: 'active',
      });

      const res = await request(app)
        .post(`/api/classes/${sourceClass._id}/promote`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetClassId: targetClass._id,
          resetElectives: true,
        });

      assert.equal(res.status, 400);
      const msg = res.body.error?.message || res.body.message || '';
      assert.match(msg, /clearance batch is active/i);
    });

    it('successfully promotes all students when studentIds omitted', async () => {
      const res = await request(app)
        .post(`/api/classes/${sourceClass._id}/promote`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetClassId: targetClass._id,
          resetElectives: true,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.promotedCount, 3);

      // Verify DB state
      const updatedSource = await Class.findById(sourceClass._id);
      const updatedTarget = await Class.findById(targetClass._id);
      assert.equal(updatedSource.studentIds.length, 0);
      assert.equal(updatedTarget.studentIds.length, 3);

      const s1 = await Student.findById(student1._id);
      assert.equal(s1.classId.toString(), targetClass._id.toString());
      assert.equal(s1.semester, 5);
      assert.equal(s1.yearOfStudy, 3);
    });

    it('promotes selected subset and keeps detained student in source class', async () => {
      // Promote student1 and student2, but student3 is detained (remains behind)
      const res = await request(app)
        .post(`/api/classes/${sourceClass._id}/promote`)
        .set('Authorization', `Bearer ${hodToken}`)
        .send({
          targetClassId: targetClass._id,
          studentIds: [student1._id, student2._id],
          resetElectives: true,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.data.promotedCount, 2);

      // Verify DB state
      const updatedSource = await Class.findById(sourceClass._id);
      const updatedTarget = await Class.findById(targetClass._id);

      // Source class retains student3!
      assert.equal(updatedSource.studentIds.length, 1);
      assert.equal(updatedSource.studentIds[0].toString(), student3._id.toString());

      // Target class receives student1 and student2!
      assert.equal(updatedTarget.studentIds.length, 2);

      // Student 3 remains in Semester 4
      const detainedStudent = await Student.findById(student3._id);
      assert.equal(detainedStudent.classId.toString(), sourceClass._id.toString());
      assert.equal(detainedStudent.semester, 4);

      // Student 1 advanced to Semester 5
      const promotedStudent = await Student.findById(student1._id);
      assert.equal(promotedStudent.classId.toString(), targetClass._id.toString());
      assert.equal(promotedStudent.semester, 5);
    });

    it('guarantees historical clearance records are NEVER deleted upon promotion', async () => {
      // 1. Create a closed historical batch representing past Semester 3 clearance
      const closedPastBatch = await NodueBatch.create({
        classId: sourceClass._id,
        departmentId: testDept._id,
        semester: 3,
        academicYear: '2024-2025',
        status: 'closed',
      });

      // 2. Create historical completed request and approval for student1
      const pastRequest = await NodueRequest.create({
        batchId: closedPastBatch._id,
        studentId: student1._id,
        status: 'cleared',
      });

      const pastApproval = await NodueApproval.create({
        requestId: pastRequest._id,
        batchId: closedPastBatch._id,
        studentId: student1._id,
        facultyId: adminUser._id,
        action: 'approved',
      });

      // 3. Promote student1 to III CSD E
      const res = await request(app)
        .post(`/api/classes/${sourceClass._id}/promote`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetClassId: targetClass._id,
          studentIds: [student1._id],
        });

      assert.equal(res.status, 200);

      // 4. Verify that past completed clearance request and approval STILL EXIST!
      const retainedRequest = await NodueRequest.findById(pastRequest._id);
      const retainedApproval = await NodueApproval.findById(pastApproval._id);

      assert.ok(retainedRequest, 'Past clearance request must remain in database');
      assert.equal(retainedRequest.status, 'cleared');
      assert.ok(retainedApproval, 'Past clearance approval must remain in database');
      assert.equal(retainedApproval.action, 'approved');
    });
  });
});
