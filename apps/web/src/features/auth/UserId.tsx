import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import TopNavBar from '../../components/TopNavBar';
import BottomNav from '../../components/BottomNav';
import PrimaryButton from '../../components/ui/PrimaryButton';
import TextButton from '../../components/ui/TextButton';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { describeApiError } from '../../api/describeError';
import { useSession, useSessionStore } from '../../session/sessionContext';
import { SIGN_IN_PATH } from '../../session/routes';

type CopyState = 'idle' | 'copied' | 'failed';

// 4820193 as 482 0193: easier to read out on a support call.
const groupColdLinkId = (id: string) => `${id.slice(0, 3)} ${id.slice(3)}`;

const UserId = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const session = useSession();
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
    <div className="flex flex-col h-full min-h-screen bg-background relative pb-20">
      {/* Top App Bar */}
      <TopNavBar title={t('auth.userId.navTitle')} showProfile={true} />

      <div className="flex flex-col px-6 pt-12 items-center text-center flex-grow">
        {/* Success Icon */}
        <div className="w-20 h-20 mb-6 bg-primary rounded-full flex items-center justify-center text-ink shadow-sm">
          <CheckCircle2 size={32} strokeWidth={2.5} />
        </div>

        {/* Title */}
        <h1 className="font-heading text-headline font-bold text-ink mb-8">
          {t('auth.userId.title')}
        </h1>

        {/* ID Card */}
        <div className="w-full bg-primary-faint rounded-2xl p-6 mb-8 shadow-sm border border-primary-muted">
          <p className="text-copy-muted text-caption font-medium tracking-widest uppercase mb-4">
            {t('auth.userId.idLabel')}
          </p>
          <div className="bg-primary-muted text-ink font-bold text-display tracking-widest tabular-nums py-3 px-6 rounded-lg mb-6 inline-block">
            {groupColdLinkId(coldLinkId)}
          </div>
          <div>
            <button
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-2 bg-accent-faint hover:bg-accent-soft text-accent-ink px-5 py-2 rounded-full font-medium text-label transition-colors"
            >
              <Copy size={16} />
              {copyState === 'copied' ? t('auth.userId.copied') : t('auth.userId.copy')}
            </button>
          </div>
          {copyState === 'failed' && (
            <p role="status" className="mt-4 text-body text-copy-muted">
              {t('auth.userId.copyFailed')}
            </p>
          )}
        </div>

        {/* Info Text */}
        <p className="text-copy-muted text-body leading-relaxed px-4">
          {t('auth.userId.channels')}
        </p>
      </div>

      {/* Action Button */}
      <div className="px-6 mb-6">
        <PrimaryButton onClick={() => void navigate('/location')}>
          {t('auth.userId.findStorage')}
        </PrimaryButton>
        <div className="mt-2">
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

      {/* Bottom Navigation */}
      <BottomNav activeTab="profile" />
    </div>
  );
};

export default UserId;
