import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ToastProvider } from '../ui/Toast';
import { ConfirmProvider } from '../ui/ConfirmDialog';
import { ProgApp } from './ProgApp';
import '../styles/fonts.css';
import '../styles/tokens.css';
import '../styles/app.css';
import './prog.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <ProgApp />
      </ConfirmProvider>
    </ToastProvider>
  </StrictMode>,
);
