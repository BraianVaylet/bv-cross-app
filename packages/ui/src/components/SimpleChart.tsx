import { cx } from '../cx.js';

export interface ChartPoint {
  /** Valor del eje Y (kg o reps). */
  value: number;
  /** Etiqueta del eje X (fecha ya formateada). */
  label: string;
  /** Se destaca con acento: el récord, el vigente. */
  highlight?: boolean;
  /** Marca ⚠: el atleta anotó dolor en ese registro. */
  warn?: boolean;
  /** Comentario del registro, para el tooltip nativo. */
  note?: string;
}

export interface SimpleChartProps {
  points: ChartPoint[];
  /** Unidad del eje Y ("kg", "reps"): va en las etiquetas. */
  unit?: string;
  className?: string;
  /** Nombre accesible del gráfico. */
  label?: string;
}

const W = 320;
const H = 140;
const PAD = { top: 12, right: 10, bottom: 22, left: 34 };

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Gráfico de línea en SVG puro (F3-09) — sin librería de charts: son 4 series
 * de datos chicas y una dependencia de 100 kB para esto no se justifica.
 *
 * Escala con `viewBox`, así que el mismo SVG sirve en 375 px y en un monitor.
 * Los tres bordes que rompen un gráfico casero están contemplados: un solo
 * punto, todos los valores iguales (línea plana, sin división por cero) y
 * lista vacía.
 */
export function SimpleChart({ points, unit = '', className, label }: SimpleChartProps) {
  if (points.length === 0) {
    return (
      <p className={cx('rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-ink-dim', className)}>
        Sin datos todavía
      </p>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Todos iguales: se dibuja una línea plana al medio en vez de dividir por 0.
  const flat = max === min;
  const yMin = flat ? min - 1 : min;
  const yMax = flat ? max + 1 : max;

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number): number =>
    points.length === 1 ? PAD.left + innerW / 2 : PAD.left + (i / (points.length - 1)) * innerW;
  const y = (v: number): number => PAD.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(x(i))} ${round(y(p.value))}`).join(' ');

  // Solo la primera y la última etiqueta: más texto en 375 px se pisa.
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <figure className={cx('space-y-1', className)}>
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        className="w-full"
        role="img"
        aria-label={label ?? `Evolución: de ${String(min)} a ${String(max)} ${unit}`.trim()}
      >
        {/* Referencias del eje Y: el mínimo y el máximo alcanzan. */}
        {[yMax, yMin].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={round(y(v))}
              y2={round(y(v))}
              className="stroke-line"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 5}
              y={round(y(v)) + 3}
              textAnchor="end"
              className="fill-ink-dim text-[9px]"
            >
              {round(v)}
            </text>
          </g>
        ))}

        {points.length > 1 && (
          <path d={path} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" />
        )}

        {points.map((p, i) => (
          <g key={`${p.label}-${String(i)}`}>
            <circle
              cx={round(x(i))}
              cy={round(y(p.value))}
              r={p.highlight ? 4.5 : 3}
              className={p.highlight ? 'fill-accent' : 'fill-surface stroke-accent'}
              strokeWidth={2}
            >
              <title>
                {`${p.label}: ${String(p.value)} ${unit}`.trim()}
                {p.warn ? ' · con dolor' : ''}
                {p.note ? ` — ${p.note}` : ''}
              </title>
            </circle>
            {p.warn && (
              <text
                x={round(x(i))}
                y={round(y(p.value)) - 8}
                textAnchor="middle"
                className="fill-warn text-[10px]"
                aria-hidden="true"
              >
                ⚠
              </text>
            )}
          </g>
        ))}

        {/* Eje X: primera y última fecha. */}
        {first && (
          <text x={PAD.left} y={H - 6} textAnchor="start" className="fill-ink-dim text-[9px]">
            {first.label}
          </text>
        )}
        {last && points.length > 1 && (
          <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-ink-dim text-[9px]">
            {last.label}
          </text>
        )}
      </svg>
    </figure>
  );
}
