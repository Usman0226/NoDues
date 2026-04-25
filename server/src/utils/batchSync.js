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
} from './safeTransaction.js';

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
      await req.save({ session });
    }

    const deleteResult = await NodueApproval.deleteMany(
      { batchId: activeBatch._id, subjectId, approvalType: 'subject' },
      { session }
    );

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
      if (updated) await req.save({ session });
    }

    await NodueApproval.updateMany(
      { batchId: activeBatch._id, subjectId, approvalType: 'subject' },
      { facultyId, facultyName, action: 'pending', actionedAt: null, dueType: null, remarks: null },
      { session }
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

    // Update facultySnapshot
    if (Array.isArray(request.facultySnapshot)) {
      const idx = request.facultySnapshot.findIndex(f => f.roleTag === 'mentor');
      if (idx !== -1) {
        request.facultySnapshot[idx] = { ...request.facultySnapshot[idx], facultyId: mentorId, facultyName: mentorName };
      } else {
        request.facultySnapshot.push({
          facultyId: mentorId, facultyName: mentorName, roleTag: 'mentor',
          approvalType: 'mentor', subjectName: 'Mentor',
        });
      }
    } else if (request.facultySnapshot) {
      request.facultySnapshot['mentor'] = {
        facultyId: mentorId, facultyName: mentorName, roleTag: 'mentor',
        approvalType: 'mentor', subjectId: null, subjectName: 'Mentor',
      };
      request.markModified('facultySnapshot');
    }
    await request.save({ session });

    await NodueApproval.findOneAndUpdate(
      { requestId: request._id, roleTag: 'mentor' },
      { facultyId: mentorId, facultyName: mentorName, action: 'pending', actionedAt: null, dueType: null, remarks: null },
      { upsert: true, session }
    );

    await NodueApproval.updateMany(
      { requestId: request._id, roleTag: 'coCurricular_mentor' },
      { facultyId: mentorId, facultyName: mentorName, action: 'pending', actionedAt: null },
      { session }
    );

    if (Array.isArray(request.facultySnapshot)) {
      request.facultySnapshot.forEach((f, idx) => {
        if (f.roleTag === 'coCurricular_mentor') {
          request.facultySnapshot[idx].facultyId = mentorId;
          request.facultySnapshot[idx].facultyName = mentorName;
        }
      });
    } else if (request.facultySnapshot) {
      Object.keys(request.facultySnapshot).forEach(key => {
        if (request.facultySnapshot[key].roleTag === 'coCurricular_mentor') {
          request.facultySnapshot[key].facultyId = mentorId;
          request.facultySnapshot[key].facultyName = mentorName;
        }
      });
      request.markModified('facultySnapshot');
    }
    await request.save({ session });

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
    await request.save({ session });

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
    }], { session });

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
    await request.save({ session });

    await NodueApproval.deleteOne(
      { requestId: request._id, subjectId, approvalType: 'subject' },
      { session }
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

// ── syncStudentDeactivation ───────────────────────────────────────────────────
export const syncStudentDeactivation = async (studentId) => {
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

    // Delete all approval records for this student in this batch
    await NodueApproval.deleteMany({ requestId: request._id }, { session });

    // Delete the request itself
    await NodueRequest.deleteOne({ _id: request._id }, { session });

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_STUDENT_DEACTIVATED', { studentId, batchId: activeBatch._id });
  } catch (err) {
    await abortSafeTransaction(session);
    logger.error('sync_student_deactivation_failed', { studentId, error: err.message });
  } finally {
    session.endSession();
  }

  if (succeeded) {
    invalidateEntityCache('student', 'all');
    if (activeBatchClassId) invalidateEntityCache('class', activeBatchClassId);
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
      if (Array.isArray(req.facultySnapshot)) {
        const idx = req.facultySnapshot.findIndex(f => f.roleTag === 'mentor');
        if (idx !== -1) {
          req.facultySnapshot[idx] = { ...req.facultySnapshot[idx], facultyId: mentorId, facultyName: mentorName };
        } else {
          req.facultySnapshot.push({
            facultyId: mentorId, facultyName: mentorName, roleTag: 'mentor',
            approvalType: 'mentor', subjectName: 'Mentor',
          });
        }
      } else if (req.facultySnapshot) {
        req.facultySnapshot['mentor'] = {
          facultyId: mentorId, facultyName: mentorName, roleTag: 'mentor',
          approvalType: 'mentor', subjectId: null, subjectName: 'Mentor',
        };
        req.markModified('facultySnapshot');
      }
      await req.save({ session });

      await NodueApproval.findOneAndUpdate(
        { requestId: req._id, roleTag: 'mentor' },
        { facultyId: mentorId, facultyName: mentorName, action: 'pending', actionedAt: null, dueType: null, remarks: null },
        { upsert: true, session }
      );

      // Update co-curricular items assigned to mentor
      await NodueApproval.updateMany(
        { requestId: req._id, roleTag: 'coCurricular_mentor' },
        { facultyId: mentorId, facultyName: mentorName, action: 'pending', actionedAt: null },
        { session }
      );

      // Snapshot updates for co-curricular
      if (Array.isArray(req.facultySnapshot)) {
        req.facultySnapshot.forEach((f, idx) => {
          if (f.roleTag === 'coCurricular_mentor') {
            req.facultySnapshot[idx].facultyId = mentorId;
            req.facultySnapshot[idx].facultyName = mentorName;
          }
        });
      } else if (req.facultySnapshot) {
        Object.keys(req.facultySnapshot).forEach(key => {
          if (req.facultySnapshot[key].roleTag === 'coCurricular_mentor') {
            req.facultySnapshot[key].facultyId = mentorId;
            req.facultySnapshot[key].facultyName = mentorName;
          }
        });
        req.markModified('facultySnapshot');
      }
      await req.save({ session });
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

    const [hodAccount, ctInfo, mentor] = await Promise.all([
      Faculty.findOne({ departmentId: cls.departmentId._id, roleTags: 'hod', isActive: true })
        .session(session).select('name').lean(),
      cls.classTeacherId
        ? Faculty.findById(cls.classTeacherId).session(session).select('name').lean()
        : null,
      student.mentorId
        ? Faculty.findById(student.mentorId).session(session).select('name').lean()
        : null,
    ]);

    const requestId = new mongoose.Types.ObjectId();
    const snapshot = {};

    if (hodAccount) {
      snapshot['hod'] = {
        facultyId: hodAccount._id, facultyName: hodAccount.name,
        roleTag: 'hod', approvalType: 'hodApproval',
        subjectId: null, subjectName: 'Department Clearance (HoD)',
      };
    }

    for (const s of cls.subjectAssignments ?? []) {
      if (!s.facultyId || s.isElective) continue;
      snapshot[s.subjectId.toString()] = {
        facultyId: s.facultyId, facultyName: s.facultyName,
        subjectId: s.subjectId, subjectName: s.subjectName, subjectCode: s.subjectCode,
        roleTag: 'faculty', approvalType: 'subject',
      };
    }

    if (cls.classTeacherId) {
      snapshot['classTeacher'] = {
        facultyId: cls.classTeacherId, facultyName: ctInfo?.name ?? null,
        roleTag: 'classTeacher', approvalType: 'classTeacher',
        subjectName: 'Class Teacher',
      };
    }

    if (student.mentorId) {
      snapshot['mentor'] = {
        facultyId: student.mentorId, facultyName: mentor?.name ?? null,
        roleTag: 'mentor', approvalType: 'mentor', subjectName: 'Mentor',
      };
    }

    for (const e of student.electiveSubjects ?? []) {
      if (!e.facultyId) continue;
      snapshot[e.subjectId.toString()] = {
        facultyId: e.facultyId, facultyName: e.facultyName,
        subjectId: e.subjectId, subjectName: e.subjectName, subjectCode: e.subjectCode,
        roleTag: 'faculty', approvalType: 'subject',
      };
    }

    await NodueRequest.create([{
      _id: requestId,
      batchId: activeBatch._id,
      studentId,
      studentSnapshot: { rollNo: student.rollNo, name: student.name, departmentName: cls.departmentId?.name },
      facultySnapshot: snapshot,
      status: 'pending',
    }], { session });

    const approvalOps = Object.values(snapshot).map(f => ({
      requestId,
      batchId: activeBatch._id,
      studentId,
      studentRollNo: student.rollNo,
      studentName: student.name,
      facultyId: f.facultyId,
      subjectId: f.subjectId ?? null,
      subjectName: f.subjectName ?? null,
      approvalType: f.approvalType,
      roleTag: f.roleTag,
      action: 'pending',
    }));

    // ── CO-CURRICULAR SYNC ──────────────────────────────────────────────────
    // Fetch co-curricular items for this student's year and department
    const ccTypes = await CoCurricularType.find({
      departmentId: cls.departmentId._id,
      applicableYears: student.yearOfStudy,
      isActive: true, // Only active items
    }).session(session).lean();

    for (const type of ccTypes) {
      const isMentorMode = type.requiresMentorApproval;
      let assignedFacultyId = isMentorMode ? student.mentorId : type.coordinatorId;
      
      // Fallback: If mentor mode but no mentor, use coordinator if available
      if (isMentorMode && !assignedFacultyId && type.coordinatorId) {
        assignedFacultyId = type.coordinatorId;
      }

      if (!assignedFacultyId) continue;

      let facultyName = null;
      if (isMentorMode && assignedFacultyId.toString() === student.mentorId?.toString()) {
        facultyName = mentor?.name || "Student's Mentor";
      } else if (type.coordinatorId) {
        // We might need to fetch the coordinator name if not already in memory
        const coord = await Faculty.findById(type.coordinatorId).session(session).select('name').lean();
        facultyName = coord?.name;
      }

      // Add to snapshot
      snapshot[type._id.toString()] = {
        facultyId: assignedFacultyId,
        facultyName: isMentorMode ? (mentor?.name || "Student's Mentor") : (facultyName || null),
        subjectId: null,
        subjectName: type.name,
        subjectCode: type.code,
        roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
        approvalType: isMentorMode ? 'mentor' : 'coCurricular',
        itemTypeId: type._id,
        itemTypeName: type.name,
        itemCode: type.code,
        isOptional: type.isOptional || false
      };

      approvalOps.push({
        requestId,
        batchId: activeBatch._id,
        studentId,
        studentRollNo: student.rollNo,
        studentName: student.name,
        facultyId: assignedFacultyId,
        subjectId: null,
        subjectName: type.name,
        approvalType: isMentorMode ? 'mentor' : 'coCurricular',
        roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
        itemTypeId: type._id,
        itemTypeName: type.name,
        itemCode: type.code,
        isOptional: type.isOptional || false,
        action: 'pending',
      });
    }

    if (approvalOps.length > 0) {
      await NodueApproval.insertMany(approvalOps, { session });
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
      await req.save({ session });
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
      .session(session).select('_id mentorId yearOfStudy name rollNo').lean();
    
    const studentMap = new Map(students.map(s => [s._id.toString(), s]));
    
    // Fetch faculty names for mentors and coordinator
    const mentorIds = [...new Set(students.map(s => s.mentorId?.toString()).filter(Boolean))];
    const faculties = await Faculty.find({ 
      _id: { $in: [...mentorIds, type.coordinatorId].filter(Boolean) } 
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
      let assignedFacultyId = isMentorMode ? student.mentorId : type.coordinatorId;
      
      if (isMentorMode && !assignedFacultyId && type.coordinatorId) {
        assignedFacultyId = type.coordinatorId;
      }

      if (!assignedFacultyId) continue;

      const facultyName = facultyMap.get(assignedFacultyId.toString()) || (isMentorMode ? "Student's Mentor" : null);

      // 1. Prepare Approval Record
      approvalOps.push({
        requestId: req._id,
        batchId: req.batchId,
        studentId: student._id,
        studentRollNo: student.rollNo,
        studentName: student.name,
        facultyId: assignedFacultyId,
        subjectName: type.name,
        approvalType: isMentorMode ? 'mentor' : 'coCurricular',
        roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
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
          roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
          approvalType: isMentorMode ? 'mentor' : 'coCurricular',
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
          roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
          approvalType: isMentorMode ? 'mentor' : 'coCurricular',
          itemTypeId: type._id,
          itemTypeName: type.name,
          itemCode: type.code,
          isOptional: type.isOptional || false
        };
        req.markModified('facultySnapshot');
      }
      requestUpdates.push(req.save({ session }));
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
 * Syncs template changes (name, faculty, mode) to all active batches.
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
      .session(session).select('_id mentorId yearOfStudy name rollNo').lean();
    const studentMap = new Map(allStudents.map(s => [s._id.toString(), s]));

    // Fetch faculty names
    const mentorIds = [...new Set(allStudents.map(s => s.mentorId?.toString()).filter(Boolean))];
    const faculties = await Faculty.find({ 
      _id: { $in: [...mentorIds, type.coordinatorId].filter(Boolean) } 
    }).session(session).select('name').lean();
    const facultyMap = new Map(faculties.map(f => [f._id.toString(), f.name]));

    const ops = [];

    // Process removals and updates
    for (const app of existingApprovals) {
      const student = studentMap.get(app.studentId.toString());
      const req = requestMap.get(app.studentId.toString());
      if (!student || !req) continue;

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
        ops.push(req.save({ session }));
      } else {
        // UPDATE
        const isMentorMode = type.requiresMentorApproval;
        let assignedFacultyId = isMentorMode ? student.mentorId : type.coordinatorId;
        if (isMentorMode && !assignedFacultyId && type.coordinatorId) {
          assignedFacultyId = type.coordinatorId;
        }
        if (!assignedFacultyId) continue;

        const facultyName = facultyMap.get(assignedFacultyId.toString()) || (isMentorMode ? "Student's Mentor" : null);

        app.facultyId = assignedFacultyId;
        app.subjectName = type.name;
        app.itemTypeName = type.name;
        app.itemCode = type.code;
        app.isOptional = type.isOptional;
        app.roleTag = isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator';
        app.approvalType = 'coCurricular';
        ops.push(app.save({ session }));

        if (Array.isArray(req.facultySnapshot)) {
          const idx = req.facultySnapshot.findIndex(f => f.itemTypeId?.toString() === typeId.toString());
          const snapshotData = {
            facultyId: assignedFacultyId,
            facultyName,
            subjectId: null,
            subjectName: type.name,
            subjectCode: type.code,
            roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
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
            roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
            approvalType: 'coCurricular',
            itemTypeId: type._id,
            itemTypeName: type.name,
            itemCode: type.code,
            isOptional: type.isOptional || false
          };
          req.markModified('facultySnapshot');
        }
        ops.push(req.save({ session }));
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
        let assignedFacultyId = isMentorMode ? student.mentorId : type.coordinatorId;
        if (isMentorMode && !assignedFacultyId && type.coordinatorId) {
          assignedFacultyId = type.coordinatorId;
        }
        if (!assignedFacultyId) continue;

        const facultyName = facultyMap.get(assignedFacultyId.toString()) || (isMentorMode ? "Student's Mentor" : null);

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
          roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
          itemTypeId: type._id,
          itemTypeName: type.name,
          itemCode: type.code,
          isOptional: type.isOptional || false,
          action: 'not_submitted'
        }], { session }));

        // Update Snapshot
        if (Array.isArray(req.facultySnapshot)) {
          req.facultySnapshot.push({
            facultyId: assignedFacultyId,
            facultyName,
            subjectId: null,
            subjectName: type.name,
            subjectCode: type.code,
            roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
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
            roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
            approvalType: 'coCurricular',
            itemTypeId: type._id,
            itemTypeName: type.name,
            itemCode: type.code,
            isOptional: type.isOptional || false
          };
          req.markModified('facultySnapshot');
        }
        ops.push(req.save({ session }));
      }
    }

    await Promise.all(ops);

    await commitSafeTransaction(session);
    succeeded = true;
    logger.audit('SYNC_CO_CURRICULAR_UPDATED', { typeId, count: approvals.length });
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
      requestUpdates.push(req.save({ session }));
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
