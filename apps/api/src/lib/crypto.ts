import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Material criptográfico con node:crypto, sin dependencias externas
 * (docs/05-seguridad.md §1). Hashes nuevos: scrypt N=2^15, r=8, p=1.
 * El formato almacenado es autodescriptivo (scrypt$N$r$p$salt_b64$hash_b64):
 * verifyPassword lee los parámetros del hash, así los hashes migrados de v1
 * (N=2^14) siguen verificando sin re-hash.
 */
const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_BYTES = 16;

// Cotas al parsear parámetros de un hash almacenado: un dump adulterado con
// N gigante no debe poder colgar el proceso (scrypt reserva 128*N*r bytes).
const MAX_N = 2 ** 17;
const MAX_R = 16;
const MAX_P = 4;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

function scryptAsync(secret: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      secret,
      salt,
      KEY_LEN,
      { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      },
    );
  });
}

/** Devuelve "scrypt$N$r$p$salt_b64$hash_b64" con los parámetros vigentes. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(plain, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), key.toString('base64')].join('$');
}

function parseStored(stored: string): { params: ScryptParams; salt: Buffer; key: Buffer } | null {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || N < 2 ** 10 || N > MAX_N || (N & (N - 1)) !== 0) return null;
  if (!Number.isInteger(r) || r < 1 || r > MAX_R) return null;
  if (!Number.isInteger(p) || p < 1 || p > MAX_P) return null;
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const key = Buffer.from(parts[5] ?? '', 'base64');
  if (salt.length < 8 || key.length !== KEY_LEN) return null;
  return { params: { N, r, p }, salt, key };
}

/** Comparación en tiempo constante; tolera hashes v1 (N=2^14) vía parámetros del formato. */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const parsed = parseStored(stored);
    if (!parsed) return false;
    const actual = await scryptAsync(plain, parsed.salt, parsed.params);
    return timingSafeEqual(actual, parsed.key);
  } catch {
    return false;
  }
}

// Hash real de una password descartada — pre-generado para que fakeVerify
// ejecute exactamente el mismo camino que un verify legítimo.
const DUMMY_HASH =
  'scrypt$32768$8$1$BgFteky6FKIKr5vUPNkrjw==$kvzIXnHWvc4FFm/VY6ADGZoexo1SYF0+UWwnkRcz/p7NHqw5TZWZdNhVfdJ0pn8k7y5XTKw7ALtxjwLJZZ7Xhg==';

/**
 * Uniforma timing en login cuando el email no existe (docs/05-seguridad.md §1):
 * corre un verify completo contra un hash dummy y descarta el resultado.
 */
export async function fakeVerify(): Promise<void> {
  await verifyPassword('definitivamente-no-es-la-password', DUMMY_HASH);
}

/** Token opaco de 256 bits en base64url (43 chars, apto para URL y cookie). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** En DB se persiste SOLO el hash del token — un dump no sirve para impersonar. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

let commonPasswords: Set<string> | null = null;

function loadCommonPasswords(): Set<string> {
  if (!commonPasswords) {
    const file = new URL('../../data/common-passwords.txt', import.meta.url);
    commonPasswords = new Set(
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => line.trim().toLowerCase())
        .filter(Boolean),
    );
  }
  return commonPasswords;
}

/** Política RN de passwords: mínimo 8 chars y fuera del top-10k de comunes. */
export function isWeakPassword(plain: string): boolean {
  if (plain.length < 8) return true;
  return loadCommonPasswords().has(plain.toLowerCase());
}
