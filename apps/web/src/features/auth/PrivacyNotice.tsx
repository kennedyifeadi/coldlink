import React from 'react';
import { useTranslation } from 'react-i18next';
import TopNavBar from '../../components/TopNavBar';
import PageHeader from '../../components/ui/PageHeader';

type Section = 'collect' | 'why' | 'share' | 'rights';

const sections: Section[] = ['collect', 'why', 'share', 'rights'];

const PrivacyNotice = () => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <TopNavBar title={t('privacy.navTitle')} showBack={true} />

      <main className="flex flex-col pb-10">
        <PageHeader title={t('privacy.title')} intro={t('privacy.intro')} />

        <div className="flex flex-col divide-y divide-line">
          {sections.map((key) => (
            <section key={key} className="px-5 py-6">
              <h2 className="font-semibold text-ink text-subtitle mb-3">
                {t(`privacy.sections.${key}.title`)}
              </h2>
              <ul className="flex flex-col gap-2 list-disc pl-5 marker:text-primary">
                {t(`privacy.sections.${key}.items`, { returnObjects: true }).map((item) => (
                  <li key={item} className="text-body text-ink">
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="text-copy-muted text-label px-5 pt-2">{t('privacy.law')}</p>
      </main>
    </div>
  );
};

export default PrivacyNotice;
