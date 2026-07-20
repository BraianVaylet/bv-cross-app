import type {
  LoginBody,
  LoginResponseDto,
  RegisterBody,
  UserDto,
} from '@bv/contracts';
import { MongoServerError, ObjectId } from 'mongodb';
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
  findUserById,
  insertEmailToken,
  insertUser,
  invalidateEmailTokens,
  listMembershipSummaries,
  markEmailVerified,
  updatePasswordHash,
  updateUserName,
} from './auth.repo.js';
import {
  findRefreshTokenByHash,
  issueAccessToken,
  issuePair,
  revokeAllUserFamilies,
  revokeFamily,
  rotateRefreshToken,
  type RefreshMeta,
  type TokenPair,
} from './token-service.js';

const VERIFY_TOKEN_TTL_MIN = 30;
const RESET_TOKEN_TTL_MIN = 30;

export interface AuthDeps {
  config: Config;
  emailProvider: EmailProvider;
}

export interface LoginResult extends LoginResponseDto {
  refreshToken: string;
  refreshExpiresAt: Date;
}

export function toUserDto(user: UserDoc): UserDto {
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

  /**
   * Rotación con detección de reuso (docs/05-seguridad.md §1). Un token ya
   * rotado (revokedAt) presentado de nuevo = posible robo: cae la familia
   * entera y queda log warn como evento de seguridad.
   */
  async function refresh(token: string, meta: RefreshMeta = {}): Promise<TokenPair> {
    const invalid = new DomainError('TOKEN_INVALID', 'La sesión ya no es válida.');
    const doc = await findRefreshTokenByHash(hashToken(token));
    if (!doc || doc.expiresAt <= new Date()) throw invalid;
    if (doc.revokedAt !== undefined) {
      await revokeFamily(doc.familyId);
      logger.warn(
        {
          userId: doc.userId.toHexString(),
          familyId: doc.familyId.toHexString(),
          ip: meta.ip,
          userAgent: meta.userAgent,
        },
        'refresh token reuse detected - family revoked',
      );
      throw invalid;
    }
    const [accessToken, rotated] = await Promise.all([
      issueAccessToken(doc.userId.toHexString(), config),
      rotateRefreshToken(doc, config, meta),
    ]);
    return { accessToken, refreshToken: rotated.token, refreshExpiresAt: rotated.expiresAt };
  }

  /** Idempotente: sin cookie o token desconocido también resuelve (204). */
  async function logout(token: string | undefined): Promise<void> {
    if (!token) return;
    const doc = await findRefreshTokenByHash(hashToken(token));
    if (doc) await revokeFamily(doc.familyId);
  }

  /** Siempre resuelve (202): no filtra si el email existe. */
  async function forgotPassword(email: string): Promise<void> {
    const user = await findUserByEmail(email);
    if (!user) return;
    await invalidateEmailTokens(user._id, 'reset');
    const token = generateToken();
    await insertEmailToken({
      userId: user._id,
      purpose: 'reset',
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000),
    });
    try {
      await emailProvider.send({
        to: user.email,
        template: 'reset-password',
        data: { name: user.name, appUrl, token },
      });
    } catch (err) {
      logger.warn({ err, userId: user._id.toHexString() }, 'reset email failed');
    }
  }

  async function resetPassword(token: string, newPassword: string): Promise<void> {
    // La fortaleza se valida ANTES de tocar el token: un fallo acá no lo quema.
    if (isWeakPassword(newPassword)) {
      throw new DomainError(
        'WEAK_PASSWORD',
        'La contraseña debe tener al menos 8 caracteres y no ser una contraseña común.',
      );
    }
    const invalid = new DomainError('TOKEN_INVALID', 'El enlace no es válido o ya venció.');
    const doc = await findEmailTokenByHash(hashToken(token));
    if (!doc || doc.purpose !== 'reset' || doc.expiresAt <= new Date()) throw invalid;
    const consumed = await consumeEmailToken(doc._id);
    if (!consumed) throw invalid;
    await updatePasswordHash(doc.userId, await hashPassword(newPassword));
    // Probó control del email: vale como verificación si estaba pendiente.
    await markEmailVerified(doc.userId);
    // Posible cuenta comprometida: caen TODAS las sesiones (herencia v1).
    await revokeAllUserFamilies(doc.userId);
  }

  async function changePassword(
    userId: string,
    body: { currentPassword: string; newPassword: string },
    currentRefreshToken: string | undefined,
  ): Promise<void> {
    if (isWeakPassword(body.newPassword)) {
      throw new DomainError(
        'WEAK_PASSWORD',
        'La contraseña debe tener al menos 8 caracteres y no ser una contraseña común.',
      );
    }
    const user = await findUserById(new ObjectId(userId));
    if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw new DomainError('INVALID_CREDENTIALS', 'La contraseña actual no es correcta.');
    }
    await updatePasswordHash(user._id, await hashPassword(body.newPassword));
    // UX: la sesión que cambió la password sigue viva; el resto muere.
    const current = currentRefreshToken
      ? await findRefreshTokenByHash(hashToken(currentRefreshToken))
      : null;
    await revokeAllUserFamilies(user._id, current?.familyId);
  }

  /** GET /me (F1-07). */
  async function getMe(userId: string): Promise<UserDto> {
    const user = await findUserById(new ObjectId(userId));
    if (!user) throw new DomainError('TOKEN_INVALID', 'Autenticación inválida.');
    return toUserDto(user);
  }

  /** GET /me/memberships (F1-07): selector de org, solo active/invited. */
  function myMemberships(userId: string) {
    return listMembershipSummaries(new ObjectId(userId));
  }

  /** PATCH /me (F2-06): editar el nombre propio. */
  async function updateName(userId: string, name: string): Promise<UserDto> {
    const id = new ObjectId(userId);
    await updateUserName(id, name);
    const user = await findUserById(id);
    if (!user) throw new DomainError('TOKEN_INVALID', 'Autenticación inválida.');
    return toUserDto(user);
  }

  return {
    register,
    verifyEmail,
    resendVerification,
    login,
    refresh,
    logout,
    forgotPassword,
    resetPassword,
    changePassword,
    getMe,
    myMemberships,
    updateName,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
