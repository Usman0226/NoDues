import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true, // Required for httpOnly cookies if used
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Minimal - rely on httpOnly cookies (nds_token)
axiosInstance.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error)
);

// Response interceptor: Envelope preservation & global error handling
axiosInstance.interceptors.response.use(
  (response) => {

    return response.data;
  },
  (error) => {
    const status = error.response?.status;
    const errorData = error.response?.data?.error || {};

    // 1. Force Redirect to Change Password (PRD §2, Guide §2)
    if (status === 403 && errorData.code === 'AUTH_PASSWORD_CHANGE_REQUIRED') {
      if (window.location.pathname !== '/change-password') {
        window.location.href = '/change-password';
      }
    }

    // 2. Clear session on Unauthorized
    if (status === 401) {
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // Standardize error delivery to components
    return Promise.reject({
      code: errorData.code || 'UNKNOWN_ERROR',
      message: errorData.message || error.message || 'An unexpected error occurred',
      statusCode: status || 500
    });
  }
);

export default axiosInstance;

