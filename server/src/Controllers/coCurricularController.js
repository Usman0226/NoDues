import mongoose from 'mongoose';
import CoCurricularType from '../models/CoCurricularType.js';
import Faculty from '../models/Faculty.js';
import Student from '../models/Student.js';
import NodueApproval from '../models/NodueApproval.js';
import NodueRequest from '../models/NodueRequest.js';
import NodueBatch from '../models/NodueBatch.js';
import Class from '../models/Class.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import cache from '../config/cache.js';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } from '../utils/safeTransaction.js';
import { createNotification } from './notification.controller.js';
import * as batchSync from '../utils/batchSync.js';

// ── GET /api/co-curricular-types ──────────────────────────────────────────────
const invalidateCoCurricularCache = (departmentId) => {
  const keys = cache.keys().filter(
    (k) => k === `co_curricular:all` || k === `co_curricular:dept:${departmentId}`
  );
  if (keys.length) cache.del(keys);
};

export const getCoCurricularTypes = async (req, res, next) => {
  try {
    const { departmentId } = req.query;
    const query = { isActive: { $ne: false } };

    if (req.user.role === 'hod') {
      query.departmentId = req.user.departmentId;
    } else if (departmentId) {
      query.departmentId = departmentId;
    }

    const scopeId = req.user.role === 'hod' ? req.user.departmentId : (departmentId ?? 'all');
    const cacheKey = `co_curricular:${scopeId === 'all' ? 'all' : `dept:${scopeId}`}`;

    const cached = cache.get(cacheKey);
    if (cached) return res.status(200).json({ success: true, data: cached });

    const types = await CoCurricularType.find(query)
      .populate('coordinatorId', 'name employeeId')
      .populate('departmentId', 'name')
      .lean();

    cache.set(cacheKey, types, 120); // 2-min cache — co-curricular types rarely change
    res.status(200).json({
      success: true,
      data: types,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/co-curricular-types ─────────────────────────────────────────────
export const createCoCurricularType = async (req, res, next) => {
  try {
    const { name, code, departmentId: bodyDeptId, applicableYears, coordinatorId, fields, isOptional, requiresMentorApproval, requiresClassTeacherApproval } = req.body;

    // Determine target departmentId
    let departmentId = bodyDeptId;
    if (req.user.role === 'hod') {
      departmentId = req.user.departmentId;
    }

    if (!name || !code || !departmentId || !applicableYears?.length) {
      return next(new ErrorResponse('Required fields missing', 400));
    }

    if (!requiresMentorApproval && !requiresClassTeacherApproval && !coordinatorId) {
      return next(new ErrorResponse('Either a Coordinator must be selected, Mentor Approval must be required, or Class Teacher Approval must be required', 400));
    }

    // HoD Scope Check ( redundant if we infer, but kept for explicit validation if admin sends a different deptId)
    if (req.user.role === 'hod' && departmentId.toString() !== req.user.departmentId.toString()) {
      return next(new ErrorResponse('Access denied: You can only create items for your own department', 403));
    }

    let faculty = null;
    // Verify Coordinator belongs to Department if coordinatorId is provided
    if (coordinatorId) {
      faculty = await Faculty.findOne({ _id: coordinatorId, departmentId, isActive: true }).lean();
      if (!faculty) {
        return next(new ErrorResponse('Invalid coordinator: Faculty member does not belong to the specified department or is inactive', 400));
      }
    }

    const type = await CoCurricularType.create({
      name,
      code,
      departmentId,
      applicableYears,
      coordinatorId: coordinatorId || undefined,
      fields: fields || [],
      isOptional: isOptional || false,
      requiresMentorApproval: requiresMentorApproval || false,
      requiresClassTeacherApproval: requiresClassTeacherApproval || false,
    });

    // Add coordinator roleTag if not present
    if (faculty && !faculty.roleTags.includes('coordinator')) {
      await Faculty.findByIdAndUpdate(coordinatorId, { $addToSet: { roleTags: 'coordinator' } });
    }

    // ── RETROACTIVE ADDITION TO ACTIVE BATCHES ─────────────────────────────
    // Offload to batchSync for robust edge-case handling
    batchSync.syncCoCurricularAddition(type._id);

    logger.audit('CO_CURRICULAR_TYPE_CREATED', {
      actor: req.user.userId,
      resource_id: type._id.toString(),
      details: { name, code }
    });

    invalidateCoCurricularCache(departmentId);

    res.status(201).json({
      success: true,
      data: type,
    });
  } catch (err) {
    if (err.code === 11000) return next(new ErrorResponse('Item code already exists', 400));
    next(err);
  }
};

// ── PATCH /api/co-curricular-types/:id ────────────────────────────────────────
export const updateCoCurricularType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, applicableYears, coordinatorId, fields, isOptional, requiresMentorApproval, requiresClassTeacherApproval } = req.body;
    
    const type = await CoCurricularType.findById(id);
    if (!type) return next(new ErrorResponse('Type not found', 404));
    const updates = Object.fromEntries(
      Object.entries({
        name,
        code,
        applicableYears,
        coordinatorId,
        fields,
        isOptional,
        requiresMentorApproval,
        requiresClassTeacherApproval
      }).filter(([, v]) => v !== undefined)
    );


    if ((requiresMentorApproval || requiresClassTeacherApproval) && !coordinatorId) {
       updates.$unset = { coordinatorId: 1 };
       delete updates.coordinatorId;
    }

    let faculty = null;
    if (updates.coordinatorId && updates.coordinatorId !== type.coordinatorId?.toString()) {
      faculty = await Faculty.findOne({ _id: updates.coordinatorId, departmentId: type.departmentId.toString(), isActive: true }).lean();
      if (!faculty) return next(new ErrorResponse('Invalid coordinator: Faculty must belong to same department and be active', 400));
      
      await Faculty.findByIdAndUpdate(updates.coordinatorId, { $addToSet: { roleTags: 'coordinator' } });
    }

    const updatedType = await CoCurricularType.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

    // ── SYNC CHANGES TO ACTIVE BATCHES ─────────────────────────────────────
    batchSync.syncCoCurricularUpdate(updatedType._id);

    logger.audit('CO_CURRICULAR_TYPE_UPDATED', {
      actor: req.user.userId,
      resource_id: id,
      details: updates
    });

    invalidateCoCurricularCache(type.departmentId);

    res.status(200).json({
      success: true,
      data: updatedType,
    });
  } catch (err) {
    next(err);
  }
};

export const assignCoCurricularToMentors = async (req, res, next) => {
  try {
    const { id } = req.params;
    let { mode, facultyId: overrideFacultyId } = req.body;

    // Auto-detect mode from URL if not explicitly provided in body
    if (!mode) {
      if (req.originalUrl.includes('assign-mentors')) mode = 'per_mentor';
      else if (req.originalUrl.includes('assign-class-teachers')) mode = 'per_class_teacher';
      else mode = 'per_mentor'; // Default
    }

    if (!['per_mentor', 'single_faculty', 'per_class_teacher'].includes(mode)) {
      return next(new ErrorResponse('mode must be per_mentor, single_faculty or per_class_teacher', 400));
    }

    let overrideFaculty = null;
    if (mode === 'single_faculty') {
      if (!overrideFacultyId) {
        return next(new ErrorResponse('facultyId is required for single_faculty mode', 400));
      }
      overrideFaculty = await Faculty.findOne({ _id: overrideFacultyId, isActive: true })
        .select('_id name employeeId').lean();
      if (!overrideFaculty) {
        return next(new ErrorResponse('Selected faculty not found or inactive', 404));
      }
    }

    const type = await CoCurricularType.findOne({ _id: id, isActive: true }).lean();
    if (!type) return next(new ErrorResponse('Co-curricular type not found', 404));

    // HoD Scope Check
    if (req.user.role === 'hod' && type.departmentId.toString() !== req.user.departmentId.toString()) {
      return next(new ErrorResponse('Access denied: You can only manage your department\'s items', 403));
    }

    // Derive semester set from applicableYears (year Y → semesters 2Y-1, 2Y)
    const semesterSet = new Set();
    for (const yr of type.applicableYears) {
      semesterSet.add(2 * yr - 1);
      semesterSet.add(2 * yr);
    }

    const classes = await Class.find({
      departmentId: type.departmentId,
      semester: { $in: [...semesterSet] },
      isActive: true,
    }).select('_id classTeacherId').lean();

    if (!classes.length) {
      return res.status(200).json({
        success: true,
        data: { created: 0, skipped: 0, skippedNoRequest: 0, message: 'No matching classes found' },
      });
    }

    const classIds = classes.map((c) => c._id);
    const classMap = new Map(classes.map(c => [c._id.toString(), c]));

    const activeBatches = await NodueBatch.find({
      classId: { $in: classIds },
      status: 'active',
    }).select('_id classId').lean();

    if (!activeBatches.length) {
      return res.status(200).json({
        success: true,
        data: { created: 0, skipped: 0, skippedNoRequest: 0, message: 'No active batches found for applicable classes' },
      });
    }

    const batchIds = activeBatches.map((b) => b._id);
    const batchByClass = Object.fromEntries(activeBatches.map((b) => [b.classId.toString(), b._id]));

    const students = await Student.find({
      classId: { $in: classIds },
      isActive: true,
    }).select('_id rollNo name classId mentorId').lean();

    const requests = await NodueRequest.find({
      batchId: { $in: batchIds },
      studentId: { $in: students.map((s) => s._id) },
    }).select('_id studentId batchId').lean();

    const requestMap = new Map();
    for (const r of requests) {
      requestMap.set(`${r.studentId}:${r.batchId}`, r);
    }

    let skipped = 0;
    let skippedNoRequest = 0;
    const approvalDocs = [];
    const snapshotUpdates = [];

    // ── 1. PREPARE ASSIGNMENTS ───────────────────────────────────────────
    for (const student of students) {
      let assignedFacultyId;
      let roleTag;
      let subjectNameLabel;
      let facultyName = null;

      if (mode === 'single_faculty') {
        assignedFacultyId = overrideFaculty._id;
        facultyName = overrideFaculty.name;
        roleTag = 'coCurricular_coordinator';
        subjectNameLabel = `Coordinator Clearance – ${type.name}`;
      } else if (mode === 'per_mentor') {
        if (!student.mentorId) {
          skipped++;
          continue;
        }
        assignedFacultyId = student.mentorId;
        roleTag = 'coCurricular_mentor';
        subjectNameLabel = `Mentor Clearance – ${type.name}`;
        // Note: facultyName will be fetched via populate or left as null for snapshot update logic below
      } else if (mode === 'per_class_teacher') {
        const cls = classMap.get(student.classId.toString());
        if (!cls?.classTeacherId) {
          skipped++;
          continue;
        }
        assignedFacultyId = cls.classTeacherId;
        roleTag = 'coCurricular_classTeacher';
        subjectNameLabel = `Class Teacher Clearance – ${type.name}`;
      }

      const batchId = batchByClass[student.classId.toString()];
      if (!batchId) continue;

      const request = requestMap.get(`${student._id}:${batchId}`);
      if (!request) {
        skippedNoRequest++;
        continue;
      }

      approvalDocs.push({
        requestId:    request._id,
        batchId,
        studentId:    student._id,
        studentRollNo: student.rollNo,
        studentName:  student.name,
        facultyId:    assignedFacultyId,
        subjectId:    null,
        subjectName:  subjectNameLabel,
        approvalType: 'coCurricular',
        roleTag:      roleTag,
        itemTypeId:   type._id,
        itemTypeName: type.name,
        itemCode:     type.code,
        isOptional:   type.isOptional,
        action:       'pending',
      });

      // Prepare snapshot update
      snapshotUpdates.push({
        requestId: request._id,
        snapshot: {
          facultyId: assignedFacultyId,
          facultyName: facultyName, // will be null for per_mentor/per_class_teacher unless we fetch it
          subjectId: null,
          subjectName: type.name,
          subjectCode: type.code,
          roleTag: roleTag,
          approvalType: 'coCurricular',
          itemTypeId: type._id,
          itemTypeName: type.name,
          itemCode: type.code,
          isOptional: type.isOptional || false
        }
      });
    }

    // ── 2. EXECUTE UPDATES ───────────────────────────────────────────────
    let created = 0;
    if (approvalDocs.length > 0) {
      // Use a transaction for consistency if possible, or at least delete first
      // Since we want to avoid duplicates and handle re-assignment:
      
      // Delete ALL existing co-curricular approvals for this specific item type in these batches
      await NodueApproval.deleteMany({
        batchId: { $in: batchIds },
        itemTypeId: type._id
      });

      // Insert new ones
      const result = await NodueApproval.insertMany(approvalDocs, { ordered: false }).catch((err) => {
        if (err.code === 11000 || err.writeErrors) {
          return { insertedCount: err.insertedDocs?.length ?? 0 };
        }
        throw err;
      });
      created = result.insertedCount ?? approvalDocs.length;

      // Update Snapshots in NodueRequests
      const reqIds = [...new Set(snapshotUpdates.map(u => u.requestId))];
      const allRequests = await NodueRequest.find({ _id: { $in: reqIds } });
      
      const reqOps = [];
      for (const req of allRequests) {
        const update = snapshotUpdates.find(u => u.requestId.toString() === req._id.toString());
        if (!update) continue;

        if (Array.isArray(req.facultySnapshot)) {
          const idx = req.facultySnapshot.findIndex(f => f.itemTypeId?.toString() === type._id.toString());
          if (idx !== -1) req.facultySnapshot[idx] = update.snapshot;
          else req.facultySnapshot.push(update.snapshot);
        } else if (req.facultySnapshot) {
          req.facultySnapshot[type._id.toString()] = update.snapshot;
          req.markModified('facultySnapshot');
        }
        reqOps.push(req.save());
      }
      await Promise.all(reqOps);
    }

    logger.audit('CO_CURRICULAR_ASSIGNED', {
      actor: req.user.userId,
      resource_id: id,
      timestamp: new Date().toISOString(),
      details: { mode, overrideFacultyId: overrideFaculty?._id ?? null, created, skipped, skippedNoRequest },
    });

    let modeLabel = mode === 'single_faculty' ? `single faculty (${overrideFaculty.name})` : 
                    mode === 'per_mentor' ? "each student's own mentor" : 
                    "each student's class teacher";

    return res.status(200).json({
      success: true,
      data: {
        mode,
        created,
        skipped,
        skippedNoRequest,
        assignedTo: mode === 'single_faculty' ? { _id: overrideFaculty._id, name: overrideFaculty.name } : null,
        message: `Done (${modeLabel}). ${created} approval(s) created. ${skipped} skipped (missing assignment). ${skippedNoRequest} skipped (no active request).`,
      },
    });
  } catch (err) {
    next(err);
  }
};



// ── DELETE /api/co-curricular-types/:id ────────────────────────────────────────
export const deleteCoCurricularType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const type = await CoCurricularType.findById(id);
    if (!type) return next(new ErrorResponse('Item type not found', 404));

    if (req.user.role === 'hod' && type.departmentId.toString() !== req.user.departmentId.toString()) {
      return next(new ErrorResponse('Access denied: You cannot remove items from other departments', 403));
    }

    type.isActive = false;
    await type.save();

    // Sync removal from active batches
    batchSync.syncCoCurricularRemoval(type.departmentId, type._id);

    logger.audit('CO_CURRICULAR_TYPE_DEACTIVATED', {
      actor: req.user.userId,
      resource_id: id
    });

    invalidateCoCurricularCache(type.departmentId);

    res.status(200).json({
      success: true,
      data: { message: 'Item type deactivated' }
    });
  } catch (err) {
    next(err);
  }
};

export const activateCoCurricularType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const type = await CoCurricularType.findById(id);
    if (!type) return next(new ErrorResponse('Item type not found', 404));

    if (req.user.role === 'hod' && type.departmentId.toString() !== req.user.departmentId.toString()) {
      return next(new ErrorResponse('Access denied: You cannot activate items from other departments', 403));
    }

    type.isActive = true;
    await type.save();

    logger.audit('CO_CURRICULAR_TYPE_ACTIVATED', {
      actor: req.user.userId,
      resource_id: id
    });

    invalidateCoCurricularCache(type.departmentId);

    res.status(200).json({
      success: true,
      data: type
    });
  } catch (err) {
    next(err);
  }
};


// ── Student Submission (to be moved/integrated with Student Portal) ────────
export const submitCoCurricular = async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    await startSafeTransaction(session);
    const { typeId } = req.params;
    const { submittedData } = req.body;
    const studentId = req.user.userId;

    const type = await CoCurricularType.findOne({ _id: typeId, isActive: true }).session(session).lean();
    const student = await Student.findById(studentId).populate('classId').session(session);

    if (!type || !student) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse('Resource not found', 404));
    }

    // Infer student year if not explicitly set
    let studentYear = student.yearOfStudy;
    if (!studentYear && student.classId && student.classId.semester) {
        studentYear = student.classId.semester > 2 ? Math.ceil(student.classId.semester / 2) : 1;
    }

    // Validate if applicable to student's year
    if (!studentYear || !type.applicableYears.includes(studentYear)) {
      await abortSafeTransaction(session);
      return next(new ErrorResponse(`Not applicable to your year (detected year: ${studentYear})`, 400));
    }


    // Find if item already in student.coCurricular
    let item = student.coCurricular.find(i => i.itemTypeId.toString() === typeId);
    if (!item) {
        // This shouldn't happen if batch initiation worked, but let's be safe
        student.coCurricular.push({
            itemTypeId: type._id,
            itemCode: type.code,
            itemTypeName: type.name,
            submittedData,
            submittedAt: new Date(),
            status: 'submitted'
        });
    } else {
        item.submittedData = submittedData;
        item.submittedAt = new Date();
        item.status = 'submitted';
    }

    await student.save({ session });

    // Update associated NodueApproval to 'pending' if it was rejected/due_marked
    // We fetch current active batch for this student's class
    const activeBatch = await mongoose.model('NodueBatch').findOne({ 
        classId: student.classId, 
        status: 'active' 
    }).session(session).lean();

    if (activeBatch) {
        // Ensure approval record matches latest template settings
        const isMentorMode = type.requiresMentorApproval;
        const isCTMode = type.requiresClassTeacherApproval;
        
        let assignedFacultyId = null;
        let roleTag = 'coCurricular_coordinator';
        let facultyNameStr = "Department Faculty";

        if (isMentorMode) {
            assignedFacultyId = student.mentorId;
            roleTag = 'coCurricular_mentor';
            facultyNameStr = "Student's Mentor";
        } else if (isCTMode) {
            assignedFacultyId = student.classId?.classTeacherId;
            roleTag = 'coCurricular_classTeacher';
            facultyNameStr = "Class Teacher";
        } else {
            assignedFacultyId = type.coordinatorId;
            roleTag = 'coCurricular_coordinator';
        }

        // Fetch actual name if available
        if (assignedFacultyId) {
            if (isMentorMode && student.mentorId && assignedFacultyId.toString() === student.mentorId.toString()) {
                // If it's the mentor, we can try to fetch name if needed, but snapshots usually use placeholders or are updated later
                const mentor = await Faculty.findById(assignedFacultyId).session(session).select('name').lean();
                if (mentor) facultyNameStr = mentor.name;
            } else if (isCTMode && student.classId?.classTeacherId && assignedFacultyId.toString() === student.classId.classTeacherId.toString()) {
                const ct = await Faculty.findById(assignedFacultyId).session(session).select('name').lean();
                if (ct) facultyNameStr = ct.name;
            } else if (!isMentorMode && !isCTMode) {
                const coordinator = await Faculty.findById(assignedFacultyId).session(session).select('name').lean();
                if (coordinator) facultyNameStr = coordinator.name;
            }
        }

        // Fallback: If mentor/CT mode but no faculty assigned, use coordinator
        if ((isMentorMode || isCTMode) && !assignedFacultyId && type.coordinatorId) {
            assignedFacultyId = type.coordinatorId;
            roleTag = 'coCurricular_coordinator';
            const fallbackCoord = await Faculty.findById(type.coordinatorId).session(session).select('name').lean();
            facultyNameStr = fallbackCoord?.name || 'Department Faculty';
        }

        const approval = await NodueApproval.findOneAndUpdate(
            { 
                batchId: activeBatch._id, 
                studentId: student._id, 
                itemTypeId: type._id 
            },
            { 
                action: 'pending', 
                actionedAt: null, 
                remarks: null,
                // Sync latest settings
                facultyId: assignedFacultyId,
                facultyName: facultyNameStr,
                roleTag: roleTag,
                approvalType: 'coCurricular',
                subjectName: type.name,
                itemTypeName: type.name,
                itemCode: type.code,
                isOptional: type.isOptional
            },
            { session, new: true }
        );

        // Update snapshot to reflect latest faculty choice
        const request = await mongoose.model('NodueRequest').findOne({ _id: approval.requestId }).session(session);
        if (request) {
            if (Array.isArray(request.facultySnapshot)) {
                const idx = request.facultySnapshot.findIndex(f => f.itemTypeId?.toString() === type._id.toString());
                const snapshotData = {
                    facultyId: assignedFacultyId,
                    facultyName: facultyNameStr,
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
                if (idx !== -1) request.facultySnapshot[idx] = snapshotData;
                else request.facultySnapshot.push(snapshotData);
            } else if (request.facultySnapshot) {
                request.facultySnapshot[type._id.toString()] = {
                    facultyId: assignedFacultyId,
                    facultyName: facultyNameStr,
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
                request.markModified('facultySnapshot');
            }
            await request.save({ session });
        }

        if (approval && approval.facultyId) {
          await createNotification({
            user: approval.facultyId,
            userModel: 'Faculty',
            title: 'New Submission',
            message: `${student.name} (${student.rollNo}) has submitted documentation for ${type.name}.`,
            type: 'info',
            link: '/faculty/approvals'
          });
        }
    }

    await commitSafeTransaction(session);

    logger.info('co_curricular_submitted', {
        actor: studentId,
        resource_id: typeId,
        action: 'SUBMIT_CO_CURRICULAR'
    });

    res.status(200).json({
        success: true,
        data: { message: 'Submission successful' }
    });
  } catch (err) {
    await abortSafeTransaction(session);
    next(err);
  } finally {
    session.endSession();
  }
};
