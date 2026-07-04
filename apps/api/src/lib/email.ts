import type { Config } from '../config.js';
import { logger } from './logger.js';

/**
 * Envío de emails transaccionales (docs/tasks/F1.md F1-03).
 * El provider SOLO lanza ante fallo: el servicio que envía decide si el flujo
 * sigue (register no debe fallar porque falló el mail — el usuario reintenta
 * con resend). Selección por config: sin RESEND_API_KEY → consola (dev/test).
 */

export type TemplateName = 'verify-email' | 'reset-password' | 'member-invite';

export interface SendEmailInput {
  to: string;
  template: TemplateName;
  data: Record<string, string>;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<void>;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// Templates en español, HTML simple + texto plano, sin tracking
// (docs/tasks/F1.md F1-03). Placeholders {{clave}} se resuelven con `data`.
const TEMPLATES: Record<TemplateName, EmailTemplate> = {
  'verify-email': {
    subject: 'Verificá tu email — BV Cross',
    html: `<p>Hola {{name}},</p>
<p>Para activar tu cuenta hacé clic en el siguiente enlace (vence en 30 minutos):</p>
<p><a href="{{appUrl}}/verify?token={{token}}">Verificar mi email</a></p>
<p>Si no creaste una cuenta en BV Cross, ignorá este mensaje.</p>`,
    text: `Hola {{name}},

Para activar tu cuenta abrí este enlace (vence en 30 minutos):
{{appUrl}}/verify?token={{token}}

Si no creaste una cuenta en BV Cross, ignorá este mensaje.`,
  },
  'reset-password': {
    subject: 'Restablecer tu contraseña — BV Cross',
    html: `<p>Hola {{name}},</p>
<p>Recibimos un pedido para restablecer tu contraseña. El enlace vence en 30 minutos:</p>
<p><a href="{{appUrl}}/reset-password?token={{token}}">Elegir nueva contraseña</a></p>
<p>Si no fuiste vos, ignorá este mensaje: tu contraseña sigue igual.</p>`,
    text: `Hola {{name}},

Recibimos un pedido para restablecer tu contraseña. El enlace vence en 30 minutos:
{{appUrl}}/reset-password?token={{token}}

Si no fuiste vos, ignorá este mensaje: tu contraseña sigue igual.`,
  },
  'member-invite': {
    subject: 'Te invitaron a {{orgName}} — BV Cross',
    html: `<p>Hola,</p>
<p><strong>{{orgName}}</strong> te invitó a sumarte en BV Cross.</p>
<p>Tu código para unirte es: <strong>{{joinCode}}</strong></p>
<p>Usalo en cualquiera de las apps:</p>
<ul>
<li><a href="{{crossUrl}}">Registro de cargas</a></li>
<li><a href="{{scheduleUrl}}">Agenda de clases</a></li>
</ul>`,
    text: `Hola,

{{orgName}} te invitó a sumarte en BV Cross.
Tu código para unirte es: {{joinCode}}

Usalo en cualquiera de las apps:
- Registro de cargas: {{crossUrl}}
- Agenda de clases: {{scheduleUrl}}`,
  },
};

/** Reemplaza {{clave}}; placeholder sin dato es bug del caller → throw. */
function render(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = data[key];
    if (value === undefined) {
      throw new Error(`Template con placeholder sin resolver: ${key}`);
    }
    return value;
  });
}

export function renderTemplate(name: TemplateName, data: Record<string, string>): RenderedEmail {
  const tpl = TEMPLATES[name];
  return {
    subject: render(tpl.subject, data),
    html: render(tpl.html, data),
    text: render(tpl.text, data),
  };
}

/** Dev/test: imprime destinatario y cuerpo completo (incluye el link con token) al log. */
export class ConsoleEmailProvider implements EmailProvider {
  send(input: SendEmailInput): Promise<void> {
    const rendered = renderTemplate(input.template, input.data);
    logger.info(
      { to: input.to, template: input.template, subject: rendered.subject, body: rendered.text },
      'email (console provider)',
    );
    return Promise.resolve();
  }
}

const RESEND_URL = 'https://api.resend.com/emails';

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(input: SendEmailInput): Promise<void> {
    const rendered = renderTemplate(input.template, input.data);
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend respondió ${String(res.status)} para template ${input.template}`);
    }
  }
}

export function createEmailProvider(config: Config): EmailProvider {
  if (config.RESEND_API_KEY) {
    return new ResendEmailProvider(config.RESEND_API_KEY, config.EMAIL_FROM);
  }
  return new ConsoleEmailProvider();
}
