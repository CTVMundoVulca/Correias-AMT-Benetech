import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../ui/Toast';
import { ConfirmProvider } from '../ui/ConfirmDialog';
import { EmendaApp } from './EmendaApp';
import '../styles/fonts.css';
import '../styles/tokens.css';
import '../styles/app.css';
import './emenda.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <EmendaApp />
      </ConfirmProvider>
    </ToastProvider>
  </StrictMode>,
);
