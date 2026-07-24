import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SessionCard,
  isSelectable,
  occupancyTone,
  sessionState,
  type SessionLike,
  type SessionState,
} from './SessionCard.js';

const NOW = new Date('2026-07-22T12:00:00.000Z');

const session = (over: Partial<SessionLike> = {}): SessionLike => ({
  startsAt: '2026-07-22T21:00:00.000Z',
  status: 'scheduled',
  capacity: 10,
  bookedCount: 0,
  myBookingId: null,
  ...over,
});

describe('sessionState', () => {
  it('deriva los 6 estados', () => {
    expect(sessionState(session(), NOW)).toBe('available');
    expect(sessionState(session({ bookedCount: 8 }), NOW)).toBe('almost'); // 80%
    expect(sessionState(session({ bookedCount: 10 }), NOW)).toBe('full');
    expect(sessionState(session({ myBookingId: 'b1' }), NOW)).toBe('booked');
    expect(sessionState(session({ status: 'cancelled' }), NOW)).toBe('cancelled');
    expect(sessionState(session({ startsAt: '2026-07-22T09:00:00.000Z' }), NOW)).toBe('past');
  });

  it('lo propio manda: una clase reservada que se llenó sigue reservada', () => {
    expect(sessionState(session({ myBookingId: 'b1', bookedCount: 10 }), NOW)).toBe('booked');
    // Y una cancelada por el gimnasio no se disfraza de llena.
    expect(sessionState(session({ status: 'cancelled', bookedCount: 10 }), NOW)).toBe('cancelled');
  });

  it('solo disponible y casi llena se pueden tocar', () => {
    const selectable: SessionState[] = ['available', 'almost'];
    const all: SessionState[] = ['available', 'almost', 'full', 'booked', 'cancelled', 'past'];
    for (const state of all) {
      expect(isSelectable(state)).toBe(selectable.includes(state));
    }
  });
});

describe('occupancyTone (F3-06)', () => {
  it('cambia justo en los umbrales del producto', () => {
    // 12 lugares: hasta 9 es normal, 9/12 (75%) todavía no…
    expect(occupancyTone(8, 12)).toBe('ok');
    expect(occupancyTone(9, 12)).toBe('ok');
    // …10/12 pasa el 80% y avisa; 12/12 es lleno.
    expect(occupancyTone(10, 12)).toBe('warn');
    expect(occupancyTone(11, 12)).toBe('warn');
    expect(occupancyTone(12, 12)).toBe('danger');
  });

  it('el 80% exacto ya es advertencia', () => {
    expect(occupancyTone(8, 10)).toBe('warn');
    expect(occupancyTone(7, 10)).toBe('ok');
  });

  it('sobrecupo o cupo cero no rompen la escala', () => {
    expect(occupancyTone(13, 12)).toBe('danger');
    expect(occupancyTone(0, 0)).toBe('danger');
    expect(occupancyTone(0, 12)).toBe('ok');
  });
});

describe('SessionCard', () => {
  const base = { time: '18:00', discipline: 'crossfit', bookedCount: 4, capacity: 10 };

  it('los 6 estados se distinguen en pantalla', () => {
    const notes: Record<SessionState, string | null> = {
      available: null,
      almost: 'Quedan pocos lugares',
      full: 'Completa',
      booked: 'Estás anotado',
      cancelled: 'Cancelada por el gimnasio',
      past: 'Ya pasó',
    };
    for (const [state, note] of Object.entries(notes) as [SessionState, string | null][]) {
      const { unmount } = render(<SessionCard {...base} state={state} />);
      if (note) expect(screen.getByText(note)).toBeTruthy();
      else expect(screen.queryByText(/Completa|anotado|Cancelada|pasó|pocos/)).toBeNull();
      unmount();
    }
  });

  it('llena y pasada no disparan onSelect (ni cancelada)', () => {
    for (const state of ['full', 'past', 'cancelled', 'booked'] as SessionState[]) {
      const onSelect = vi.fn();
      const { unmount } = render(<SessionCard {...base} state={state} onSelect={onSelect} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onSelect).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('disponible sí dispara onSelect', () => {
    const onSelect = vi.fn();
    render(<SessionCard {...base} state="available" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('mientras reserva no acepta otro tap y se anuncia ocupada', () => {
    const onSelect = vi.fn();
    render(<SessionCard {...base} state="available" loading onSelect={onSelect} />);
    const card = screen.getByRole('button');
    expect(card.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(card);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('la ocupación se lee como texto y como barra accesible', () => {
    render(<SessionCard {...base} bookedCount={7} capacity={12} state="available" />);
    expect(screen.getByText('7/12')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Ocupación' });
    expect(bar.getAttribute('aria-valuenow')).toBe('7');
    expect(bar.getAttribute('aria-valuemax')).toBe('12');
  });
});
