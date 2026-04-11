import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';
import ErrorResponse from '../utils/errorResponse.js';

export const protect = async (req, res, next) => {
  const token = req.cookies?.nds_token;

  if (!token) {
    return next(
      new ErrorResponse('Not authorized, please log in', 401, 'AUTH_REQUIRED')
    );
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    // Force password-change guard — skip for students and specific auth routes
    if (
      decoded.mustChangePassword &&
      req.user.role !== 'student' &&
      !req.path.endsWith('/change-password') &&
      !req.path.endsWith('/me') &&
      !req.path.endsWith('/logout')
    ) {
      return next(
        new ErrorResponse(
          'Password change required before accessing this resource',
          403,
          'AUTH_PASSWORD_CHANGE_REQUIRED'
        )
      );
    }

    next();
  } catch (err) {
    logger.warn('JWT verification failed', {
      timestamp: new Date().toISOString(),
      actor: 'anonymous',
      action: `${req.method}:${req.path}`,
      resource_id: null,
      error: err.message,
    });

    if (err.name === 'TokenExpiredError') {
      return next(
        new ErrorResponse('Session expired, please log in again', 401, 'AUTH_TOKEN_EXPIRED')
      );
    }

    return next(
      new ErrorResponse('Invalid token, please log in again', 401, 'AUTH_TOKEN_INVALID')
    );
  }
};
