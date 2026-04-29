/**
 * batchSync.js
 *
 * Keeps NodueRequest / NodueApproval data in sync whenever class or student
 * data changes while a batch is active.
 *
 * Key design principles:
 *  1. Every function uses startSafeTransaction — works on M0 and replica sets.
 *  2. Cache invalidation is OUTSIDE the try/catch — it only runs on success,
 *     but is never skipped by a thrown error inside the transaction.
 *  3. Errors are logged but NOT re-thrown so callers can complete gracefully.
 */
import mongoose from 'mongoose';
import NodueBatch from '../models/NodueBatch.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import CoCurricularType from '../models/CoCurricularType.js';
import logger from './logger.js';
import { invalidateEntityCache } from './cacheHooks.js';
import {
  startSafeTransaction,
  commitSafeTransaction,
  abortSafeTransaction,
  getSessionOptions,
} from './safeTransaction.js';
import { recalcRequestStatus } from '../Controllers/approvalController.js';

// ── syncSubjectRemoval ────────────────────────────────────────────────────────
export const syncSubjectRemoval = async (classId, subjectId) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const activeBatch = await NodueBatch.findOne({ classId, status: 'active' }).session(session).lean();
    if (!activeBatch) {
      await commitSafeTransaction(session);
      return; // no active batch — nothing to sync
    }

    logger.info('sync_subject_removal_started', { batchId: activeBatch._id, subjectId });

    const requests = await NodueRequest.find({ batchId: activeBatch._id }).session(session);

    for (const req of requests) {
      if (Array.isArray(req.facultySnapshot)) {
        req.facultySnapshot = req.facultySnapshot.filter(
          f => f.subjectId?.toString() !== subjectId.toString()
        );
      } else if (req.facultySnapshot && typeof req.facultySnapshot === 'object') {
        delete req.facultySnapshot[subjectId.toString()];
        req.markModified('facultySnapshot');
      }
      await req.save(getSessionOptions(session));
    }

    const deleteResult = await NodueApproval.deleteMany({ batchId: activeBatch._id, subjectId, approvalType: 'subject' }, getSessionOptions(session));

    await commitSafeTransaction(session);
    succeeded = true;

    logger.audit('SYNC_SUBJECT_REMOVED', {
      batchId: activeBatch._id.toString(),
      subjectId: subjectId.toString(),
      approvalsDeleted: deleteResult.deletedCount,
    });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_subject_removal_failed', { classId, subjectId, error: err.message });
  } finally {
    session.endSession();
  }

  // ── Cache invalidation: outside try — guaranteed to run only on success ──
  if (succeeded) {
    invalidateEntityCache('student', 'all');
    invalidateEntityCache('class', classId);
  }
};

// ── syncSubjectUpdate ─────────────────────────────────────────────────────────
export const syncSubjectUpdate = async (classId, subjectId, facultyData) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const activeBatch = await NodueBatch.findOne({ classId, status: 'active' }).session(session).lean();
    if (!activeBatch) {
      await commitSafeTransaction(session);
      return;
    }

    const { facultyId, facultyName, subjectCode } = facultyData;

    const requests = await NodueRequest.find({ batchId: activeBatch._id }).session(session);
    for (const req of requests) {
      let updated = false;
      if (Array.isArray(req.facultySnapshot)) {
        const idx = req.facultySnapshot.findIndex(f => f.subjectId?.toString() === subjectId.toString());
        if (idx !== -1) {
          req.facultySnapshot[idx] = { ...req.facultySnapshot[idx], facultyId, facultyName, subjectCode };
          updated = true;
        }
      } else if (req.facultySnapshot && req.facultySnapshot[subjectId.toString()]) {
        req.facultySnapshot[subjectId.toString()] = {
          ...req.facultySnapshot[subjectId.toString()],
          facultyId, facultyName, subjectCode,
        };
        req.markModified('facultySnapshot');
        updated = true;
      }
      if (updated) await req.save(getSessionOptions(session));
    }

    await NodueApproval.updateMany(
      { batchId: activeBatch._id, subjectId, approvalType: 'subject' },
      { facultyId, facultyName, action: 'pending', actionedAt: null, dueType: null, remarks: null },
      getSessionOptions(session)
    );

    await commitSafeTransaction(session);
    succeeded = true;

    logger.audit('SYNC_SUBJECT_UPDATED', {
      batchId: activeBatch._id.toString(),
      subjectId: subjectId.toString(),
      newFacultyId: facultyId?.toString(),
    });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_subject_update_failed', { classId, subjectId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('class', classId);
  }
};

// ── syncStudentUpdate ─────────────────────────────────────────────────────────
/**
 * Propagate changes to a student's basic details (Name, RollNo) to all
 * active batch requests and approvals.
 */
export const syncStudentUpdate = async (studentId, { name, rollNo }) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    // 1. Update the studentSnapshot in all active NodueRequests for this student
    const activeRequests = await NodueRequest.find({ studentId }).session(session);
    if (!activeRequests.length) {
      await commitSafeTransaction(session);
      return;
    }

    const batchIds = [...new Set(activeRequests.map(r => r.batchId.toString()))];
    const activeBatches = await NodueBatch.find({ _id: { $in: batchIds }, status: 'active' })
      .session(session).select('_id').lean();
    const activeBatchIds = new Set(activeBatches.map(b => b._id.toString()));

    let requestsModified = 0;
    for (const req of activeRequests) {
      if (!activeBatchIds.has(req.batchId.toString())) continue;

      if (name) req.studentSnapshot.name = name;
      if (rollNo) req.studentSnapshot.rollNo = rollNo;
      
      req.markModified('studentSnapshot');
      await req.save(getSessionOptions(session));
      requestsModified++;
    }

    // 2. Update the studentName/studentRollNo in all corresponding NodueApprovals
    const updateFields = {};
    if (name) updateFields.studentName = name;
    if (rollNo) updateFields.studentRollNo = rollNo;

    if (Object.keys(updateFields).length > 0 && activeBatchIds.size > 0) {
      await NodueApproval.updateMany(
        { studentId, batchId: { $in: Array.from(activeBatchIds) } },
        { $set: updateFields },
        getSessionOptions(session)
      );
    }

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_STUDENT_UPDATED', { studentId, requestsModified, name, rollNo });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_student_update_failed', { studentId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('student', studentId.toString());
  }
};

// ── syncMentorUpdate ──────────────────────────────────────────────────────────
export const syncMentorUpdate = async (studentId, mentorId, mentorName) => {
  let succeeded = false;
  let activeBatchClassId = null;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const request = await NodueRequest.findOne({ studentId }).sort({ createdAt: -1 }).session(session);
    if (!request) {
      await commitSafeTransaction(session);
      return;
    }

    const activeBatch = await NodueBatch.findOne({ _id: request.batchId, status: 'active' })
      .session(session).lean();
    if (!activeBatch) {
      await commitSafeTransaction(session);
      return;
    }
    activeBatchClassId = activeBatch.classId;

    // 1. Update facultySnapshot (both 'mentor' and 'coCurricular_mentor' entries)
    if (Array.isArray(request.facultySnapshot)) {
      // Standard Mentor Role
      const idx = request.facultySnapshot.findIndex(f => f.roleTag === 'mentor');
      if (idx !== -1) {
        request.facultySnapshot[idx] = { ...request.facultySnapshot[idx], facultyId: mentorId, facultyName: mentorName };
      } else {
        request.facultySnapshot.push({
          facultyId: mentorId, facultyName: mentorName, roleTag: 'mentor',
          approvalType: 'mentor', subjectName: 'Mentor',
        });
      }

      // Co-Curricular items assigned to mentor
      request.facultySnapshot.forEach((f, idx) => {
        if (f.roleTag === 'coCurricular_mentor') {
          request.facultySnapshot[idx].facultyId = mentorId;
          request.facultySnapshot[idx].facultyName = mentorName;
        }
      });
    } else if (request.facultySnapshot) {
      // Object-style snapshot
      request.facultySnapshot['mentor'] = {
        facultyId: mentorId, facultyName: mentorName, roleTag: 'mentor',
        approvalType: 'mentor', subjectId: null, subjectName: 'Mentor',
      };
      
      Object.keys(request.facultySnapshot).forEach(key => {
        if (request.facultySnapshot[key].roleTag === 'coCurricular_mentor') {
          request.facultySnapshot[key].facultyId = mentorId;
          request.facultySnapshot[key].facultyName = mentorName;
        }
      });
      request.markModified('facultySnapshot');
    }

    // 2. Perform database updates for approvals
    await NodueApproval.findOneAndUpdate(
      { requestId: request._id, roleTag: 'mentor' },
      { 
        studentId: request.studentId,
        batchId: request.batchId,
        studentRollNo: request.studentSnapshot?.rollNo,
        studentName: request.studentSnapshot?.name,
        facultyId: mentorId, 
        facultyName: mentorName, 
        subjectName: 'Mentor',
        approvalType: 'mentor',
        action: 'pending', 
        actionedAt: null, 
        dueType: null, 
        remarks: null 
      },
      { upsert: true, ...getSessionOptions(session) }
    );

    await NodueApproval.updateMany(
      { requestId: request._id, roleTag: 'coCurricular_mentor' },
      { facultyId: mentorId, facultyName: mentorName, action: 'pending', actionedAt: null },
      getSessionOptions(session)
    );

    // 3. Save request ONCE at the end
    await request.save(getSessionOptions(session));

    await commitSafeTransaction(session);
    succeeded = true;

    logger.audit('SYNC_MENTOR_UPDATED', {
      studentId: studentId.toString(),
      newMentorId: mentorId.toString(),
    });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_mentor_update_failed', { studentId, error: err.message });
  } finally {
    session.endSession();
  }

  // Cache invalidation outside try — runs only on success
  if (succeeded && activeBatchClassId) {
    invalidateEntityCache('class', activeBatchClassId.toString());
  }
};

// ── syncElectiveAddition ──────────────────────────────────────────────────────
export const syncElectiveAddition = async (studentId, electiveData) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const request = await NodueRequest.findOne({ studentId }).sort({ createdAt: -1 }).session(session);
    if (!request) {
      await commitSafeTransaction(session);
      return;
    }

    const activeBatch = await NodueBatch.findOne({ _id: request.batchId, status: 'active' })
      .session(session).lean();
    if (!activeBatch) {
      await commitSafeTransaction(session);
      return;
    }

    const { subjectId, subjectName, subjectCode, facultyId, facultyName } = electiveData;

    // Add to facultySnapshot
    if (Array.isArray(request.facultySnapshot)) {
      request.facultySnapshot.push({
        facultyId, facultyName, subjectId, subjectName, subjectCode,
        roleTag: 'faculty', approvalType: 'subject',
      });
    } else if (request.facultySnapshot) {
      request.facultySnapshot[subjectId.toString()] = {
        facultyId, facultyName, subjectId, subjectName, subjectCode,
        roleTag: 'faculty', approvalType: 'subject',
      };
      request.markModified('facultySnapshot');
    }
    await request.save(getSessionOptions(session));

    // Create approval record
    await NodueApproval.create([{
      requestId: request._id,
      batchId: activeBatch._id,
      studentId,
      studentRollNo: request.studentSnapshot?.rollNo,
      studentName: request.studentSnapshot?.name,
      facultyId, subjectId, subjectName,
      approvalType: 'subject',
      roleTag: 'faculty',
      action: 'pending',
    }], getSessionOptions(session));

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_ELECTIVE_ADDED', { studentId, subjectId });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_elective_addition_failed', { studentId, error: err.message });
  } finally {
    session.endSession();
  }
};

// ── syncElectiveRemoval ───────────────────────────────────────────────────────
export const syncElectiveRemoval = async (studentId, subjectId) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const request = await NodueRequest.findOne({ studentId }).sort({ createdAt: -1 }).session(session);
    if (!request) {
      await commitSafeTransaction(session);
      return;
    }

    const activeBatch = await NodueBatch.findOne({ _id: request.batchId, status: 'active' })
      .session(session).lean();
    if (!activeBatch) {
      await commitSafeTransaction(session);
      return;
    }

    // Remove from facultySnapshot
    if (Array.isArray(request.facultySnapshot)) {
      request.facultySnapshot = request.facultySnapshot.filter(
        f => f.subjectId?.toString() !== subjectId.toString()
      );
    } else if (request.facultySnapshot) {
      delete request.facultySnapshot[subjectId.toString()];
      request.markModified('facultySnapshot');
    }
    await request.save(getSessionOptions(session));

    await NodueApproval.deleteOne(
      { requestId: request._id, subjectId, approvalType: 'subject' },
      getSessionOptions(session)
    );

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_ELECTIVE_REMOVED', { studentId, subjectId });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_elective_removal_failed', { studentId, error: err.message });
  } finally {
    session.endSession();
  }
};

// ── syncElectiveUpdate ────────────────────────────────────────────────────────
/**
 * When a student's elective faculty is changed while a batch is active, update
 * the existing NodueApproval record and the facultySnapshot on the request.
 * This ensures the old faculty no longer sees a pending approval and the new
 * faculty immediately sees it.
 */
export const syncElectiveUpdate = async (studentId, subjectId, { facultyId, facultyName }) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const request = await NodueRequest.findOne({ studentId }).sort({ createdAt: -1 }).session(session);
    if (!request) {
      await commitSafeTransaction(session);
      return;
    }

    const activeBatch = await NodueBatch.findOne({ _id: request.batchId, status: 'active' })
      .session(session).lean();
    if (!activeBatch) {
      await commitSafeTransaction(session);
      return;
    }

    // Update the approval record to point to the new faculty
    await NodueApproval.findOneAndUpdate(
      { requestId: request._id, subjectId, approvalType: 'subject' },
      {
        $set: {
          facultyId,
          facultyName,
          // Reset to pending so the new faculty sees it as actionable
          action: 'pending',
          actionedAt: null,
          remarks: null,
        }
      },
      getSessionOptions(session)
    );

    // Update the facultySnapshot on the request
    if (Array.isArray(request.facultySnapshot)) {
      const entry = request.facultySnapshot.find(
        f => f.subjectId?.toString() === subjectId.toString()
      );
      if (entry) {
        entry.facultyId   = facultyId;
        entry.facultyName = facultyName;
        request.markModified('facultySnapshot');
      }
    } else if (request.facultySnapshot?.[subjectId.toString()]) {
      request.facultySnapshot[subjectId.toString()].facultyId   = facultyId;
      request.facultySnapshot[subjectId.toString()].facultyName = facultyName;
      request.markModified('facultySnapshot');
    }
    await request.save(getSessionOptions(session));

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_ELECTIVE_UPDATED', { studentId, subjectId, newFacultyId: facultyId });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_elective_update_failed', { studentId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('student', studentId.toString());
  }
};

// ── syncStudentDeactivation ───────────────────────────────────────────────────
export const syncStudentDeactivation = async (studentId) => {
  let succeeded = false;
  const affectedClassIds = [];
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    // Fetch ALL requests for this student, not just the latest.
    // Only remove requests from active batches; historical (closed-batch) records are preserved.
    const allRequests = await NodueRequest.find({ studentId }).session(session).lean();
    if (!allRequests.length) {
      await commitSafeTransaction(session);
      return;
    }

    const batchIds = [...new Set(allRequests.map(r => r.batchId.toString()))];
    const activeBatches = await NodueBatch.find({ _id: { $in: batchIds }, status: 'active' })
      .session(session).select('_id classId').lean();
    const activeBatchMap = new Map(activeBatches.map(b => [b._id.toString(), b]));

    if (!activeBatches.length) {
      // No active batches — nothing to clean up in live data
      await commitSafeTransaction(session);
      return;
    }

    activeBatches.forEach(b => { if (b.classId) affectedClassIds.push(b.classId.toString()); });

    const activeRequestIds = allRequests
      .filter(r => activeBatchMap.has(r.batchId.toString()))
      .map(r => r._id);

    if (activeRequestIds.length > 0) {
      await NodueApproval.deleteMany({ requestId: { $in: activeRequestIds } }, { session });
      await NodueRequest.deleteMany({ _id: { $in: activeRequestIds } }, { session });
    }

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_STUDENT_DEACTIVATED', {
      studentId,
      removedRequests: activeRequestIds.length,
      preservedHistorical: allRequests.length - activeRequestIds.length,
    });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_student_deactivation_failed', { studentId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('student', 'all');
    [...new Set(affectedClassIds)].forEach(cid => invalidateEntityCache('class', cid));
  }
};

// ── bulkSyncMentorUpdate ──────────────────────────────────────────────────────
export const bulkSyncMentorUpdate = async (studentIds, mentorId, mentorName) => {
  let succeeded = false;
  const affectedClassIds = [];
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const requests = await NodueRequest.find({ studentId: { $in: studentIds } }).session(session);
    const batchIds = [...new Set(requests.map(r => r.batchId.toString()))];
    const activeBatches = await NodueBatch.find({ _id: { $in: batchIds }, status: 'active' })
      .session(session).select('_id classId');
    const activeBatchIds = activeBatches.map(b => b._id.toString());

    activeBatches.forEach(b => { if (b.classId) affectedClassIds.push(b.classId.toString()); });

    const filteredRequests = requests.filter(r => activeBatchIds.includes(r.batchId.toString()));

    for (const req of filteredRequests) {
      // 1. Update facultySnapshot (both 'mentor' and 'coCurricular_mentor')
      if (Array.isArray(req.facultySnapshot)) {
        // Standard Mentor Role
        const idx = req.facultySnapshot.findIndex(f => f.roleTag === 'mentor');
        if (idx !== -1) {
          req.facultySnapshot[idx] = { ...req.facultySnapshot[idx], facultyId: mentorId, facultyName: mentorName };
        } else {
          req.facultySnapshot.push({
            facultyId: mentorId, facultyName: mentorName, roleTag: 'mentor',
            approvalType: 'mentor', subjectName: 'Mentor',
          });
        }

        // Co-Curricular entries assigned to mentor
        req.facultySnapshot.forEach((f, idx) => {
          if (f.roleTag === 'coCurricular_mentor') {
            req.facultySnapshot[idx].facultyId = mentorId;
            req.facultySnapshot[idx].facultyName = mentorName;
          }
        });
      } else if (req.facultySnapshot) {
        // Object-style snapshot
        req.facultySnapshot['mentor'] = {
          facultyId: mentorId, facultyName: mentorName, roleTag: 'mentor',
          approvalType: 'mentor', subjectId: null, subjectName: 'Mentor',
        };
        
        Object.keys(req.facultySnapshot).forEach(key => {
          if (req.facultySnapshot[key].roleTag === 'coCurricular_mentor') {
            req.facultySnapshot[key].facultyId = mentorId;
            req.facultySnapshot[key].facultyName = mentorName;
          }
        });
        req.markModified('facultySnapshot');
      }

      // 2. Database updates for approvals
      await NodueApproval.findOneAndUpdate(
        { requestId: req._id, roleTag: 'mentor' },
        { 
          studentId: req.studentId,
          batchId: req.batchId,
          studentRollNo: req.studentSnapshot?.rollNo,
          studentName: req.studentSnapshot?.name,
          facultyId: mentorId, 
          facultyName: mentorName, 
          subjectName: 'Mentor',
          approvalType: 'mentor',
          action: 'pending', 
          actionedAt: null, 
          dueType: null, 
          remarks: null 
        },
        { upsert: true, session }
      );

      await NodueApproval.updateMany(
        { requestId: req._id, roleTag: 'coCurricular_mentor' },
        { facultyId: mentorId, facultyName: mentorName, action: 'pending', actionedAt: null },
        { session }
      );

      // 3. Save request ONCE
      await req.save(getSessionOptions(session));
    }

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('BULK_SYNC_MENTOR_UPDATED', { count: filteredRequests.length });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('bulk_sync_mentor_update_failed', { error: err.message });
  } finally {
    session.endSession();
  }

  // Cache invalidation outside try — guaranteed on success only
  if (succeeded) {
    const uniqueClassIds = [...new Set(affectedClassIds)];
    uniqueClassIds.forEach(cid => invalidateEntityCache('class', cid));
  }
};

// ── bulkSyncStudentDeactivation ───────────────────────────────────────────────
export const bulkSyncStudentDeactivation = async (studentIds) => {
  let succeeded = false;
  const affectedClassIds = [];
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const requests = await NodueRequest.find({ studentId: { $in: studentIds } })
      .populate('batchId').session(session);
    const requestIds = requests.map(r => r._id);

    requests.forEach(r => {
      const cid = r.batchId?.classId?.toString();
      if (cid) affectedClassIds.push(cid);
    });

    if (requestIds.length > 0) {
      await NodueApproval.deleteMany({ requestId: { $in: requestIds } }, { session });
      await NodueRequest.deleteMany({ _id: { $in: requestIds } }, { session });
    }

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('BULK_SYNC_STUDENT_DEACTIVATED', { count: requestIds.length });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('bulk_sync_student_deactivation_failed', { error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('student', 'all');
    const uniqueClassIds = [...new Set(affectedClassIds)];
    for (const cid of uniqueClassIds) {
      invalidateEntityCache('class', cid);
    }
  }
};

/**
 * Generates faculty snapshot and approval records for a single student.
 * Used during batch initiation, student creation, and class changes.
 */
export const generateStudentSnapshotData = (student, cls, {
  hodAccount,
  ctInfo,
  mentorMap, // Map<facultyId, name>
  coCurricularItems
}) => {
  const snapshot = {};

  // 1. HOD/AO
  if (hodAccount) {
    const isAO = hodAccount.roleTags?.includes('ao') && !hodAccount.roleTags?.includes('hod');
    snapshot['hod'] = {
      facultyId: hodAccount._id,
      facultyName: hodAccount.name,
      roleTag: isAO ? 'ao' : 'hod',
      approvalType: 'hodApproval',
      subjectId: null,
      subjectName: isAO ? 'Department Clearance (AO)' : 'Department Clearance (HoD)',
    };
  }

  // 2. Class Subjects
  for (const s of cls.subjectAssignments ?? []) {
    if (!s.facultyId || s.isElective) continue;
    snapshot[s.subjectId.toString()] = {
      facultyId: s.facultyId,
      facultyName: s.facultyName,
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      roleTag: 'faculty',
      approvalType: 'subject',
    };
  }

  // 3. Class Teacher
  if (cls.classTeacherId) {
    snapshot['classTeacher'] = {
      facultyId: cls.classTeacherId,
      facultyName: ctInfo?.name ?? null,
      roleTag: 'classTeacher',
      approvalType: 'classTeacher',
      subjectId: null,
      subjectName: 'Class Teacher',
    };
  }

  // 4. Mentor
  if (student.mentorId) {
    snapshot['mentor'] = {
      facultyId: student.mentorId,
      facultyName: mentorMap instanceof Map 
        ? mentorMap.get(student.mentorId.toString()) 
        : (mentorMap?.[student.mentorId.toString()] || null),
      roleTag: 'mentor',
      approvalType: 'mentor',
      subjectId: null,
      subjectName: 'Mentor',
    };
  }

  // 5. Electives
  for (const e of student.electiveSubjects ?? []) {
    if (!e.facultyId) continue;
    snapshot[e.subjectId.toString()] = {
      facultyId: e.facultyId,
      facultyName: e.facultyName,
      subjectId: e.subjectId,
      subjectName: e.subjectName,
      subjectCode: e.subjectCode,
      roleTag: 'faculty',
      approvalType: 'subject',
    };
  }

  // 6. Co-Curricular
  const activeStudentYear = student.yearOfStudy || (cls.semester > 2 ? Math.ceil(cls.semester / 2) : 1);
  const applicableItems = coCurricularItems?.filter(item => 
    item.applicableYears.includes(activeStudentYear)
  ) ?? [];

  for (const item of applicableItems) {
    const isMentorMode = item.requiresMentorApproval;
    const isCTMode = item.requiresClassTeacherApproval;
    
    let assignedFacultyId = null;
    let roleTag = 'coCurricular_coordinator';

    if (isMentorMode) {
      assignedFacultyId = student.mentorId;
      roleTag = 'coCurricular_mentor';
    } else if (isCTMode) {
      assignedFacultyId = cls.classTeacherId;
      roleTag = 'coCurricular_classTeacher';
    } else {
      assignedFacultyId = item.coordinatorId?._id || item.coordinatorId;
      roleTag = 'coCurricular_coordinator';
    }

    // Fallback: If mentor/CT mode but no faculty assigned, use coordinator
    if ((isMentorMode || isCTMode) && !assignedFacultyId && item.coordinatorId) {
        assignedFacultyId = item.coordinatorId?._id || item.coordinatorId;
        roleTag = 'coCurricular_coordinator';
    }

    if (!assignedFacultyId) continue;

    const facultyName = isMentorMode ? (mentorMap instanceof Map ? mentorMap.get(student.mentorId?.toString()) : (mentorMap?.[student.mentorId?.toString()] || null)) : 
                        (isCTMode ? (ctInfo?.name || null) : (item.coordinatorId?.name || null));

    snapshot[item._id.toString()] = {
      facultyId: assignedFacultyId,
      facultyName,
      subjectId: null,
      subjectName: item.name,
      subjectCode: item.code,
      roleTag,
      approvalType: 'coCurricular',
      itemTypeId: item._id,
      itemTypeName: item.name,
      itemCode: item.code,
      isOptional: item.isOptional || false
    };
  }

  return snapshot;
};

// ── syncClassChange ───────────────────────────────────────────────────────────
export const syncClassChange = async (studentId, oldClassId, newClassId) => {

  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    // 1. Deactivate old request and its approvals
    const oldRequest = await NodueRequest.findOne({ studentId }).sort({ createdAt: -1 }).session(session);
    if (oldRequest) {
      await NodueApproval.deleteMany({ requestId: oldRequest._id }, { session });
      await NodueRequest.deleteOne({ _id: oldRequest._id }, { session });
    }

    // 2. Check if new class has an active batch
    const activeBatch = await NodueBatch.findOne({ classId: newClassId, status: 'active' })
      .session(session).lean();
    if (!activeBatch) {
      await commitSafeTransaction(session);
      return;
    }

    // 3. Create new request for the new class batch
    const student = await Student.findOne({ _id: studentId, isActive: true }).session(session).lean();
    if (!student) {
      await commitSafeTransaction(session);
      return;
    }

    const cls = await Class.findById(newClassId)
      .session(session)
      .select('name departmentId semester academicYear classTeacherId subjectAssignments')
      .populate('departmentId', 'name')
      .lean();
    if (!cls) {
      await commitSafeTransaction(session);
      return;
    }

    const [hodAccount, ctInfo, mentor, coCurricularItems] = await Promise.all([
      Faculty.findOne({ 
        departmentId: cls.departmentId._id, 
        roleTags: { $in: ['hod', 'ao'] }, 
        isActive: true 
      })
        .session(session).select('name roleTags').lean(),
      cls.classTeacherId
        ? Faculty.findById(cls.classTeacherId).session(session).select('name').lean()
        : null,
      student.mentorId
        ? Faculty.findById(student.mentorId).session(session).select('name').lean()
        : null,
      CoCurricularType.find({
        departmentId: cls.departmentId._id,
        isActive: true
      }).populate('coordinatorId', 'name').session(session).lean()
    ]);

    const mentorMap = new Map();
    if (student.mentorId && mentor) {
      mentorMap.set(student.mentorId.toString(), mentor.name);
    }

    const snapshot = generateStudentSnapshotData(student, cls, {
      hodAccount,
      ctInfo,
      mentorMap,
      coCurricularItems
    });

    const requestId = new mongoose.Types.ObjectId();

    await NodueRequest.create([{
      _id: requestId,
      batchId: activeBatch._id,
      studentId,
      studentSnapshot: { 
        rollNo: student.rollNo, 
        name: student.name, 
        departmentName: cls.departmentId?.name 
      },
      facultySnapshot: snapshot,
      status: 'pending',
    }], { session });

    const approvals = Object.values(snapshot).map(f => ({
      requestId,
      batchId: activeBatch._id,
      studentId,
      studentRollNo: student.rollNo,
      studentName: student.name,
      facultyId: f.facultyId,
      subjectId: f.subjectId ?? null,
      subjectName: f.subjectName ?? null,
      itemTypeId: f.itemTypeId ?? null,
      itemTypeName: f.itemTypeName ?? null,
      itemCode: f.itemCode ?? null,
      isOptional: f.isOptional ?? false,
      approvalType: f.approvalType,
      roleTag: f.roleTag,
      action: f.approvalType === 'coCurricular' ? 'not_submitted' : 'pending',
    }));

    if (approvals.length > 0) {
      await NodueApproval.insertMany(approvals, { session });
    }

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_CLASS_CHANGE_COMPLETED', { studentId, oldClassId, newClassId, batchId: activeBatch._id });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_class_change_failed', { studentId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('student', 'all');
    invalidateEntityCache('class', oldClassId);
    invalidateEntityCache('class', newClassId);
  }
};

// ── syncSubjectAddition ───────────────────────────────────────────────────────
export const syncSubjectAddition = async (classId, subjectData) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const activeBatch = await NodueBatch.findOne({ classId, status: 'active' }).session(session).lean();
    if (!activeBatch) {
      await commitSafeTransaction(session);
      return;
    }

    const { subjectId, subjectName, subjectCode, facultyId, facultyName } = subjectData;

    // Add to facultySnapshot of all requests in this batch
    const requests = await NodueRequest.find({ batchId: activeBatch._id }).session(session);
    for (const req of requests) {
      if (Array.isArray(req.facultySnapshot)) {
        req.facultySnapshot.push({
          facultyId, facultyName, subjectId, subjectName, subjectCode,
          roleTag: 'faculty', approvalType: 'subject',
        });
      } else if (req.facultySnapshot && typeof req.facultySnapshot === 'object') {
        req.facultySnapshot[subjectId.toString()] = {
          facultyId, facultyName, subjectId, subjectName, subjectCode,
          roleTag: 'faculty', approvalType: 'subject',
        };
        req.markModified('facultySnapshot');
      }
      await req.save(getSessionOptions(session));
    }

    // Create approval records for all students in the batch
    const bulkApprovals = requests.map(req => ({
      requestId: req._id,
      batchId: activeBatch._id,
      studentId: req.studentId,
      studentRollNo: req.studentSnapshot?.rollNo,
      studentName: req.studentSnapshot?.name,
      facultyId, subjectId, subjectName,
      approvalType: 'subject',
      roleTag: 'faculty',
      action: 'pending',
    }));

    if (bulkApprovals.length > 0) {
      await NodueApproval.insertMany(bulkApprovals, { session });
    }

    await commitSafeTransaction(session);
    succeeded = true;

    logger.audit('SYNC_SUBJECT_ADDED', {
      batchId: activeBatch._id.toString(),
      subjectId: subjectId.toString(),
      approvalsCreated: bulkApprovals.length,
    });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_subject_addition_failed', { classId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('class', classId);
  }
};

// ── syncCoCurricularAddition ──────────────────────────────────────────────────
/**
 * Adds a new co-curricular item to all applicable students in active batches.
 */
export const syncCoCurricularAddition = async (typeId) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const type = await CoCurricularType.findById(typeId).session(session).lean();
    if (!type) {
      await commitSafeTransaction(session);
      return;
    }

    const activeBatches = await NodueBatch.find({ 
      departmentId: type.departmentId, 
      status: 'active' 
    }).session(session).lean();

    if (activeBatches.length === 0) {
      await commitSafeTransaction(session);
      return;
    }

    const batchIds = activeBatches.map(b => b._id);
    const requests = await NodueRequest.find({ batchId: { $in: batchIds } }).session(session);
    
    const studentIds = [...new Set(requests.map(r => r.studentId.toString()))];
    const students = await Student.find({ _id: { $in: studentIds } })
      .session(session).select('_id mentorId yearOfStudy name rollNo classId').lean();
    
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    
    const classes = await Class.find({ _id: { $in: activeBatches.map(b => b.classId) } })
      .session(session).select('_id classTeacherId').lean();
    const classMap = new Map(classes.map(c => [c._id.toString(), c]));

    // Fetch faculty names for mentors, class teachers, and coordinator
    const mentorIds = [...new Set(students.map(s => s.mentorId?.toString()).filter(Boolean))];
    const ctIds = [...new Set(classes.map(c => c.classTeacherId?.toString()).filter(Boolean))];
    const faculties = await Faculty.find({ 
      _id: { $in: [...mentorIds, ...ctIds, type.coordinatorId].filter(Boolean) } 
    }).session(session).select('name').lean();
    const facultyMap = new Map(faculties.map(f => [f._id.toString(), f.name]));

    const approvalOps = [];
    const requestUpdates = [];

    for (const req of requests) {
      const student = studentMap.get(req.studentId.toString());
      if (!student) continue;

      // Check applicability
      if (type.applicableYears?.length > 0 && !type.applicableYears.includes(student.yearOfStudy)) {
        continue;
      }

      // Check if already exists to prevent duplicates
      const exists = await NodueApproval.exists({ 
        requestId: req._id, 
        itemTypeId: type._id 
      }).session(session);
      if (exists) continue;

      const isMentorMode = type.requiresMentorApproval;
      const isCTMode = type.requiresClassTeacherApproval;
      
      let assignedFacultyId = null;
      let roleTag = 'coCurricular_coordinator';

      if (isMentorMode) {
        assignedFacultyId = student.mentorId;
        roleTag = 'coCurricular_mentor';
      } else if (isCTMode) {
        const cls = classMap.get(student.classId.toString());
        assignedFacultyId = cls?.classTeacherId;
        roleTag = 'coCurricular_classTeacher';
      } else {
        assignedFacultyId = type.coordinatorId;
        roleTag = 'coCurricular_coordinator';
      }
      
      // Fallback
      if ((isMentorMode || isCTMode) && !assignedFacultyId && type.coordinatorId) {
        assignedFacultyId = type.coordinatorId;
        roleTag = 'coCurricular_coordinator';
      }

      if (!assignedFacultyId) continue;

      const facultyName = facultyMap.get(assignedFacultyId.toString()) || 
                          (isMentorMode ? "Student's Mentor" : (isCTMode ? "Class Teacher" : null));

      // 1. Prepare Approval Record
      approvalOps.push({
        requestId: req._id,
        batchId: req.batchId,
        studentId: student._id,
        studentRollNo: student.rollNo,
        studentName: student.name,
        facultyId: assignedFacultyId,
        subjectName: type.name,
        approvalType: 'coCurricular',
        roleTag: roleTag,
        itemTypeId: type._id,
        itemTypeName: type.name,
        itemCode: type.code,
        isOptional: type.isOptional || false,
        action: 'pending'
      });

      // 2. Prepare Snapshot Update
      if (Array.isArray(req.facultySnapshot)) {
        req.facultySnapshot.push({
          facultyId: assignedFacultyId,
          facultyName,
          subjectId: null,
          subjectName: type.name,
          subjectCode: type.code,
          roleTag: roleTag,
          approvalType: 'coCurricular',
          itemTypeId: type._id,
          itemTypeName: type.name,
          itemCode: type.code,
          isOptional: type.isOptional || false
        });
      } else if (req.facultySnapshot) {
        req.facultySnapshot[type._id.toString()] = {
          facultyId: assignedFacultyId,
          facultyName,
          subjectId: null,
          subjectName: type.name,
          subjectCode: type.code,
          roleTag: roleTag,
          approvalType: 'coCurricular',
          itemTypeId: type._id,
          itemTypeName: type.name,
          itemCode: type.code,
          isOptional: type.isOptional || false
        };
        req.markModified('facultySnapshot');
      }
      requestUpdates.push(req.save(getSessionOptions(session)));
    }

    if (approvalOps.length > 0) {
      await NodueApproval.insertMany(approvalOps, { session });
      await Promise.all(requestUpdates);
    }

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_CO_CURRICULAR_ADDED', { typeId, count: approvalOps.length });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_co_curricular_addition_failed', { typeId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('student', 'all');
  }
};

// ── syncCoCurricularUpdate ────────────────────────────────────────────────────
/**
 * Synchronizes co-curricular item updates (name, coordinator, modes) with existing approvals.
 */
export const syncCoCurricularUpdate = async (typeId) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const type = await CoCurricularType.findById(typeId).session(session).lean();
    if (!type) {
      await commitSafeTransaction(session);
      return;
    }

    const activeBatches = await NodueBatch.find({ 
      departmentId: type.departmentId, 
      status: 'active' 
    }).session(session).lean();

    if (activeBatches.length === 0) {
      await commitSafeTransaction(session);
      return;
    }

    const batchIds = activeBatches.map(b => b._id);
    
    const existingApprovals = await NodueApproval.find({ 
      itemTypeId: typeId, 
      batchId: { $in: batchIds } 
    }).session(session);

    const existingStudentIds = existingApprovals.map(a => a.studentId.toString());
    const existingRequests = await NodueRequest.find({
      batchId: { $in: batchIds },
      studentId: { $in: existingStudentIds }
    }).session(session);
    const requestMap = new Map(existingRequests.map(r => [r.studentId.toString(), r]));

    // Fetch all students in these batches to handle additions
    const allRequests = await NodueRequest.find({ batchId: { $in: batchIds } }).session(session);
    const allStudentIds = [...new Set(allRequests.map(r => r.studentId.toString()))];
    const allStudents = await Student.find({ _id: { $in: allStudentIds } })
      .session(session).select('_id mentorId yearOfStudy name rollNo classId').lean();
    const studentMap = new Map(allStudents.map(s => [s._id.toString(), s]));

    const classes = await Class.find({ _id: { $in: activeBatches.map(b => b.classId) } })
      .session(session).select('_id classTeacherId').lean();
    const classMap = new Map(classes.map(c => [c._id.toString(), c]));

    // Fetch faculty names
    const mentorIds = [...new Set(allStudents.map(s => s.mentorId?.toString()).filter(Boolean))];
    const ctIds = [...new Set(classes.map(c => c.classTeacherId?.toString()).filter(Boolean))];
    const faculties = await Faculty.find({ 
      _id: { $in: [...mentorIds, ...ctIds, type.coordinatorId].filter(Boolean) } 
    }).session(session).select('name').lean();
    const facultyMap = new Map(faculties.map(f => [f._id.toString(), f.name]));

    const ops = [];

    // Process removals and updates
    const processedStudentIds = new Set();
    for (const app of existingApprovals) {
      const studentIdStr = app.studentId.toString();
      const student = studentMap.get(studentIdStr);
      const req = requestMap.get(studentIdStr);
      if (!student || !req) continue;

      // DEDUPLICATION: If we have multiple approvals for the same item/student, delete the extra ones
      if (processedStudentIds.has(studentIdStr)) {
        ops.push(NodueApproval.deleteOne({ _id: app._id }).session(session));
        continue;
      }
      processedStudentIds.add(studentIdStr);

      const isApplicable = type.applicableYears.includes(student.yearOfStudy);
      const isDeactivated = !type.isActive;

      if (!isApplicable || isDeactivated) {
        // REMOVE
        ops.push(NodueApproval.deleteOne({ _id: app._id }).session(session));
        if (Array.isArray(req.facultySnapshot)) {
          req.facultySnapshot = req.facultySnapshot.filter(f => f.itemTypeId?.toString() !== typeId.toString());
        } else if (req.facultySnapshot) {
          delete req.facultySnapshot[typeId.toString()];
          req.markModified('facultySnapshot');
        }
        ops.push(req.save(getSessionOptions(session)));
      } else {
        // UPDATE
        const isMentorMode = type.requiresMentorApproval;
        const isCTMode = type.requiresClassTeacherApproval;
        
        let assignedFacultyId = null;
        let roleTag = 'coCurricular_coordinator';

        if (isMentorMode) {
          assignedFacultyId = student.mentorId;
          roleTag = 'coCurricular_mentor';
        } else if (isCTMode) {
          const cls = classMap.get(student.classId.toString());
          assignedFacultyId = cls?.classTeacherId;
          roleTag = 'coCurricular_classTeacher';
        } else {
          assignedFacultyId = type.coordinatorId;
          roleTag = 'coCurricular_coordinator';
        }
        
        // Fallback
        if ((isMentorMode || isCTMode) && !assignedFacultyId && type.coordinatorId) {
          assignedFacultyId = type.coordinatorId;
          roleTag = 'coCurricular_coordinator';
        }

        if (!assignedFacultyId) continue;

        const facultyName = facultyMap.get(assignedFacultyId.toString()) || 
                            (isMentorMode ? "Student's Mentor" : (isCTMode ? "Class Teacher" : null));

        app.facultyId = assignedFacultyId;
        app.facultyName = facultyName;
        app.subjectName = type.name;
        app.itemTypeName = type.name;
        app.itemCode = type.code;
        app.isOptional = type.isOptional;
        app.roleTag = roleTag;
        app.approvalType = 'coCurricular';
        ops.push(app.save(getSessionOptions(session)));

        if (Array.isArray(req.facultySnapshot)) {
          const idx = req.facultySnapshot.findIndex(f => f.itemTypeId?.toString() === typeId.toString());
          const snapshotData = {
            facultyId: assignedFacultyId,
            facultyName,
            subjectId: null,
            subjectName: type.name,
            subjectCode: type.code,
            roleTag: roleTag,
            approvalType: 'coCurricular',
            itemTypeId: type._id,
            itemTypeName: type.name,
            itemCode: type.code,
            isOptional: type.isOptional || false
          };
          if (idx !== -1) req.facultySnapshot[idx] = snapshotData;
          else req.facultySnapshot.push(snapshotData);
        } else if (req.facultySnapshot) {
          req.facultySnapshot[typeId.toString()] = {
            facultyId: assignedFacultyId,
            facultyName,
            subjectId: null,
            subjectName: type.name,
            subjectCode: type.code,
            roleTag: roleTag,
            approvalType: 'coCurricular',
            itemTypeId: type._id,
            itemTypeName: type.name,
            itemCode: type.code,
            isOptional: type.isOptional || false
          };
          req.markModified('facultySnapshot');
        }
        ops.push(req.save(getSessionOptions(session)));
      }
    }

    // GROUP 2: ADDITIONS
    if (type.isActive) {
      const existingStudentSet = new Set(existingStudentIds);
      const studentsToReceive = allStudents.filter(s => 
        !existingStudentSet.has(s._id.toString()) && 
        type.applicableYears.includes(s.yearOfStudy)
      );

      for (const student of studentsToReceive) {
        const req = allRequests.find(r => r.studentId.toString() === student._id.toString());
        if (!req) continue;

        const isMentorMode = type.requiresMentorApproval;
        const isCTMode = type.requiresClassTeacherApproval;
        
        let assignedFacultyId = null;
        let roleTag = 'coCurricular_coordinator';

        if (isMentorMode) {
          assignedFacultyId = student.mentorId;
          roleTag = 'coCurricular_mentor';
        } else if (isCTMode) {
          const cls = classMap.get(student.classId.toString());
          assignedFacultyId = cls?.classTeacherId;
          roleTag = 'coCurricular_classTeacher';
        } else {
          assignedFacultyId = type.coordinatorId;
          roleTag = 'coCurricular_coordinator';
        }
        
        // Fallback
        if ((isMentorMode || isCTMode) && !assignedFacultyId && type.coordinatorId) {
          assignedFacultyId = type.coordinatorId;
          roleTag = 'coCurricular_coordinator';
        }

        if (!assignedFacultyId) continue;

        const facultyName = facultyMap.get(assignedFacultyId.toString()) || 
                            (isMentorMode ? "Student's Mentor" : (isCTMode ? "Class Teacher" : null));

        // Create Approval
        ops.push(NodueApproval.create([{
          requestId: req._id,
          batchId: req.batchId,
          studentId: student._id,
          studentRollNo: student.rollNo,
          studentName: student.name,
          facultyId: assignedFacultyId,
          subjectName: type.name,
          approvalType: 'coCurricular',
          roleTag: roleTag,
          itemTypeId: type._id,
          itemTypeName: type.name,
          itemCode: type.code,
          isOptional: type.isOptional || false,
          action: 'pending'
        }], { session }));

        // Update Snapshot
        if (Array.isArray(req.facultySnapshot)) {
          req.facultySnapshot.push({
            facultyId: assignedFacultyId,
            facultyName,
            subjectId: null,
            subjectName: type.name,
            subjectCode: type.code,
            roleTag: roleTag,
            approvalType: 'coCurricular',
            itemTypeId: type._id,
            itemTypeName: type.name,
            itemCode: type.code,
            isOptional: type.isOptional || false
          });
        } else if (req.facultySnapshot) {
          req.facultySnapshot[typeId.toString()] = {
            facultyId: assignedFacultyId,
            facultyName,
            subjectId: null,
            subjectName: type.name,
            subjectCode: type.code,
            roleTag: roleTag,
            approvalType: 'coCurricular',
            itemTypeId: type._id,
            itemTypeName: type.name,
            itemCode: type.code,
            isOptional: type.isOptional || false
          };
          req.markModified('facultySnapshot');
        }
        ops.push(req.save(getSessionOptions(session)));
      }
    }

      await Promise.all(ops);

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_CO_CURRICULAR_UPDATED', { typeId, count: existingApprovals.length });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_co_curricular_update_failed', { typeId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('student', 'all');
  }
};



export const syncCoCurricularRemoval = async (departmentId, typeId) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const activeBatches = await NodueBatch.find({ departmentId, status: 'active' }).session(session).lean();
    if (activeBatches.length === 0) {
      await commitSafeTransaction(session);
      return;
    }

    const batchIds = activeBatches.map(b => b._id);
    
    // 1. Remove from facultySnapshot
    const requests = await NodueRequest.find({ batchId: { $in: batchIds } }).session(session);
    const requestUpdates = [];
    for (const req of requests) {
      if (Array.isArray(req.facultySnapshot)) {
        req.facultySnapshot = req.facultySnapshot.filter(f => f.itemTypeId?.toString() !== typeId.toString());
      } else if (req.facultySnapshot) {
        delete req.facultySnapshot[typeId.toString()];
        req.markModified('facultySnapshot');
      }
      requestUpdates.push(req.save(getSessionOptions(session)));
    }

    // 2. Delete approvals
    await NodueApproval.deleteMany({ 
      batchId: { $in: batchIds }, 
      itemTypeId: typeId 
    }, { session });

    await Promise.all(requestUpdates);

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_CO_CURRICULAR_REMOVED', { typeId });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_co_curricular_removal_failed', { typeId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('student', 'all');
  }
};

/**
 * Updates all approval records and snapshots when a class teacher is changed for a class.
 */
export const bulkSyncClassTeacherUpdate = async (classId, classTeacherId, classTeacherName) => {
  let succeeded = false;
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);

    const activeBatch = await NodueBatch.findOne({ classId, status: 'active' }).session(session).lean();
    if (!activeBatch) {
      await commitSafeTransaction(session);
      return;
    }

    const requests = await NodueRequest.find({ batchId: activeBatch._id }).session(session);
    
    for (const req of requests) {
      let updated = false;
      
      if (Array.isArray(req.facultySnapshot)) {
        // 1. Update core classTeacher approval if it exists
        const idx = req.facultySnapshot.findIndex(f => f.roleTag === 'classTeacher');
        if (idx !== -1) {
          req.facultySnapshot[idx] = { ...req.facultySnapshot[idx], facultyId: classTeacherId, facultyName: classTeacherName };
          updated = true;
        }
        
        // 2. Update co-curricular items assigned to class teacher
        req.facultySnapshot.forEach((f, i) => {
          if (f.roleTag === 'coCurricular_classTeacher') {
            req.facultySnapshot[i].facultyId = classTeacherId;
            req.facultySnapshot[i].facultyName = classTeacherName;
            updated = true;
          }
        });
      } else if (req.facultySnapshot) {
        // Handle object-based snapshot
        if (req.facultySnapshot['classTeacher']) {
          req.facultySnapshot['classTeacher'] = {
            ...req.facultySnapshot['classTeacher'],
            facultyId: classTeacherId,
            facultyName: classTeacherName
          };
          updated = true;
        }
        
        Object.keys(req.facultySnapshot).forEach(key => {
          if (req.facultySnapshot[key].roleTag === 'coCurricular_classTeacher') {
            req.facultySnapshot[key].facultyId = classTeacherId;
            req.facultySnapshot[key].facultyName = classTeacherName;
            updated = true;
          }
        });
        if (updated) req.markModified('facultySnapshot');
      }
      
      if (updated) await req.save(getSessionOptions(session));
    }

    // Update core classTeacher approval records
    await NodueApproval.updateMany(
      { batchId: activeBatch._id, roleTag: 'classTeacher' },
      { facultyId: classTeacherId, facultyName: classTeacherName, action: 'pending', actionedAt: null },
      { session }
    );

    // Update co-curricular approval records assigned to class teacher
    await NodueApproval.updateMany(
      { batchId: activeBatch._id, roleTag: 'coCurricular_classTeacher' },
      { facultyId: classTeacherId, facultyName: classTeacherName, action: 'pending', actionedAt: null },
      { session }
    );

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('BULK_SYNC_CLASS_TEACHER_UPDATED', { classId, classTeacherId });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('bulk_sync_class_teacher_update_failed', { classId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('class', classId);
  }
};

/**
 * Comprehensive repair and sync for all active batches.
 * Ensures every student in an active class has a NodueRequest and all required NodueApproval records.
 */
export const syncAllActiveBatches = async () => {
  try {
    const activeBatches = await NodueBatch.find({ status: 'active' });
    logger.info('sync_all_active_batches_started', { count: activeBatches.length });

    for (const batch of activeBatches) {
      const cls = await Class.findById(batch.classId).lean();
      if (!cls) continue;

      const students = await Student.find({ classId: batch.classId, isActive: true }).lean();
      
      const [hodAccount, ctInfo, coCurricularItems, mentors] = await Promise.all([
        Faculty.findOne({ departmentId: cls.departmentId, roleTags: 'hod' }).lean(),
        cls.classTeacherId ? Faculty.findById(cls.classTeacherId).select('name').lean() : null,
        CoCurricularType.find({ departmentId: cls.departmentId, isActive: true }).populate('coordinatorId', 'name').lean(),
        Faculty.find({ _id: { $in: students.map(s => s.mentorId).filter(Boolean) } }).select('name').lean()
      ]);

      const mentorMap = new Map(mentors.map(m => [m._id.toString(), m.name]));

      for (const student of students) {
        try {
          let request = await NodueRequest.findOne({ batchId: batch._id, studentId: student._id });
          
          const freshSnapshot = generateStudentSnapshotData(student, cls, {
            hodAccount,
            ctInfo,
            mentorMap,
            coCurricularItems
          });

          if (!request) {
            request = await NodueRequest.create({
              batchId: batch._id,
              studentId: student._id,
              studentSnapshot: {
                rollNo: student.rollNo,
                name: student.name,
                departmentName: cls.departmentId?.name ?? null,
              },
              facultySnapshot: freshSnapshot,
              status: 'pending'
            });
          } else {
            request.facultySnapshot = freshSnapshot;
            request.markModified('facultySnapshot');
            await request.save();
          }

          // Ensure all approval records from snapshot exist
          for (const f of Object.values(freshSnapshot)) {
            const query = {
              requestId: request._id,
              roleTag: f.roleTag,
              itemTypeId: f.itemTypeId ?? null,
              subjectId: f.subjectId ?? null
            };

            const existing = await NodueApproval.findOne(query);

            if (!existing) {
              await NodueApproval.create({
                requestId: request._id,
                batchId: batch._id,
                studentId: student._id,
                studentRollNo: student.rollNo,
                studentName: student.name,
                facultyId: f.facultyId,
                subjectId: f.subjectId ?? null,
                subjectName: f.subjectName ?? null,
                itemTypeId: f.itemTypeId ?? null,
                itemTypeName: f.itemTypeName ?? null,
                itemCode: f.itemCode ?? null,
                isOptional: f.isOptional ?? false,
                approvalType: f.approvalType,
                roleTag: f.roleTag,
                action: f.approvalType === 'coCurricular' ? 'not_submitted' : 'pending'
              });
            }
          }
          
          await recalcRequestStatus(request._id);
          
          // Invalidate student status cache to ensure immediate visibility
          invalidateEntityCache('student', student._id);
          
          // Throttling to avoid overwhelming M0 cluster/connection pool
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (err) {
          logger.error('sync_individual_student_failed', { 
            studentId: student._id, 
            rollNo: student.rollNo,
            error: err.message 
          });
        }
      }
    }

    logger.audit('SYNC_ALL_ACTIVE_BATCHES_COMPLETE', { timestamp: new Date() });
    invalidateEntityCache('student', 'all');
    invalidateEntityCache('batch', 'all');
  } catch (err) {
    logger.error('sync_all_active_batches_failed', { error: err.message });
  }
};
