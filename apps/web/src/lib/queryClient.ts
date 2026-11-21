import { QueryClient } from '@tanstack/react-query';
import { SourceError } from '@tuneshift/sources';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) =>
        !(err instanceof SourceError && [400, 401, 404].includes(err.status)) && count < 2,
    },
  },
});
