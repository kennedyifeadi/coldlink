import React from 'react';
import { ChevronRight, ShoppingBag, Snowflake } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoMain from '../../assets/logo_main.webp';
import BottomNav from '../../components/BottomNav';
import Card from '../../components/ui/Card';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { MY_BOOKINGS_PATH } from '../../session/routes';
import { SEARCH_STEPS } from './searchFlow';

const Home = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative px-6 pb-28">
      <div className="flex items-center mt-8 mb-12">
        <img src={logoMain} alt={t('common.logoAlt')} width={190} height={44} />
      </div>

      <h1 className="font-heading text-display font-bold text-ink tracking-tight leading-tight mb-4">
        {t('search.home.title')}
      </h1>
      <p className="text-copy-muted text-lead leading-relaxed mb-8">{t('search.home.intro')}</p>

      <Card className="p-5 mb-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-12 h-12 rounded-full bg-primary-soft text-primary-strong flex items-center justify-center shrink-0">
            <Snowflake size={24} aria-hidden="true" />
          </div>
          <p className="text-copy text-body leading-relaxed">{t('search.home.searchHint')}</p>
        </div>
        <PrimaryButton onClick={() => void navigate(SEARCH_STEPS.place)} withArrow>
          {t('search.home.findStorage')}
        </PrimaryButton>
      </Card>

      <button
        type="button"
        onClick={() => void navigate(MY_BOOKINGS_PATH)}
        className="flex items-center gap-4 w-full min-h-16 p-4 rounded-xl bg-surface-muted hover:bg-surface-sunken transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-full bg-surface-sunken text-primary-strong flex items-center justify-center shrink-0">
          <ShoppingBag size={20} aria-hidden="true" />
        </div>
        <div className="flex-grow">
          <div className="font-semibold text-copy text-lead">{t('search.home.myBookings')}</div>
          <div className="text-copy-muted text-label mt-0.5">{t('search.home.myBookingsHint')}</div>
        </div>
        <ChevronRight size={20} className="text-copy-subtle shrink-0" aria-hidden="true" />
      </button>

      <BottomNav activeTab="find" />
    </div>
  );
};

export default Home;
