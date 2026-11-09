/**
 * phase3-consolidation.test.js — Unit & Integration Tests for Phase 3 Class Consolidation
 * TRD Reference: TRD §5 Phase 3 (Steps 3.1 – 3.4) | Constraints: NC-4, NC-5, NC-6, FR-B1 to FR-B5
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  setupTestEnvironment,
  teardownTestEnvironment,
  clearTestDatabase,
} from '../harness/testHarness.js';

// Models
import Class from '../../src/models/Class.js';
import Student from '../../src/models/Student.js';
import Subject from '../../src/models/Subject.js';
import Department from '../../src/models/Department.js';
import Faculty from '../../src/models/Faculty.js';

// Consolidation functions under test
import {
  extractCanonicalClassName,
  computeRosterOverlap,
  generateMergeProposals,
} from '../../../scripts/proposeClassMerges.js';
import { executeClassMerges } from '../../../scripts/commitClassMerge.js';

describe('TRD Phase 3: Class Identity Consolidation (FR-B1 to FR-B5, NC-4)', () => {
  let department;
  let testFaculty;
  let subSem3, subSem4;
  let classSem3, classSem4;
  let studentsSem3, studentsSem4;

  before(async () => {
    await setupTestEnvironment();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();

    department = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true,
    });

    testFaculty = await Faculty.create({
      name: 'Dr. Grace Hopper',
      email: 'grace.hopper@test.edu',
      employeeId: 'EMP_HOP_01',
      password: 'password123',
      departmentId: department._id,
      roleTags: ['faculty'],
    });

    subSem3 = await Subject.create({
      name: 'Data Structures',
      code: '23CS301',
      semester: 3,
      departmentId: department._id,
    });

    subSem4 = await Subject.create({
      name: 'Algorithms',
      code: '23CS401',
      semester: 4,
      departmentId: department._id,
    });

    // Old model: separate class document per semester
    classSem3 = await Class.create({
      name: 'CSE-A Sem 3',
      departmentId: department._id,
      semester: 3,
      academicYear: '2025-26',
      classTeacherId: testFaculty._id,
      subjectAssignments: [
        {
          subjectId: subSem3._id,
          subjectName: subSem3.name,
          subjectCode: subSem3.code,
          facultyId: testFaculty._id,
          facultyName: testFaculty.name,
        },
      ],
    });

    classSem4 = await Class.create({
      name: 'CSE-A Sem 4',
      departmentId: department._id,
      semester: 4,
      academicYear: '2025-26',
      classTeacherId: testFaculty._id,
      subjectAssignments: [
        {
          subjectId: subSem4._id,
          subjectName: subSem4.name,
          subjectCode: subSem4.code,
          facultyId: testFaculty._id,
          facultyName: testFaculty.name,
        },
      ],
    });

    // Create 3 students in sem 3
    studentsSem3 = await Student.create([
      { rollNo: '24CS001', name: 'Student 1', email: 's1@test.edu', departmentId: department._id, classId: classSem3._id, semester: 3 },
      { rollNo: '24CS002', name: 'Student 2', email: 's2@test.edu', departmentId: department._id, classId: classSem3._id, semester: 3 },
      { rollNo: '24CS003', name: 'Student 3', email: 's3@test.edu', departmentId: department._id, classId: classSem3._id, semester: 3 },
    ]);

    // Create same students re-imported or linked to sem 4
    studentsSem4 = await Student.create([
      { rollNo: '24CS004', name: 'Student 4', email: 's4@test.edu', departmentId: department._id, classId: classSem4._id, semester: 4 },
      { rollNo: '24CS005', name: 'Student 5', email: 's5@test.edu', departmentId: department._id, classId: classSem4._id, semester: 4 },
    ]);
  });

  // ── 1. Helper Unit Tests ───────────────────────────────────────────────────
  describe('Name Canonicalization & Overlap Arithmetic', () => {
    it('normalizes semester-suffixed class names into canonical section identifiers', () => {
      assert.equal(extractCanonicalClassName('CSE-A Sem 3'), 'CSE-A');
      assert.equal(extractCanonicalClassName('CSE-B Semester 5'), 'CSE-B');
      assert.equal(extractCanonicalClassName('CSD - A (2024-25)'), 'CSD-A');
      assert.equal(extractCanonicalClassName('ECE-A Section 2'), 'ECE-A');
      assert.equal(extractCanonicalClassName('AIML-B'), 'AIML-B');
    });

    it('computes roster overlap accurately', () => {
      const setA = new Set(['24CS001', '24CS002', '24CS003']);
      const setB = new Set(['24CS001', '24CS002', '24CS099']);
      const overlap = computeRosterOverlap(setA, setB);
      assert.equal(overlap, 0.6667); // 2 out of 3 = 0.6667
    });
  });

  // ── 2. Proposal Generation (TRD Step 3.1) ───────────────────────────────────
  describe('Merge Proposal Generation (Step 3.1)', () => {
    it('generates consolidation proposal pairing same section across semesters', async () => {
      const db = mongoose.connection.db;
      const proposals = await generateMergeProposals(db);

      assert.equal(proposals.length, 1);
      const prop = proposals[0];
      assert.equal(prop.canonicalName, 'CSE-A');
      assert.equal(prop.primaryClassName, 'CSE-A Sem 4', 'Higher semester should be primary');
      assert.equal(prop.contributingClasses.length, 2);
    });
  });

  // ── 3. Human Review Safety Gate (NC-4) ───────────────────────────────────────
  describe('Human Review Gate (NC-4)', () => {
    it('halts and throws error if proposals are not marked approved: true', async () => {
      const db = mongoose.connection.db;
      const unapprovedProposals = [
        {
          canonicalName: 'CSE-A',
          primaryClassId: classSem4._id.toString(),
          approved: false, // Not approved by admin!
          contributingClasses: [],
        },
      ];

      await assert.rejects(
        async () => {
          await executeClassMerges(db, unapprovedProposals);
        },
        /NC-4 SAFETY HALT: No proposals marked "approved: true"/
      );
    });
  });

  // ── 4. Merge Execution (TRD Step 3.3, FR-B1 to FR-B4) ───────────────────────
  describe('Merge Execution & Persistent Class Update (Step 3.3)', () => {
    it('updates primary class with active and archived semester subjects', async () => {
      const db = mongoose.connection.db;

      const approvedProposal = {
        canonicalName: 'CSE-A',
        primaryClassId: classSem4._id.toString(),
        approved: true,
        contributingClasses: [
          { classId: classSem4._id.toString(), semester: 4 },
          { classId: classSem3._id.toString(), semester: 3 },
        ],
      };

      const result = await executeClassMerges(db, [approvedProposal]);
      assert.equal(result.proposalsExecuted, 1);
      assert.equal(result.classesMerged, 1); // classSem3 retired
      assert.equal(result.studentsRelinked, 3); // 3 students from sem 3 relinked

      // Verify Primary Class document state
      const reloadedPrimary = await Class.findById(classSem4._id).lean();
      assert.equal(reloadedPrimary.name, 'CSE-A');
      assert.equal(reloadedPrimary.semester, 4);
      assert.equal(reloadedPrimary.isActive, true);

      // Verify semesterSubjects map
      const semSubjects = reloadedPrimary.semesterSubjects;
      assert.ok(semSubjects, 'semesterSubjects must be populated');

      // Semester 3 subjects must be archived (FR-B3)
      assert.equal(semSubjects['3'].status, 'archived');
      assert.equal(semSubjects['3'].subjects[0].subjectCode, '23CS301');
      assert.ok(semSubjects['3'].archivedAt);

      // Semester 4 subjects must be active (FR-B2, FR-B4)
      assert.equal(semSubjects['4'].status, 'active');
      assert.equal(semSubjects['4'].subjects[0].subjectCode, '23CS401');

      // Verify Secondary Class is retired but preserved for history (NC-6)
      const reloadedSecondary = await Class.findById(classSem3._id).lean();
      assert.equal(reloadedSecondary.isActive, false);
      assert.equal(reloadedSecondary.mergedIntoClassId.toString(), classSem4._id.toString());

      // Verify all students from sem 3 now point to primary class
      const relinkedStudents = await Student.find({ classId: classSem4._id }).lean();
      assert.equal(relinkedStudents.length, 5, 'All 5 students should now reference primary class');

      // Verify migration audit log (NFR-4)
      const log = await db.collection('migrationLogs').findOne({
        migration: 'phase3-class-consolidation',
      });
      assert.ok(log);
      assert.equal(log.classesRetired, 1);
      assert.equal(log.studentsRelinked, 3);
    });
  });
});
