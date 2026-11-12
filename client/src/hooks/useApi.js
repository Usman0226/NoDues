import React, { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';

export const useApi = (apiFunc, options = {}) => {
  const queryClient = useQueryClient();
  const [manualLoading, setManualLoading] = React.useState(false);
  const isRequestInProgress = React.useRef(false);

  const optionsRef = React.useRef(options);
  React.useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const serializedKey = useMemo(
    () => (options.queryKey ? JSON.stringify(options.queryKey) : null),
    [options.queryKey]
  );

  const serializedParams = useMemo(
    () => (options.params !== undefined ? JSON.stringify(options.params) : null),
    [options.params]
  );

  const queryKey = useMemo(() => {
    if (serializedKey) return JSON.parse(serializedKey);
    const base = ['api', apiFunc.name || 'unnamed'];
    if (serializedParams !== null) base.push(JSON.parse(serializedParams));
    return base;
  }, [serializedKey, serializedParams, apiFunc]);

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      const currentOptions = optionsRef.current;
      try {
        const result =
          currentOptions.params !== undefined
            ? await apiFunc(currentOptions.params)
            : await apiFunc();
        currentOptions.onSuccess?.(result);
        return result;
      } catch (err) {
        const errorMessage = err?.response?.data?.error?.message || err.message || 'Something went wrong';
        if (!currentOptions.silent) {
          toast.error(errorMessage);
        }
        currentOptions.onError?.(err);
        throw err;
      }
    },
    enabled: options.immediate !== false,
    initialData: options.initialData,
    ...options.queryOptions,
  });

  const request = useCallback(
    async (...args) => {
      const currentOptions = optionsRef.current;

      if (isRequestInProgress.current && args.length === 0) return;

      isRequestInProgress.current = true;
      setManualLoading(true);

      try {
        if (args.length > 0) {
          // Route parameterized calls through React Query's fetchQuery for in-flight deduplication
          const result = await queryClient.fetchQuery({
            queryKey: [...queryKey, ...args],
            queryFn: () => apiFunc(...args),
            staleTime: 0,
          });
          queryClient.setQueryData(queryKey, result);
          currentOptions.onSuccess?.(result);
          return result;
        }

        const { data: refetchedData } = await refetch();
        return refetchedData;
      } catch (err) {
        const errorMessage = err?.response?.data?.error?.message || err.message || 'Something went wrong';
        if (!currentOptions.silent) {
          toast.error(errorMessage);
        }
        currentOptions.onError?.(err);
        throw err;
      } finally {
        isRequestInProgress.current = false;
        setManualLoading(false);
      }
    },
    [apiFunc, queryKey, queryClient, refetch]
  );

  const setData = useCallback(
    (newData) => {
      queryClient.setQueryData(queryKey, newData);
    },
    [queryClient, queryKey]
  );

  return {
    data,
    loading: isLoading || manualLoading,
    isFetching: isFetching || manualLoading,
    refreshing: isFetching || manualLoading,
    error: error ? error?.response?.data?.error?.message || error.message : null,
    request,
    setData,
  };
};
