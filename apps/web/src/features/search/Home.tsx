import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoMain from '../../assets/logo_main.webp';
import BottomNav from '../../components/BottomNav';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { useSession } from '../../session/sessionContext';
import { MY_BOOKINGS_PATH, PROVIDER_ONBOARDING_PATH } from '../../session/routes';
import { SEARCH_STEPS } from './searchFlow';

interface HomeLinkProps {
  title: string;
  hint: string;
  onClick: () => void;
}

const HomeLink = ({ title, hint, onClick }: HomeLinkProps) => (
  <button
    type="button"
    onClick={onClick}
    className="group flex items-center gap-4 w-full min-h-18 px-5 py-4 text-left transition-colors hover:bg-surface-muted"
  >
    <span className="flex-grow">
      <span className="block font-semibold text-ink text-body">{title}</span>
      <span className="block text-copy-muted text-label mt-0.5">{hint}</span>
    </span>
    <ChevronRight
      size={20}
      className="text-copy-subtle shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
      aria-hidden="true"
    />
  </button>
);

const Home = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const session = useSession();
  const isProvider = session.status === 'signedIn' && session.user.roles.includes('provider');

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24">
      <div className="px-5 pt-6">
        <img src={logoMain} alt={t('common.logoAlt')} width={164} height={38} />
      </div>

      <div className="px-5 pt-14 pb-8">
        <h1 className="text-display font-bold text-ink tracking-tight mb-3">
          {t('search.home.title')}
        </h1>
        <p className="text-copy-muted text-lead mb-8">{t('search.home.intro')}</p>
        <PrimaryButton onClick={() => void navigate(SEARCH_STEPS.place)}>
          {t('search.home.findStorage')}
        </PrimaryButton>
      </div>

      <div className="divide-y divide-line border-b border-line">
        <HomeLink
          title={t('search.home.myBookings')}
          hint={t('search.home.myBookingsHint')}
          onClick={() => void navigate(MY_BOOKINGS_PATH)}
        />
        <HomeLink
          title={isProvider ? t('search.home.yourFacilities') : t('search.home.listColdRoom')}
          hint={
            isProvider ? t('search.home.yourFacilitiesHint') : t('search.home.listColdRoomHint')
          }
          onClick={() => void navigate(PROVIDER_ONBOARDING_PATH)}
        />
      </div>

      <BottomNav activeTab="find" />
    </div>
  );
};

export default Home;
