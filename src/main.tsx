import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import './styles/app.css'
import './styles/markdown.css'
import './i18n'
import { App } from './App'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
