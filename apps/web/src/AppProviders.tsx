import React, { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SessionProvider from './session/SessionProvider';
import { createSessionStore } from './session/sessionStore';
import SignInFlowProvider from './features/auth/SignInFlowProvider';

const AppProviders = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(() => new QueryClient());
  const [sessionStore] = useState(() => createSessionStore());

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider store={sessionStore}>
        <SignInFlowProvider>{children}</SignInFlowProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
};

export default AppProviders;
