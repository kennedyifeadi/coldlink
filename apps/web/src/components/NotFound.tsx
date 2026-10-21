import React from 'react';
import { SearchX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoMain from '../assets/logo_main.webp';
import PrimaryButton from './ui/PrimaryButton';

const NotFound = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full min-h-screen bg-background px-6 pb-8">
      <div className="flex justify-center items-center py-6">
        <img src={logoMain} alt={t('common.logoAlt')} width={138} height={32} />
      </div>

      <div className="flex flex-col items-center text-center pt-12 mb-auto">
        <div className="w-20 h-20 mb-8 bg-surface-muted rounded-full flex items-center justify-center text-primary-strong">
          <SearchX size={32} />
        </div>
        <h1 className="font-heading text-headline font-bold text-ink mb-3">
          {t('notFound.title')}
        </h1>
        <p className="text-copy-muted text-lead leading-relaxed max-w-sm">{t('notFound.body')}</p>
      </div>

      <div className="mt-12">
        <PrimaryButton onClick={() => void navigate('/')}>{t('notFound.goToStart')}</PrimaryButton>
      </div>
    </div>
  );
};

export default NotFound;
