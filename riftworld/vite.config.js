import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' makes the built game work from any folder,
// e.g. https://<user>.github.io/Games/riftworld/dist/
export default defineConfig({
  base: './',
  plugins: [react()],
});
