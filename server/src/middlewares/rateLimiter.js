import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';


export const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 500, 
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
  skip: (req) => process.env.NODE_ENV === 'test'
});


export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10, 
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts from this IP, please try again after 15 minutes',
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
  }
});


export const healthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, 
  max: 60,
  standardHeaders: false,
  legacyHeaders: false,
  skipSuccessfulRequests: true 
});
