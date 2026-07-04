import type {
  LoginBody,
  LoginResponseDto,
  RegisterBody,
  UserDto,
} from '@bv/contracts';
import { MongoServerError } from 'mongodb';
import type { Config } from '../../config.js';
import type { UserDoc } from '../../db/types.js';
import {
  fakeVerify,
  generateToken,
  hashPassword,
  hashToken,
  isWeakPassword,
  verifyPassword,
} from '../../lib/crypto.js';
import type { EmailProvider } from '../../lib/email.js';
import { DomainError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import {
  consumeEmailToken,
  findEmailTokenByHash,
  findUserByEmail,
  insertEmailToken,
  insertUser,
  invalidateEmailTokens,
  listMembershipSummaries,
  markEmailVerified,
} from './auth.repo.js';
import { issuePair, type RefreshMeta, type TokenPair } from './token-service.js';

const VERIFY_TOKEN_TTL_MIN = 30;

export interface AuthDeps {
  config: Config;
  emailProvider: EmailProvider;
}

export interface LoginResult extends LoginResponseDto {
  refreshToken: string;
  refreshExpiresAt: Date;
}

function toUserDto(user: UserDoc): UserDto {
  return {
    id: user._id.toHexString(),
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

export function createAuthService(deps: AuthDeps) {
  const { config, emailProvider } = deps;

  // URL base para los links de email: el FE de cargas (primer origen configurado).
  const appUrl = config.APP_ORIGINS[0] ?? 'http://localhost:5173';

  /** Emite token de verificación y manda el email. Lanza si el provider falla. */
  async function sendVerificationEmail(user: UserDoc): Promise<void> {
    const token = generateToken();
    await insertEmailToken({
      userId: user._id,
      purpose: 'verify',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MIN * 60 * 1000),
    });
    await emailProvider.send({
      to: user.email,
      template: 'verify-email',
      data: { name: user.name, appUrl, token },
    });
  }

  async function register(body: RegisterBody): Promise<UserDto> {
    if (isWeakPassword(body.password)) {
      throw new DomainError(
        'WEAK_PASSWORD',
        'La contraseña debe tener al menos 8 caracteres y no ser una contraseña común.',
      );
    }
    const passwordHash = await hashPassword(body.password);
    let user: UserDoc;
    try {
      user = await insertUser({ email: body.email, name: body.name, passwordHash });
    } catch (err) {
      // Race de doble registro: la unicidad la garantiza el índice (E11000).
      if (err instanceof MongoServerError && err.code === 11000) {
        throw new DomainError('EMAIL_TAKEN', 'Ya existe una cuenta con ese email.');
      }
      throw err;
    }
    try {
      await sendVerificationEmail(user);
    } catch (err) {
      // El registro NO falla por un mail caído: el usuario usa resend.
      logger.warn({ err, userId: user._id.toHexString() }, 'verification email failed');
    }
    return toUserDto(user);
  }

  async function verifyEmail(token: string): Promise<void> {
    const invalid = new DomainError('TOKEN_INVALID', 'El enlace no es válido o ya venció.');
    const doc = await findEmailTokenByHash(hashToken(token));
    // Mismo error para inexistente/usado/expirado/propósito equivocado: sin oráculo.
    if (!doc || doc.purpose !== 'verify' || doc.expiresAt <= new Date()) throw invalid;
    const consumed = await consumeEmailToken(doc._id);
    if (!consumed) throw invalid;
    await markEmailVerified(doc.userId);
  }

  /** Siempre resuelve (202 en la ruta): no filtra si el email existe. */
  async function resendVerification(email: string): Promise<void> {
    const user = await findUserByEmail(email);
    if (!user || user.emailVerifiedAt !== null) return;
    await invalidateEmailTokens(user._id, 'verify');
    try {
      await sendVerificationEmail(user);
    } catch (err) {
      logger.warn({ err, userId: user._id.toHexString() }, 'verification email failed');
    }
  }

  async function login(body: LoginBody, meta: RefreshMeta = {}): Promise<LoginResult> {
    const user = await findUserByEmail(body.email);
    if (!user) {
      // Timing uniforme: mismo costo de scrypt aunque la cuenta no exista.
      await fakeVerify();
      throw new DomainError('INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
    }
    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw new DomainError('INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
    if (user.emailVerifiedAt === null) {
      throw new DomainError('EMAIL_NOT_VERIFIED', 'Verificá tu email antes de ingresar.');
    }
    const pair: TokenPair = await issuePair(user._id.toHexString(), config, meta);
    const memberships = await listMembershipSummaries(user._id);
    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      refreshExpiresAt: pair.refreshExpiresAt,
      user: toUserDto(user),
      memberships,
    };
  }

  return { register, verifyEmail, resendVerification, login };
}

export type AuthService = ReturnType<typeof createAuthService>;
