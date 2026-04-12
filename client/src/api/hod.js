import api from './axiosInstance';

export const getHodOverview = () => api.get('/hod/overview');
export const getHodDues = (params) => api.get('/hod/dues', { params });
export const overrideDue = (data) => api.post('/hod/override', data);
export const getHodActivity = () => api.get('/hod/activity');
