/**
 * wizard.js — Setup Wizard API Client
 * TRD Reference: TRD §3.5 (FR-E1 to FR-E4), TRD §5 Phase 5, FR-F3 to FR-F5
 */

import api from './axiosInstance';

/**
 * Check feature flag status for setup wizard
 * @returns {Promise<{ success: boolean, data: { enabled: boolean, flagName: string } }>}
 */
export const getWizardStatus = () => api.get('/wizard/status');

/**
 * Retrieve saved wizard progress for a class
 * @param {string} classId
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const getWizardProgress = (classId) => api.get(`/wizard/classes/${classId}/progress`);

/**
 * Update wizard progress for a class
 * @param {string} classId
 * @param {{ step: string, markCompleted?: boolean, data?: any }} payload
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const updateWizardProgress = (classId, payload) => api.put(`/wizard/classes/${classId}/progress`, payload);

/**
 * Bulk-update wizard progress across multiple provisioned classes
 * @param {{ classIds: string[], step: string, markCompleted?: boolean, data?: any }} payload
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const bulkUpdateWizardProgress = (payload) => api.put('/wizard/classes/bulk-progress', payload);

/**
 * Retrieve pre-flight validation checklist for a class
 * @param {string} classId
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const getPreflightChecklist = (classId) => api.get(`/wizard/classes/${classId}/preflight`);

/**
 * Initiate batch through the wizard pre-flight gate
 * @param {string} classId
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const initiateWizardBatch = (classId) => api.post(`/wizard/classes/${classId}/initiate`);

/**
 * Inspect timetable PDF to discover page count, headers, and section matches
 * @param {FormData} formData
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const inspectTimetablePdf = (formData) =>
  api.post('/timetable/inspect', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

/**
 * Upload timetable PDF to generate text-layer extracted preview
 * @param {FormData} formData
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const previewTimetable = (formData) =>
  api.post('/timetable/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

/**
 * Batch provisions all detected sections from a multi-page timetable PDF
 * @param {FormData} formData
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const batchImportTimetable = (formData) =>
  api.post('/timetable/batch-import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

/**
 * Commit reviewed timetable rows into class semester subjects
 * @param {Object} payload
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const commitTimetable = (payload) => api.post('/timetable/commit', payload);

/**
 * Bulk-commit reviewed and unvisited sections from an institutional timetable PDF
 * @param {FormData|Object} payload
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const bulkCommitTimetable = (payload) =>
  api.post(
    '/timetable/bulk-commit',
    payload,
    payload instanceof FormData
      ? { headers: { 'Content-Type': 'multipart/form-data' } }
      : undefined
  );

/**
 * Clone subject structure from an existing class
 * @param {string} classId
 * @param {string} sourceClassId
 * @returns {Promise<{ success: boolean, data: any }>}
 */
export const cloneClassSubjects = (classId, sourceClassId) =>
  api.post(`/classes/${classId}/clone-subjects`, { sourceClassId });

