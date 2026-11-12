import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute fresh window
      gcTime: 1000 * 60 * 30, // 30 minutes garbage-collection window (v5 option)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

