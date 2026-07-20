/**
 * Única puerta a la red (docs/tasks/F2.md F2-03).
 *
 * Decisiones de diseño obligatorias:
 * - Access token en MEMORIA DE MÓDULO (closure) — jamás localStorage.
 * - 401 TOKEN_EXPIRED → refresh single-flight: una sola promesa compartida
 *   entre requests concurrentes; la original se reintenta UNA vez.
 * - `credentials: 'include'` SOLO en /auth/* (la cookie HttpOnly de refresh
 *   no tiene por qué viajar en cada request de datos).
 */

const BASE = (import.meta.env.VITE_API_URL) ?? '';

let accessToken: string | null = null;
let activeOrgId: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setActiveOrgId(orgId: string | null): void {
  activeOrgId = orgId;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Avisa a AuthContext que la sesión murió (refresh imposible). */
export const SESSION_EXPIRED_EVENT = 'bv:session-expired';

interface RequestOptions {
  method?: string;
  body?: unknown;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

async function rawRequest(path: string, options: RequestOptions): Promise<Response> {
  const isAuthCall = path.startsWith('/api/v1/auth/');
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (activeOrgId && !isAuthCall) headers['X-Org-Id'] = activeOrgId;

  try {
    return await fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: isAuthCall ? 'include' : 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No pudimos conectar con el servidor. Revisá tu conexión.');
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let envelope: ErrorEnvelope = {};
  try {
    envelope = (await res.json()) as ErrorEnvelope;
  } catch {
    /* respuesta sin cuerpo */
  }
  return new ApiError(
    res.status,
    envelope.error?.code ?? 'ERROR',
    envelope.error?.message ?? 'Ocurrió un error inesperado.',
    envelope.error?.details,
  );
}

// ── Refresh single-flight ────────────────────────────────────────────────────
let refreshInFlight: Promise<boolean> | null = null;

/** true si renovó el access token; false si la sesión está muerta. */
function refreshOnce(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await rawRequest('/api/v1/auth/refresh', { method: 'POST' });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await rawRequest(path, options);

  // Solo TOKEN_EXPIRED dispara refresh (TOKEN_INVALID = sesión rota, no insistir).
  if (res.status === 401 && !path.startsWith('/api/v1/auth/')) {
    const err = await parseError(res.clone());
    if (err.code === 'TOKEN_EXPIRED') {
      const renewed = await refreshOnce();
      if (!renewed) {
        accessToken = null;
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        throw err;
      }
      res = await rawRequest(path, options); // reintento único
    }
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}
