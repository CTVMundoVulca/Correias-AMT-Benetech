import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './state/store';
import { ToastProvider } from './ui/Toast';
import { ConfirmProvider } from './ui/ConfirmDialog';
import { createDefaultRepository } from './storage/LocalStorageRepository';
import { isConfigured } from './cloud/config';
import { CloudApp } from './cloud/CloudApp';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';

// Com o Firebase do AMT configurado (src/cloud/config.ts) → nuvem compartilhada com login.
// Sem configuração → modo local, só neste aparelho (como os apps CTV).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        {isConfigured() ? (
          <CloudApp />
        ) : (
          <StoreProvider repository={createDefaultRepository()}>
            <App />
          </StoreProvider>
        )}
      </ConfirmProvider>
    </ToastProvider>
  </StrictMode>,
);
