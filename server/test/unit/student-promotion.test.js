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

    it('resets assigned faculty mentor (mentorId: null) by default upon promotion', async () => {
      // Assign faculty mentor to student1 and student2
      await Student.findByIdAndUpdate(student1._id, { mentorId: hodUser._id });
      await Student.findByIdAndUpdate(student2._id, { mentorId: hodUser._id });

      const beforeS1 = await Student.findById(student1._id);
      assert.equal(beforeS1.mentorId?.toString(), hodUser._id.toString());

      // Promote with default resetFaculty
      const res = await request(app)
        .post(`/api/classes/${sourceClass._id}/promote`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetClassId: targetClass._id,
          resetElectives: true,
          // resetFaculty defaults to true
        });

      assert.equal(res.status, 200);

      // Verify mentorId is now null for promoted students
      const afterS1 = await Student.findById(student1._id);
      assert.equal(afterS1.mentorId, null, 'Assigned faculty mentor must be reset to null upon promotion');
      const afterS2 = await Student.findById(student2._id);
      assert.equal(afterS2.mentorId, null, 'Assigned faculty mentor must be reset to null upon promotion');
    });

    it('preserves assigned faculty mentor when resetFaculty: false is passed', async () => {
      await Student.findByIdAndUpdate(student1._id, { mentorId: hodUser._id });

      const res = await request(app)
        .post(`/api/classes/${sourceClass._id}/promote`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          targetClassId: targetClass._id,
          studentIds: [student1._id],
          resetFaculty: false,
        });

      assert.equal(res.status, 200);

      const afterS1 = await Student.findById(student1._id);
      assert.equal(afterS1.mentorId?.toString(), hodUser._id.toString(), 'Mentor must be preserved when resetFaculty is false');
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

  describe('Bulk Cohort Promotion (Simultaneous Section Migration)', () => {
    let sectionB;
    let targetSectionB;
    let studentB1;

    beforeEach(async () => {
      sectionB = await Class.create({
        name: 'CSD-B',
        departmentId: testDept._id,
        semester: 4,
        academicYear: '2024-2025',
        isActive: true,
      });

      targetSectionB = await Class.create({
        name: 'CSD-B',
        departmentId: testDept._id,
        semester: 5,
        academicYear: '2025-2026',
        isActive: true,
      });

      studentB1 = await Student.create({
        rollNo: '23CSD099',
        name: 'Rohan Sharma',
        classId: sectionB._id,
        departmentId: testDept._id,
        semester: 4,
        academicYear: '2024-2025',
        yearOfStudy: 2,
        isActive: true,
      });
      sectionB.studentIds = [studentB1._id];
      await sectionB.save();
    });

    it('GET /api/classes/cohort-promotion-preview returns all sections with auto-matched targets', async () => {
      const res = await request(app)
        .get(`/api/classes/cohort-promotion-preview?departmentId=${testDept._id}&semester=4`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.classes.length, 2); // CSD-E and CSD-B

      const sectionEMapping = res.body.data.classes.find(c => c.sourceClass._id === sourceClass._id.toString());
      assert.ok(sectionEMapping);
      assert.equal(sectionEMapping.sourceClass.studentCount, 3);
      assert.equal(sectionEMapping.recommendedTargetClassId, targetClass._id.toString());

      const sectionBMapping = res.body.data.classes.find(c => c.sourceClass._id === sectionB._id.toString());
      assert.ok(sectionBMapping);
      assert.equal(sectionBMapping.sourceClass.studentCount, 1);
      assert.equal(sectionBMapping.recommendedTargetClassId, targetSectionB._id.toString());
    });

    it('GET /api/classes/cohort-promotion-preview auto-resolves department for admin when departmentId omitted', async () => {
      const res = await request(app)
        .get(`/api/classes/cohort-promotion-preview?semester=4`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.classes.length, 2);
    });

    it('POST /api/classes/bulk-promote promotes multiple sections at once and resets assigned faculty', async () => {
      // Assign faculty mentor to studentB1 and student1
      await Student.findByIdAndUpdate(studentB1._id, { mentorId: hodUser._id });
      await Student.findByIdAndUpdate(student1._id, { mentorId: hodUser._id });

      const res = await request(app)
        .post('/api/classes/bulk-promote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          departmentId: testDept._id,
          resetFaculty: true,
          promotions: [
            { sourceClassId: sourceClass._id, targetClassId: targetClass._id, resetElectives: true },
            { sourceClassId: sectionB._id, targetClassId: targetSectionB._id, resetElectives: true },
          ],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.totalClasses, 2);
      assert.equal(res.body.data.totalPromotedStudents, 4); // 3 from section E, 1 from section B

      // Verify studentB1 is now in targetSectionB in Semester 5 and mentorId is reset to null
      const updatedB1 = await Student.findById(studentB1._id);
      assert.equal(updatedB1.classId.toString(), targetSectionB._id.toString());
      assert.equal(updatedB1.semester, 5);
      assert.equal(updatedB1.mentorId, null, 'Faculty mentor must be reset to null upon bulk promotion');

      const updatedS1 = await Student.findById(student1._id);
      assert.equal(updatedS1.mentorId, null, 'Faculty mentor must be reset to null upon bulk promotion');

      // Verify target classes received studentIds
      const refreshedTargetE = await Class.findById(targetClass._id);
      assert.equal(refreshedTargetE.studentIds.length, 3);

      const refreshedTargetB = await Class.findById(targetSectionB._id);
      assert.equal(refreshedTargetB.studentIds.length, 1);
    });

    it('POST /api/classes/bulk-promote blocks entire promotion if any section has an active batch', async () => {
      // Create an active batch on section B
      await NodueBatch.create({
        classId: sectionB._id,
        departmentId: testDept._id,
        semester: 4,
        academicYear: '2024-2025',
        status: 'active',
      });

      const res = await request(app)
        .post('/api/classes/bulk-promote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          departmentId: testDept._id,
          promotions: [
            { sourceClassId: sourceClass._id, targetClassId: targetClass._id },
            { sourceClassId: sectionB._id, targetClassId: targetSectionB._id },
          ],
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error?.message || res.body.message, /clearance batches are active/i);

      // Verify no students were moved
      const refreshedStudent1 = await Student.findById(student1._id);
      assert.equal(refreshedStudent1.classId.toString(), sourceClass._id.toString());
    });

    it('POST /api/classes/bulk-promote blocks duplicate destination assignment without explicit consolidation flag', async () => {
      const res = await request(app)
        .post('/api/classes/bulk-promote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          departmentId: testDept._id,
          promotions: [
            { sourceClassId: sourceClass._id, targetClassId: targetClass._id },
            { sourceClassId: sectionB._id, targetClassId: targetClass._id }, // Accidental duplicate!
          ],
        });

      assert.equal(res.status, 400);
      assert.match(res.body.error?.message || res.body.message, /Multiple source sections are mapped to the same destination/i);
    });

    it('POST /api/classes/auto-create-target-sections provisions missing sections and inherits cohort subjects', async () => {
      // Add a subject to targetClass (Sem 5)
      const sampleSubject = await mongoose.model('Subject').create({
        name: 'Machine Learning',
        code: '23CSD107',
        semester: 5,
        isActive: true,
      });

      await Class.findByIdAndUpdate(targetClass._id, {
        $push: {
          subjectAssignments: {
            subjectId: sampleSubject._id,
            subjectName: sampleSubject.name,
            subjectCode: sampleSubject.code,
            isElective: false,
            facultyId: null,
            facultyName: null,
          },
        },
      });

      const res = await request(app)
        .post('/api/classes/auto-create-target-sections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          departmentId: testDept._id,
          sourceSemester: 4,
          targetSemester: 5,
          sectionNames: ['CSD-C', 'CSD-D'],
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.length, 2);

      const createdC = await Class.findOne({ departmentId: testDept._id, semester: 5, name: 'CSD-C' });
      assert.ok(createdC);
      assert.equal(createdC.semester, 5);
      assert.equal(createdC.isActive, true);
      assert.equal(createdC.subjectAssignments.length, 1, 'Newly provisioned section must inherit cohort subjects');
      assert.equal(createdC.subjectAssignments[0].subjectCode, '23CSD107');
    });

    it('POST /api/classes/:id/propagate-cohort-subjects synchronizes subjects across peer cohort sections', async () => {
      const sampleSubject = await mongoose.model('Subject').create({
        name: 'Distributed Systems',
        code: '23CSD110',
        semester: 5,
        isActive: true,
      });

      await Class.findByIdAndUpdate(targetClass._id, {
        $push: {
          subjectAssignments: {
            subjectId: sampleSubject._id,
            subjectName: sampleSubject.name,
            subjectCode: sampleSubject.code,
            isElective: false,
            facultyId: null,
            facultyName: null,
          },
        },
      });

      const res = await request(app)
        .post(`/api/classes/${targetClass._id}/propagate-cohort-subjects`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ overwrite: true });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.updatedSections >= 1);
    });
  });

  describe('Department Academic Rollover & Central Master Curriculum', () => {
    it('GET /api/classes/master-curriculum auto-provisions or retrieves semester master curriculum', async () => {
      const res = await request(app)
        .get(`/api/classes/master-curriculum?departmentId=${testDept._id}&semester=5`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data);
      assert.equal(res.body.data.isMaster, true);
      assert.equal(res.body.data.semester, 5);
    });

    it('POST /api/classes/master-curriculum/sync broadcasts master subjects while preserving assigned faculty', async () => {
      // 1. Get or create master class and attach a master subject
      const masterSubject = await mongoose.model('Subject').create({
        name: 'Cloud Computing',
        code: '23CSD115',
        semester: 5,
        isActive: true,
      });

      const master = await Class.findOneAndUpdate(
        { departmentId: testDept._id, semester: 5, isMaster: true },
        {
          $set: {
            subjectAssignments: [{
              subjectId: masterSubject._id,
              subjectName: masterSubject.name,
              subjectCode: masterSubject.code,
              isElective: false,
              facultyId: null,
              facultyName: null,
            }],
          },
        },
        { new: true, upsert: true }
      );

      // 2. Set an existing faculty on targetClass for that subject
      await Class.findByIdAndUpdate(targetClass._id, {
        $set: {
          subjectAssignments: [{
            subjectId: masterSubject._id,
            subjectName: 'Old Cloud Name',
            subjectCode: '23CSD115',
            isElective: false,
            facultyId: hodUser._id,
            facultyName: 'Dr. Test Faculty',
          }],
        },
      });

      // 3. Sync from master curriculum
      const res = await request(app)
        .post('/api/classes/master-curriculum/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ departmentId: testDept._id, semester: 5, syncFaculty: false });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      // Verify targetClass updated subject details but KEPT existing assigned faculty
      const updatedTarget = await Class.findById(targetClass._id).lean();
      assert.equal(updatedTarget.subjectAssignments.length, 1);
      assert.equal(updatedTarget.subjectAssignments[0].subjectName, 'Cloud Computing');
      assert.equal(updatedTarget.subjectAssignments[0].facultyId.toString(), hodUser._id.toString());
      assert.equal(updatedTarget.subjectAssignments[0].facultyName, 'Dr. Test Faculty');
    });

    it('GET /api/classes/department-rollover-preview generates department waterfall simulation', async () => {
      const res = await request(app)
        .get(`/api/classes/department-rollover-preview?departmentId=${testDept._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.transitions);
      assert.ok(Array.isArray(res.body.data.transitions));
      assert.ok(res.body.data.totalStudents >= 1);
    });

    it('POST /api/classes/department-rollover executes atomic top-down waterfall rollover', async () => {
      const res = await request(app)
        .post('/api/classes/department-rollover')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          departmentId: testDept._id,
          autoCreateMissingSections: true,
          resetElectives: true,
          resetFaculty: true,
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.totalAffectedStudents >= 1);

      // Verify student 1 was promoted to next semester
      const updatedStudent = await Student.findById(student1._id).lean();
      assert.equal(updatedStudent.semester, 5);
      assert.equal(updatedStudent.currentSemester, 5);
      assert.equal(updatedStudent.classId.toString(), targetClass._id.toString());
    });
  });
});
