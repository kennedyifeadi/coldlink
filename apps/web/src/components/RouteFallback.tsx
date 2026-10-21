import React from 'react';
import { useTranslation } from 'react-i18next';

// The message fades in late so fast loads show nothing but the page background.
const RouteFallback = () => {
  const { t } = useTranslation();

  return (
    <div role="status" className="flex items-center justify-center min-h-screen bg-background">
      <p className="text-copy-subtle text-body opacity-0 animate-fade-in-late">
        {t('common.loading')}
      </p>
    </div>
  );
};

export default RouteFallback;
