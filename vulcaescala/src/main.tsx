import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StoreProvider } from './state/store';
import { LocalStorageRepository } from './storage/LocalStorageRepository';
import './styles.css';

// Para trocar de backend, basta criar outra implementação de StorageRepository aqui.
const repository = new LocalStorageRepository();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider repository={repository}>
      <App />
    </StoreProvider>
  </StrictMode>,
);
