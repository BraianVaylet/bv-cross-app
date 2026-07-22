import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreditBadge } from './CreditBadge.js';

const AR = 'America/Argentina/Buenos_Aires';

describe('CreditBadge', () => {
  it('muestra el saldo y el vencimiento del pack que se consume primero', () => {
    render(<CreditBadge remaining={5} expiresAt="2026-08-01T23:59:59.999Z" timeZone={AR} />);
    expect(screen.getByRole('button').textContent).toContain('5 clases');
    expect(screen.getByRole('button').textContent).toContain('vence 01/08');
  });

  it('singular con una sola clase', () => {
    render(<CreditBadge remaining={1} timeZone={AR} />);
    expect(screen.getByRole('button').textContent).toContain('1 clase');
    expect(screen.getByRole('button').textContent).not.toContain('clases');
  });

  it('sin créditos avisa qué hacer, no solo que hay cero', () => {
    render(<CreditBadge remaining={0} expiresAt="2026-08-01T23:59:59.999Z" timeZone={AR} />);
    const badge = screen.getByRole('button');
    expect(badge.textContent).toContain('Sin clases — hablá con tu gimnasio');
    expect(badge.textContent).not.toContain('vence'); // un vencimiento sin saldo confunde
    expect(badge.className).toContain('warn');
  });

  it('el vencimiento se lee en la tz del gimnasio', () => {
    // 01/08 23:59 en Buenos Aires es 02/08 en UTC: tiene que decir 01/08.
    render(<CreditBadge remaining={3} expiresAt="2026-08-02T02:59:59.999Z" timeZone={AR} />);
    expect(screen.getByRole('button').textContent).toContain('vence 01/08');
  });

  it('lleva al detalle de saldo', () => {
    const onClick = vi.fn();
    render(<CreditBadge remaining={2} timeZone={AR} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
