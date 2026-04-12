import { Router } from 'express';
import { sseConnect } from '../Controllers/sseController.js';
import { protect } from '../middlewares/auth.js';

const router = Router();

router.get('/connect', protect, sseConnect);
router.get('/batch/:id', protect, sseConnect);
router.get('/department/:id', protect, sseConnect);

export default router;
