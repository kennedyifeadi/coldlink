import { createContext, useContext, useSyncExternalStore } from 'react';
import type { SessionStore } from './sessionStore';

export const SessionContext = createContext<SessionStore | null>(null);

export const useSessionStore = () => {
  const store = useContext(SessionContext);
  if (!store) throw new Error('useSessionStore needs a SessionProvider');
  return store;
};

export const useSession = () => {
  const store = useSessionStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
};
