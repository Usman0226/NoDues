import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

export const useApi = (apiFunc, options = {}) => {
  const queryClient = useQueryClient();
  const [manualLoading, setManualLoading] = React.useState(false);
  
  // Create a unique query key if not provided, based on the function name if possible
  // In a real app, passing an explicit queryKey is safer, but this provides a fallback.
  const queryKey = useMemo(() => {
    if (options.queryKey) return options.queryKey;
    // Fallback keying based on the function itself (only works if static)
    // For manual requests (not immediate), caching is less critical but still useful.
    return ['api', apiFunc.name || 'unnamed'];
  }, [options.queryKey, apiFunc]);

  const {
    data,
    isLoading, // Only true on the first fetch when no data in cache
    isFetching, // True whenever a request is in flight
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const result = await apiFunc();
        options.onSuccess?.(result);
        return result;
      } catch (err) {
        const errorMessage = err?.response?.data?.error?.message || err.message || 'Something went wrong';
        if (!options.silent) {
          toast.error(errorMessage);
        }
        options.onError?.(err);
        throw err;
      }
    },
    enabled: options.immediate !== false,
    initialData: options.initialData,
    ...options.queryOptions // Allow passing extra react-query options
  });

  const optionsRef = React.useRef(options);
  React.useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const request = useCallback(async (...args) => {
    const currentOptions = optionsRef.current;
    if (args.length > 0) {
      try {
        const result = await apiFunc(...args);
        queryClient.setQueryData(queryKey, result);
        currentOptions.onSuccess?.(result);
        return result;
      } catch (err) {
        const errorMessage = err?.response?.data?.error?.message || err.message || 'Something went wrong';
        if (!currentOptions.silent) {
          toast.error(errorMessage);
        }
        currentOptions.onError?.(err);
        throw err;
      } finally {
        setManualLoading(false);
      }
    }
    
    setManualLoading(true);
    try {
      const { data: refetchedData } = await refetch();
      return refetchedData;
    } finally {
      setManualLoading(false);
    }
  }, [apiFunc, queryKey, queryClient, refetch]);

  const setData = useCallback((newData) => {
    queryClient.setQueryData(queryKey, newData);
  }, [queryClient, queryKey]);

  return { 
    data, 
    loading: isLoading || manualLoading,
    isFetching: isFetching || manualLoading,
    refreshing: isFetching || manualLoading, // Alias for better semantics in background refetches
    error: error ? (error?.response?.data?.error?.message || error.message) : null, 
    request, 
    setData 
  };
};
