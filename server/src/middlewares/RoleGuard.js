import ErrorResponse from '../utils/errorResponse.js';
import NodueBatch from '../models/NodueBatch.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';


export const RoleGuard = (roles) => (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Authentication required', 401, 'AUTH_REQUIRED'));
  }

  // Support both single role and roleTags array
  const userRoles = req.user.roleTags || [req.user.role];
  const hasAccess = roles.some(role => userRoles.includes(role));

  if (!hasAccess) {
    return next(
      new ErrorResponse(
        `Role '${req.user.role}' is not authorized to access this resource`,
        403,
        'AUTH_FORBIDDEN'
      )
    );
  }

  next();
};


export const DepartmentGuard = async (req, res, next) => {
  try {
    if (req.user.role === 'admin') return next();

    const { departmentId, batchId, classId, studentId } = { ...req.params, ...req.query };
    const userDeptId = req.user.departmentId?.toString();

    if (req.user.role === 'hod' || req.user.role === 'ao') {
      // 1. Explicit Department Check
      if (departmentId && departmentId !== userDeptId) {
        return next(new ErrorResponse('Access denied: Unauthorized department context', 403, 'AUTH_DEPARTMENT_SCOPE'));
      }

      // 2. Batch Ownership Check
      if (batchId) {
        const batch = await NodueBatch.findById(batchId).select('departmentId').lean();
        if (batch && batch.departmentId?.toString() !== userDeptId) {
          return next(new ErrorResponse('Access denied: Unauthorized batch access', 403, 'AUTH_DEPARTMENT_SCOPE'));
        }
      }

      // 3. Class Ownership Check
      if (classId) {
        const cls = await Class.findById(classId).select('departmentId').lean();
        if (cls && cls.departmentId?.toString() !== userDeptId) {
          return next(new ErrorResponse('Access denied: Unauthorized class access', 403, 'AUTH_DEPARTMENT_SCOPE'));
        }
      }

      // 4. Student Ownership Check
      if (studentId) {
        const student = await Student.findById(studentId).select('departmentId').lean();
        if (student && student.departmentId?.toString() !== userDeptId) {
          return next(new ErrorResponse('Access denied: Unauthorized student access', 403, 'AUTH_DEPARTMENT_SCOPE'));
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};