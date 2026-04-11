import { Router } from 'express';
import {
  getClasses,
  createClass,
  getClassById,
  updateClass,
  deleteClass,
  assignClassTeacher,
  addSubjectAssignment,
  updateSubjectAssignment,
  removeSubjectAssignment,
  cloneSubjects,
} from '../Controllers/classController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

router.use(protect);
router.use(RoleGuard(['admin', 'hod']));

// Collection routes
router.route('/')
  .get(getClasses)
  .post(createClass);

// Single class routes
router.route('/:id')
  .get(getClassById)
  .patch(updateClass)
  .delete(deleteClass);

// Class teacher assignment
router.patch('/:id/class-teacher', assignClassTeacher);

// Subject assignments
router.route('/:id/subjects')
  .post(addSubjectAssignment);

router.route('/:id/subjects/:assignmentId')
  .patch(updateSubjectAssignment)
  .delete(removeSubjectAssignment);

// Clone subjects
router.post('/:id/clone-subjects', cloneSubjects);

export default router;
