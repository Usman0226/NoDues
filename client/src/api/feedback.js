import axiosInstance from './axiosInstance';

export const submitFeedback = async (data) => {
  const response = await axiosInstance.post('/feedback', data);
  return response.data;
};

export const getFeedback = async (params) => {
  const response = await axiosInstance.get('/feedback', { params });
  return response.data;
};

export const updateFeedback = async (id, data) => {
  const response = await axiosInstance.patch(`/feedback/${id}`, data);
  return response.data;
};

export const deleteFeedback = async (id) => {
  const response = await axiosInstance.delete(`/feedback/${id}`);
  return response.data;
};
