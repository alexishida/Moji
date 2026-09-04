import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import packageJson from '../package.json'
import en from './locales/en.json'
import enGB from './locales/en-GB.json'
import ptBR from './locales/pt-BR.json'
import ptPT from './locales/pt-PT.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import it from './locales/it.json'
import nl from './locales/nl.json'
import ar from './locales/ar.json'
import hi from './locales/hi.json'
import zh from './locales/zh.json'
import zhTW from './locales/zh-TW.json'
import ja from './locales/ja.json'
import ru from './locales/ru.json'

// One resource bundle per language. Adding a language = add a JSON file here
// plus one entry in the language registry below — no feature code changes.
export const LANGUAGES = [
  { code: 'en', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文（简体）' },
  { code: 'zh-TW', label: '中文（繁體，台灣）' },
  { code: 'ru', label: 'Русский' }
] as const

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'en-GB': { translation: enGB },
    'pt-BR': { translation: ptBR },
    'pt-PT': { translation: ptPT },
    es: { translation: es },
    fr: { translation: fr },
    de: { translation: de },
    it: { translation: it },
    nl: { translation: nl },
    ar: { translation: ar },
    hi: { translation: hi },
    ja: { translation: ja },
    zh: { translation: zh },
    'zh-TW': { translation: zhTW },
    ru: { translation: ru }
  },
  lng: 'en',
  fallbackLng: 'en',
  // `version` fica disponivel em qualquer chave sem passar parametro no call site,
  // mantendo a versao exibida sempre igual a do package.json.
  interpolation: { escapeValue: false, defaultVariables: { version: packageJson.version } },
  returnEmptyString: false
})
