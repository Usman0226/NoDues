import api from './axiosInstance';

export const getSubjects = (params) => api.get('/subjects', { params });
export const createSubject = (data) => api.post('/subjects', data);
export const getSubject = (id) => api.get(`/subjects/${id}`);
export const updateSubject = (id, data) => api.patch(`/subjects/${id}`, data);
export const deleteSubject = (id) => api.delete(`/subjects/${id}`);

export const bulkDeleteSubjects = (ids) => api.post('/subjects/bulk-delete', { ids });
export const bulkActivateSubjects = (ids) => api.post('/subjects/bulk-activate', { ids });
export const activateSubject = (id) => api.post(`/subjects/${id}/activate`);