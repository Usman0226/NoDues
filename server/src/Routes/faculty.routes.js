import { Router } from 'express';
import {
  getFaculty,
  createFaculty,
  getFacultyById,
  updateFaculty,
  deleteFaculty,
  getFacultyClasses,
  resendCredentials,
} from '../Controllers/facultyController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

router.use(protect);
router.get('/me/classes', (req, res, next) => {
  req.params.id = req.user.userId;
  next();
}, getFacultyClasses);

router.use(RoleGuard(['admin', 'hod']));

router.route('/')
  .get(getFaculty)
  .post(createFaculty);

router.route('/:id')
  .get(getFacultyById)
  .patch(updateFaculty)
  .delete(deleteFaculty);

router.get('/:id/classes', getFacultyClasses);
router.post('/:id/resend-creds', resendCredentials);

export default router;
