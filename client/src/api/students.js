import api from './axiosInstance';
export const getStudents = (params) => api.get('/students', { params });
export const createStudent = (data) => api.post('/students', data);
