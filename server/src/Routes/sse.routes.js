import { Router } from 'express';
import { sseConnect } from '../Controllers/sseController.js';
import { protect } from '../middlewares/auth.js';

const router = Router();

// Main SSE connection point
router.get('/connect', protect, sseConnect);

// Context-aware connections (logged for debugging, but use same logic)
router.get('/batch/:id', protect, sseConnect);
router.get('/department/:id', protect, sseConnect);

export default router;
