import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // Necesario para el auto-cleanup de Testing Library entre tests
    // (sin afterEach global, los árboles renderizados se acumulan en el DOM).
    globals: true,
  },
});
