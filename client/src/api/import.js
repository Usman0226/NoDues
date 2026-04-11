import api from './axiosInstance';

/**
 * Generic preview wrapper
 */
export const previewImport = (type, formData) => {
  const endpoints = {
    students: '/import/students/preview',
    faculty: '/import/faculty/preview',
    electives: '/import/electives/preview',
    mentors: '/import/mentors/preview'
  };
  return api.post(endpoints[type] || endpoints.students, formData, { 
    headers: { 'Content-Type': 'multipart/form-data' } 
  });
};

/**
 * Generic commit wrapper
 */
export const commitImport = (type, data) => {
  const endpoints = {
    students: '/import/students/commit',
    faculty: '/import/faculty/commit',
    electives: '/import/electives/commit',
    mentors: '/import/mentors/commit'
  };
  return api.post(endpoints[type] || endpoints.students, data);
};

// Student Import
export const previewStudents = (formData) => api.post('/import/students/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const commitStudents = (data) => api.post('/import/students/commit', data);

// Faculty Import
export const previewFaculty = (formData) => api.post('/import/faculty/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const commitFaculty = (data) => api.post('/import/faculty/commit', data);

// Electives Import
export const previewElectives = (formData) => api.post('/import/electives/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const commitElectives = (data) => api.post('/import/electives/commit', data);

// Mentors Import
export const previewMentors = (formData) => api.post('/import/mentors/preview', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const commitMentors = (data) => api.post('/import/mentors/commit', data);

// Templates
export const getTemplate = (type) => api.get(`/import/template/${type}`, { responseType: 'blob' });
