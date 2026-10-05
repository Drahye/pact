import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import './styles/surfaces.css';
import './styles/type.css';
import './components/objects/objects.css';
import { initPwaInstall } from './lib/pwaInstall';

// Before React renders: Chromium can fire beforeinstallprompt very early, and it fires once.
initPwaInstall();

// A tab opened before a deploy asks for chunks the new build no longer has. Reload once to pick up the new build; the flag stops a loop.
window.addEventListener('vite:preloadError', (event) => {
  try {
    const key = 'pact.chunk-reload';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch {
    /* no storage: let the error boundary show its retry */
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
