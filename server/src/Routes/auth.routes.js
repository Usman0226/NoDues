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
} from '../Controllers/authController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

router.post('/login', login);

router.post('/student-login', studentLogin);

router.post(
  '/change-password',
  protect,
  RoleGuard(['admin', 'faculty', 'hod']),
  changePassword
);

router.post('/logout', protect, logout);

router.get('/me', protect, getMe);
router.get('/diag/status', protect, RoleGuard(['admin']), getEmailStats);
router.get('/diag/logs', protect, RoleGuard(['admin']), getEmailLogs);
router.post('/diag/test', protect, RoleGuard(['admin']), runEmailDiag);

export default router;
