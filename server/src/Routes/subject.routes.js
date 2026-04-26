import { Router } from 'express';
import {
  getSubjects,
  createSubject,
  getSubjectById,
  updateSubject,
  deleteSubject,
  activateSubject,
  bulkDeleteSubjects,
  bulkActivateSubjects,
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

router.post('/:id/activate', activateSubject);

router.post('/bulk-delete', bulkDeleteSubjects);
router.post('/bulk-activate', bulkActivateSubjects);


export default router;
