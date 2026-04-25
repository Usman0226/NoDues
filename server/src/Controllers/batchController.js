import mongoose from 'mongoose';
import NodueBatch from '../models/NodueBatch.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueApproval from '../models/NodueApproval.js';
import Class from '../models/Class.js';
import Student from '../models/Student.js';
import Faculty from '../models/Faculty.js';
import ErrorResponse from '../utils/errorResponse.js';
import cache from '../config/cache.js';
import { withCache, invalidateKeys } from '../utils/withCache.js';
import logger from '../utils/logger.js';
import { pushEvent } from './sseController.js';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import Task from '../models/Task.js';
import CoCurricularType from '../models/CoCurricularType.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } from '../utils/safeTransaction.js';
import { createNotification } from './notification.controller.js';

// ── GET /api/batch ────────────────────────────────────────────────────────────
export const getBatches = async (req, res, next) => {
  try {
    const { classId, departmentId, semester, academicYear, status, search, page = 1, limit = 20 } = req.query;

    const query = {};
    if (req.user.role === 'hod') query.departmentId = req.user.departmentId;
    else if (departmentId)       query.departmentId = departmentId;

    if (classId)      query.classId      = classId;
    if (semester)     query.semester     = Number(semester);
    if (academicYear) query.academicYear = academicYear;
    if (status)       query.status       = status;

    if (search) {
      query.className = { $regex: search, $options: 'i' };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [batches, total] = await Promise.all([
      NodueBatch.find(query)
        .select('_id classId className departmentId semester academicYear status totalStudents initiatedAt deadline initiatedBy')
        .populate('departmentId', 'name')
        .populate('initiatedBy', 'name')
        .sort({ initiatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NodueBatch.countDocuments(query),
    ]);

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data: batches,
      pagination: {
        page: Number(page), limit: Number(limit), total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};


const _executeInitiation = async (cls, deadline, initiator, session) => {
  const classId = cls._id;

  // 1. Fetch active students 
  const students = await Student.find({ classId, isActive: true })
    .select('_id rollNo name mentorId electiveSubjects')
    .session(session)
    .lean();
  
  if (!students.length) {
    throw new Error(`No active students found in class ${cls.name}`);
  }

  // 2. Build Batch Record
  const [batch] = await NodueBatch.create([{
    classId,
    className:       cls.name,
    departmentId:    cls.departmentId._id || cls.departmentId,
    semester:        cls.semester,
    academicYear:    cls.academicYear,
    initiatedBy:     initiator.userId,
    initiatedByRole: initiator.role,
    deadline:        deadline ? new Date(deadline) : null,
    status:          'active',
    totalStudents:   students.length,
  }], { session });

  // 3. Fetch necessary faculty info
  const [hodAccount, ctInfo] = await Promise.all([
    Faculty.findOne({ 
      departmentId: cls.departmentId._id || cls.departmentId, 
      roleTags: 'hod', 
      isActive: true 
    }).select('name').session(session).lean(),
    cls.classTeacherId ? Faculty.findById(cls.classTeacherId).select('name').session(session).lean() : null
  ]);

  const allMentorIds = [...new Set(students.map(s => s.mentorId).filter(Boolean))];
  const mentors = await Faculty.find({ _id: { $in: allMentorIds } })
    .select('name')
    .session(session)
    .lean();
  const mentorMap = new Map(mentors.map(m => [m._id.toString(), m.name]));

  // 3b. Fetch Co-Curricular items for this department
  const coCurricularItems = await CoCurricularType.find({
    departmentId: cls.departmentId._id || cls.departmentId,
    isActive: true
  }).populate('coordinatorId', 'name').session(session).lean();

  // 4. Operation Builder
  const requestOps  = [];
  const approvalOps = [];
  const now         = new Date();
  const departmentName = cls.departmentId?.name ?? null;

  for (const student of students) {
    const requestId = new mongoose.Types.ObjectId();
    
    // Build Faculty Snapshot for this student
    const snapshot = {};
    if (hodAccount) {
      snapshot['hod'] = {
        facultyId:    hodAccount._id,
        facultyName:  hodAccount.name,
        roleTag:      'hod',
        approvalType: 'hodApproval',
        subjectId:    null,
        subjectName:  'Department Clearance (HoD)',
      };
    }

    // Regular subjects
    for (const s of cls.subjectAssignments ?? []) {
      if (!s.facultyId || s.isElective) continue;
      snapshot[s.subjectId.toString()] = {
        facultyId:    s.facultyId,
        facultyName:  s.facultyName,
        subjectId:    s.subjectId,
        subjectName:  s.subjectName,
        subjectCode:  s.subjectCode,
        roleTag:      'faculty',
        approvalType: 'subject',
      };
    }

    // Class teacher
    if (cls.classTeacherId) {
      snapshot['classTeacher'] = {
        facultyId:    cls.classTeacherId,
        facultyName:  ctInfo?.name ?? null,
        subjectId:    null,
        subjectName:  'Class Teacher',
        subjectCode:  null,
        roleTag:      'classTeacher',
        approvalType: 'classTeacher',
      };
    }

    // Mentor
    if (student.mentorId) {
      const mentorName = mentorMap.get(student.mentorId.toString());
      snapshot['mentor'] = {
        facultyId:    student.mentorId,
        facultyName:  mentorName ?? null,
        subjectId:    null,
        subjectName:  'Mentor',
        subjectCode:  null,
        roleTag:      'mentor',
        approvalType: 'mentor',
      };
    }

    // Elective subjects (student-specific)
    for (const e of student.electiveSubjects ?? []) {
      if (!e.facultyId) continue;
      snapshot[e.subjectId.toString()] = {
        facultyId:    e.facultyId,
        facultyName:  e.facultyName,
        subjectId:    e.subjectId,
        subjectName:  e.subjectName,
        subjectCode:  e.subjectCode,
        roleTag:      'faculty',
        approvalType: 'subject',
      };
    }

    // Co-Curricular items (based on student year)
    const activeStudentYear = student.yearOfStudy || (cls.semester > 2 ? Math.ceil(cls.semester / 2) : 1); // Fallback if not set
    const studentYear = student.yearOfStudy || activeStudentYear;

    const applicableItems = coCurricularItems.filter(item => 
      item.applicableYears.includes(studentYear)
    );

    for (const item of applicableItems) {
      const isMentorMode = item.requiresMentorApproval;
      let assignedFacultyId = isMentorMode ? student.mentorId : item.coordinatorId?._id || item.coordinatorId;
      
      // Fallback: If mentor mode but no mentor assigned, fallback to coordinator if available
      if (isMentorMode && !assignedFacultyId && item.coordinatorId) {
          assignedFacultyId = item.coordinatorId?._id || item.coordinatorId;
      }

      const facultyName = isMentorMode ? (mentorMap.get(student.mentorId?.toString()) || 'Student\'s Mentor') : (item.coordinatorId?.name || null);

      snapshot[item._id.toString()] = {
        facultyId:    assignedFacultyId,
        facultyName:  facultyName,
        subjectId:    null,
        subjectName:  item.name,
        subjectCode:  item.code,
        roleTag:      isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
        approvalType: 'coCurricular',
        itemTypeId:   item._id,
        itemTypeName: item.name,
        itemCode:     item.code,
        isOptional:   item.isOptional || false
      };
    }

    requestOps.push({
      insertOne: {
        document: {
          _id:     requestId,
          batchId: batch._id,
          studentId: student._id,
          studentSnapshot: {
            rollNo: student.rollNo,
            name:   student.name,
            departmentName,
          },
          facultySnapshot: snapshot,
          status:     'pending',
          createdAt:  now,
          updatedAt:  now,
        },
      },
    });

    for (const f of Object.values(snapshot)) {
      // Every co-curricular approval MUST have a facultyId (schema requirement).
      // If still missing (no mentor AND no coordinator), we skip but log it.
      if (!f.facultyId) {
        console.error('CRITICAL: Missing faculty for co-curricular approval', f.itemTypeName);
        continue;
      }
      approvalOps.push({
        insertOne: {
          document: {
            requestId,
            batchId:      batch._id,
            studentId:    student._id,
            studentRollNo: student.rollNo,
            studentName:  student.name,
            facultyId:    f.facultyId,
            subjectId:    f.subjectId    ?? null,
            subjectName:  f.subjectName  ?? null,
            itemTypeId:   f.itemTypeId   ?? null,
            itemTypeName: f.itemTypeName ?? null,
            itemCode:     f.itemCode     ?? null,
            isOptional:   f.isOptional   ?? false,
            approvalType: 'coCurricular',
            roleTag:      f.roleTag,
            action:       'not_submitted',
            createdAt:    now,
          },
        },
      });
    }
  }

  // 5. Execute Bulk Writes
  const [requestResult, approvalResult] = await Promise.all([
    NodueRequest.bulkWrite(requestOps,  { ordered: false, session }),
    NodueApproval.bulkWrite(approvalOps, { ordered: false, session }),
  ]);

  // 6. Cache & Logs
  cache.set(`batch_summary:${batch._id}`, {
    cleared: 0, pending: students.length, hasDues: 0, hodOverride: 0,
  }, 30);
  // Invalidating all student statuses for this class is more reliable for bulk writes
  invalidateEntityCache('student', 'all');

  logger.audit('BATCH_INITIATED', {
    actor: initiator.userId,
    resource_id: batch._id.toString(),
    classId,
    requestsCreated: requestResult.insertedCount,
  });

  // Create notification for HoD if initiated by Admin
  if (initiator.role === 'admin') {
    const hod = await Faculty.findOne({ 
      departmentId: cls.departmentId._id || cls.departmentId, 
      roleTags: 'hod', 
      isActive: true 
    }).select('_id').lean();
    
    if (hod) {
      await createNotification({
        user: hod._id,
        userModel: 'Faculty',
        title: 'New Batch Initiated',
        message: `A new NoDues batch has been initiated for ${cls.name} by the Admin.`,
        type: 'info',
        link: `/hod/batch/${batch._id}`
      });
    }
  }

  // SSE Notification
  const studentIdList = students.map((s) => s._id.toString());
  pushEvent(studentIdList, 'BATCH_INITIATED', {
    batchId:      batch._id,
    className:    cls.name,
    semester:     cls.semester,
    academicYear: cls.academicYear,
  });

  return {
    batchId: batch._id,
    className: cls.name,
    totalStudents: students.length,
    requestsCreated: requestResult.insertedCount
  };
};

// ── GET /api/batch/initiate-preview ──────────────────────────────────────────
export const getInitiationPreview = async (req, res, next) => {
  try {
    const departmentId = req.user.departmentId;
    if (!departmentId) return next(new ErrorResponse('Department context missing from session', 400));

    // 1. Fetch all active classes
    const classes = await Class.find({ departmentId, isActive: true })
      .select('name semester academicYear classTeacherId subjectAssignments')
      .lean();

    // 2. Fetch active batches to identify currently running sessions
    const activeBatches = await NodueBatch.find({ departmentId, status: 'active' })
      .select('classId initiatedAt')
      .lean();
    
    const activeBatchMap = new Map(activeBatches.map(b => [b.classId.toString(), b.initiatedAt]));

    // 3. Get student counts for all classes in one go
    const studentCounts = await Student.aggregate([
      { $match: { departmentId: new mongoose.Types.ObjectId(departmentId), isActive: true } },
      { $group: { _id: '$classId', count: { $sum: 1 } } }
    ]);
    const studentCountMap = new Map(studentCounts.map(s => [s._id.toString(), s.count]));

    // 4. Map and Analyze
    const preview = classes.map(cls => {
      const classIdStr = cls._id.toString();
      const activeSince = activeBatchMap.get(classIdStr);
      const studentCount = studentCountMap.get(classIdStr) || 0;
      const hasCT = !!cls.classTeacherId;
      const subjects = (cls.subjectAssignments || []).filter(s => !s.isElective);

      let status = 'READY';
      let reason = null;

      if (activeSince) {
        status = 'ACTIVE';
        reason = `Active session since ${new Date(activeSince).toLocaleDateString()}`;
      } else if (studentCount === 0) {
        status = 'EMPTY';
        reason = 'No active students found';
      }

      const warnings = [];
      if (!hasCT) warnings.push('No Class Teacher assigned');
      if (subjects.length === 0) warnings.push('No core subjects assigned');
      return {
        classId: cls._id,
        className: cls.name,
        semester: cls.semester,
        academicYear: cls.academicYear,
        status,
        reason,
        studentCount,
        hasCT,
        subjectCount: subjects.length,
        warnings
      };
    });

    preview.sort((a, b) => {
      const order = { READY: 0, ACTIVE: 1, EMPTY: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.className.localeCompare(b.className);
    });

    res.status(200).json({
      success: true,
      data: preview
    });
  } catch (err) {
    next(err);
  }
};

export const initiateBatch = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { classId, deadline } = req.body;
    if (!classId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('classId is required', 400));
    }

    const initiator = { userId: req.user.userId, role: req.user.role };

    const cls = await Class.findOne({ _id: classId, isActive: true })
      .populate('departmentId', 'name')
      .session(session)
      .lean();
    if (!cls) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Class not found', 404));
    }

    if (req.user.role === 'hod' && cls.departmentId?._id?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403));
    }

    const existing = await NodueBatch.findOne({ classId, status: 'active' }).session(session).lean();
    if (existing) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse(`Active session already exists for ${cls.name}`, 409));
    }

    const result = await _executeInitiation(cls, deadline, initiator, session);

    await commitSafeTransaction(session);

    logger.audit('BATCH_INITIATED', {
      actor: req.user.userId,
      actor_role: req.user.role,
      classId,
      departmentId: cls.departmentId?._id ?? cls.departmentId,
      totalStudents: result.totalStudents
    });

    return res.status(201).json({
      success: true,
      data: { ...result, initiatedAt: new Date() },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    if (err.message?.includes('No active students')) {
      return next(new ErrorResponse(err.message, 400));
    }
    next(err);
  } finally {
    session.endSession();
  }
};

export const initiateDepartmentWide = async (req, res, next) => {
  try {
    const { deadline } = req.body;
    const departmentId = req.user.departmentId;

    if (!departmentId) {
      return next(new ErrorResponse('Department context missing from session', 400));
    }

    const classes = await Class.find({ departmentId, isActive: true })
      .populate('departmentId', 'name')
      .lean();

    if (!classes.length) {
      return next(new ErrorResponse('No active classes found for this department', 404));
    }

    const activeBatches = await NodueBatch.find({
      departmentId,
      status: 'active'
    }).select('classId').lean();

    const activeClassIds = new Set(activeBatches.map(b => b.classId.toString()));
    const eligibleClasses = classes.filter(c => !activeClassIds.has(c._id.toString()));

    if (!eligibleClasses.length) {
      return res.status(200).json({
        success: true,
        message: 'All classes already have active clearance sessions',
        summary: { total: classes.length, initiated: 0, skipped: classes.length }
      });
    }

    // Initialize background task
    const task = await Task.create({
      type: 'batch_initiation',
      label: `Initiating NoDues for ${eligibleClasses.length} classes`,
      status: 'processing',
      actor: req.user.userId,
      progress: 0,
      meta: { 
        total: eligibleClasses.length,
        departmentId 
      }
    });

    // Respond immediately - the frontend Activity Center (Inbox) will track progress
    res.status(202).json({
      success: true,
      data: {
        message: 'Bulk initiation started in background',
        taskId: task._id
      }
    });

    // Background processing logic
    const runBackgroundProcessing = async () => {
      try {
        const results = { initiated: [], failed: [] };

        for (let i = 0; i < eligibleClasses.length; i++) {
          const cls = eligibleClasses[i];
          const session = await mongoose.startSession();
          
          try {
            await startSafeTransaction(session);
            const initRes = await _executeInitiation(cls, deadline, { 
              userId: req.user.userId, 
              role: req.user.role 
            }, session);
            
            await commitSafeTransaction(session);
            results.initiated.push(initRes);

            logger.audit('BATCH_INITIATED', {
              actor: req.user.userId,
              actor_role: req.user.role,
              classId: cls._id,
              departmentId: cls.departmentId?._id ?? cls.departmentId,
              totalStudents: initRes.totalStudents,
              context: 'DEPARTMENT_WIDE_INITIATION'
            });

          } catch (err) {
            await abortSafeTransaction(session);
            logger.error('bulk_initiate_single_failure', { 
              class: cls.name, 
              error: err.message 
            });
            results.failed.push({ 
              className: cls.name, 
              reason: err.message 
            });
          } finally {
            session.endSession();
            
            const progress = Math.round(((i + 1) / eligibleClasses.length) * 100);
            await Task.findByIdAndUpdate(task._id, { 
              progress,
              message: `Processed ${i + 1} of ${eligibleClasses.length} classes...`
            });
          }
        }

        // Final task update
        const finalStatus = results.initiated.length > 0 ? 'success' : 'error';
        await Task.findByIdAndUpdate(task._id, {
          status: finalStatus,
          progress: 100,
          message: `Completed: ${results.initiated.length} succeeded, ${results.failed.length} failed.`,
          meta: { 
            ...task.meta,
            success: results.initiated.length, 
            failed: results.failed.length,
            errors: results.failed.slice(0, 10)
          }
        });
        
        // Notify the actor that the bulk operation is complete
        await createNotification({
          user: req.user.userId,
          userModel: req.user.role === 'admin' ? 'Admin' : 'Faculty',
          title: 'Bulk Initiation Complete',
          message: `Processed ${eligibleClasses.length} classes: ${results.initiated.length} succeeded, ${results.failed.length} failed.`,
          type: results.failed.length === 0 ? 'success' : 'warning',
          link: '/admin/batches'
        });

      } catch (err) {
        logger.error('bulk_initiation_background_crash', { error: err.message, taskId: task._id });
        await Task.findByIdAndUpdate(task._id, { 
          status: 'error', 
          message: `Background process crashed: ${err.message}` 
        }).catch(() => {});
      }
    };

    // Fire and forget background process
    runBackgroundProcessing();

  } catch (err) {
    next(err);
  }
};

// ── GET /api/batch/:batchId ───────────────────────────────────────────────────
export const getBatchStatus = async (req, res, next) => {
  try {
    const { batchId } = req.params;

    const batch = await NodueBatch.findById(batchId)
      .select('_id className departmentId semester academicYear status totalStudents initiatedAt deadline')
      .lean();
    if (!batch) return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));

    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    // Cache batch grid — 60s TTL; invalidated on any approval action
    const cacheKey = `batch_status:${batchId}`;
    const cachedGrid = cache.get(cacheKey);
    if (cachedGrid) {
      return res.status(200).json({ success: true, data: { batch, ...cachedGrid } });
    }

    // Requests + approvals in parallel — both indexed on batchId
    const [requests, approvals] = await Promise.all([
      NodueRequest.find({ batchId })
        .select('studentId studentSnapshot status facultySnapshot')
        .lean(),
      NodueApproval.find({ batchId })
        .select('studentId facultyId action subjectId approvalType roleTag itemTypeId')
        .lean(),
    ]);

    // Build approval map for each student: studentId -> columnKey -> approvalData
    const studentApprovalMap = {};
    approvals.forEach((a) => {
      const sId = a.studentId.toString();
      // Uniquely identify the clearance task column
      // For subjects, use subjectId. For co-curricular, use itemTypeId. For roles, use roleTag.
      const colKey = a.itemTypeId 
        ? a.itemTypeId.toString() 
        : (a.approvalType === 'subject' ? (a.subjectId?.toString() || a.subjectName) : a.roleTag);
      
      if (!studentApprovalMap[sId]) studentApprovalMap[sId] = {};
      studentApprovalMap[sId][colKey] = {
        _id: a._id,
        status: a.action,
        subjectId: a.subjectId,
        type: a.approvalType,
      };
    });

    const students = requests.map((r) => {
      const sId = r.studentId.toString();
      const studentApprovals = studentApprovalMap[sId] || {};
      
      const counts = Object.values(studentApprovals).reduce((acc, a) => {
        acc.total++;
        if (a.status === 'approved') acc.cleared++;
        else if (a.status === 'due_marked') acc.dues++;
        else acc.pending++;
        return acc;
      }, { total: 0, cleared: 0, dues: 0, pending: 0 });

      return {
        _id:       r._id,
        studentId: r.studentId,
        rollNo:    r.studentSnapshot?.rollNo,
        name:      r.studentSnapshot?.name,
        status:    r.status,
        cleared:   counts.cleared,
        pending:   counts.pending,
        dues:      counts.dues,
        total:     counts.total,
        approvals: studentApprovals,
        facultySnapshot: Array.isArray(r.facultySnapshot) 
          ? r.facultySnapshot 
          : Object.values(r.facultySnapshot || {}),
      };
    });

    // Extract unique columns (faculty-task pairs) from snapshots
    const columnsMap = new Map();
    requests.forEach(r => {
      const snapshot = r.facultySnapshot || {};
      if (Array.isArray(snapshot)) {
        snapshot.forEach(f => {
          const key = f.itemTypeId 
            ? f.itemTypeId.toString() 
            : (f.approvalType === 'subject' ? (f.subjectId?.toString() || f.subjectName) : f.roleTag);
          if (!columnsMap.has(key)) columnsMap.set(key, f);
        });
      } else {
        Object.entries(snapshot).forEach(([key, f]) => {
          if (!columnsMap.has(key)) columnsMap.set(key, f);
        });
      }
    });

    const faculty = Array.from(columnsMap.entries()).map(([key, f]) => ({
      _id:         key, // Matrix column ID
      facultyId:   f.facultyId,
      name:        f.facultyName,
      subjectId:   f.subjectId,
      subjectName: f.subjectName,
      type:        f.approvalType,
    }));

    const gridPayload = { students, faculty };
    cache.set(cacheKey, gridPayload, 60);

    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      data: {
        batch: {
          _id:          batch._id,
          className:    batch.className,
          semester:     batch.semester,
          academicYear: batch.academicYear,
          status:       batch.status,
          totalStudents: batch.totalStudents,
          initiatedAt:  batch.initiatedAt,
          deadline:     batch.deadline,
        },
        ...gridPayload,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/batch/:batchId/students/:studentId ───────────────────────────────
export const getBatchStudentDetail = async (req, res, next) => {
  try {
    const { batchId, studentId } = req.params;

    // Both queries hit { batchId: 1, studentId: 1 } compound index
    const [request, approvals, batch] = await Promise.all([
      NodueRequest.findOne({ batchId, studentId })
        .select('studentSnapshot status overrideRemark')
        .lean(),
      NodueApproval.find({ batchId, studentId })
        .select('_id facultyId facultyName subjectName approvalType roleTag action dueType remarks actionedAt')
        .populate('facultyId', 'name employeeId')
        .lean(),
      NodueBatch.findById(batchId).select('departmentId').lean()
    ]);

    if (!request || !batch) return next(new ErrorResponse('Record not found', 404, 'NOT_FOUND'));

    // HoD Scope Check
    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    return res.status(200).json({
      success: true,
      data: {
        studentId,
        rollNo:         request.studentSnapshot?.rollNo,
        name:           request.studentSnapshot?.name,
        status:         request.status,
        overrideRemark: request.overrideRemark ?? null,
        approvals: approvals.map((a) => ({
          _id:          a._id,
          facultyId:    a.facultyId?._id,
          facultyName:  a.facultyId?.name,
          employeeId:   a.facultyId?.employeeId,
          subjectName:  a.subjectName,
          approvalType: a.approvalType,
          roleTag:      a.roleTag,
          action:       a.action,
          dueType:      a.dueType    ?? null,
          remarks:      a.remarks    ?? null,
          actionedAt:   a.actionedAt ?? null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/batch/:batchId/close ──────────────────────────────────────────
export const closeBatch = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { batchId } = req.params;

    const batch = await NodueBatch.findById(batchId).session(session);
    if (!batch) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));
    }
    if (batch.status === 'closed') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Batch is already closed', 400, 'BATCH_ALREADY_CLOSED'));
    }

    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    batch.status = 'closed';
    await batch.save({ session });

    await commitSafeTransaction(session);

    logger.audit('BATCH_CLOSED', {
      actor: req.user.userId,
      resource_id: batchId,
    });

    const batchRequests = await NodueRequest.find({ batchId }, 'studentId').lean();
    const batchStudentIds = batchRequests.map((r) => r.studentId.toString());
    pushEvent(batchStudentIds, 'BATCH_CLOSED', { batchId });

    return res.status(200).json({
      success: true,
      data: { batchId: batch._id, status: 'closed' },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── POST /api/batch/:batchId/students ─────────────────────────────────────────
export const addStudentToBatch = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { batchId } = req.params;
    const { studentId } = req.body;
    if (!studentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('studentId is required', 400, 'VALIDATION_ERROR'));
    }

    const [batch, student] = await Promise.all([
      NodueBatch.findById(batchId).session(session).lean(),
      Student.findOne({ _id: studentId, isActive: true })
        .select('_id rollNo name mentorId electiveSubjects classId departmentId')
        .session(session)
        .lean(),
    ]);

    if (!batch) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));
    }
    if (batch.status !== 'active') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }

    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    if (!student) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Student not found', 404, 'NOT_FOUND'));
    }

    const existing = await NodueRequest.findOne({ batchId, studentId }).session(session).lean();
    if (existing) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Student already in this batch', 409, 'DUPLICATE_KEY'));
    }

    const cls = await Class.findById(batch.classId)
      .select('name departmentId semester academicYear classTeacherId subjectAssignments')
      .session(session)
      .lean();

    // ── Build Faculty Snapshot (Full implementation) ─────────────────────────
    const [hodAccount, ctInfo] = await Promise.all([
      Faculty.findOne({ 
        departmentId: cls.departmentId._id || cls.departmentId, 
        roleTags: 'hod', 
        isActive: true 
      }).select('name').session(session).lean(),
      cls.classTeacherId ? Faculty.findById(cls.classTeacherId).select('name').session(session).lean() : null
    ]);

    const snapshot = {};
    if (hodAccount) {
      snapshot['hod'] = {
        facultyId: hodAccount._id, facultyName: hodAccount.name,
        roleTag: 'hod', approvalType: 'hodApproval',
        subjectId: null, subjectName: 'Department Clearance (HoD)',
      };
    }

    // Regular subjects
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
      const mentor = await Faculty.findById(student.mentorId).select('name').session(session).lean();
      snapshot['mentor'] = {
        facultyId: student.mentorId, facultyName: mentor?.name ?? null,
        roleTag: 'mentor', approvalType: 'mentor',
        subjectName: 'Mentor',
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

    // ── Create Documents ─────────────────────────────────────────────────────
    const requestId = new mongoose.Types.ObjectId();
    const [request] = await NodueRequest.create([{
      _id: requestId,
      batchId,
      studentId,
      studentSnapshot: { 
        rollNo: student.rollNo, 
        name: student.name,
        departmentName: cls.departmentId?.name ?? null 
      },
      facultySnapshot: snapshot,
      status: 'pending',
    }], { session });

    const approvals = Object.values(snapshot).map(f => ({
      requestId,
      batchId,
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

    await NodueApproval.insertMany(approvals, { session });
    await NodueBatch.findByIdAndUpdate(batchId, { $inc: { totalStudents: 1 } }, { session });

    await commitSafeTransaction(session);

    logger.audit('STUDENT_ADDED_TO_BATCH', {
      actor: req.user.userId,
      resource_id: batchId,
      studentId,
    });

    pushEvent([studentId.toString()], 'STUDENT_ADDED_TO_BATCH', {
      batchId,
      requestId: request._id,
    });

    return res.status(201).json({
      success: true,
      data: { requestId: request._id, studentId, batchId, status: 'pending' },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── DELETE /api/batch/:batchId/faculty/:facultyId ─────────────────────────────
export const removeFacultyFromBatch = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { batchId, facultyId } = req.params;

    const batch = await NodueBatch.findById(batchId).select('status departmentId').session(session).lean();
    if (!batch) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Batch not found', 404, 'NOT_FOUND'));
    }
    if (batch.status !== 'active') {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Batch is closed', 400, 'BATCH_CLOSED'));
    }

    if (req.user.role === 'hod' && batch.departmentId?.toString() !== req.user.departmentId) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Access denied', 403, 'AUTH_DEPARTMENT_SCOPE'));
    }

    const result = await NodueApproval.deleteMany({
      batchId,
      facultyId,
      action: 'pending',
    }, { session });

    await commitSafeTransaction(session);

    logger.audit('FACULTY_REMOVED_BATCH', {
      actor: req.user.userId,
      resource_id: batchId, 
      facultyId,
      pendingDeleted: result.deletedCount,
    });

    return res.status(200).json({
      success: true,
      data: {
        batchId, facultyId,
        pendingApprovalsRemoved: result.deletedCount,
        message: 'Pending approvals removed. Actioned approvals retained.',
      },
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};

// ── BATCH OPERATIONS ─────────────────────────────────────────────────────────

export const bulkCloseBatches = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('IDs array is required', 400));
    }

    const query = { _id: { $in: ids }, status: 'active' };
    if (req.user.role === 'hod') {
      query.departmentId = req.user.departmentId;
    }

    const batches = await NodueBatch.find(query).select('_id').session(session).lean();
    const result = await NodueBatch.updateMany(query, { status: 'closed' }, { session });

    await commitSafeTransaction(session);

    // Notify students after commit
    for (const batch of batches) {
      const bid = batch._id.toString();
      const batchRequests = await NodueRequest.find({ batchId: bid }, 'studentId').lean();
      const studentIds = batchRequests.map(r => r.studentId.toString());
      if (studentIds.length) {
        pushEvent(studentIds, 'BATCH_CLOSED', { batchId: bid });
      }
    }

    logger.audit('BATCH_BULK_CLOSED', {
      actor: req.user.userId,
      details: { count: result.modifiedCount, requested: ids.length }
    });

    return res.status(200).json({
      success: true,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};