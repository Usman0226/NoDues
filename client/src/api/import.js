import api from './axiosInstance';
export const importStudents = (formData) => api.post('/import/students', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const importFaculty = (formData) => api.post('/import/faculty', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
