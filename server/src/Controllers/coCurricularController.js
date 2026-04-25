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
    const { name, code, departmentId: bodyDeptId, applicableYears, coordinatorId, fields, isOptional, requiresMentorApproval } = req.body;

    // Determine target departmentId
    let departmentId = bodyDeptId;
    if (req.user.role === 'hod') {
      departmentId = req.user.departmentId;
    }

    if (!name || !code || !departmentId || !applicableYears?.length) {
      return next(new ErrorResponse('Required fields missing', 400));
    }

    if (!requiresMentorApproval && !coordinatorId) {
      return next(new ErrorResponse('Either a Coordinator must be selected or Mentor Approval must be required', 400));
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
    const { name, code, applicableYears, coordinatorId, fields, isOptional, requiresMentorApproval } = req.body;
    
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
        requiresMentorApproval 
      }).filter(([, v]) => v !== undefined)
    );

    if (requiresMentorApproval && !coordinatorId) {
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
    const { mode = 'per_mentor', facultyId: overrideFacultyId } = req.body;

    if (!['per_mentor', 'single_faculty'].includes(mode)) {
      return next(new ErrorResponse('mode must be per_mentor or single_faculty', 400));
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
    }).select('_id').lean();

    if (!classes.length) {
      return res.status(200).json({
        success: true,
        data: { created: 0, skipped: 0, skippedNoRequest: 0, message: 'No matching classes found' },
      });
    }

    const classIds = classes.map((c) => c._id);

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

    for (const student of students) {
      let assignedFacultyId;
      if (mode === 'single_faculty') {
        assignedFacultyId = overrideFaculty._id;
      } else {
        if (!student.mentorId) {
          skipped++;
          logger.warn('co_curricular_mentor_assign_skip_no_mentor', {
            studentId: student._id.toString(),
            typeId: id,
          });
          continue;
        }
        assignedFacultyId = student.mentorId;
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
        subjectName:  mode === 'single_faculty'
          ? `Coordinator Clearance – ${type.name}`
          : `Mentor Clearance – ${type.name}`,
        approvalType: mode === 'single_faculty' ? 'coCurricular' : 'mentor',
        roleTag:      mode === 'single_faculty' ? 'coordinator' : 'mentor',
        itemTypeId:   type._id,
        itemTypeName: type.name,
        itemCode:     type.code,
        isOptional:   type.isOptional,
        action:       'pending',
      });
    }

    let created = 0;
    if (approvalDocs.length) {
      const result = await NodueApproval.insertMany(approvalDocs, { ordered: false }).catch((err) => {
        if (err.code === 11000 || err.writeErrors) {
          return { insertedCount: err.insertedDocs?.length ?? 0 };
        }
        throw err;
      });
      created = result.insertedCount ?? approvalDocs.length;
    }

    logger.audit('CO_CURRICULAR_ASSIGNED', {
      actor: req.user.userId,
      resource_id: id,
      timestamp: new Date().toISOString(),
      details: { mode, overrideFacultyId: overrideFaculty?._id ?? null, created, skipped, skippedNoRequest },
    });

    const modeLabel = mode === 'single_faculty'
      ? `single faculty (${overrideFaculty.name})`
      : `each student\'s own mentor`;

    return res.status(200).json({
      success: true,
      data: {
        mode,
        created,
        skipped,
        skippedNoRequest,
        assignedTo: mode === 'single_faculty'
          ? { _id: overrideFaculty._id, name: overrideFaculty.name }
          : null,
        message: `Done (${modeLabel}). ${created} approval(s) created. ${skipped} skipped (no mentor). ${skippedNoRequest} skipped (no active request).`,
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
        let assignedFacultyId = isMentorMode ? student.mentorId : type.coordinatorId;
        
        let facultyNameStr = isMentorMode ? "Student's Mentor" : (faculty?.name || 'Department Faculty');

        // Fallback
        if (isMentorMode && !assignedFacultyId && type.coordinatorId) {
            assignedFacultyId = type.coordinatorId;
            facultyNameStr = faculty?.name || 'Department Faculty';
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
                roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
                approvalType: isMentorMode ? 'mentor' : 'coCurricular',
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
                    roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
                    approvalType: isMentorMode ? 'mentor' : 'coCurricular',
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
                    roleTag: isMentorMode ? 'coCurricular_mentor' : 'coCurricular_coordinator',
                    approvalType: isMentorMode ? 'mentor' : 'coCurricular',
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
