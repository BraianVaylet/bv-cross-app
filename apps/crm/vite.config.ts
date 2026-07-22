import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };
// Build id visible al pie de la cuenta: versión + fecha corta (yyyymmdd).
const buildId = `${pkg.version}+${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

/**
 * El CRM no es PWA (a diferencia de las apps del atleta): se usa desde la
 * compu del mostrador o el teléfono del dueño, siempre con conexión. Nada de
 * service worker en una app que cambia seguido.
 */
export default defineConfig({
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
  },
  plugins: [react(), tailwindcss()],
  server: {
    // 5173 bv-cross · 5174 BV Agenda · 5175 el CRM.
    port: 5175,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
