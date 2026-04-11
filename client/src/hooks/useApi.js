import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';

/**
 * Standardized hook for API calls
 * @param {Function} apiFunc - The service function to call
 * @param {Object} options - {onSuccess, onError, immediate}
 */
export const useApi = (apiFunc, options = {}) => {
  const [data, setData] = useState(options.initialData || null);
  const [loading, setLoading] = useState(!!options.immediate);
  const [error, setError] = useState(null);

  const request = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFunc(...args);
      // Our axiosInstance now returns response.data directly
      setData(response);
      options.onSuccess?.(response);
      return response;
    } catch (err) {
      const errorMessage = err.message || 'Something went wrong';
      setError(errorMessage);
      if (!options.silent) {
        toast.error(errorMessage);
      }
      options.onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiFunc, options]);

  return { data, loading, error, request, setData };
};
