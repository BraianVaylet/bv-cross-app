import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Input, Select, Textarea } from './Field.js';

describe('Input', () => {
  it('with error: aria-invalid + aria-describedby wired to the message', () => {
    render(<Input label="Email" error="Email inválido" />);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const message = document.getElementById(describedBy ?? '');
    expect(message?.textContent).toBe('Email inválido');
  });

  it('without error: shows hint, no aria-invalid', () => {
    render(<Input label="Alias" hint="Visible para tu gimnasio" />);
    const input = screen.getByLabelText('Alias');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByText('Visible para tu gimnasio')).toBeTruthy();
  });

  it('label is connected via htmlFor in all field kinds', () => {
    render(
      <>
        <Textarea label="Notas" />
        <Select label="Rol">
          <option value="a">A</option>
        </Select>
      </>,
    );
    expect(screen.getByLabelText('Notas').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Rol').tagName).toBe('SELECT');
  });
});
