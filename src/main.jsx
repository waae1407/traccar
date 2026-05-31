import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const clearDevServiceWorkerCache = async () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;

  const hasCleared = sessionStorage.getItem('base44_dev_cache_cleared');
  if (hasCleared) return;

  const registrations = navigator.serviceWorker?.getRegistrations
    ? await navigator.serviceWorker.getRegistrations()
    : [];
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if (window.caches?.keys) {
    const cacheNames = await window.caches.keys();
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
  }

  if (registrations.length) {
    sessionStorage.setItem('base44_dev_cache_cleared', 'true');
    window.location.reload();
  }
};

clearDevServiceWorkerCache().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
  )
});