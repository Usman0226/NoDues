/**
 * wizardController.js — Controller endpoints for Setup Wizard
 * TRD Reference: TRD §3.5 (FR-E1 to FR-E4), TRD §5 Phase 5 (Steps 5.1 – 5.6)
 */

import {
  getWizardProgress,
  saveWizardProgress,
  validatePreflightChecklist,
} from '../services/wizardService.js';
import ErrorResponse from '../utils/errorResponse.js';

/**
 * GET /api/wizard/classes/:classId/progress
 */
export async function getProgress(req, res, next) {
  try {
    const { classId } = req.params;
    const progress = await getWizardProgress(classId);

    res.status(200).json({
      success: true,
      data: progress,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/wizard/classes/:classId/progress
 */
export async function updateProgress(req, res, next) {
  try {
    const { classId } = req.params;
    const { step, markCompleted, data } = req.body;

    if (!step) {
      return next(new ErrorResponse('Step is required', 400, 'VALIDATION_ERROR'));
    }

    const updated = await saveWizardProgress(classId, {
      step,
      markCompleted,
      data,
    });

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/wizard/classes/:classId/preflight
 */
export async function getPreflight(req, res, next) {
  try {
    const { classId } = req.params;
    const preflight = await validatePreflightChecklist(classId);

    res.status(200).json({
      success: true,
      data: preflight,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/wizard/classes/:classId/initiate
 * Requirement: FR-E2 (wizard gate before batch initiation)
 */
export async function initiateWizardBatch(req, res, next) {
  try {
    const { classId } = req.params;
    const preflight = await validatePreflightChecklist(classId);

    if (!preflight.readyForInitiation) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'PREFLIGHT_FAILED',
          message: 'Cannot initiate batch: one or more pre-flight checklist items failed.',
          details: preflight.checks,
        },
      });
    }

    // Mark preflight and initiation steps completed in wizard
    await saveWizardProgress(classId, {
      step: 'initiation',
      markCompleted: true,
      data: { initiatedAt: new Date() },
    });

    res.status(200).json({
      success: true,
      message: 'Pre-flight passed. Wizard ready for batch initiation.',
      data: {
        classId,
        readyForInitiation: true,
        preflight,
      },
    });
  } catch (err) {
    next(err);
  }
}
