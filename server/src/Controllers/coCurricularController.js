import mongoose from 'mongoose';
import CoCurricularType from '../models/CoCurricularType.js';
import Faculty from '../models/Faculty.js';
import Student from '../models/Student.js';
import NodueApproval from '../models/NodueApproval.js';
import ErrorResponse from '../utils/errorResponse.js';
import logger from '../utils/logger.js';
import { invalidateEntityCache } from '../utils/cacheHooks.js';
import { startSafeTransaction, commitSafeTransaction, abortSafeTransaction } from '../utils/safeTransaction.js';

// ── GET /api/co-curricular-types ──────────────────────────────────────────────
export const getCoCurricularTypes = async (req, res, next) => {
  try {
    const { departmentId } = req.query;
    const query = { isActive: { $ne: false } };


    if (req.user.role === 'hod') {
      query.departmentId = req.user.departmentId;
    } else if (departmentId) {
      query.departmentId = departmentId;
    }

    const types = await CoCurricularType.find(query)
      .populate('coordinatorId', 'name employeeId')
      .populate('departmentId', 'name')
      .lean();

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
    const { name, code, departmentId: bodyDeptId, applicableYears, coordinatorId, fields, isOptional } = req.body;

    // Determine target departmentId
    let departmentId = bodyDeptId;
    if (req.user.role === 'hod') {
      departmentId = req.user.departmentId;
    }

    if (!name || !code || !departmentId || !coordinatorId || !applicableYears?.length) {
      return next(new ErrorResponse('Required fields missing', 400));
    }

    // HoD Scope Check ( redundant if we infer, but kept for explicit validation if admin sends a different deptId)
    if (req.user.role === 'hod' && departmentId.toString() !== req.user.departmentId.toString()) {
      return next(new ErrorResponse('Access denied: You can only create items for your own department', 403));
    }

    // Verify Coordinator belongs to Department
    const faculty = await Faculty.findOne({ _id: coordinatorId, departmentId, isActive: true }).lean();
    if (!faculty) {
      return next(new ErrorResponse('Invalid coordinator: Faculty member does not belong to the specified department or is inactive', 400));
    }

    const type = await CoCurricularType.create({
      name,
      code,
      departmentId,
      applicableYears,
      coordinatorId,
      fields: fields || [],
      isOptional: isOptional || false,
    });

    // Add coordinator roleTag if not present
    if (!faculty.roleTags.includes('coordinator')) {
      await Faculty.findByIdAndUpdate(coordinatorId, { $addToSet: { roleTags: 'coordinator' } });
    }

    logger.audit('CO_CURRICULAR_TYPE_CREATED', {
      actor: req.user.userId,
      resource_id: type._id.toString(),
      details: { name, code }
    });

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
    const updates = req.body;

    const type = await CoCurricularType.findById(id);
    if (!type) return next(new ErrorResponse('Item type not found', 404));

    // HoD Scope Check
    if (req.user.role === 'hod' && type.departmentId.toString() !== req.user.departmentId.toString()) {
      return next(new ErrorResponse('Access denied: You cannot manage co-curricular types of other departments', 403));
    }

    // If changing coordinator, handle roleTags
    if (updates.coordinatorId && updates.coordinatorId !== type.coordinatorId.toString()) {
      const newFaculty = await Faculty.findOne({ _id: updates.coordinatorId, departmentId: type.departmentId.toString(), isActive: true }).lean();
      if (!newFaculty) return next(new ErrorResponse('Invalid coordinator: Faculty must belong to same department and be active', 400));
      
      await Faculty.findByIdAndUpdate(updates.coordinatorId, { $addToSet: { roleTags: 'coordinator' } });
    }

    const updatedType = await CoCurricularType.findByIdAndUpdate(id, updates, { new: true, runValidators: true });

    logger.audit('CO_CURRICULAR_TYPE_UPDATED', {
      actor: req.user.userId,
      resource_id: id,
      details: updates
    });

    res.status(200).json({
      success: true,
      data: updatedType,
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

    logger.audit('CO_CURRICULAR_TYPE_DEACTIVATED', {
      actor: req.user.userId,
      resource_id: id
    });

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
        await NodueApproval.findOneAndUpdate(
            { 
                batchId: activeBatch._id, 
                studentId: student._id, 
                itemTypeId: type._id 
            },
            { action: 'pending', actionedAt: null, remarks: null },
            { session }
        );
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
