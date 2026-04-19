import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('nds_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);
let isRedirecting = false;

axiosInstance.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    const status = error.response?.status;
    const errorData = error.response?.data?.error || {};

    if (status === 403 && errorData.code === 'AUTH_PASSWORD_CHANGE_REQUIRED') {
      if (window.location.pathname !== '/change-password' && !isRedirecting) {
        isRedirecting = true;
        window.location.replace('/change-password');
      }
    }

    if (status === 401) {
      localStorage.removeItem('nds_token');
      if (window.location.pathname !== '/login' && !isRedirecting) {
        isRedirecting = true;
        window.location.replace('/login');
      }
    }

    return Promise.reject({
      code: errorData.code || 'UNKNOWN_ERROR',
      message: errorData.message || error.message || 'An unexpected error occurred',
      statusCode: status || 500
    });
  }
);

export default axiosInstance;

