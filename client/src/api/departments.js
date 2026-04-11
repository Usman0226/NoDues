import api from './axiosInstance';

export const getDepartments = () => api.get('/departments');
export const createDepartment = (data) => api.post('/departments', data);
export const getDepartment = (id) => api.get(`/departments/${id}`);
export const updateDepartment = (id, data) => api.patch(`/departments/${id}`, data);
