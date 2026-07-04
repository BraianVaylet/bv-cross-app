import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog.js';

describe('ConfirmDialog', () => {
  it('calls onConfirm only on confirm, onCancel on cancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="¿Archivar pack?"
        message="No se podrá asignar más."
        confirmLabel="Archivar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Archivar'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('danger by default: confirm button uses danger variant', () => {
    render(
      <ConfirmDialog open title="t" message="m" onConfirm={() => {}} onCancel={() => {}} />,
    );
    const confirm = screen.getByText('Confirmar');
    expect(confirm.className).toContain('bg-danger');
  });

  it('loading disables both actions', () => {
    render(
      <ConfirmDialog open loading title="t" message="m" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText('Cancelar').closest('button')).toHaveProperty('disabled', true);
    expect(screen.getByText('Confirmar').closest('button')).toHaveProperty('disabled', true);
  });
});
