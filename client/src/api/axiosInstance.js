import axios from 'axios';

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true, // Required for httpOnly cookies if used
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Attach token if it exists in localStorage
// (Keeping dual support for Header-based JWT and Cookie-based JWT)
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: Global error handling & unwrapping
axiosInstance.interceptors.response.use(
  (response) => response.data, // Consistently return data envelope
  (error) => {
    const status = error.response?.status;
    const errorData = error.response?.data;

    // Handle session expiry
    if (status === 401) {
      localStorage.removeItem('token');
      // Only redirect if not already on login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // Pass through detailed PRD error objects if they exist
    return Promise.reject(errorData || { 
      message: error.message || 'An unexpected error occurred',
      status: status || 500
    });
  }
);

export default axiosInstance;

