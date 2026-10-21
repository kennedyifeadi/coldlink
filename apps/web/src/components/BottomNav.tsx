import React from 'react';
import { Snowflake, User, ShoppingBag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

type BottomNavTab = 'find' | 'bookings' | 'profile';

interface BottomNavProps {
  activeTab?: BottomNavTab;
}

const BottomNav = ({ activeTab = 'find' }: BottomNavProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-surface border-t border-line flex justify-between px-8 pt-3 pb-safe-3 z-20 shadow-bar"
    >
      <button
        onClick={() => void navigate('/discovery')}
        aria-current={activeTab === 'find' ? 'page' : undefined}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'find' ? 'text-primary-strong' : 'text-copy-subtle hover:text-copy'}`}
      >
        <Snowflake size={24} />
        <span className="text-caption font-medium">{t('nav.findStorage')}</span>
      </button>

      <button
        aria-current={activeTab === 'bookings' ? 'page' : undefined}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'bookings' ? 'text-primary-strong' : 'text-copy-subtle hover:text-copy'}`}
      >
        <ShoppingBag size={24} />
        <span className="text-caption font-medium">{t('nav.bookings')}</span>
      </button>

      <button
        onClick={() => void navigate('/userid')}
        aria-current={activeTab === 'profile' ? 'page' : undefined}
        className={`flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-primary-strong' : 'text-copy-subtle hover:text-copy'}`}
      >
        <User size={24} />
        <span className="text-caption font-medium">{t('nav.profile')}</span>
      </button>
    </nav>
  );
};

export default BottomNav;
