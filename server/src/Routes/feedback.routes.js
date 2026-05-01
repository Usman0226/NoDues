import express from 'express';
import { submitFeedback, getFeedback, updateFeedback, deleteFeedback } from '../Controllers/feedback.controller.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = express.Router();

router.use(protect);

router.post('/', submitFeedback);
router.get('/', RoleGuard(['admin']), getFeedback);
router.patch('/:id', RoleGuard(['admin']), updateFeedback);
router.delete('/:id', RoleGuard(['admin']), deleteFeedback);

export default router;
