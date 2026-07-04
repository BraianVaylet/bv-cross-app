import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal.js';

function TwoButtonsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open title="Título" onClose={onClose}>
      <button type="button">Uno</button>
      <button type="button">Dos</button>
    </Modal>
  );
}

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}}>
        contenido
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('focuses inside on open and blocks body scroll', () => {
    render(<TwoButtonsModal onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    // Foco inicial: primer focusable del panel (el botón "Cerrar" del header).
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('Escape and overlay click close; panel click does not', () => {
    const onClose = vi.fn();
    render(<TwoButtonsModal onClose={onClose} />);
    fireEvent.click(screen.getByText('Uno'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Tab cycles focus inside the panel (trap)', () => {
    render(<TwoButtonsModal onClose={() => {}} />);
    const last = screen.getByText('Dos');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Desde el último, Tab vuelve al primero (botón Cerrar).
    expect(screen.getByLabelText('Cerrar')).toBe(document.activeElement);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toBe(document.activeElement);
  });

  it('restores body scroll on unmount', () => {
    const { unmount } = render(<TwoButtonsModal onClose={() => {}} />);
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
