import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AppDataProvider } from './store/AppDataContext.jsx'

// On GitHub Pages the app lives under /<repo>/, so React Router needs that
// same prefix as its basename. Vite exposes it as BASE_URL (from vite.config
// `base`). Strip the trailing slash; '/' means root (local dev / custom domain).
const routerBase = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={routerBase}>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </BrowserRouter>
  </StrictMode>,
)
