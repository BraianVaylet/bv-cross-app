import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [react(), tailwindcss()],
});
