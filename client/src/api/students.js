import api from './axiosInstance';

export const getStudents = (params) => api.get('/students', { params });
export const createStudent = (data) => api.post('/students', data);
export const getStudent = (id) => api.get(`/students/${id}`);
export const updateStudent = (id, data) => api.patch(`/students/${id}`, data);
export const deleteStudent = (id) => api.delete(`/students/${id}`);
export const assignMentor = (id, mentorId) => api.patch(`/students/${id}/mentor`, { mentorId });
export const addElective = (id, data) => api.post(`/students/${id}/electives`, data);
export const updateElective = (id, subjectId, data) => api.patch(`/students/${id}/electives/${subjectId}`, data);
export const removeElective = (id, subjectId) => api.delete(`/students/${id}/electives/${subjectId}`);

export const bulkDeactivateStudents = (ids) => api.post('/students/bulk-deactivate', { ids });
export const bulkAssignMentor = (ids, mentorId) => api.post('/students/bulk-assign-mentor', { ids, mentorId });
