/**
 * phase5-wizard.test.js — Unit and Integration Tests for Setup Wizard & Cutover
 * TRD Reference: TRD §3.5 (FR-E1 to FR-E4), TRD §5 Phase 5 (Steps 5.1 – 5.6), FR-F3 to FR-F5
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
import Student from '../../src/models/Student.js';
import Subject from '../../src/models/Subject.js';
import Department from '../../src/models/Department.js';
import Faculty from '../../src/models/Faculty.js';
import { setFeatureFlag, clearFeatureFlagCache } from '../../src/utils/featureFlags.js';
import {
  getWizardProgress,
  saveWizardProgress,
  validatePreflightChecklist,
} from '../../src/services/wizardService.js';

describe('TRD Phase 5: Setup Wizard & Cutover (FR-E1 to FR-E4, FR-F3 to FR-F5)', () => {
  let adminToken;
  let adminUser;
  let testDepartment;
  let testClass;
  let testFaculty;
  let testSubject;

  before(async () => {
    await setupTestEnvironment();
  });

  after(async () => {
    await teardownTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    clearFeatureFlagCache();

    testDepartment = await Department.create({
      name: 'Computer Science and Engineering',
      code: 'CSE',
      isActive: true,
    });

    adminUser = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Admin User',
      email: 'admin.wizard@test.edu',
      role: 'admin',
      roleTags: ['admin'],
    };
    adminToken = signTestToken(adminUser);

    testFaculty = await Faculty.create({
      name: 'Teacher John',
      email: 'john.wiz@test.edu',
      employeeId: 'EMP_WIZ_02',
      password: 'password123',
      departmentId: testDepartment._id,
      roleTags: ['faculty'],
    });

    testSubject = await Subject.create({
      name: 'Database Systems',
      code: '23CS403',
      semester: 4,
      departmentId: testDepartment._id,
    });

    testClass = await Class.create({
      name: 'CSE-A',
      departmentId: testDepartment._id,
      semester: 4,
      academicYear: '2025-26',
      classTeacherId: null, // intentionally unassigned initially for checklist test
      subjectAssignments: [],
      studentIds: [],
    });
  });

  // ── 1. Feature Flag Gating (FR-F3 to FR-F5) ─────────────────────────────────
  describe('Feature Flag Gate (setup_wizard_enabled)', () => {
    it('returns 404 FEAT_001 when setup_wizard_enabled is false', async () => {
      await setFeatureFlag('setup_wizard_enabled', false, 'Setup Wizard dark launched');

      const res = await request(app)
        .get(`/api/wizard/classes/${testClass._id}/progress`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.error?.code, 'FEAT_001');
    });

    it('immediately permits access when setup_wizard_enabled is flipped to true (FR-F5)', async () => {
      await setFeatureFlag('setup_wizard_enabled', true, 'Setup Wizard active');

      const res = await request(app)
        .get(`/api/wizard/classes/${testClass._id}/progress`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.currentStep, 'class_info');
    });
  });

  // ── 2. Fixed Step Order Enforcement (FR-E1) ─────────────────────────────────
  describe('Wizard Step Sequencing (FR-E1)', () => {
    beforeEach(async () => {
      await setFeatureFlag('setup_wizard_enabled', true);
    });

    it('rejects skipping ahead before completing preceding required steps', async () => {
      // Trying to jump directly from class_info to preflight
      await assert.rejects(
        async () => {
          await saveWizardProgress(testClass._id, {
            step: 'preflight',
            markCompleted: false,
          });
        },
        /FR-E1 Sequence Violation: Cannot proceed to 'preflight'/
      );
    });

    it('enforces sequential advancement through wizard steps', async () => {
      // Step 1: class_info
      const step1 = await saveWizardProgress(testClass._id, {
        step: 'class_info',
        markCompleted: true,
        data: { className: 'CSE-A', section: 'A' },
      });
      assert.deepEqual(step1.completedSteps, ['class_info']);

      // Step 2: timetable_subjects
      const step2 = await saveWizardProgress(testClass._id, {
        step: 'timetable_subjects',
        markCompleted: true,
        data: { subjectsConfigured: 5 },
      });
      assert.ok(step2.completedSteps.includes('timetable_subjects'));

      // Step 3: students
      const step3 = await saveWizardProgress(testClass._id, {
        step: 'students',
        markCompleted: true,
      });
      assert.ok(step3.completedSteps.includes('students'));
    });
  });

  // ── 3. Pre-flight Checklist Validation (FR-E2) ──────────────────────────────
  describe('Pre-flight Checklist Gate (FR-E2)', () => {
    it('fails when class has 0 students, 0 subjects, and no class teacher', async () => {
      const preflight = await validatePreflightChecklist(testClass._id);

      assert.equal(preflight.readyForInitiation, false);
      assert.equal(preflight.checks.studentsPresent.passed, false);
      assert.equal(preflight.checks.subjectsPresent.passed, false);
      assert.equal(preflight.checks.classTeacherAssigned.passed, false);
    });

    it('passes when students, subjects, and class teacher are all present', async () => {
      // Assign class teacher
      testClass.classTeacherId = testFaculty._id;
      // Assign subject
      testClass.subjectAssignments = [
        {
          subjectId: testSubject._id,
          subjectName: testSubject.name,
          subjectCode: testSubject.code,
          facultyId: testFaculty._id,
        },
      ];
      await testClass.save();

      // Enroll student
      await Student.create({
        rollNo: '24CS001',
        name: 'Wizard Student',
        email: 'ws1@test.edu',
        departmentId: testDepartment._id,
        classId: testClass._id,
        semester: 4,
      });

      const preflight = await validatePreflightChecklist(testClass._id);

      assert.equal(preflight.readyForInitiation, true);
      assert.equal(preflight.checks.studentsPresent.passed, true);
      assert.equal(preflight.checks.subjectsPresent.passed, true);
      assert.equal(preflight.checks.classTeacherAssigned.passed, true);
    });
  });

  // ── 4. Initiation Gate & Progress Persistence (FR-E2, FR-E3) ────────────────
  describe('Initiation Route & Progress Persistence (FR-E2, FR-E3)', () => {
    beforeEach(async () => {
      await setFeatureFlag('setup_wizard_enabled', true);
    });

    it('blocks wizard batch initiation with 400 PREFLIGHT_FAILED when preflight is unfulfilled', async () => {
      const res = await request(app)
        .post(`/api/wizard/classes/${testClass._id}/initiate`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 400);
      assert.equal(res.body.error?.code, 'PREFLIGHT_FAILED');
      assert.equal(res.body.error?.details?.studentsPresent?.passed, false);
    });

    it('permits wizard initiation when pre-flight passes and updates progress', async () => {
      // Fulfill checklist
      testClass.classTeacherId = testFaculty._id;
      testClass.subjectAssignments = [
        {
          subjectId: testSubject._id,
          subjectName: testSubject.name,
          subjectCode: testSubject.code,
          facultyId: testFaculty._id,
        },
      ];
      // Mark preceding wizard steps completed
      testClass.wizardProgress = {
        currentStep: 'preflight',
        completedSteps: ['class_info', 'timetable_subjects', 'students', 'mentors', 'preflight'],
        stepData: {},
      };
      await testClass.save();

      await Student.create({
        rollNo: '24CS002',
        name: 'Ready Student',
        email: 'rs2@test.edu',
        departmentId: testDepartment._id,
        classId: testClass._id,
        semester: 4,
      });

      const res = await request(app)
        .post(`/api/wizard/classes/${testClass._id}/initiate`)
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data?.readyForInitiation, true);

      // Verify progress persisted on class document (FR-E3)
      const progress = await getWizardProgress(testClass._id);
      assert.ok(progress.completedSteps.includes('initiation'));
      assert.ok(progress.stepData?.initiation?.initiatedAt);
    });
  });

  // ── 5. Parallel Coexistence (FR-E4) ─────────────────────────────────────────
  describe('Standalone Admin Page Coexistence (FR-E4)', () => {
    it('confirms existing standalone class endpoints remain fully functional in parallel', async () => {
      const res = await request(app)
        .get('/api/classes')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data?.classes || res.body.data));
    });
  });
});
