import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string };
// Build id visible al pie de la cuenta: versión + fecha corta (yyyymmdd).
const buildId = `${pkg.version}+${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

export default defineConfig({
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': la versión nueva no se aplica sola; la app avisa y el usuario
      // actualiza con un toque (components/UpdatePrompt.tsx). Con 'autoUpdate'
      // la pestaña abierta seguiría con el JS viejo hasta un refresh manual.
      registerType: 'prompt',
      injectRegister: 'auto',
      devOptions: { enabled: false },
      includeAssets: ['icon.svg', 'icon-maskable.svg'],
      manifest: {
        // App aparte de BV Cross: se instala con su propio ícono y su propio
        // nombre. Comparten sesión (cookie de apex), no instalación.
        name: 'BV Agenda',
        short_name: 'BV Agenda',
        description: 'Reservá tus clases y mirá tu saldo.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        // Base clara de @bv/ui (tokens.css --c-base light).
        background_color: '#F7F8F3',
        theme_color: '#F7F8F3',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Datos del usuario: red primero, con fallback a caché sin conexión.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') && request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // 5174: bv-cross ya usa el 5173 y en dev las dos corren juntas para
    // probar el SSO (misma cookie, mismo host vía proxy).
    port: 5174,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
