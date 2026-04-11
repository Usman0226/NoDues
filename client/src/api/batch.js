import api from './axiosInstance';
export const getBatch = (id) => api.get(`/batch/${id}`);
export const getBatchStatus = (id) => api.get(`/batch/${id}/status`);
export const createBatch = (data) => api.post('/batch', data);
