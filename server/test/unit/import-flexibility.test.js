import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import xlsx from 'xlsx';

import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearTestDatabase,
  signTestToken,
} from '../harness/testHarness.js';

import app from '../../src/app.js';
import Department from '../../src/models/Department.js';
import Class from '../../src/models/Class.js';
import Student from '../../src/models/Student.js';
import Faculty from '../../src/models/Faculty.js';

function buildXlsxBuffer(rows) {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('Flexible Spreadsheet Import Preview & Validation', () => {
  let adminToken;
  let testDept;
  let testClass;

  before(async () => {
    await setupTestEnvironment();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    testDept = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true,
    });

    adminToken = signTestToken({
      _id: new mongoose.Types.ObjectId(),
      name: 'Admin User',
      email: 'admin.import@test.edu',
      role: 'admin',
      roleTags: ['admin'],
    });

    testClass = await Class.create({
      name: 'CSE-A',
      departmentId: testDept._id,
      semester: 5,
      academicYear: '2026-27',
    });
  });

  it('parses student sheets with varied header names, optional emails, and catches duplicates cleanly', async () => {
    const buffer = buildXlsxBuffer([
      { 'Roll Number': '23691A3201', 'Student Name': 'Alice Rao', 'Mail ID': 'alice@mits.ac.in' },
      { 'Roll Number': '23691A3202', 'Student Name': 'Bob Kumar', 'Mail ID': '' }, // email optional
      { 'Roll Number': '23691A3202', 'Student Name': 'Duplicate Row', 'Mail ID': 'dup@mits.ac.in' }, // duplicate in file
      { 'Roll Number': '23691A3203', 'Student Name': 'Invalid Mail', 'Mail ID': 'not-an-email' }, // invalid email
    ]);

    const res = await request(app)
      .post(`/api/import/students/preview?classId=${testClass._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'students.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.valid.length, 2);
    assert.equal(res.body.data.valid[0].rollNo, '23691A3201');
    assert.equal(res.body.data.valid[0].email, 'alice@mits.ac.in');
    assert.equal(res.body.data.valid[1].rollNo, '23691A3202');
    assert.equal(res.body.data.valid[1].email, undefined);
    assert.equal(res.body.data.errors.length, 2);
  });

  it('returns 400 with clear format message for empty spreadsheets', async () => {
    const buffer = buildXlsxBuffer([]);

    const res = await request(app)
      .post(`/api/import/students/preview?classId=${testClass._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'empty.xlsx');

    assert.equal(res.status, 400);
    assert.match(res.body.error?.message || '', /no data rows/i);
  });

  it('matches mentor lookup by either employeeId or faculty email', async () => {
    await Faculty.create({
      name: 'Prof. Grace Hopper',
      email: 'grace@mits.ac.in',
      employeeId: 'FAC_HOPPER',
      password: 'password123',
      departmentId: testDept._id,
      roleTags: ['faculty'],
      isActive: true,
    });

    await Student.create([
      { rollNo: '23691A3210', name: 'Student One', classId: testClass._id, departmentId: testDept._id },
      { rollNo: '23691A3211', name: 'Student Two', classId: testClass._id, departmentId: testDept._id },
    ]);

    const buffer = buildXlsxBuffer([
      { 'Roll No': '23691A3210', 'Faculty Employee ID': 'FAC_HOPPER' },
      { 'Roll No': '23691A3211', 'Faculty Employee ID': 'grace@mits.ac.in' },
    ]);

    const res = await request(app)
      .post('/api/import/mentors/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'mentors.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.data.valid.length, 2);
    assert.equal(res.body.data.errors.length, 0);
  });
});

