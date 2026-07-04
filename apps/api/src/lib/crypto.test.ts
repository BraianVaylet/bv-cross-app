import { describe, expect, it } from 'vitest';
import {
  fakeVerify,
  generateToken,
  hashPassword,
  hashToken,
  isWeakPassword,
  verifyPassword,
} from './crypto.js';

// Fixture generada ejecutando el crypto.ts REAL de bv-cross v1
// (scripts en el PR): garantía de que los hashes migrados siguen verificando.
const V1_PASSWORD = 'Xk9#mQ2v-fixture';
const V1_HASH =
  'scrypt$16384$8$1$K2uCtFO0pLGLIMgOC4ifow==$cbnDjVMdc5pe4Z2LR2rPLKPF5mG4LZoiu3WgMxWE9dzFzdx9Q98fauJ3Sk8ul/1qkNkEOobSOcTQ2NuWg8ge9A==';

describe('hashPassword / verifyPassword', () => {
  it('verifica un hash recién creado y rechaza password incorrecta', async () => {
    const hash = await hashPassword('una-password-segura');
    expect(await verifyPassword('una-password-segura', hash)).toBe(true);
    expect(await verifyPassword('otra-password', hash)).toBe(false);
  });

  it('rechaza un hash adulterado (un char cambiado)', async () => {
    const hash = await hashPassword('una-password-segura');
    const parts = hash.split('$');
    const key = parts[5] ?? '';
    parts[5] = (key.startsWith('A') ? 'B' : 'A') + key.slice(1);
    expect(await verifyPassword('una-password-segura', parts.join('$'))).toBe(false);
  });

  it('verifica un hash real de v1 (N=2^14) — garantía de migración', async () => {
    expect(await verifyPassword(V1_PASSWORD, V1_HASH)).toBe(true);
    expect(await verifyPassword('password-equivocada', V1_HASH)).toBe(false);
  });

  it('emite hashes nuevos con N=2^15 en formato autodescriptivo', async () => {
    const hash = await hashPassword('x'.repeat(12));
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('dos hashes de la misma password difieren (salt aleatorio)', async () => {
    const [a, b] = await Promise.all([hashPassword('misma-pass'), hashPassword('misma-pass')]);
    expect(a).not.toBe(b);
    expect(await verifyPassword('misma-pass', a)).toBe(true);
    expect(await verifyPassword('misma-pass', b)).toBe(true);
  });

  it('rechaza formatos inválidos y parámetros fuera de cota sin lanzar', async () => {
    expect(await verifyPassword('x', 'no-es-un-hash')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$abc$def')).toBe(false);
    // N gigante (DoS por memoria) y N que no es potencia de 2
    expect(await verifyPassword('x', V1_HASH.replace('16384', '1048576'))).toBe(false);
    expect(await verifyPassword('x', V1_HASH.replace('16384', '20000'))).toBe(false);
  });
});

describe('fakeVerify', () => {
  it('completa sin lanzar y tarda como un verify real (camino idéntico)', async () => {
    await expect(fakeVerify()).resolves.toBeUndefined();
  });
});

describe('generateToken / hashToken', () => {
  it('genera 100 tokens únicos en base64url estricto de 43 chars', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('hashToken es SHA-256 hex determinístico y distinto del token', () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });
});

describe('isWeakPassword', () => {
  it('corta (<8) → débil', () => {
    expect(isWeakPassword('1234567')).toBe(true);
  });

  it('en la lista top-10k → débil, insensible a mayúsculas', () => {
    expect(isWeakPassword('password')).toBe(true);
    expect(isWeakPassword('PASSWORD')).toBe(true);
    expect(isWeakPassword('12345678')).toBe(true);
  });

  it('fuerte → false', () => {
    expect(isWeakPassword('Xk9#mQ2v')).toBe(false);
  });
});
