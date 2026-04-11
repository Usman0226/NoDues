import api from './axiosInstance';
export const getSubjects = (params) => api.get('/subjects', { params });
export const createSubject = (data) => api.post('/subjects', data);
