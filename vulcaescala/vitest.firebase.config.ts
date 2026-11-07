import { defineConfig } from 'vitest/config';

// Testes que precisam do emulador do Firebase (npm run test:firebase)
export default defineConfig({
  test: { include: ['firebase/tests/**/*.test.ts'], testTimeout: 20000, hookTimeout: 30000, fileParallelism: false },
});
