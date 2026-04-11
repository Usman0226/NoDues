import api from './axiosInstance';
export const getClasses = (params) => api.get('/classes', { params });
export const getClass = (id) => api.get(`/classes/${id}`);
export const createClass = (data) => api.post('/classes', data);
