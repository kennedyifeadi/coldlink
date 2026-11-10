import React from 'react';
import { WifiOff } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UserRole } from '@coldlink/shared';
import { describeApiError } from '../api/describeError';
import NotFound from '../components/NotFound';
import RouteFallback from '../components/RouteFallback';
import PrimaryButton from '../components/ui/PrimaryButton';
import { useSession, useSessionStore } from './sessionContext';
import { SIGN_IN_PATH, SIGNED_IN_HOME, type ReturnToState } from './routes';

const SessionUnavailable = ({ error }: { error: unknown }) => {
  const { t } = useTranslation();
  const store = useSessionStore();

  return (
    <div className="flex flex-col h-full min-h-screen bg-background px-6 pb-8">
      <div className="flex flex-col items-center text-center pt-24 mb-auto">
        <div className="w-20 h-20 mb-8 bg-surface-muted rounded-full flex items-center justify-center text-primary-strong">
          <WifiOff size={32} aria-hidden="true" />
        </div>
        <h1 className="font-heading text-headline font-bold text-ink mb-3">
          {t('session.unavailable.title')}
        </h1>
        <p className="text-copy-muted text-lead leading-relaxed max-w-sm">
          {describeApiError(error, t)}
        </p>
      </div>
      <div className="mt-12">
        <PrimaryButton onClick={store.retryRestore}>{t('common.tryAgain')}</PrimaryButton>
      </div>
    </div>
  );
};

interface RequireSessionProps {
  /** The user needs at least one of these roles; otherwise the page is not found. */
  roles?: readonly UserRole[];
}

/** Lets signed-in users through, and sends everyone else to sign in and back. */
export const RequireSession = ({ roles }: RequireSessionProps) => {
  const session = useSession();
  const location = useLocation();

  switch (session.status) {
    case 'loading':
      return <RouteFallback />;
    case 'unavailable':
      return <SessionUnavailable error={session.error} />;
    case 'signedOut':
      return (
        <Navigate
          to={SIGN_IN_PATH}
          replace
          state={{ returnTo: `${location.pathname}${location.search}` } satisfies ReturnToState}
        />
      );
    case 'signedIn':
      // Not found rather than forbidden, so the page does not admit it exists.
      if (roles && !roles.some((role) => session.user.roles.includes(role))) return <NotFound />;
      return <Outlet />;
  }
};

/** For the sign-in screen: a signed-in user goes straight on. */
export const RedirectIfSignedIn = () => {
  const session = useSession();

  if (session.status === 'loading') return <RouteFallback />;
  if (session.status === 'signedIn') return <Navigate to={SIGNED_IN_HOME} replace />;
  return <Outlet />;
};
