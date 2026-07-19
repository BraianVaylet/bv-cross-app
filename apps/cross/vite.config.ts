import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// PWA (manifest + service worker con prompt de actualización) llega en F2-06.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // En dev el FE habla same-origin y Vite proxea a la API local: la cookie
    // HttpOnly de refresh viaja sin pelear con SameSite entre puertos.
    // En prod VITE_API_URL apunta a https://api.<apex> (cookie con Domain).
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});
