import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ptBR from './locales/pt-BR.json'
import es from './locales/es.json'
import zh from './locales/zh.json'
import ja from './locales/ja.json'
import ru from './locales/ru.json'

// One resource bundle per language. Adding a language = add a JSON file here
// plus one entry in the language registry below — no feature code changes.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文（简体）' },
  { code: 'ru', label: 'Русский' }
] as const

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'pt-BR': { translation: ptBR },
    es: { translation: es },
    ja: { translation: ja },
    zh: { translation: zh },
    ru: { translation: ru }
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnEmptyString: false
})
