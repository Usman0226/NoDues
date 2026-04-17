import React, { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

export const useApi = (apiFunc, options = {}) => {
  const queryClient = useQueryClient();
  const [manualLoading, setManualLoading] = React.useState(false);
  
  const queryKey = useMemo(() => {
    if (options.queryKey) return options.queryKey;
      return ['api', apiFunc.name || 'unnamed'];
  }, [options.queryKey, apiFunc]);

  const {
    data,
    isLoading, 
    isFetching, 
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
    refreshing: isFetching || manualLoading,
    error: error ? (error?.response?.data?.error?.message || error.message) : null, 
    request, 
    setData 
  };
};
