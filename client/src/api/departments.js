import api from './axiosInstance';
export const getDepartments = () => api.get('/departments');
export const createDepartment = (data) => api.post('/departments', data);
export const getDepartment = (id) => api.get(`/departments/${id}`);
