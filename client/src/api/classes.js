import api from './axiosInstance';

export const getClasses = (params) => api.get('/classes', { params });
export const createClass = (data) => api.post('/classes', data);
export const getClass = (id) => api.get(`/classes/${id}`);
export const updateClass = (id, data) => api.patch(`/classes/${id}`, data);
export const deleteClass = (id) => api.delete(`/classes/${id}`);

export const addSubjectToClass = (id, data) => api.post(`/classes/${id}/subjects`, data);
export const updateClassSubject = (classId, subjectId, data) => api.patch(`/classes/${classId}/subjects/${subjectId}`, data);
export const removeClassSubject = (classId, subjectId) => api.delete(`/classes/${classId}/subjects/${subjectId}`);
export const updateClassTeacher = (id, facultyId) => api.patch(`/classes/${id}/class-teacher`, { classTeacherId: facultyId });
export const cloneSubjects = (id, sourceClassId) => api.post(`/classes/${id}/clone-subjects`, { sourceClassId });
export const initiateBatch = (id, sourceClassId) => api.post(`/classes/${id}/initiate-batch`, { sourceClassId });