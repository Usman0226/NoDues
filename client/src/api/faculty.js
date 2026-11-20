import api from './axiosInstance';

export const getFaculty = (params) => api.get('/faculty', { params });
export const createFaculty = (data) => api.post('/faculty', data);
export const getFacultyDetail = (id) => api.get(`/faculty/${id}`);
export const updateFaculty = (id, data) => api.patch(`/faculty/${id}`, data);
export const deleteFaculty = (id) => api.delete(`/faculty/${id}`);
export const getFacultyClasses = (id, params) => api.get(`/faculty/${id}/classes`, { params });
export const getMyClasses = (params) => api.get('/faculty/me/classes', { params });
export const getMyBatches = () => api.get('/faculty/me/batches');
export const getMyMentees = (params) => api.get('/faculty/me/mentees', { params });
export const getMenteeClearance = (studentId) => api.get(`/faculty/me/mentees/${studentId}/clearance`);
export const resendCredentials = (id) => api.post(`/faculty/${id}/resend-creds`);

export const bulkDeactivateFaculty = (ids) => api.post('/faculty/bulk-deactivate', { ids });
export const bulkActivateFaculty = (ids) => api.post('/faculty/bulk-activate', { ids });
export const bulkResendCredentials = (ids) => api.post('/faculty/bulk-resend-creds', { ids });
export const bulkUpdateRoles = (ids, targetRole, action) => api.post('/faculty/bulk-update-roles', { ids, targetRole, action });
export const activateFaculty = (id) => api.post(`/faculty/${id}/activate`);