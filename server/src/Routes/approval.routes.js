import { Router } from 'express';
import {
  getPendingApprovals,
  getApprovalHistory,
  approveRequest,
  bulkApproveRequests,
  markDue,
  updateApproval,
} from '../Controllers/approvalController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

router.use(protect);
router.use(RoleGuard(['admin', 'faculty', 'hod'])); // admin can view, faculty and hod can action approvals

router.get('/pending',  getPendingApprovals);
router.get('/history',  getApprovalHistory);
router.post('/approve', approveRequest);
router.post('/bulk-approve', bulkApproveRequests);
router.post('/mark-due', markDue);
router.patch('/:approvalId', updateApproval);

export default router;
