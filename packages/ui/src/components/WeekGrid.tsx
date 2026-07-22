import type { ReactNode } from 'react';
import { cx } from '../cx.js';
import { dayLabel } from '../lib/agendaTime.js';
import { ChevronLeftIcon, ChevronRightIcon } from './Icons.js';

export interface WeekGridProps {
  /** Las 7 fechas `YYYY-MM-DD` de la semana visible. */
  days: string[];
  selected: string;
  onSelectDay: (ymd: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  /** El horizonte de materialización manda: más allá no hay nada que reservar. */
  canGoPrev?: boolean;
  canGoNext?: boolean;
  /** Cantidad de clases por día: el punto avisa qué días tienen algo. */
  countsByDay?: Record<string, number>;
  /** Hoy en la tz de la org, para marcarlo. */
  today?: string;
  children: ReactNode;
}

/**
 * Semana de la grilla: flechas para moverse y una pestaña por día (F4-04).
 *
 * Es la pantalla más usada del producto, así que el día se cambia con un tap
 * en un blanco grande y sin scroll horizontal escondido.
 */
export function WeekGrid({
  days,
  selected,
  onSelectDay,
  onPrevWeek,
  onNextWeek,
  canGoPrev = true,
  canGoNext = true,
  countsByDay = {},
  today,
  children,
}: WeekGridProps) {
  const navBtn =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-raised hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={navBtn}
          onClick={onPrevWeek}
          disabled={!canGoPrev}
          aria-label="Semana anterior"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>

        <div role="tablist" aria-label="Días de la semana" className="flex flex-1 justify-between gap-0.5">
          {days.map((ymd) => {
            const { weekday, day } = dayLabel(ymd);
            const isSelected = ymd === selected;
            const hasSessions = (countsByDay[ymd] ?? 0) > 0;
            return (
              <button
                key={ymd}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => {
                  onSelectDay(ymd);
                }}
                className={cx(
                  'flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                  isSelected
                    ? 'bg-accent-soft text-accent-strong'
                    : 'text-ink-muted hover:bg-raised hover:text-ink',
                )}
              >
                <span className="text-[0.6875rem] font-medium uppercase">{weekday}</span>
                <span
                  className={cx(
                    'text-sm font-semibold tabular-nums',
                    ymd === today && !isSelected && 'text-accent',
                  )}
                >
                  {day}
                </span>
                <span
                  aria-hidden="true"
                  className={cx(
                    'h-1 w-1 rounded-full',
                    hasSessions ? (isSelected ? 'bg-accent-strong' : 'bg-ink-dim') : 'bg-transparent',
                  )}
                />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className={navBtn}
          onClick={onNextWeek}
          disabled={!canGoNext}
          aria-label="Semana siguiente"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      <div>{children}</div>
    </div>
  );
}
