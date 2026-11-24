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
  async (error) => {
    const config = error.config;
    const status = error.response?.status;
    const errorData = error.response?.data?.error || {};

    // Cold-start & gateway retry for idempotent GET requests (Render free-tier spindown)
    const isColdStartStatus = [502, 503, 504].includes(status) || (!error.response && error.code === 'ERR_NETWORK');
    const isGet = config && (config.method?.toLowerCase() === 'get' || !config.method);
    
    if (config && isGet && isColdStartStatus && (config._retryCount || 0) < 2) {
      config._retryCount = (config._retryCount || 0) + 1;
      const delay = config._retryCount * 1500;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return axiosInstance(config);
    }

    if (status === 401) {
      localStorage.removeItem('nds_token');
      if (window.location.pathname !== '/login' && !isRedirecting) {
        isRedirecting = true;
        setTimeout(() => { isRedirecting = false; }, 2500);
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

