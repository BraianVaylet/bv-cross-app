import { useState, type ReactNode } from 'react';
import { cx } from '../cx.js';
import { Button } from './Button.js';
import { ChevronRightIcon } from './Icons.js';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Contenido de la celda (y del renglón de la card en mobile). */
  cell: (row: T) => ReactNode;
  /** Valor para ordenar. Sin esto la columna no ordena. */
  sortValue?: (row: T) => string | number;
  /** Oculta el label en la card de mobile (para la columna principal). */
  primary?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Se muestra si no hay filas (y no está cargando). */
  empty?: ReactNode;
  loading?: boolean;
  /** Paginación por cursor: si hay más, se pide desde acá. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  caption?: string;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/**
 * Tabla del CRM (F3-05).
 *
 * En escritorio es una tabla; abajo de 768px **colapsa a cards**, porque una
 * tabla de 5 columnas en un teléfono se lee con lupa y el dueño la abre desde
 * el teléfono todo el tiempo.
 *
 * El orden es de la PÁGINA ACTUAL, del lado del cliente: ordenar el total
 * exigiría que el servidor pagine ordenado y no vale la complejidad para
 * listas de gimnasio. Se avisa en el `title` del encabezado.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading = false,
  hasMore = false,
  onLoadMore,
  loadingMore = false,
  caption,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);

  const sorted = (() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const { sortValue } = column;
    return [...rows].sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  })();

  const toggleSort = (key: string): void => {
    setSort((prev) =>
      prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  };

  if (!loading && rows.length === 0) return <>{empty}</>;

  return (
    <div className="space-y-3">
      {/* Escritorio */}
      <div className="hidden overflow-x-auto rounded-2xl border border-line md:block">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="border-b border-line bg-raised/50 text-left">
            <tr>
              {columns.map((col) => (
                <th key={col.key} scope="col" className={cx('px-4 py-2.5 font-medium text-ink-muted', col.className)}>
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => {
                        toggleSort(col.key);
                      }}
                      title="Ordena las filas cargadas"
                      aria-label={`Ordenar por ${col.header}`}
                      className="inline-flex items-center gap-1 hover:text-ink"
                    >
                      {col.header}
                      <span aria-hidden="true" className="text-[0.625rem]">
                        {sort?.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => { onRowClick(row); } : undefined}
                className={cx(
                  'border-b border-line last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-raised/60',
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cx('px-4 py-3 text-ink', col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Teléfono: una card por fila. */}
      <ul className="space-y-2 md:hidden">
        {sorted.map((row) => (
          <li key={rowKey(row)}>
            <button
              type="button"
              onClick={onRowClick ? () => { onRowClick(row); } : undefined}
              disabled={!onRowClick}
              className={cx(
                'flex w-full items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left',
                onRowClick ? 'transition-colors hover:bg-raised/60' : 'cursor-default',
              )}
            >
              <div className="min-w-0 flex-1 space-y-1">
                {columns.map((col) => (
                  <div key={col.key} className="flex items-baseline gap-2 text-sm">
                    {!col.primary && (
                      <span className="shrink-0 text-xs text-ink-dim">{col.header}</span>
                    )}
                    <span className={cx('min-w-0 text-ink', col.primary && 'font-medium')}>
                      {col.cell(row)}
                    </span>
                  </div>
                ))}
              </div>
              {onRowClick && <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-dim" />}
            </button>
          </li>
        ))}
      </ul>

      {hasMore && onLoadMore && (
        <Button variant="secondary" full loading={loadingMore} onClick={onLoadMore}>
          Cargar más
        </Button>
      )}
    </div>
  );
}
