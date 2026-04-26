import { Router } from 'express';
import {
  getDepartments,
  createDepartment,
  getDepartmentById,
  updateDepartment,
} from '../Controllers/departmentController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

// All department routes require authentication
router.use(protect);

router
  .route('/')
  .get(RoleGuard(['admin', 'hod', 'ao']),    getDepartments)
  .post(RoleGuard(['admin']),          createDepartment);

router
  .route('/:id')
  .get(RoleGuard(['admin', 'hod', 'ao']),    getDepartmentById)
  .patch(RoleGuard(['admin']),         updateDepartment);

export default router;
