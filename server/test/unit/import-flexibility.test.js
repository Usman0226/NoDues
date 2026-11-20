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

import fs from 'node:fs';

function buildXlsxBuffer(rows) {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(rows);
  xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildGridXlsxBuffer(grid, sheetName = 'Sheet1') {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet(grid);
  xlsx.utils.book_append_sheet(wb, ws, sheetName);
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

  it('handles arbitrary preamble lines, blank lines, and Name of the Candidate header', async () => {
    const grid = [
      ['', '', ''],
      ['Computer Science Engineering - (Data Science)  - Section -A-2026 - 27', '', ''],
      ['B.Tech - II Year I Semester Regular Nominal Rolls ', '', ''],
      ['', '', ''],
      ['S.No', 'Roll No', 'Name of the Candidate'],
      [1, '25MRA07001', 'ABHILASH GONGI'],
      [2, '25MRA07002', 'ABHISHEK REDDY SANAKA'],
      ['', '', ''],
      ['TOTAL : 2', '', ''],
    ];

    const buffer = buildGridXlsxBuffer(grid);

    const res = await request(app)
      .post(`/api/import/students/preview?classId=${testClass._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'nominal_rolls.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.valid.length, 2);
    assert.equal(res.body.data.valid[0].rollNo, '25MRA07001');
    assert.equal(res.body.data.valid[0].name, 'ABHILASH GONGI');
    assert.equal(res.body.data.valid[1].rollNo, '25MRA07002');
    assert.equal(res.body.data.valid[1].name, 'ABHISHEK REDDY SANAKA');
    assert.equal(res.body.data.errors.length, 0);
  });

  it('parses messy CSV with trailing commas, leading/trailing whitespace, and mixed case headers', async () => {
    const csv = [
      ',,,,,',
      '"Department of Data Science",,,,,',
      ',,,,,',
      '"S.No.","rOlL nUmBeR",,"NaMe Of ThE cAnDiDaTe",,,"eMaIl Id",,,',
      '1, 25MRA07001 ,, "ABHILASH GONGI" ,,, abhilash@test.edu ,,,',
      '2, 25MRA07002 ,, "ABHISHEK REDDY" ,,, ,,,',
      ',,,,,',
      '"Total Students : 2",,,,,',
    ].join('\n');

    const buffer = Buffer.from(csv);

    const res = await request(app)
      .post(`/api/import/students/preview?classId=${testClass._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'students.csv');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.valid.length, 2);
    assert.equal(res.body.data.valid[0].rollNo, '25MRA07001');
    assert.equal(res.body.data.valid[0].name, 'ABHILASH GONGI');
    assert.equal(res.body.data.valid[0].email, 'abhilash@test.edu');
    assert.equal(res.body.data.valid[1].rollNo, '25MRA07002');
    assert.equal(res.body.data.valid[1].name, 'ABHISHEK REDDY');
    assert.equal(res.body.data.errors.length, 0);
  });

  it('auto-corrects inverted/swapped column headers using value heuristics', async () => {
    // Header labels Name as column 1 and Roll No as column 2, but contents are inverted
    const grid = [
      ['S.No.', 'Name of the Student', 'Roll No'],
      [1, '25MRA02009', 'YANUMULA NAGENDRA'],
      [2, '25MRA04065', 'MALISETTY RAKESH'],
    ];

    const buffer = buildGridXlsxBuffer(grid);

    const res = await request(app)
      .post(`/api/import/students/preview?classId=${testClass._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'swapped.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.valid.length, 2);
    assert.equal(res.body.data.valid[0].rollNo, '25MRA02009');
    assert.equal(res.body.data.valid[0].name, 'YANUMULA NAGENDRA');
    assert.equal(res.body.data.valid[1].rollNo, '25MRA04065');
    assert.equal(res.body.data.valid[1].name, 'MALISETTY RAKESH');
  });

  it('parses real institutional multi-sheet nominal roll workbook and selects section sheet', async () => {
    const uploadedPath = 'C:/Users/chand/.gemini/antigravity/brain/f6054918-501c-4451-ace5-1e819bc17c54/.user_uploaded/media_1794944659686_2ae8efa3.xlsx';
    if (!fs.existsSync(uploadedPath)) {
      return; // Skip if run in CI without local artifact
    }

    const csdClass = await Class.create({
      name: 'CSD-A',
      departmentId: testDept._id,
      semester: 3,
      academicYear: '2026-27',
    });

    const buffer = fs.readFileSync(uploadedPath);

    const res = await request(app)
      .post(`/api/import/students/preview?classId=${csdClass._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'II_Year_I_Semester_Rolls.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.valid.length, 71); // Exactly 71 students in Section A!
    assert.equal(res.body.data.errors.length, 0); // 0 errors!
    assert.equal(res.body.data.valid[0].rollNo, '25MRA07001');
    assert.equal(res.body.data.valid[0].name, 'ABHILASH GONGI');
    assert.equal(res.body.data.valid[70].rollNo, '26MLA07024');
    assert.equal(res.body.data.valid[70].name, 'GATTU ASRAR AHAMAD');
  });

  it('handles split name columns (First Name + Last Name) and placeholder emails without failing', async () => {
    const buffer = buildXlsxBuffer([
      { 'Roll No': '25MRA07010', 'First Name': 'Priya', 'Last Name': 'Sharma', 'Email': 'NA' },
      { 'Roll No': '25MRA07011', 'Given Name': 'Kiran', 'Surname': 'Kumar', 'Email': 'none' },
      { 'Roll No': '25MRA07012', 'Name': 'Mr. Rahul Verma', 'Email': '-' },
      { 'Roll No': '25MRA07013', 'First Name': 'Sneha', 'Last Name': 'Reddy', 'Email': 'sneha@test.edu' },
    ]);

    const res = await request(app)
      .post(`/api/import/students/preview?classId=${testClass._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'split_names.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.data.valid.length, 4);
    assert.equal(res.body.data.errors.length, 0);
    assert.equal(res.body.data.valid[0].name, 'Priya Sharma');
    assert.equal(res.body.data.valid[0].email, undefined); // Placeholder filtered out
    assert.equal(res.body.data.valid[1].name, 'Kiran Kumar');
    assert.equal(res.body.data.valid[2].name, 'Rahul Verma'); // Stripped 'Mr.'
    assert.equal(res.body.data.valid[3].name, 'Sneha Reddy');
    assert.equal(res.body.data.valid[3].email, 'sneha@test.edu');
  });

  it('matches department by short code (e.g. CSE) during faculty preview', async () => {
    const buffer = buildXlsxBuffer([
      { 'Employee ID': 'EMP001', 'Name': 'Dr. Alan Turing', 'Email': 'alan@mits.ac.in', 'Department': 'CSE', 'Phone': '+91 98765 43210' },
      { 'Employee ID': 'EMP002', 'Name': 'Prof. Ada Lovelace', 'Email': 'ada@mits.ac.in', 'Department': 'Computer Science and Engineering', 'Phone': '9876543211' },
    ]);

    const res = await request(app)
      .post('/api/import/faculty/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'faculty.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.data.valid.length, 2);
    assert.equal(res.body.data.errors.length, 0);
    assert.equal(res.body.data.valid[0].employeeId, 'EMP001');
    assert.equal(res.body.data.valid[0].departmentId.toString(), testDept._id.toString());
    assert.equal(res.body.data.valid[1].employeeId, 'EMP002');
    assert.equal(res.body.data.valid[1].departmentId.toString(), testDept._id.toString());
  });

  it('parses Roman numeral semesters and elective types in subject preview', async () => {
    const buffer = buildXlsxBuffer([
      { 'Subject Code': '20CS501', 'Subject Name': 'Operating Systems', 'Semester': 'V', 'Is Elective': 'No' },
      { 'Subject Code': '20CS502', 'Subject Name': 'Cloud Computing', 'Semester': 'Sem 5', 'Is Elective': 'PE' },
      { 'Subject Code': '20CS301', 'Subject Name': 'Data Structures', 'Semester': 'III', 'Is Elective': 'Regular' },
    ]);

    const res = await request(app)
      .post('/api/import/subjects/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'subjects.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.data.valid.length, 3);
    assert.equal(res.body.data.errors.length, 0);
    assert.equal(res.body.data.valid[0].semester, 5);
    assert.equal(res.body.data.valid[0].isElective, false);
    assert.equal(res.body.data.valid[1].semester, 5);
    assert.equal(res.body.data.valid[1].isElective, true);
    assert.equal(res.body.data.valid[2].semester, 3);
    assert.equal(res.body.data.valid[2].isElective, false);
  });

  it('unpacks comma-separated lists and en-dash ranges in mentor assignments', async () => {
    await Faculty.create({
      name: 'Dr. John von Neumann',
      email: 'john@mits.ac.in',
      employeeId: 'EMP_NEUMANN',
      password: 'password123',
      departmentId: testDept._id,
      roleTags: ['faculty'],
      isActive: true,
    });

    await Student.create([
      { rollNo: '25MRA07050', name: 'Student 50', classId: testClass._id, departmentId: testDept._id },
      { rollNo: '25MRA07051', name: 'Student 51', classId: testClass._id, departmentId: testDept._id },
      { rollNo: '25MRA07052', name: 'Student 52', classId: testClass._id, departmentId: testDept._id },
      { rollNo: '25MRA07055', name: 'Student 55', classId: testClass._id, departmentId: testDept._id },
    ]);

    // Test en-dash range '25MRA07050–52' and separate comma-delimited item '25MRA07055'
    const buffer = buildXlsxBuffer([
      { 'Roll No': '25MRA07050–52, 25MRA07055', 'Faculty Employee ID': 'EMP_NEUMANN' },
    ]);

    const res = await request(app)
      .post('/api/import/mentors/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'mentors_range.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.data.valid.length, 4);
    assert.equal(res.body.data.errors.length, 0);
    const validRolls = res.body.data.valid.map((v) => v.rollNo);
    assert.deepEqual(validRolls, ['25MRA07050', '25MRA07051', '25MRA07052', '25MRA07055']);
  });

  it('auto-resolves target class by matching sheet name when classId query param is omitted', async () => {
    // Single active class in db is testClass ('CSE-A')
    const buffer = buildGridXlsxBuffer([
      ['Roll No', 'Full Name'],
      ['25MRA07001', 'John Doe']
    ], 'CSE-A');

    const res = await request(app)
      .post('/api/import/students/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'student_roster.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.data.valid.length, 1);
    assert.equal(res.body.data.targetClass.name, 'CSE-A');
  });

  it('returns a user-friendly error message when classId is omitted and ambiguous across multiple classes', async () => {
    // Add a second class so auto-resolution requires an explicit match
    await Class.create({
      name: 'CSE-B',
      departmentId: testDept._id,
      semester: 5,
      academicYear: '2026-27',
    });

    const buffer = buildGridXlsxBuffer([
      ['Roll No', 'Full Name'],
      ['25MRA07001', 'John Doe']
    ], 'RandomSheetName');

    const res = await request(app)
      .post('/api/import/students/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'students.xlsx');

    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /Please select a target class\/section/i);
  });

  it('parses multi-sheet workbook with DS-A and DS-B, accurately matches target classes, and excludes summary sheets', async () => {
    // Set up CSD department and sections A and B (Semester 3) plus an unrelated CSD-C (Sem 7)
    const csdDept = await Department.create({
      name: 'Computer Science and Engineering (Data Science)',
      code: 'CSD',
      isActive: true,
    });

    const classCsdA = await Class.create({
      name: 'CSD-A',
      departmentId: csdDept._id,
      semester: 3,
      academicYear: '2026-27',
      isActive: true,
    });

    const classCsdB = await Class.create({
      name: 'CSD-B',
      departmentId: csdDept._id,
      semester: 3,
      academicYear: '2026-27',
      isActive: true,
    });

    // Unrelated class that should NEVER be matched
    await Class.create({
      name: 'CSD-C',
      departmentId: csdDept._id,
      semester: 7,
      academicYear: '2026-27',
      isActive: true,
    });

    const wb = xlsx.utils.book_new();
    
    // Sheet 1: DS-A with preamble
    const dsAGrid = [
      [],
      [],
      ['Computer Science Engineering - (Data Science) - Section -A- 2026 - 27'],
      ['B.Tech - II Year I Semester Regular Nominal Rolls'],
      ['S.No', 'Roll No', 'Name of the Candidate'],
      [1, '25MRA07001', 'ALICE SMITH'],
      [2, '25MRA07002', 'BOB JONES']
    ];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(dsAGrid), 'DS-A ');

    // Sheet 2: DS-B with preamble
    const dsBGrid = [
      [],
      [],
      ['Computer Science Engineering - (Data Science) - Section -B- 2026 - 27'],
      ['B.Tech - II Year I Semester Regular Nominal Rolls'],
      ['S.No', 'Roll No', 'Name of the Candidate'],
      [1, '25MRA07063', 'CHARLIE BROWN'],
      [2, '25MRA07064', 'DIANA PRINCE']
    ];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(dsBGrid), 'DS-B ');

    // Sheet 3: STRENGTH summary sheet (no student rolls)
    const strengthGrid = [
      ['BRANCH', 'SECTION', 'TOTAL'],
      ['CE', null, 6],
      ['EEE', null, 10]
    ];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(strengthGrid), 'STRENGTH');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await request(app)
      .post('/api/import/students/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'II_Year_I_Semester_Updated_Rolls.xlsx');

    assert.equal(res.status, 200);
    assert.equal(res.body.data.isMultiSheet, true);
    assert.equal(res.body.data.rosterSheetsCount, 2);
    assert.equal(res.body.data.totalRosterRecords, 4);

    const sheets = res.body.data.sheets;
    const sheetA = sheets.find(s => s.sheetName === 'DS-A');
    const sheetB = sheets.find(s => s.sheetName === 'DS-B');
    const sheetStrength = sheets.find(s => s.sheetName === 'STRENGTH');

    assert.ok(sheetA, 'Sheet DS-A must be present');
    assert.equal(sheetA.sheetType, 'roster');
    assert.equal(sheetA.valid.length, 2);
    assert.equal(sheetA.targetClass.name, 'CSD-A');
    assert.equal(sheetA.targetClass.semester, 3);

    assert.ok(sheetB, 'Sheet DS-B must be present');
    assert.equal(sheetB.sheetType, 'roster');
    assert.equal(sheetB.valid.length, 2);
    assert.equal(sheetB.targetClass.name, 'CSD-B');
    assert.equal(sheetB.targetClass.semester, 3);

    assert.ok(sheetStrength, 'STRENGTH sheet must be classified as summary');
    assert.equal(sheetStrength.sheetType, 'summary');
  });

  it('commits multiple classes in one shot via batch payload in an atomic transaction', async () => {
    const csdDept = await Department.create({
      name: 'Computer Science and Engineering (Data Science)',
      code: 'CSD',
      isActive: true,
    });

    const classA = await Class.create({
      name: 'CSD-A',
      departmentId: csdDept._id,
      semester: 3,
      academicYear: '2026-27',
      isActive: true,
    });

    const classB = await Class.create({
      name: 'CSD-B',
      departmentId: csdDept._id,
      semester: 3,
      academicYear: '2026-27',
      isActive: true,
    });

    const batchPayload = {
      batch: [
        {
          classId: classA._id.toString(),
          sheetName: 'DS-A',
          students: [
            { rollNo: '25MRA07001', name: 'ALICE SMITH', email: 'alice@mits.ac.in' },
            { rollNo: '25MRA07002', name: 'BOB JONES', email: 'bob@mits.ac.in' }
          ]
        },
        {
          classId: classB._id.toString(),
          sheetName: 'DS-B',
          students: [
            { rollNo: '25MRA07063', name: 'CHARLIE BROWN', email: 'charlie@mits.ac.in' },
            { rollNo: '25MRA07064', name: 'DIANA PRINCE', email: 'diana@mits.ac.in' }
          ]
        }
      ]
    };

    const res = await request(app)
      .post('/api/import/students/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(batchPayload);

    assert.equal(res.status, 201);
    assert.equal(res.body.data.count, 4);
    assert.equal(res.body.data.classesCount, 2);

    // Verify students exist in DB and linked to their respective classes
    const student1 = await Student.findOne({ rollNo: '25MRA07001' });
    assert.ok(student1);
    assert.equal(student1.classId.toString(), classA._id.toString());

    const student3 = await Student.findOne({ rollNo: '25MRA07063' });
    assert.ok(student3);
    assert.equal(student3.classId.toString(), classB._id.toString());

    // Verify class studentIds were updated
    const updatedClassA = await Class.findById(classA._id);
    assert.equal(updatedClassA.studentIds.length, 2);
    const updatedClassB = await Class.findById(classB._id);
    assert.equal(updatedClassB.studentIds.length, 2);
  });

  it('detects cross-sheet duplicate roll numbers and flags them in preview', async () => {
    const csdDept = await Department.create({
      name: 'Computer Science and Engineering (Data Science)',
      code: 'CSD',
      isActive: true,
    });

    await Class.create({
      name: 'CSD-A',
      departmentId: csdDept._id,
      semester: 3,
      academicYear: '2026-27',
      isActive: true,
    });

    await Class.create({
      name: 'CSD-B',
      departmentId: csdDept._id,
      semester: 3,
      academicYear: '2026-27',
      isActive: true,
    });

    const wb = xlsx.utils.book_new();

    // Sheet 1: DS-A with roll 25MRA07001
    const dsAGrid = [
      ['Roll No', 'Name of the Candidate'],
      ['25MRA07001', 'ALICE SMITH']
    ];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(dsAGrid), 'DS-A');

    // Sheet 2: DS-B has 25MRA07001 (duplicate across sheets) and 25MRA07064
    const dsBGrid = [
      ['Roll No', 'Name of the Candidate'],
      ['25MRA07001', 'ALICE CLONE'],
      ['25MRA07064', 'DIANA PRINCE']
    ];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(dsBGrid), 'DS-B');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await request(app)
      .post('/api/import/students/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'students.xlsx');

    assert.equal(res.status, 200);
    const sheetB = res.body.data.sheets.find(s => s.sheetName === 'DS-B');
    assert.ok(sheetB);
    assert.equal(sheetB.valid.length, 1);
    assert.equal(sheetB.errors.length, 1);
    assert.match(sheetB.errors[0].reason, /Duplicate roll number 25MRA07001 already found in sheet "DS-A"/i);
  });

  it('resolves DS-B to CSD-B even when preview is called with query classId for CSD-A', async () => {
    const csdDept = await Department.create({
      name: 'Computer Science and Engineering (Data Science)',
      code: 'CSD',
      isActive: true,
    });

    const classA = await Class.create({
      name: 'CSD-A',
      departmentId: csdDept._id,
      semester: 3,
      academicYear: '2026-27',
      isActive: true,
    });

    const classB = await Class.create({
      name: 'CSD-B',
      departmentId: csdDept._id,
      semester: 3,
      academicYear: '2026-27',
      isActive: true,
    });

    const wb = xlsx.utils.book_new();

    const dsAGrid = [
      ['Computer Science Engineering - (Data Science) - Section -A- 2026 - 27'],
      ['B.Tech - II Year I Semester Regular Nominal Rolls'],
      ['Roll No', 'Name of the Candidate'],
      ['25MRA07001', 'ALICE SMITH']
    ];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(dsAGrid), 'DS-A');

    const dsBGrid = [
      ['Computer Science Engineering - (Data Science) - Section -B- 2026 - 27'],
      ['B.Tech - II Year I Semester Regular Nominal Rolls'],
      ['Roll No', 'Name of the Candidate'],
      ['25MRA07063', 'CHARLIE BROWN']
    ];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(dsBGrid), 'DS-B');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Call with classId=classA._id
    const res = await request(app)
      .post(`/api/import/students/preview?classId=${classA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'students.xlsx');

    assert.equal(res.status, 200);
    const sheetA = res.body.data.sheets.find(s => s.sheetName === 'DS-A');
    const sheetB = res.body.data.sheets.find(s => s.sheetName === 'DS-B');

    assert.equal(sheetA.targetClass.name, 'CSD-A');
    assert.equal(sheetB.targetClass.name, 'CSD-B');
  });
});

