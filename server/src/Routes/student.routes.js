import { Router } from 'express';
import {
  getStudents,
  createStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
  assignMentor,
  addElective,
  updateElective,
  removeElective,
  bulkDeactivateStudents,
  bulkActivateStudents,
  bulkAssignMentor,
  activateStudent,
} from '../Controllers/studentController.js';

import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

router.use(protect);
router.use(RoleGuard(['admin', 'hod', 'ao']));

router.route('/')
  .get(getStudents)
  .post(createStudent);

router.route('/:id')
  .get(getStudentById)
  .patch(updateStudent)
  .delete(deleteStudent);

router.patch('/:id/mentor', assignMentor);

router.route('/:id/electives')
  .post(addElective);

router.route('/:id/electives/:assignmentId')
  .patch(updateElective)
  .delete(removeElective);

router.post('/:id/activate', activateStudent);

router.post('/bulk-deactivate', bulkDeactivateStudents);
router.post('/bulk-activate', bulkActivateStudents);
router.post('/bulk-assign-mentor', bulkAssignMentor);

export default router;

