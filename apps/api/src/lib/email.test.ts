import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.js';
import {
  ConsoleEmailProvider,
  createEmailProvider,
  renderTemplate,
  ResendEmailProvider,
  type TemplateName,
} from './email.js';
import { logger } from './logger.js';

const TEMPLATE_DATA: Record<TemplateName, Record<string, string>> = {
  'verify-email': { name: 'Ana', appUrl: 'https://app.test', token: 'tok123' },
  'reset-password': { name: 'Ana', appUrl: 'https://app.test', token: 'tok123' },
  'member-invite': {
    orgName: 'Box Central',
    joinCode: 'ABC123',
    crossUrl: 'https://app.test',
    scheduleUrl: 'https://agenda.test',
  },
};

const baseEnv = {
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'x'.repeat(32),
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('renderTemplate', () => {
  it('resuelve todos los placeholders — ningún {{ queda en el output', () => {
    for (const [name, data] of Object.entries(TEMPLATE_DATA)) {
      const r = renderTemplate(name as TemplateName, data);
      expect(r.subject).not.toContain('{{');
      expect(r.html).not.toContain('{{');
      expect(r.text).not.toContain('{{');
    }
  });

  it('placeholder sin dato → throw (bug del caller, no silencio)', () => {
    expect(() => renderTemplate('verify-email', { name: 'Ana' })).toThrow(/appUrl|token/);
  });

  it('verify-email y reset-password arman el link con el token', () => {
    const verify = renderTemplate('verify-email', TEMPLATE_DATA['verify-email']);
    expect(verify.text).toContain('https://app.test/verify?token=tok123');
    const reset = renderTemplate('reset-password', TEMPLATE_DATA['reset-password']);
    expect(reset.text).toContain('https://app.test/reset-password?token=tok123');
  });
});

describe('ConsoleEmailProvider', () => {
  it('loguea destinatario y el link completo con el token', async () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    await new ConsoleEmailProvider().send({
      to: 'ana@test.com',
      template: 'verify-email',
      data: TEMPLATE_DATA['verify-email'],
    });
    expect(spy).toHaveBeenCalledOnce();
    const [payload] = spy.mock.calls[0] as [{ to: string; body: string }, string];
    expect(payload.to).toBe('ana@test.com');
    expect(payload.body).toContain('https://app.test/verify?token=tok123');
  });
});

describe('ResendEmailProvider', () => {
  it('postea a Resend con from/to/subject y auth Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await new ResendEmailProvider('re_key', 'no-reply@bv.test').send({
      to: 'ana@test.com',
      template: 'member-invite',
      data: TEMPLATE_DATA['member-invite'],
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_key');
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.from).toBe('no-reply@bv.test');
    expect(body.to).toBe('ana@test.com');
    expect(body.subject).toContain('Box Central');
  });

  it('respuesta no-ok → lanza (el caller decide si el flujo sigue)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(
      new ResendEmailProvider('re_invalida', 'no-reply@bv.test').send({
        to: 'ana@test.com',
        template: 'verify-email',
        data: TEMPLATE_DATA['verify-email'],
      }),
    ).rejects.toThrow(/401/);
  });
});

describe('createEmailProvider', () => {
  it('sin RESEND_API_KEY → consola; con key → Resend', () => {
    expect(createEmailProvider(loadConfig(baseEnv))).toBeInstanceOf(ConsoleEmailProvider);
    expect(createEmailProvider(loadConfig({ ...baseEnv, RESEND_API_KEY: 're_x' }))).toBeInstanceOf(
      ResendEmailProvider,
    );
  });
});
