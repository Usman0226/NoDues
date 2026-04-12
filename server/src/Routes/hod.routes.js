import { Router } from 'express';
import { getOverview, getDues, overrideDues, bulkOverrideDues } from '../Controllers/hodController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';

const router = Router();

router.use(protect);
router.use(RoleGuard(['hod']));

router.get('/overview', getOverview);
router.get('/dues',     getDues);
router.post('/override', overrideDues);
router.post('/bulk-override', bulkOverrideDues);

export default router;
