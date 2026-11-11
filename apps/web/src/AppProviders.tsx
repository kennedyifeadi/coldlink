import React, { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isApiError } from './api/client';
import SessionProvider from './session/SessionProvider';
import { createSessionStore } from './session/sessionStore';
import SignInFlowProvider from './features/auth/SignInFlowProvider';
import SearchFlowProvider from './features/search/SearchFlowProvider';

// One quiet retry for a dropped connection. Any other failure shows at once, with Try again, so a
// farmer on a slow network is not left watching a loader through three backed-off retries.
const retryDroppedConnection = (failureCount: number, error: unknown) =>
  failureCount < 1 && isApiError(error, 'network');

const AppProviders = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: retryDroppedConnection } } }),
  );
  const [sessionStore] = useState(() => createSessionStore());

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider store={sessionStore}>
        <SignInFlowProvider>
          <SearchFlowProvider>{children}</SearchFlowProvider>
        </SignInFlowProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
};

export default AppProviders;
