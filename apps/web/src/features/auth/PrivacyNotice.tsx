import React from 'react';
import { useTranslation } from 'react-i18next';
import TopNavBar from '../../components/TopNavBar';
import Card from '../../components/ui/Card';

type Section = 'collect' | 'why' | 'share' | 'rights';

const sections: Section[] = ['collect', 'why', 'share', 'rights'];

const PrivacyNotice = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full min-h-screen bg-background relative">
      <TopNavBar title={t('privacy.navTitle')} showBack={true} />

      <main className="flex flex-col px-5 pt-6 pb-10">
        <h1 className="font-heading text-headline-lg font-bold text-ink mb-2 tracking-tight">
          {t('privacy.title')}
        </h1>
        <p className="text-copy-muted text-lead leading-relaxed mb-6">{t('privacy.intro')}</p>

        <div className="flex flex-col gap-4">
          {sections.map((key) => (
            <Card key={key} tone="muted" className="p-5">
              <h2 className="font-heading font-semibold text-ink text-title mb-3">
                {t(`privacy.sections.${key}.title`)}
              </h2>
              <ul className="flex flex-col gap-2 list-disc pl-5 marker:text-primary-strong">
                {t(`privacy.sections.${key}.items`, { returnObjects: true }).map((item) => (
                  <li key={item} className="text-body text-copy leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <p className="text-copy-muted text-body leading-relaxed mt-6">{t('privacy.law')}</p>
      </main>
    </div>
  );
};

export default PrivacyNotice;
