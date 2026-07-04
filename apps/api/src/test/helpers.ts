import { loadConfig, type Config } from '../config.js';

/** Config válida para tests; override puntual por caso. */
export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://localhost:27017/bvcross-test',
    JWT_SECRET: 'x'.repeat(48),
    APP_ORIGINS: 'https://app.bvcross.test,https://crm.bvcross.test',
    ...overrides,
  });
}
