import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';

export const useApi = (apiFunc, options = {}) => {
  const [data, setData] = useState(options.initialData || null);
  const [loading, setLoading] = useState(!!options.immediate);
  const [error, setError] = useState(null);

  const apiFuncRef = useRef(apiFunc);
  const optionsRef = useRef(options);
  
  useEffect(() => {
    apiFuncRef.current = apiFunc;
    optionsRef.current = options;
  });

  const request = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFuncRef.current(...args);
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
  }, []);

  useEffect(() => {
    if (options.immediate) {
      request();
    }
  }, []); 

  return { data, loading, error, request, setData };
};
