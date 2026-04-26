import { Router } from 'express';
import {
  getBatches,
  initiateBatch,
  initiateDepartmentWide,
  getBatchStatus,
  getBatchStudentDetail,
  closeBatch,
  addStudentToBatch,
  removeFacultyFromBatch,
  bulkCloseBatches,
  getInitiationPreview
} from '../Controllers/batchController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard, DepartmentGuard } from '../middlewares/RoleGuard.js';
import { validate, Schemas } from '../utils/validation.js';

const router = Router();

router.use(protect);
router.use(RoleGuard(['admin', 'hod', 'ao']));
router.use(DepartmentGuard);

router.route('/').get(getBatches);
router.post('/initiate', validate(Schemas.Batch.Initiate), initiateBatch);
router.get('/initiate-preview', getInitiationPreview);
router.post('/initiate-department', validate(Schemas.Batch.InitiateDept), initiateDepartmentWide);
router.post('/bulk-close', validate(Schemas.Batch.BulkClose), bulkCloseBatches);

router.route('/:batchId').get(getBatchStatus);
router.patch('/:batchId/close', closeBatch);
router.post('/:batchId/students', validate(Schemas.Batch.AddStudent), addStudentToBatch);
router.get('/:batchId/students/:studentId', getBatchStudentDetail);
router.delete('/:batchId/faculty/:facultyId', removeFacultyFromBatch);

export default router;
