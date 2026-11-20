import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import xlsx from 'xlsx';
import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Class from '../../src/models/Class.js';
import Student from '../../src/models/Student.js';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearTestDatabase,
  signTestToken,
} from '../harness/testHarness.js';
import { cleanPersonName, isPlaceholderEmail, sanitizeValue } from '../../src/utils/importUtils.js';

describe('Adversarial Edge-Case Stress Testing for Imports & Rosters', () => {
  let adminToken;
  let dept;
  let classA;
  let classB;
  let masterClass;

  before(async () => {
    await setupTestEnvironment();
    adminToken = signTestToken({ role: 'admin', userId: new mongoose.Types.ObjectId().toString() });
  });

  beforeEach(async () => {
    await clearTestDatabase();

    dept = await Department.create({
      name: 'Computer Science and Design',
      code: 'CSD',
      isActive: true,
    });

    classA = await Class.create({
      name: 'CSD-A',
      semester: 3,
      academicYear: '2026-27',
      departmentId: dept._id,
      isActive: true,
      isMaster: false,
      studentIds: [],
    });

    classB = await Class.create({
      name: 'CSD-B',
      semester: 3,
      academicYear: '2026-27',
      departmentId: dept._id,
      isActive: true,
      isMaster: false,
      studentIds: [],
    });

    masterClass = await Class.create({
      name: 'Semester 3 Curriculum Master',
      semester: 3,
      academicYear: '2026-27',
      departmentId: dept._id,
      isActive: true,
      isMaster: true,
      studentIds: [],
    });
  });

  after(async () => {
    await clearTestDatabase();
    await teardownTestEnvironment();
  });

  const createBuffer = (sheets) => {
    const wb = xlsx.utils.book_new();
    for (const [sheetName, rows] of Object.entries(sheets)) {
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, sheetName);
    }
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  };

  it('BREAK-TEST 1: Curriculum Master must reject single and batch commits', async () => {
    // Single commit to master
    const resSingle = await request(app)
      .post('/api/import/students/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: masterClass._id.toString(),
        students: [{ rollNo: '25MRA07099', name: 'HACKER STUDENT' }],
      });

    assert.equal(resSingle.status, 400);
    assert.match(resSingle.body.error?.message || resSingle.body.message, /Curriculum Master/i);

    // Batch commit containing master
    const resBatch = await request(app)
      .post('/api/import/students/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        batch: [
          {
            classId: masterClass._id.toString(),
            sheetName: 'Curriculum Sheet',
            students: [{ rollNo: '25MRA07098', name: 'HACKER TWO' }],
          },
        ],
      });

    assert.equal(resBatch.status, 400);
    assert.match(resBatch.body.error?.message || resBatch.body.message, /Curriculum Master/i);

    // Verify master has 0 students
    const masterDb = await Class.findById(masterClass._id);
    assert.equal(masterDb.studentIds.length, 0);
  });

  it('BREAK-TEST 2: Direct Student APIs must reject assigning/moving to Curriculum Master', async () => {
    // POST /api/students with master classId
    const resCreate = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        rollNo: '25MRA07088',
        name: 'ATTEMPT MASTER CREATE',
        email: '25mra07088@mits.ac.in',
        classId: masterClass._id.toString(),
      });

    assert.equal(resCreate.status, 400);
    assert.match(resCreate.body.error?.message || resCreate.body.message, /Curriculum Master/i);

    // Create student in Class A first
    const studentInA = await Student.create({
      rollNo: '25MRA07089',
      name: 'STUDENT IN A',
      email: '25mra07089@mits.ac.in',
      departmentId: dept._id,
      classId: classA._id,
      semester: 3,
      academicYear: '2026-27',
      isActive: true,
    });

    // PUT /api/students/:id moving to master classId
    const resUpdate = await request(app)
      .put(`/api/students/${studentInA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        classId: masterClass._id.toString(),
      });

    assert.equal(resUpdate.status, 400);
    assert.match(resUpdate.body.error?.message || resUpdate.body.message, /Curriculum Master/i);
  });

  it('BREAK-TEST 3: Excel Formula Errors (#VALUE!, #REF!) should NOT be stored as names or valid data', async () => {
    const dirtyRows = [
      { 'Roll No': '25MRA07011', Name: '#VALUE!', Email: 'test1@mits.ac.in' },
      { 'Roll No': '#REF!', Name: 'Valid Name', Email: 'test2@mits.ac.in' },
      { 'Roll No': '25MRA07012', Name: 'Valid Student', Email: '#NAME?' },
      { 'Roll No': '\u00A025MRA07013\u00A0', Name: '  Clean   Student  ', Email: 'clean@mits.ac.in' },
    ];

    const buf = createBuffer({ 'DS-A': dirtyRows });
    const resPreview = await request(app)
      .post('/api/import/students/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buf, 'dirty_test.xlsx');

    assert.equal(resPreview.status, 200);
    const sheetData = resPreview.body.data.sheets[0];

    // Check if #VALUE! or #REF! was flagged as invalid
    const names = sheetData.valid.map((s) => s.name);
    const rolls = sheetData.valid.map((s) => s.rollNo);

    // If the system broke, #VALUE! would be in names, or #REF! in rolls
    assert.ok(!names.includes('#VALUE!'), 'Error: #VALUE! formula error was accepted as a valid student name!');
    assert.ok(!rolls.includes('#REF!'), 'Error: #REF! formula error was accepted as a valid roll number!');
    assert.ok(rolls.includes('25MRA07013'), 'Non-breaking space should be stripped cleanly');
  });

  it('BREAK-TEST 4: Nominal Roll Re-import (Updated Rolls) should UPDATE existing students rather than drop them', async () => {
    // 1. Existing student in CSD-A
    const initialStudent = await Student.create({
      rollNo: '25MRA07001',
      name: 'OLD NAME',
      email: 'old@mits.ac.in',
      departmentId: dept._id,
      classId: classA._id,
      semester: 3,
      academicYear: '2026-27',
      isActive: true,
    });
    classA.studentIds.push(initialStudent._id);
    await classA.save();

    // 2. Updated nominal roll uploaded with corrected name and transferred to CSD-B
    const updatedRows = [
      { 'Roll No': '25MRA07001', Name: 'CORRECTED NAME', Email: 'updated@mits.ac.in' },
      { 'Roll No': '25MRA07002', Name: 'BRAND NEW STUDENT', Email: 'new@mits.ac.in' },
    ];

    const buf = createBuffer({ 'DS-B': updatedRows });

    // Preview
    const resPreview = await request(app)
      .post('/api/import/students/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buf, 'updated_rolls.xlsx');

    assert.equal(resPreview.status, 200);

    // Commit to CSD-B
    const resCommit = await request(app)
      .post('/api/import/students/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        batch: [
          {
            classId: classB._id.toString(),
            sheetName: 'DS-B',
            students: [
              { rollNo: '25MRA07001', name: 'CORRECTED NAME', email: 'updated@mits.ac.in' },
              { rollNo: '25MRA07002', name: 'BRAND NEW STUDENT', email: 'new@mits.ac.in' },
            ],
          },
        ],
      });

    assert.equal(resCommit.status, 201);

    // Check DB state: 25MRA07001 should have updated name, updated email, and new classId (classB)
    const updatedStudent = await Student.findOne({ rollNo: '25MRA07001' });
    assert.equal(updatedStudent.name, 'CORRECTED NAME', 'Existing student name should be updated on re-import');
    assert.equal(updatedStudent.classId.toString(), classB._id.toString(), 'Student section should be moved to CSD-B');

    // Check Class studentIds: classA should no longer have 25MRA07001, classB should have both students
    const refreshedA = await Class.findById(classA._id);
    const refreshedB = await Class.findById(classB._id);

    assert.ok(!refreshedA.studentIds.map((id) => id.toString()).includes(updatedStudent._id.toString()), 'Student should be removed from old class');
    assert.ok(refreshedB.studentIds.map((id) => id.toString()).includes(updatedStudent._id.toString()), 'Student should be added to new class');
    assert.equal(refreshedB.studentIds.length, 2);
  });
});
