import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './context/ToastContext'
import { SellerProvider } from './context/SellerContext'
import './index.css'

// Registrar Service Worker solo en producción
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Fallo silencioso — la app funciona sin SW
    });
  });
}

// Capturar el evento de instalación PWA para mostrarlo en la UI
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__pwaInstallPrompt = e;
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SellerProvider>
          <App />
        </SellerProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)
