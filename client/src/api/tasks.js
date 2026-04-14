import axiosInstance from './axiosInstance';

export const getTasks = () => axiosInstance.get('/api/tasks');
export const deleteTask = (id) => axiosInstance.delete(`/api/tasks/${id}`);
export const clearTasks = () => axiosInstance.delete('/api/tasks');
