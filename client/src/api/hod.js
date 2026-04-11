import api from './axiosInstance';
export const getDues = (params) => api.get('/hod/dues', { params });
export const overrideDue = (id) => api.post(`/hod/override/${id}`);
