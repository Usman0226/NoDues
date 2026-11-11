import api from './axiosInstance';

export const getClasses = (params) => api.get('/classes', { params });
export const createClass = (data) => api.post('/classes', data);
export const getClass = (id) => api.get(`/classes/${id}`);
export const updateClass = (id, data) => api.patch(`/classes/${id}`, data);
export const deleteClass = (id) => api.delete(`/classes/${id}`);

export const addSubjectToClass = (id, data) => api.post(`/classes/${id}/subjects`, data);
export const updateClassSubject = (classId, subjectId, data) => api.patch(`/classes/${classId}/subjects/${subjectId}`, data);
export const removeClassSubject = (classId, subjectId) => api.delete(`/classes/${classId}/subjects/${subjectId}`);
export const bulkRemoveClassSubjects = (classId, assignmentIds) => api.post(`/classes/${classId}/subjects/bulk-remove`, { assignmentIds });
export const updateClassTeacher = (id, facultyId) => api.patch(`/classes/${id}/class-teacher`, { classTeacherId: facultyId });
export const cloneSubjects = (id, sourceClassId) => api.post(`/classes/${id}/clone-subjects`, { sourceClassId });
export const initiateBatch = (id, sourceClassId) => api.post(`/classes/${id}/initiate-batch`, { sourceClassId });
export const activateClass = (id) => api.post(`/classes/${id}/activate`);
export const getPromotionCandidates = (id) => api.get(`/classes/${id}/promotion-candidates`);
export const promoteStudents = (id, data) => api.post(`/classes/${id}/promote`, data);
export const getCohortPromotionPreview = (params) => api.get('/classes/cohort-promotion-preview', { params });
export const bulkPromoteClasses = (data) => api.post('/classes/bulk-promote', data);
export const autoCreateTargetSections = (data) => api.post('/classes/auto-create-target-sections', data);
export const propagateCohortSubjects = (id, data) => api.post(`/classes/${id}/propagate-cohort-subjects`, data);
export const getMasterCurriculum = (params) => api.get('/classes/master-curriculum', { params });
export const syncMasterCurriculum = (data) => api.post('/classes/master-curriculum/sync', data);
export const getDepartmentRolloverPreview = (params) => api.get('/classes/department-rollover-preview', { params });
export const executeDepartmentRollover = (data) => api.post('/classes/department-rollover', data);
