import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * A client for one spec. Never share one across tests: a cache hit from a
 * previous test would make the next one pass without fetching anything.
 *
 * `retry: false` so a rejected fetch surfaces as an error state immediately
 * instead of after backoff; `gcTime: Infinity` so nothing is collected
 * mid-assertion.
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
    },
  });
}

export function QueryTestProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createTestQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
