import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface TopNavBarProps {
  title: string;
  showBack?: boolean;
}

const TopNavBar = ({ title, showBack = false }: TopNavBarProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <header className="flex items-center gap-1 h-14 px-2 border-b border-line bg-surface sticky top-0 z-10">
      {showBack && (
        <button
          type="button"
          onClick={() => void navigate(-1)}
          aria-label={t('common.goBack')}
          className="w-11 h-11 flex items-center justify-center text-ink hover:bg-surface-muted rounded-full transition-colors shrink-0"
        >
          <ArrowLeft size={22} />
        </button>
      )}
      <span className={`text-ink font-semibold text-body truncate ${showBack ? '' : 'pl-3'}`}>
        {title}
      </span>
    </header>
  );
};

export default TopNavBar;
