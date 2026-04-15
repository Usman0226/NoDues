import api from './axiosInstance';

export const getStudentStatus = (requestId) => 
  requestId ? api.get(`/student/status/${requestId}`) : api.get('/student/status');
export const getStudentHistory = () => api.get('/student/history');
