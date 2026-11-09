/**
 * phase4-shadow.test.js — Unit Tests for TRD Phase 4 Shadow Verification
 * TRD Reference: TRD §5 Phase 4 (Steps 4.1 – 4.3), MON-2, NC-5, NC-6, NFR-5
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import {
  shadowCompareClassSubjects,
  shadowCompareStudentSemester,
  shadowCompareFacultySnapshot,
  getShadowMetrics,
  resetShadowMetrics,
} from '../../src/services/shadowVerification.js';

describe('TRD Phase 4: Shadow Verification Engine (MON-2, NFR-5)', () => {
  beforeEach(() => {
    resetShadowMetrics();
  });

  describe('Class Subjects Shadow Comparison', () => {
    it('returns legacy subjects unconditionally when semesterSubjects matches', () => {
      const subjectId = new mongoose.Types.ObjectId();
      const facultyId = new mongoose.Types.ObjectId();

      const classDoc = {
        _id: new mongoose.Types.ObjectId(),
        name: 'CSE-A',
        semester: 4,
        subjectAssignments: [
          { subjectId, subjectCode: '23CS401', facultyId },
        ],
        semesterSubjects: {
          '4': {
            status: 'active',
            subjects: [{ subjectId, subjectCode: '23CS401', facultyId }],
          },
        },
      };

      const result = shadowCompareClassSubjects(classDoc);

      assert.deepEqual(result, classDoc.subjectAssignments);
      const metrics = getShadowMetrics();
      assert.equal(metrics.totalComparisons, 1);
      assert.equal(metrics.mismatchesDetected, 0);
      assert.equal(metrics.mismatchesByType.class_subjects, 0);
    });

    it('detects mismatch, logs warning, but still returns legacy subjects (MON-2, NFR-5)', () => {
      const sub1 = new mongoose.Types.ObjectId();
      const sub2 = new mongoose.Types.ObjectId();
      const facultyId = new mongoose.Types.ObjectId();

      const classDoc = {
        _id: new mongoose.Types.ObjectId(),
        name: 'CSE-A',
        semester: 4,
        // Legacy has 1 subject
        subjectAssignments: [
          { subjectId: sub1, subjectCode: '23CS401', facultyId },
        ],
        // New structure has 2 subjects
        semesterSubjects: {
          '4': {
            status: 'active',
            subjects: [
              { subjectId: sub1, subjectCode: '23CS401', facultyId },
              { subjectId: sub2, subjectCode: '23CS402', facultyId },
            ],
          },
        },
      };

      const result = shadowCompareClassSubjects(classDoc);

      // Must return legacy assignments untouched
      assert.equal(result.length, 1);
      assert.equal(result[0].subjectCode, '23CS401');

      // Metric must record the mismatch
      const metrics = getShadowMetrics();
      assert.equal(metrics.totalComparisons, 1);
      assert.equal(metrics.mismatchesDetected, 1);
      assert.equal(metrics.mismatchesByType.class_subjects, 1);
      assert.ok(metrics.lastMismatchTimestamp);
    });

    it('handles Map instance of semesterSubjects properly', () => {
      const subId = new mongoose.Types.ObjectId();
      const facId = new mongoose.Types.ObjectId();

      const map = new Map();
      map.set('3', {
        status: 'active',
        subjects: [{ subjectId: subId, subjectCode: '23CS301', facultyId: facId }],
      });

      const classDoc = {
        _id: new mongoose.Types.ObjectId(),
        name: 'ECE-B',
        semester: 3,
        subjectAssignments: [{ subjectId: subId, subjectCode: '23CS301', facultyId: facId }],
        semesterSubjects: map,
      };

      const result = shadowCompareClassSubjects(classDoc);
      assert.deepEqual(result, classDoc.subjectAssignments);
      assert.equal(getShadowMetrics().mismatchesDetected, 0);
    });
  });

  describe('Student Semester Shadow Comparison', () => {
    it('returns legacy semester when currentSemester matches', () => {
      const student = {
        _id: new mongoose.Types.ObjectId(),
        rollNo: '24CS001',
        semester: 4,
        currentSemester: 4,
      };

      const result = shadowCompareStudentSemester(student);
      assert.equal(result, 4);
      assert.equal(getShadowMetrics().mismatchesDetected, 0);
    });

    it('detects semester divergence, increments student_semester metric, returns legacy semester', () => {
      const student = {
        _id: new mongoose.Types.ObjectId(),
        rollNo: '24CS002',
        semester: 3, // Legacy says 3
        currentSemester: 4, // New says 4
      };

      const result = shadowCompareStudentSemester(student);

      // Strictly returns legacy value (NFR-5)
      assert.equal(result, 3);

      const metrics = getShadowMetrics();
      assert.equal(metrics.mismatchesDetected, 1);
      assert.equal(metrics.mismatchesByType.student_semester, 1);
    });
  });

  describe('Faculty Snapshot Shadow Comparison', () => {
    it('returns old snapshot and reports zero mismatches when snapshots match', () => {
      const facId = new mongoose.Types.ObjectId();
      const subId = new mongoose.Types.ObjectId();

      const oldSnap = [{ facultyId: facId, subjectId: subId, type: 'subject' }];
      const newSnap = [{ facultyId: facId, subjectId: subId, type: 'subject' }];

      const result = shadowCompareFacultySnapshot({ name: 'AIML-A' }, oldSnap, newSnap);
      assert.deepEqual(result, oldSnap);
      assert.equal(getShadowMetrics().mismatchesDetected, 0);
    });

    it('detects snapshot mismatch, records metric, returns old snapshot', () => {
      const fac1 = new mongoose.Types.ObjectId();
      const fac2 = new mongoose.Types.ObjectId();
      const sub = new mongoose.Types.ObjectId();

      const oldSnap = [{ facultyId: fac1, subjectId: sub, type: 'subject' }];
      const newSnap = [{ facultyId: fac2, subjectId: sub, type: 'subject' }];

      const result = shadowCompareFacultySnapshot({ name: 'AIML-A' }, oldSnap, newSnap);
      assert.deepEqual(result, oldSnap);

      const metrics = getShadowMetrics();
      assert.equal(metrics.mismatchesDetected, 1);
      assert.equal(metrics.mismatchesByType.faculty_snapshot, 1);
    });
  });

  describe('Resiliency & Failsafe Execution', () => {
    it('recovers gracefully from null or corrupted input without throwing', () => {
      assert.deepEqual(shadowCompareClassSubjects(null), []);
      assert.equal(shadowCompareStudentSemester(null), null);
      assert.deepEqual(shadowCompareFacultySnapshot(null, null, null), null);
    });
  });
});
