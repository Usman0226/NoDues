import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

const isFacultyOrAdmin = (req) => {
  if (process.env.NODE_ENV === 'test') return true;

  const token = req.cookies?.nds_token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

  if (token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded) return false;

      const userRoles = decoded.roleTags || (decoded.role ? [decoded.role] : []);
      const exemptedRoles = ['admin', 'faculty', 'hod', 'ao'];
      
      return exemptedRoles.some(role => userRoles.includes(role));
    } catch (err) {
      return false;
    }
  }
  return false;
};

export const apiLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, 
  max: 1000, 
  standardHeaders: true, 
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP, please try again after 15 minutes',
      statusCode: 429
    }
  },
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      method: req.method,
      path: req.path,
      actor: req.user?.id || 'anonymous'
    });
    res.status(options.statusCode).send(options.message);
  },
  skip: isFacultyOrAdmin
});


export const authLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, 
  max: 10, 
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts from this IP, please try again after 2 minutes',
      statusCode: 429
    }
  },
  handler: (req, res, next, options) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      method: req.method,
      path: req.path
    });
    res.status(options.statusCode).send(options.message);
  }
});

/**
 * Rate limiter for heavy import operations
 */
export const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // Limit each IP to 30 import-related requests per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'IMPORT_RATE_LIMIT_EXCEEDED',
      message: 'Too many import requests from this IP, please try again after an hour',
      statusCode: 429
    }
  },
  handler: (req, res, next, options) => {
    logger.warn('Import rate limit exceeded', {
      ip: req.ip,
      method: req.method,
      path: req.path,
      actor: req.user?.id || 'anonymous'
    });
    res.status(options.statusCode).send(options.message);
  },
  skip: isFacultyOrAdmin
});


export const healthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 60,
  standardHeaders: false,
  legacyHeaders: false,
  skipSuccessfulRequests: true 
});
