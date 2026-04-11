import api from './axiosInstance';
export const getApprovals = (params) => api.get('/approvals', { params });
export const approve = (id) => api.post(`/approvals/${id}/approve`);
export const reject = (id) => api.post(`/approvals/${id}/reject`);
export const markDue = (id, data) => api.post(`/approvals/${id}/due`, data);
