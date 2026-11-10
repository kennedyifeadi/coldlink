import React, { useEffect, type ReactNode } from 'react';
import { SessionContext } from './sessionContext';
import type { SessionStore } from './sessionStore';

interface SessionProviderProps {
  store: SessionStore;
  children: ReactNode;
}

const SessionProvider = ({ store, children }: SessionProviderProps) => {
  useEffect(() => {
    store.restore();
  }, [store]);

  return <SessionContext value={store}>{children}</SessionContext>;
};

export default SessionProvider;
