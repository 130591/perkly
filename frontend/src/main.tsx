import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { SWRConfig } from 'swr'
import { App } from './App.tsx'
import { AuthProvider } from './auth/AuthContext'
import { ToastProvider } from './components/Toast'
import { request } from './api/http'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SWRConfig value={{ fetcher: (path: string) => request(path) }}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </SWRConfig>
  </StrictMode>,
)
