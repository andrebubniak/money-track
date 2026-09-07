"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The client is created inside `useState`, not at module scope: a
 * module-level `QueryClient` is shared by every request the server handles,
 * so one user's cached options could be handed to the next.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A default for whatever else reaches for `useQuery`. The options
            // dropdowns deliberately opt out of it — see the `staleTime` in
            // `useAsyncOptions`, and why.
            staleTime: 30_000,
            retry: 1,
            // A dropdown's option list is not worth a request every time the
            // user comes back to the tab.
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
