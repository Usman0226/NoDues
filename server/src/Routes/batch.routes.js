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
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

router.use(protect);
router.use(RoleGuard(['admin', 'hod']));

router.route('/').get(getBatches);
router.post('/initiate', initiateBatch);
router.get('/initiate-preview', getInitiationPreview);
router.post('/initiate-department', initiateDepartmentWide);
router.post('/bulk-close', bulkCloseBatches);

router.route('/:batchId').get(getBatchStatus);
router.patch('/:batchId/close', closeBatch);
router.post('/:batchId/students', addStudentToBatch);
router.get('/:batchId/students/:studentId', getBatchStudentDetail);
router.delete('/:batchId/faculty/:facultyId', removeFacultyFromBatch);

export default router;
