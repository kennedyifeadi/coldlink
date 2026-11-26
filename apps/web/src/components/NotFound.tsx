import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import logoMain from '../assets/logo_main.webp';
import PrimaryButton from './ui/PrimaryButton';

const NotFound = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-screen bg-background px-5 pb-8">
      <div className="py-6">
        <img src={logoMain} alt={t('common.logoAlt')} width={138} height={32} />
      </div>

      <div className="pt-16 mb-auto pb-6">
        <h1 className="text-headline font-bold text-ink mb-2">{t('notFound.title')}</h1>
        <p className="text-copy-muted text-body">{t('notFound.body')}</p>
      </div>

      <div className="mt-12">
        <PrimaryButton onClick={() => void navigate('/')}>{t('notFound.goToStart')}</PrimaryButton>
      </div>
    </div>
  );
};

export default NotFound;
