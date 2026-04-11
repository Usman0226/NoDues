import api from './axiosInstance';

export const getHodOverview = () => api.get('/hod/overview');
export const getHodDues = () => api.get('/hod/dues');
export const overrideDue = (data) => api.post('/hod/override', data);
