import { defineConfig } from 'vitest/config';

/**
 * Cobertura (docs/08-testing.md §7): se mide todo y se exige 90% solo donde
 * está la plata — reservas (créditos y cupos) y asignaciones de packs. Sin
 * umbral global: un número alto en módulos triviales no prueba nada, y forzarlo
 * empuja a escribir tests de relleno.
 *
 * `branches` va más bajo en assignments a propósito: sus ramas son en su
 * mayoría spreads de campos opcionales (`...(x !== undefined ? { x } : {})`),
 * donde cubrir el 90% significa combinatoria de DTOs, no lógica probada.
 */
const MONEY = { statements: 90, functions: 90, lines: 90 };

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**', 'src/index.ts'],
      thresholds: {
        '**/modules/bookings/**': { ...MONEY, branches: 90 },
        '**/modules/assignments/**': { ...MONEY, branches: 80 },
      },
    },
  },
});
