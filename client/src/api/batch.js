import api from './axiosInstance';

export const getBatches = (params) => api.get('/batch', { params });
export const initiateBatch = (data) => api.post('/batch/initiate', data);
export const getBatch = (id) => api.get(`/batch/${id}`);
export const getBatchStudentDetail = (batchId, studentId) => api.get(`/batch/${batchId}/students/${studentId}`);
export const closeBatch = (id) => api.patch(`/batch/${id}/close`);
export const addStudentToBatch = (batchId, data) => api.post(`/batch/${batchId}/students`, data);
export const removeFacultyFromBatch = (batchId, facultyId) => api.delete(`/batch/${batchId}/faculty/${facultyId}`);
