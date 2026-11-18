import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTimetableHours,
  extractTableRowsFromText,
  parseTimetablePageFromText,
  normalizeFacultyName,
  getTokenSortedName,
  isWithoutTeacher
} from '../../src/services/timetableParser.js';

describe('Timetable Resilience & Real-World Edge Cases', () => {
  it('parses diverse hours formats including L-T-P and addition formulas', () => {
    assert.strictEqual(parseTimetableHours('3-0-0'), 3);
    assert.strictEqual(parseTimetableHours('3-1-0'), 4);
    assert.strictEqual(parseTimetableHours('3+1'), 4);
    assert.strictEqual(parseTimetableHours('3+1+0'), 4);
    assert.strictEqual(parseTimetableHours('3/0/2'), 5);
    assert.strictEqual(parseTimetableHours('4'), 4);
    assert.strictEqual(parseTimetableHours(''), 0);
    assert.strictEqual(parseTimetableHours(null), 0);
  });

  it('normalizes faculty names by stripping designations and titles', () => {
    assert.strictEqual(normalizeFacultyName('Dr. K. Dinesh (HOD)'), 'k dinesh');
    assert.strictEqual(normalizeFacultyName('Mr. V. Naveen [Asst. Prof]'), 'v naveen');
    assert.strictEqual(normalizeFacultyName('Prof. S. Ramanathan, Ph.D.'), 's ramanathan');
  });

  it('generates token-sorted names for order-independent matching', () => {
    const s1 = getTokenSortedName('Ramanathan P.');
    const s2 = getTokenSortedName('P. Ramanathan');
    assert.strictEqual(s1, s2);
  });

  it('detects unassigned course placeholder tokens', () => {
    assert.strictEqual(isWithoutTeacher('Without Teacher'), true);
    assert.strictEqual(isWithoutTeacher('TBD'), true);
    assert.strictEqual(isWithoutTeacher('TBA'), true);
    assert.strictEqual(isWithoutTeacher('Vacant'), true);
    assert.strictEqual(isWithoutTeacher('NIL'), true);
    assert.strictEqual(isWithoutTeacher('Staff'), true);
    assert.strictEqual(isWithoutTeacher('Dr. Alan Turing'), false);
  });

  it('extracts table rows with S.No serial column, pipe delimiters, and L-T-P hours', () => {
    const sampleTable = `
Department of Computer Science and Engineering
Time Table for III B.Tech I Semester (CSD - A)
S.No\tCourse Code & Name\tFaculty Name\tL-T-P
1\t23CSD107 Database Systems\tDr. Alan Turing (HOD)\t3-1-0
2\t23CSD108 Operating Systems Lab\tDr. Alan Turing / Dr. Ada Lovelace\t0-0-3
3\t23CSD4M01 Honors Elective\tWithout Teacher\t3-0-0
Time Table Incharge\tPrincipal
    `;

    const rows = extractTableRowsFromText(sampleTable);
    assert.strictEqual(rows.length, 3);
    assert.strictEqual(rows[0].subjectCode, '23CSD107');
    assert.strictEqual(rows[0].hours, 4);
    assert.strictEqual(rows[1].subjectCode, '23CSD108');
    assert.strictEqual(rows[1].hours, 3);
    assert.strictEqual(rows[2].subjectCode, '23CSD4M01');
    assert.strictEqual(rows[2].isElective, true);
  });

  it('matches inverted faculty names and co-faculty with slash/ampersand via lookup', () => {
    const facultyDb = [
      { _id: 'fac_1', name: 'Dr. Alan Turing', departmentId: 'dept_csd' },
      { _id: 'fac_2', name: 'Dr. Ada Lovelace', departmentId: 'dept_csd' },
      { _id: 'fac_3', name: 'P. Ramanathan', departmentId: 'dept_math' },
    ];

    const subjectsDb = [
      { _id: 'sub_1', code: '23CSD107', name: 'Database Management Systems', isElective: false },
      { _id: 'sub_2', code: '23CSD108', name: 'Operating Systems Lab', isElective: false },
      { _id: 'sub_3', code: '23MAT301', name: 'Discrete Mathematics', isElective: false },
    ];

    const rawRows = [
      // 1. Matches inverted name 'Turing Alan' to 'Dr. Alan Turing'
      {
        subjectCode: '23CSD107',
        subjectName: 'Database Management Systems',
        facultyField: 'Turing Alan (HOD)',
        hours: 4,
        isElective: false,
      },
      // 2. Matches co-faculty delimited with slash '/'
      {
        subjectCode: '23CSD108',
        subjectName: 'Operating Systems Lab',
        facultyField: 'Dr. Alan Turing / Dr. Ada Lovelace',
        hours: 3,
        isElective: false,
      },
      // 3. Matches cross-department faculty 'Ramanathan P.' from math dept
      {
        subjectCode: '23MAT301',
        subjectName: 'Discrete Mathematics',
        facultyField: 'Ramanathan P.',
        hours: 4,
        isElective: false,
      },
      // 4. Gracefully marks unassigned teacher as excluded per FR-C3
      {
        subjectCode: '23CSD109',
        subjectName: 'Seminar',
        facultyField: 'Without Teacher',
        hours: 1,
        isElective: false,
      }
    ];

    const result = parseTimetablePageFromText('dummy text with length greater than twenty-five characters', {
      pageNumber: 1,
      pageCount: 1,
      rawRows,
      allFaculties: facultyDb,
      allSubjects: subjectsDb,
      departmentId: 'dept_csd',
    });

    assert.strictEqual(result.rows.length, 4);

    // Row 1: Inverted name matched
    assert.strictEqual(result.rows[0].status, 'matched');
    assert.strictEqual(result.rows[0].facultyId, 'fac_1');

    // Row 2: Primary and Co-faculty matched
    assert.strictEqual(result.rows[1].status, 'matched');
    assert.strictEqual(result.rows[1].facultyId, 'fac_1');
    assert.deepStrictEqual(result.rows[1].coFacultyIds, ['fac_2']);

    // Row 3: Cross-department token-sorted match
    assert.strictEqual(result.rows[2].status, 'matched');
    assert.strictEqual(result.rows[2].facultyId, 'fac_3');

    // Row 4: Without Teacher excluded
    assert.strictEqual(result.rows[3].status, 'excluded');
    assert.strictEqual(result.rows[3].excludeReason, 'WITHOUT_TEACHER');
  });
});
