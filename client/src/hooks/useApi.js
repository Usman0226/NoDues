import { useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

/**
 * useApi - Enhanced hook that integrates with react-query for production-grade caching.
 * @param {Function} apiFunc - The API function to call.
 * @param {Object} options - Configuration options (immediate, initialData, queryKey, etc.)
 */
export const useApi = (apiFunc, options = {}) => {
  const queryClient = useQueryClient();
  
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

  const request = useCallback(async (...args) => {
    // If we have arguments, we bypass the query cache for this specific call 
    // or we could refactor more aggressively. For now, let's support it:
    if (args.length > 0) {
      try {
        // We still use refetch or direct call
        const result = await apiFunc(...args);
        // Update the cache with this new data manually
        queryClient.setQueryData(queryKey, result);
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
    }
    
    // Otherwise just refetch the query
    const { data: refetchedData } = await refetch();
    return refetchedData;
  }, [apiFunc, queryKey, queryClient, refetch, options.onSuccess, options.onError, options.silent]);

  const setData = useCallback((newData) => {
    queryClient.setQueryData(queryKey, newData);
  }, [queryClient, queryKey]);

  return { 
    data, 
    loading: isLoading, // backward compatibility: only show skeleton on first load
    isFetching, // available for subtle loading indicators
    error: error ? (error?.response?.data?.error?.message || error.message) : null, 
    request, 
    setData 
  };
};
