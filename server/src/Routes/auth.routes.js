import { Router } from 'express';
import {
  login,
  studentLogin,
  changePassword,
  logout,
  getMe,
  getEmailStats,
  getEmailLogs,
  runEmailDiag,
  forgotPassword,
} from '../Controllers/authController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

import { authLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

router.post('/login', authLimiter, login);

router.post('/student-login', authLimiter, studentLogin);
router.post('/forgot-password', authLimiter, forgotPassword);

router.post(
  '/change-password',
  protect,
  RoleGuard(['admin', 'faculty', 'hod', 'ao']),
  changePassword
);

router.post('/logout', protect, logout);

router.get('/me', protect, getMe);
router.get('/diag/status', protect, RoleGuard(['admin']), getEmailStats);
router.get('/diag/logs', protect, RoleGuard(['admin']), getEmailLogs);
router.post('/diag/test', protect, RoleGuard(['admin']), runEmailDiag);

export default router;
