import express from 'express';
import { submitFeedback } from '../Controllers/feedback.controller.js';
import { protect } from '../middlewares/auth.js';

const router = express.Router();

router.use(protect);

router.post('/', submitFeedback);

export default router;
