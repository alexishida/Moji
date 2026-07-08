import { Menu, type MenuItemConstructorOptions } from 'electron'
import { t } from './i18n-main'
import { SUPPORTED_LANGUAGES, type Language, type MenuAction } from './shared'

interface MenuDeps {
  language: Language
  send: (action: MenuAction) => void
  setLanguage: (lang: Language) => void
}

const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
  es: 'Español'
}

export function buildMenu({ language, send, setLanguage }: MenuDeps): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: t(language, 'menu.file'),
      submenu: [
        { label: t(language, 'menu.open'), accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { type: 'separator' },
        { label: t(language, 'menu.save'), accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: t(language, 'menu.saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { type: 'separator' },
        {
          label: t(language, 'menu.export'),
          submenu: [
            { label: t(language, 'menu.exportHtml'), click: () => send('export:html') },
            { label: t(language, 'menu.exportPdf'), click: () => send('export:pdf') }
          ]
        },
        { type: 'separator' },
        { label: t(language, 'menu.quit'), role: 'quit' }
      ]
    },
    {
      label: t(language, 'menu.view'),
      submenu: [
        { label: t(language, 'menu.toggleEdit'), accelerator: 'CmdOrCtrl+E', click: () => send('toggle-edit') },
        { label: t(language, 'menu.toggleTheme'), accelerator: 'CmdOrCtrl+D', click: () => send('toggle-theme') },
        { type: 'separator' },
        {
          label: t(language, 'menu.language'),
          submenu: SUPPORTED_LANGUAGES.map<MenuItemConstructorOptions>((lang) => ({
            label: LANGUAGE_LABELS[lang],
            type: 'radio',
            checked: lang === language,
            click: () => setLanguage(lang)
          }))
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
