import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../ui/Toast';
import { ConfirmProvider } from '../ui/ConfirmDialog';
import { PonteApp } from './PonteApp';
import '../styles/fonts.css';
import '../styles/tokens.css';
import '../styles/app.css';
import './ponte.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <PonteApp />
      </ConfirmProvider>
    </ToastProvider>
  </StrictMode>,
);
