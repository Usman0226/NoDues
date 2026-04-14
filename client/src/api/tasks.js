import axiosInstance from './axiosInstance';

export const getTasks = () => axiosInstance.get('/tasks');
export const deleteTask = (id) => axiosInstance.delete(`/tasks/${id}`);
export const clearTasks = () => axiosInstance.delete('/tasks');
