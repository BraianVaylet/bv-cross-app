import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button.js';

describe('Button', () => {
  it('loading: disabled, spinner visible, no onClick', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Guardar
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByTestId('spinner')).toBeTruthy();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type=button (does not submit forms by accident)', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('fires onClick when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ok</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
