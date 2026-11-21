import { Router } from 'express';
import {
  getFaculty,
  createFaculty,
  getFacultyById,
  updateFaculty,
  deleteFaculty,
  getFacultyClasses,
  getFacultyClassStudents,
  getFacultyBatches,
  getFacultyMentees,
  getMenteeClearance,
  resendCredentials,
  bulkDeactivateFaculty,
  bulkResendCredentials,
  bulkUpdateRoles,
  activateFaculty,
  bulkActivateFaculty,
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
router.get('/me/classes/:classId/students', asyncHandler(getFacultyClassStudents));
router.get('/me/batches', asyncHandler(getFacultyBatches));
router.get('/me/mentees', asyncHandler(getFacultyMentees));
router.get('/me/mentees/:studentId/clearance', asyncHandler(getMenteeClearance));

router.use(RoleGuard(['admin', 'hod', 'ao', 'faculty']));

router.get('/', asyncHandler(getFaculty));
router.get('/:id', asyncHandler(getFacultyById));
router.get('/:id/classes', asyncHandler(getFacultyClasses));

router.use(RoleGuard(['admin', 'hod', 'ao']));

router.post('/', asyncHandler(createFaculty));

router.route('/:id')
  .patch(asyncHandler(updateFaculty))
  .delete(asyncHandler(deleteFaculty));

router.post('/:id/resend-creds', asyncHandler(resendCredentials));
router.post('/:id/activate', asyncHandler(activateFaculty));

router.post('/bulk-deactivate', asyncHandler(bulkDeactivateFaculty));
router.post('/bulk-activate', asyncHandler(bulkActivateFaculty));
router.post('/bulk-resend-creds', asyncHandler(bulkResendCredentials));
router.post('/bulk-update-roles', asyncHandler(bulkUpdateRoles));


export default router;
