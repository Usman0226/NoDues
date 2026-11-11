import { Router } from 'express';
import {
  getClasses,
  createClass,
  getClassById,
  updateClass,
  deleteClass,
  activateClass,
  assignClassTeacher,

  addSubjectAssignment,
  updateSubjectAssignment,
  removeSubjectAssignment,
  cloneSubjects,
  getPromotionCandidates,
  promoteStudents,
  getCohortPromotionPreview,
  bulkPromoteClasses,
  autoCreateTargetSections,
  propagateCohortSubjects,
} from '../Controllers/classController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';
import { initiateBatch } from '../Controllers/batchController.js';

const router = Router();

router.use(protect);
router.use(RoleGuard(['admin', 'hod', 'ao']));

// Collection routes
router.route('/')
  .get(getClasses)
  .post(createClass);

// Bulk cohort promotion routes (must precede /:id)
router.get('/cohort-promotion-preview', getCohortPromotionPreview);
router.post('/bulk-promote', bulkPromoteClasses);
router.post('/auto-create-target-sections', autoCreateTargetSections);

// Single class routes
router.route('/:id')
  .get(getClassById)
  .patch(updateClass)
  .delete(deleteClass);

router.post('/:id/activate', activateClass);

// Student promotion routes
router.get('/:id/promotion-candidates', getPromotionCandidates);
router.post('/:id/promote', promoteStudents);


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
router.post('/:id/propagate-cohort-subjects', propagateCohortSubjects);

// Batch initiation bridge
router.post('/:id/initiate-batch', (req, res, next) => {
  req.body.classId = req.params.id; // Inject ID from URL into body as expected by controller
  initiateBatch(req, res, next);
});

export default router;
