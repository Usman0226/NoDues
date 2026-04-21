import { Router } from 'express';
import {
  getFaculty,
  createFaculty,
  getFacultyById,
  updateFaculty,
  deleteFaculty,
  getFacultyClasses,
  resendCredentials,
  bulkDeactivateFaculty,
  bulkResendCredentials,
  bulkUpdateRoles,
} from '../Controllers/facultyController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

router.use(protect);
router.get('/me/classes', (req, res, next) => {
  req.params.id = req.user.userId;
  next();
}, asyncHandler(getFacultyClasses));

router.use(RoleGuard(['admin', 'hod']));

router.route('/')
  .get(asyncHandler(getFaculty))
  .post(asyncHandler(createFaculty));

router.route('/:id')
  .get(asyncHandler(getFacultyById))
  .patch(asyncHandler(updateFaculty))
  .delete(asyncHandler(deleteFaculty));

router.get('/:id/classes', asyncHandler(getFacultyClasses));
router.post('/:id/resend-creds', asyncHandler(resendCredentials));

router.post('/bulk-deactivate', asyncHandler(bulkDeactivateFaculty));
router.post('/bulk-resend-creds', asyncHandler(bulkResendCredentials));
router.post('/bulk-update-roles', asyncHandler(bulkUpdateRoles));

export default router;
