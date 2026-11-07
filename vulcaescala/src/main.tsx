import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import { App } from './App';
import { StoreProvider } from './state/store';
import { ToastProvider } from './ui/Toast';
import { ConfirmProvider } from './ui/ConfirmDialog';
import { createDefaultRepository } from './storage/LocalStorageRepository';
import './styles/tokens.css';
import './styles/app.css';

// Para trocar de backend, basta outra implementação de StorageRepository aqui.
const repository = createDefaultRepository();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider repository={repository}>
          <App />
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>
  </StrictMode>,
);
