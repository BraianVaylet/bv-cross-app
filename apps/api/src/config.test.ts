import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/bvcross',
  JWT_SECRET: 'x'.repeat(32),
};

describe('loadConfig (fail-fast, docs/05-seguridad.md §6)', () => {
  it('loads with defaults from a minimal valid env', () => {
    const c = loadConfig(valid);
    expect(c.PORT).toBe(8787);
    expect(c.ACCESS_TOKEN_TTL_MIN).toBe(15);
    expect(c.APP_ORIGINS).toEqual([]);
    expect(c.isProd).toBe(false);
  });

  it('fails naming the missing variable', () => {
    expect(() => loadConfig({ MONGODB_URI: valid.MONGODB_URI })).toThrowError(ConfigError);
    try {
      loadConfig({ MONGODB_URI: valid.MONGODB_URI });
    } catch (e) {
      expect((e as Error).message).toContain('JWT_SECRET');
    }
  });

  it('rejects short JWT_SECRET and non-mongo URI', () => {
    expect(() => loadConfig({ ...valid, JWT_SECRET: 'corto' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...valid, MONGODB_URI: 'https://nope' })).toThrow(ConfigError);
  });

  it('parses APP_ORIGINS csv and rejects non-urls', () => {
    const c = loadConfig({ ...valid, APP_ORIGINS: 'https://a.test, https://b.test' });
    expect(c.APP_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
    expect(() => loadConfig({ ...valid, APP_ORIGINS: 'no-es-url' })).toThrow(ConfigError);
  });

  it('COOKIE_DOMAIN must start with dot; empty means undefined', () => {
    expect(loadConfig({ ...valid, COOKIE_DOMAIN: '' }).COOKIE_DOMAIN).toBeUndefined();
    expect(loadConfig({ ...valid, COOKIE_DOMAIN: '.bv.app' }).COOKIE_DOMAIN).toBe('.bv.app');
    expect(() => loadConfig({ ...valid, COOKIE_DOMAIN: 'bv.app' })).toThrow(ConfigError);
  });
});
