import api from './axiosInstance';

export const getCoCurricularTypes = (params) => api.get('/co-curricular', { params });
export const createCoCurricularType = (data) => api.post('/co-curricular', data);
export const updateCoCurricularType = (id, data) => api.patch(`/co-curricular/${id}`, data);
export const deleteCoCurricularType = (id) => api.delete(`/co-curricular/${id}`);

export const submitCoCurricular = (typeId, submittedData) => api.post(`/co-curricular/${typeId}/submit`, { submittedData });

export const assignCoCurricularToMentors = (id, payload) => api.post(`/co-curricular/${id}/assign-mentors`, payload);
export const activateCoCurricularType = (id) => api.post(`/co-curricular/${id}/activate`);