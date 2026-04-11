import api from './axiosInstance';

export const getStudentStatus = () => api.get('/student/status');
export const getStudentHistory = () => api.get('/student/history');
