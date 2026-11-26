import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import TopNavBar from '../../components/TopNavBar';
import PageHeader from '../../components/ui/PageHeader';
import BottomNav from '../../components/BottomNav';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { describeApiError } from '../../api/describeError';
import { useSession, useSessionStore } from '../../session/sessionContext';
import { returnToStateSchema, SIGN_IN_PATH } from '../../session/routes';

type CopyState = 'idle' | 'copied' | 'failed';

// 4820193 as 482 0193: easier to read out on a support call.
const groupColdLinkId = (id: string) => `${id.slice(0, 3)} ${id.slice(3)}`;

const UserId = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const session = useSession();
  // Where a new account was signing in to go, such as paying for a booking.
  const returnTo = returnToStateSchema.safeParse(location.state).data?.returnTo;
  const store = useSessionStore();
  const queryClient = useQueryClient();
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const signOut = useMutation({
    mutationFn: store.signOut,
    onSuccess: () => {
      queryClient.clear();
      void navigate(SIGN_IN_PATH, { replace: true });
    },
  });

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = setTimeout(() => setCopyState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [copyState]);

  // The route guard only renders this screen with a session.
  if (session.status !== 'signedIn') return null;
  const coldLinkId = session.user.coldlink_id;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(coldLinkId);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <TopNavBar title={t('auth.userId.navTitle')} />
      <PageHeader title={t('auth.userId.title')} />

      <div className="flex flex-col px-5 pt-6 flex-grow">
        <div className="rounded-xl border-2 border-primary p-5 mb-4">
          <p className="text-copy-muted text-label font-medium">{t('auth.userId.idLabel')}</p>
          <p className="text-ink font-bold text-display tracking-wider tabular-nums my-1">
            {groupColdLinkId(coldLinkId)}
          </p>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-2 min-h-11 -ml-1 px-1 text-primary-strong font-semibold text-body"
          >
            {copyState === 'copied' ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Copy size={18} aria-hidden="true" />
            )}
            {copyState === 'copied' ? t('auth.userId.copied') : t('auth.userId.copy')}
          </button>
          {copyState === 'failed' && (
            <p role="status" className="mt-1 text-label text-copy-muted">
              {t('auth.userId.copyFailed')}
            </p>
          )}
        </div>

        <p className="text-copy-muted text-body">{t('auth.userId.channels')}</p>
      </div>

      <div className="px-5 pt-8 mb-6">
        {returnTo === undefined ? (
          <PrimaryButton onClick={() => void navigate('/location')}>
            {t('auth.userId.findStorage')}
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => void navigate(returnTo, { replace: true })}>
            {t('auth.userId.continue')}
          </PrimaryButton>
        )}
        <div className="mt-3">
          <TextButton onClick={() => signOut.mutate()} disabled={signOut.isPending}>
            {t('auth.userId.signOut')}
          </TextButton>
        </div>
        {signOut.isError && (
          <div className="mt-2">
            <ErrorMessage>{describeApiError(signOut.error, t)}</ErrorMessage>
          </div>
        )}
      </div>

      <BottomNav activeTab="profile" />
    </div>
  );
};

export default UserId;
