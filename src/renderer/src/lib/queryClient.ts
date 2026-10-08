import { QueryClient } from '@tanstack/react-query'

/** Shared React Query client. Tuned for a local-first desktop app: data rarely
 *  changes underneath us, so we keep generous stale times and avoid refetching
 *  on window focus. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
})
