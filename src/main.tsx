import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import { initPwaInstall } from './lib/pwaInstall';

// Before React renders: Chromium can fire beforeinstallprompt very early, and it fires once.
initPwaInstall();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
