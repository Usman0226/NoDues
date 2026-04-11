import api from './axiosInstance';

export const login = (data) => api.post('/auth/login', data);
export const studentLogin = (rollNo) => api.post('/auth/student-login', { rollNo });
export const getMe = () => api.get('/auth/me');
export const changePassword = (data) => api.post('/auth/change-password', data);
export const logout = () => api.post('/auth/logout');
