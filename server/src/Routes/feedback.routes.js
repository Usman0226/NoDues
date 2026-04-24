import express from 'express';
import { submitFeedback, getFeedback } from '../Controllers/feedback.controller.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', submitFeedback);
router.get('/', getFeedback);

export default router;
