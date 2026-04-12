import api from './axiosInstance';

export const getFaculty = (params) => api.get('/faculty', { params });
export const createFaculty = (data) => api.post('/faculty', data);
export const getFacultyDetail = (id) => api.get(`/faculty/${id}`);
export const updateFaculty = (id, data) => api.patch(`/faculty/${id}`, data);
export const deleteFaculty = (id) => api.delete(`/faculty/${id}`);
export const getFacultyClasses = (id) => api.get(`/faculty/${id}/classes`);
export const getMyClasses = () => api.get('/faculty/me/classes');
export const resendCredentials = (id) => api.post(`/faculty/${id}/resend-creds`);

export const bulkDeactivateFaculty = (ids) => api.post('/faculty/bulk-deactivate', { ids });
export const bulkResendCredentials = (ids) => api.post('/faculty/bulk-resend-creds', { ids });
