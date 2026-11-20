import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests unitaires des fonctions de calcul (src/lib). Pas de DOM : logique pure uniquement.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
