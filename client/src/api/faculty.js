import api from './axiosInstance';
export const getFaculty = (params) => api.get('/faculty', { params });
export const createFaculty = (data) => api.post('/faculty', data);
