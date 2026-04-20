import axiosInstance from './axiosInstance';

export const getNotifications = () => axiosInstance.get('/notifications');
export const markNotificationRead = (id) => axiosInstance.patch(id ? `/notifications/read/${id}` : '/notifications/read');
export const deleteNotification = (id) => axiosInstance.delete(id ? `/notifications/${id}` : '/notifications');
