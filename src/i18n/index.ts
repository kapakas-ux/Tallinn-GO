import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import et from './locales/et.json';
import ru from './locales/ru.json';
import { getSettings } from '../services/settingsService';

i18next.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    et: { translation: et },
    ru: { translation: ru },
  },
  lng: getSettings().language || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

window.addEventListener('settings_changed', () => {
  const lang = getSettings().language || 'en';
  if (i18next.language !== lang) {
    i18next.changeLanguage(lang);
  }
});

export default i18next;
