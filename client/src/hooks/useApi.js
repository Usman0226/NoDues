import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';

/**
 * Standardized hook for API calls
 * @param {Function} apiFunc - The service function to call
 * @param {Object} options - {initialData, immediate, onSuccess, onError, silent}
 */
export const useApi = (apiFunc, options = {}) => {
  const [data, setData] = useState(options.initialData || null);
  const [loading, setLoading] = useState(!!options.immediate);
  const [error, setError] = useState(null);

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const request = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFunc(...args);
      // Our axiosInstance now returns response.data directly
      setData(response);
      optionsRef.current.onSuccess?.(response);
      return response;
    } catch (err) {
      const errorMessage = err?.response?.data?.error?.message || err.message || 'Something went wrong';
      setError(errorMessage);
      if (!optionsRef.current.silent) {
        toast.error(errorMessage);
      }
      optionsRef.current.onError?.(err);
      throw err;
    } finally {
      if (optionsRef.current.isMounted !== false) {
        setLoading(false);
      }
    }
  }, [apiFunc]);

  return { data, loading, error, request, setData };
};
