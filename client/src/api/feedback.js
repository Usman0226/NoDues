import axiosInstance from './axiosInstance';

export const submitFeedback = async (data) => {
  const response = await axiosInstance.post('/feedback', data);
  return response.data;
};
