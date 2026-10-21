import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

// Synchronous init with bundled resources, so the first render already has its text.
void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: en } },
  initAsync: false,
  interpolation: { escapeValue: false },
});

export default i18n;
