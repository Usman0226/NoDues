import api from './axiosInstance';
export const login = (data) => api.post('/auth/login', data);
export const changePassword = (data) => api.post('/auth/change-password', data);
