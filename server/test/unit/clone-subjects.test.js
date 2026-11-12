/**
 * clone-subjects.test.js — Integration tests for POST /api/classes/:id/clone-subjects
 * Verifies sequential transactional session safety, subject copying, and scoping guards.
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

describe('Clone Subjects Between Classes (POST /api/classes/:id/clone-subjects)', () => {
  let adminToken;
  let hodToken;
  let dept;
  let otherDept;
  let sourceClass;
  let masterClass;
  let foreignClass;

  before(async () => {
    await setupTestEnvironment();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    const adminId = new mongoose.Types.ObjectId();
    adminToken = signTestToken({ userId: adminId.toString(), role: 'admin', roleTags: ['admin'] });

    dept = await Department.create({ name: 'Computer Science Design', code: 'CSD', isActive: true });
    otherDept = await Department.create({ name: 'Mechanical', code: 'MECH', isActive: true });

    const hod = await Faculty.create({
      name: 'HoD CSD',
      employeeId: 'HOD_CSD_1',
      email: 'hodcsd@mits.ac.in',
      password: 'Password@123',
      departmentId: dept._id,
      roleTags: ['faculty', 'hod'],
      isActive: true,
    });
    hodToken = signTestToken({
      userId: hod._id.toString(),
      role: 'hod',
      roleTags: ['faculty', 'hod'],
      departmentId: dept._id.toString(),
    });

    const subj1 = await Subject.create({
      name: 'Machine Learning',
      code: '23CSD107',
      semester: 5,
      isElective: false,
      isActive: true,
    });
    const subj2 = await Subject.create({
      name: 'Cloud Computing',
      code: '23CSD4E1',
      semester: 5,
      isElective: true,
      isActive: true,
    });

    sourceClass = await Class.create({
      name: 'CSD-A',
      semester: 5,
      academicYear: '2026-27',
      departmentId: dept._id,
      isActive: true,
      subjectAssignments: [
        {
          subjectId: subj1._id,
          subjectName: subj1.name,
          subjectCode: subj1.code,
          isElective: false,
          facultyId: hod._id,
          facultyName: hod.name,
        },
        {
          subjectId: subj2._id,
          subjectName: subj2.name,
          subjectCode: subj2.code,
          isElective: true,
          facultyId: null,
          facultyName: null,
        },
      ],
    });

    masterClass = await Class.create({
      name: 'Semester 5 Master Syllabus',
      semester: 5,
      academicYear: '2026-27',
      departmentId: dept._id,
      isMaster: true,
      isActive: true,
      subjectAssignments: [],
    });

    foreignClass = await Class.create({
      name: 'MECH-A',
      semester: 5,
      academicYear: '2026-27',
      departmentId: otherDept._id,
      isActive: true,
      subjectAssignments: [],
    });
  });

  it('clones subjects from source section into master syllabus cleanly without transaction errors', async () => {
    const res = await request(app)
      .post(`/api/classes/${masterClass._id}/clone-subjects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceClassId: sourceClass._id.toString() });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.subjectsCloned, 2);

    const updated = await Class.findById(masterClass._id).lean();
    assert.equal(updated.subjectAssignments.length, 2);
    assert.equal(updated.subjectAssignments[0].subjectCode, '23CSD107');
    assert.equal(updated.subjectAssignments[0].facultyId, null);
    assert.equal(updated.subjectAssignments[1].isElective, true);
  });

  it('rejects self-clone and cross-department HoD clone', async () => {
    const selfRes = await request(app)
      .post(`/api/classes/${sourceClass._id}/clone-subjects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ sourceClassId: sourceClass._id.toString() });
    assert.equal(selfRes.status, 400);

    const crossRes = await request(app)
      .post(`/api/classes/${foreignClass._id}/clone-subjects`)
      .set('Authorization', `Bearer ${hodToken}`)
      .send({ sourceClassId: sourceClass._id.toString() });
    assert.equal(crossRes.status, 403);
  });
});
