import React from 'react';
import { CalendarCheck, Search, User, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MY_BOOKINGS_PATH } from '../session/routes';

type BottomNavTab = 'find' | 'bookings' | 'profile';

interface BottomNavProps {
  activeTab?: BottomNavTab;
}

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}

// The active tab is marked by a bar along its top edge as well as the colour.
const NavItem = ({ icon: Icon, label, active, onClick }: NavItemProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={`relative flex-1 flex flex-col items-center gap-1 pt-2.5 pb-1 transition-colors ${active ? 'text-primary-strong' : 'text-copy-subtle hover:text-copy'}`}
  >
    <span
      aria-hidden="true"
      className={`absolute top-0 inset-x-6 h-[3px] rounded-b-full ${active ? 'bg-primary' : 'bg-transparent'}`}
    />
    <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden="true" />
    <span className={`text-caption ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
  </button>
);

const BottomNav = ({ activeTab = 'find' }: BottomNavProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] bg-surface border-t border-line flex px-2 pb-safe-2 z-20"
    >
      <NavItem
        icon={Search}
        label={t('nav.findStorage')}
        active={activeTab === 'find'}
        onClick={() => void navigate('/')}
      />
      <NavItem
        icon={CalendarCheck}
        label={t('nav.bookings')}
        active={activeTab === 'bookings'}
        onClick={() => void navigate(MY_BOOKINGS_PATH)}
      />
      <NavItem
        icon={User}
        label={t('nav.profile')}
        active={activeTab === 'profile'}
        onClick={() => void navigate('/userid')}
      />
    </nav>
  );
};

export default BottomNav;
