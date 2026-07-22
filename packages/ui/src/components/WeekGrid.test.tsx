import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { weekDays } from '../lib/agendaTime.js';
import { WeekGrid } from './WeekGrid.js';

const DAYS = weekDays('2026-07-20'); // lunes 20 → domingo 26

function setup(over: Partial<React.ComponentProps<typeof WeekGrid>> = {}) {
  const props = {
    days: DAYS,
    selected: '2026-07-22',
    onSelectDay: vi.fn(),
    onPrevWeek: vi.fn(),
    onNextWeek: vi.fn(),
    children: <p>clases del día</p>,
    ...over,
  };
  render(<WeekGrid {...props} />);
  return props;
}

describe('WeekGrid', () => {
  it('muestra los 7 días y marca el seleccionado', () => {
    setup();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(7);
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain('22');
    expect(screen.getByText('clases del día')).toBeTruthy();
  });

  it('cambiar de día es un solo tap', () => {
    const props = setup();
    const viernes = screen.getAllByRole('tab')[4];
    if (!viernes) throw new Error('fixture: faltan pestañas');
    fireEvent.click(viernes);
    expect(props.onSelectDay).toHaveBeenCalledWith('2026-07-24');
  });

  it('el horizonte corta la navegación: sin semana siguiente no hay botón activo', () => {
    const props = setup({ canGoNext: false });
    const next = screen.getByRole('button', { name: 'Semana siguiente' });
    expect(next.hasAttribute('disabled')).toBe(true);
    fireEvent.click(next);
    expect(props.onNextWeek).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(props.onPrevWeek).toHaveBeenCalledTimes(1);
  });

  it('el punto de actividad solo aparece en los días con clases', () => {
    const { container } = render(
      <WeekGrid
        days={DAYS}
        selected="2026-07-20"
        onSelectDay={vi.fn()}
        onPrevWeek={vi.fn()}
        onNextWeek={vi.fn()}
        countsByDay={{ '2026-07-20': 3, '2026-07-21': 0 }}
      >
        <p>x</p>
      </WeekGrid>,
    );
    // 7 puntos renderizados, uno solo visible (los demás son transparentes)
    const dots = container.querySelectorAll('span[aria-hidden="true"]');
    expect(dots).toHaveLength(7);
    const visibles = [...dots].filter((d) => !d.className.includes('bg-transparent'));
    expect(visibles).toHaveLength(1);
  });
});
