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

// POST /api/auth/student-login — Student (roll number only)
router.post('/student-login', studentLogin);

// ── Authenticated ─────────────────────────────────────────────────────────────
// POST /api/auth/change-password — non-student only
router.post(
  '/change-password',
  protect,
  RoleGuard(['admin', 'faculty', 'hod']),
  changePassword
);

// POST /api/auth/logout — any authenticated user
router.post('/logout', protect, logout);

// GET  /api/auth/me  — any authenticated user
router.get('/me', protect, getMe);

// ── Email Diagnostics (Admin Only) ──────────────────────────────────────────
router.get('/diag/status', protect, RoleGuard(['admin']), getEmailStats);
router.get('/diag/logs', protect, RoleGuard(['admin']), getEmailLogs);
router.post('/diag/test', protect, RoleGuard(['admin']), runEmailDiag);

export default router;
