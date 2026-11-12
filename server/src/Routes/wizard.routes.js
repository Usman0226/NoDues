/**
 * wizard.routes.js — Setup Wizard Routes
 * TRD Reference: TRD §3.5 (FR-E1 to FR-E4), TRD §5 Phase 5, FR-F3 to FR-F5
 */

import { Router } from 'express';
import {
  getProgress,
  updateProgress,
  updateBulkProgress,
  getPreflight,
  initiateWizardBatch,
} from '../Controllers/wizardController.js';
import { protect } from '../middlewares/auth.js';
import { RoleGuard } from '../middlewares/RoleGuard.js';
import { isFeatureEnabled, requireFeature } from '../utils/featureFlags.js';

const router = Router();

// 1. Authentication & Role Authorization (Admin and HoD per TRD / features guide)
router.use(protect);
router.use(RoleGuard(['admin', 'hod']));

// Feature flag status check for client UI
router.get('/status', async (_req, res) => {
  const enabled = await isFeatureEnabled('setup_wizard_enabled');
  res.status(200).json({
    success: true,
    data: {
      enabled,
      flagName: 'setup_wizard_enabled',
    },
  });
});

// 2. Feature Flag Gate (FR-F3 to FR-F5): Returns 404 FEAT_001 if flag disabled
router.use(requireFeature('setup_wizard_enabled'));

// Wizard step progress endpoints (FR-E1, FR-E3)
router.put('/classes/bulk-progress', updateBulkProgress);
router.get('/classes/:classId/progress', getProgress);
router.put('/classes/:classId/progress', updateProgress);

// Pre-flight checklist endpoint (FR-E2)
router.get('/classes/:classId/preflight', getPreflight);

// Wizard-gated batch initiation (FR-E2)
router.post('/classes/:classId/initiate', initiateWizardBatch);

export default router;
