import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

/**
 * Extracts and decodes token without verifying signature (for rate limiting extraction only).
 * If valid token exists, returns decoded object, else null.
 */
const getDecodedToken = (req) => {
  const token = req.cookies?.nds_token || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);
  if (!token) return null;
  try {
    return jwt.decode(token);
  } catch (err) {
    return null;
  }
};

const isFacultyOrAdmin = (req) => {
  if (process.env.NODE_ENV === 'test') return true;

  const decoded = getDecodedToken(req);
  if (decoded) {
    const userRoles = decoded.roleTags || (decoded.role ? [decoded.role] : []);
    const exemptedRoles = ['admin', 'faculty', 'hod', 'ao'];
    return exemptedRoles.some(role => userRoles.includes(role));
  }
  return false;
};

/**
 * General API Limiter:
 * College WiFi edge case: Hundreds or thousands of students/devices share a single NAT IP.
 * - For authenticated users: rate limit per user ID (`usr:<userId>`).
 * - For unauthenticated requests: rate limit by IP (`ip:<ip>`).
 * - Window: 2 minutes. Max: 600 req / window (5 req/sec burst capacity per user).
 */
export const apiLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, 
  max: 600, 
  standardHeaders: true, 
  legacyHeaders: false,
  keyGenerator: (req) => {
    // 1. If req.user is already populated by auth middleware
    if (req.user?.userId || req.user?.id) {
      return `usr:${req.user.userId || req.user.id}`;
    }
    // 2. If token is in cookie or Authorization header, decode userId
    const decoded = getDecodedToken(req);
    if (decoded?.userId) {
      return `usr:${decoded.userId}`;
    }
    // 3. Fallback to client IP (handles IPv6 and NAT proxies cleanly)
    return `ip:${ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown')}`;
  },
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests, please slow down and try again shortly.',
      statusCode: 429
    }
  },
  handler: (req, res, next, options) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      method: req.method,
      path: req.path,
      actor: req.user?.id || req.user?.userId || 'anonymous'
    });
    res.status(options.statusCode).send(options.message);
  },
  skip: isFacultyOrAdmin
});


/**
 * Auth Limiter (Login endpoints):
 * Protects against brute-force attacks while preventing NAT IP collateral damage.
 * - Student Login: key by rollNo. Different students on the same WiFi have independent counters!
 * - Faculty / Admin Login: key by email. Different faculty on the same WiFi have independent counters!
 * - Fallback: key by IP.
 * - Window: 2 minutes. Max: 15 attempts.
 */
export const authLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, 
  max: 15, 
  standardHeaders: true, 
  legacyHeaders: false,
  keyGenerator: (req) => {
    // 1. Student login uses rollNo
    const rollNo = req.body?.rollNo ? String(req.body.rollNo).trim().toUpperCase() : null;
    if (rollNo) {
      return `auth_roll:${rollNo}`;
    }
    // 2. Staff/Admin login uses email
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase() : null;
    if (email) {
      return `auth_email:${email}`;
    }
    // 3. Fallback to IP if body credentials are missing
    return `auth_ip:${ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown')}`;
  },
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts for this account, please try again after 2 minutes',
      statusCode: 429
    }
  },
  handler: (req, res, next, options) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      identifier: req.body?.rollNo || req.body?.email || 'N/A',
      method: req.method,
      path: req.path
    });
    res.status(options.statusCode).send(options.message);
  }
});


export const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, 
  max: 30, 
  standardHeaders: true, 
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.userId || req.user?.id) {
      return `import_usr:${req.user.userId || req.user.id}`;
    }
    const decoded = getDecodedToken(req);
    if (decoded?.userId) {
      return `import_usr:${decoded.userId}`;
    }
    return `import_ip:${ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown')}`;
  },
  message: {
    success: false,
    error: {
      code: 'IMPORT_RATE_LIMIT_EXCEEDED',
      message: 'Too many import requests, please try again after an hour',
      statusCode: 429
    }
  },
  handler: (req, res, next, options) => {
    logger.warn('Import rate limit exceeded', {
      ip: req.ip,
      method: req.method,
      path: req.path,
      actor: req.user?.id || req.user?.userId || 'anonymous'
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
