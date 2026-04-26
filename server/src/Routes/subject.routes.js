import { Router } from 'express';
import {
  getSubjects,
  createSubject,
  getSubjectById,
  updateSubject,
  deleteSubject,
  bulkDeleteSubjects,
} from '../Controllers/subjectController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

router.use(protect);
router.use(RoleGuard(['admin', 'hod', 'ao']));

router.route('/')
  .get(getSubjects)
  .post(createSubject);

router.route('/:id')
  .get(getSubjectById)
  .patch(updateSubject)
  .delete(deleteSubject);

router.post('/bulk-delete', bulkDeleteSubjects);

export default router;
