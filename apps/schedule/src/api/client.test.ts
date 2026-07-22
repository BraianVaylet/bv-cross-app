import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  getAccessToken,
  request,
  SESSION_EXPIRED_EVENT,
  setAccessToken,
  setActiveOrgId,
} from './client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const expired = () =>
  jsonResponse(401, { error: { code: 'TOKEN_EXPIRED', message: 'Token vencido.' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  setAccessToken('token-viejo');
  setActiveOrgId(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  setActiveOrgId(null);
});

describe('caso 1 — refresh single-flight', () => {
  it('2 requests concurrentes con TOKEN_EXPIRED → exactamente 1 refresh, ambas reintentadas OK', async () => {
    let refreshCalls = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        // refresh lento: obliga a las dos a compartir la misma promesa
        return new Promise((resolve) =>
          setTimeout(() => { resolve(jsonResponse(200, { accessToken: 'token-nuevo' })); }, 20),
        );
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (auth === 'Bearer token-nuevo') return Promise.resolve(jsonResponse(200, { ok: true }));
      return Promise.resolve(expired());
    });

    const [a, b] = await Promise.all([
      request<{ ok: boolean }>('/api/v1/me'),
      request<{ ok: boolean }>('/api/v1/me/memberships'),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBe('token-nuevo');
  });
});

describe('caso 2 — refresh muerto', () => {
  it('refresh 401 → token en memoria null + evento de sesión expirada', async () => {
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(jsonResponse(401, { error: { code: 'TOKEN_INVALID', message: 'x' } }));
      }
      return Promise.resolve(expired());
    });

    await expect(request('/api/v1/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(getAccessToken()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });
});

describe('caso 3 — header X-Org-Id', () => {
  it('presente con org activa; ausente en /auth/*', async () => {
    setActiveOrgId('0123456789abcdef01234567');
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, {})));

    await request('/api/v1/sessions');
    await request('/api/v1/auth/logout', { method: 'POST' });

    const dataHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    const authHeaders = (fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>;
    expect(dataHeaders['X-Org-Id']).toBe('0123456789abcdef01234567');
    expect(authHeaders['X-Org-Id']).toBeUndefined();
    // credentials: include solo en /auth/*
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).credentials).toBe('same-origin');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).credentials).toBe('include');
  });
});

describe('caso 4 — ApiError', () => {
  it('mapea code/message/details del envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: { code: 'TYPE_LOCKED', message: 'No se puede.', details: { hint: 'x' } },
      }),
    );

    const err = await request('/api/v1/sessions/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.code).toBe('TYPE_LOCKED');
    expect(apiErr.status).toBe(409);
    expect(apiErr.message).toBe('No se puede.');
    expect(apiErr.details).toEqual({ hint: 'x' });
  });

  it('red caída → ApiError NETWORK', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(request('/api/v1/me')).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });
});
