import { Router } from 'express';
import { getStudentStatus, getStudentHistory } from '../Controllers/studentPortalController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

router.use(protect);
router.use(RoleGuard(['student']));

router.get('/status',  getStudentStatus);
router.get('/history', getStudentHistory);

export default router;
