import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './Toast.js';

function Trigger({ message, variant }: { message: string; variant?: 'ok' | 'danger' | 'info' }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => {
        toast.show(message, variant);
      }}
    >
      disparar
    </button>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows with role=status and auto-dismisses at 4s', () => {
    render(
      <ToastProvider>
        <Trigger message="Reserva confirmada" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('disparar'));
    expect(screen.getByRole('status').textContent).toBe('Reserva confirmada');
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('stacks 3 simultaneous toasts', () => {
    render(
      <ToastProvider>
        <Trigger message="uno" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('disparar'));
    fireEvent.click(screen.getByText('disparar'));
    fireEvent.click(screen.getByText('disparar'));
    expect(screen.getAllByRole('status')).toHaveLength(3);
  });

  it('useToast outside provider throws a clear error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Trigger message="x" />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
