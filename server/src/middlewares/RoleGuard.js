import ErrorResponse from '../utils/errorResponse.js';


export const RoleGuard = (roles) => (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Authentication required', 401, 'AUTH_REQUIRED'));
  }

  if (!roles.includes(req.user.role)) {
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


export const DepartmentGuard = (req, res, next) => {
  if (req.user.role === 'admin') return next();

  const targetDept =
    req.params.departmentId ||
    req.query.departmentId;

  if (
    req.user.role === 'hod' &&
    targetDept &&
    targetDept !== req.user.departmentId?.toString()
  ) {
    return next(
      new ErrorResponse(
        'Access denied: you can only manage your own department',
        403,
        'AUTH_DEPARTMENT_SCOPE'
      )
    );
  }

  next();
};