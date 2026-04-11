import api from './axiosInstance';

export const getFaculty = (params) => api.get('/faculty', { params });
export const createFaculty = (data) => api.post('/faculty', data);
export const getFacultyDetail = (id) => api.get(`/faculty/${id}`);
export const updateFaculty = (id, data) => api.patch(`/faculty/${id}`, data);
export const deleteFaculty = (id) => api.delete(`/faculty/${id}`);
export const getFacultyClasses = (id) => api.get(`/faculty/${id}/classes`);
