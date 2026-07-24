import type { AttendeeDto, SessionDto, TemplateDto } from '@bv/contracts';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  Segmented,
  Select,
  Skeleton,
  addDaysYmd,
  dayLabel,
  groupByDayInTz,
  occupancyTone,
  shortDate,
  startOfWeekYmd,
  timeInTz,
  todayInTz,
  useToast,
  weekDays,
} from '@bv/ui';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../lib/usePageTitle';

type Tab = 'grid' | 'calendar';

/** 0=domingo en la API; la grilla arranca en lunes, como el gimnasio. */
const WEEKDAYS = [
  { value: 1, label: 'Lunes', short: 'Lun' },
  { value: 2, label: 'Martes', short: 'Mar' },
  { value: 3, label: 'Miércoles', short: 'Mié' },
  { value: 4, label: 'Jueves', short: 'Jue' },
  { value: 5, label: 'Viernes', short: 'Vie' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
  { value: 0, label: 'Domingo', short: 'Dom' },
];

const byTime = (a: TemplateDto, b: TemplateDto): number => a.startTime.localeCompare(b.startTime);

export function Classes() {
  usePageTitle('Clases');
  const [tab, setTab] = useState<Tab>('grid');

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Clases</h1>

      <Segmented<Tab>
        options={[
          { value: 'grid', label: 'Grilla semanal' },
          { value: 'calendar', label: 'Calendario' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'grid' ? <TemplateGrid /> : <SessionCalendar />}
    </div>
  );
}

// ── Grilla semanal (templates) ──────────────────────────────────────────────

function TemplateGrid() {
  const toast = useToast();
  const [items, setItems] = useState<TemplateDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TemplateDto | { weekday: number } | null>(null);
  const [toDelete, setToDelete] = useState<TemplateDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState<TemplateDto[] | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    setItems(null);
    try {
      const { items: list } = await api.templates.list();
      setItems(list);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upsert = (template: TemplateDto): void => {
    setItems((prev) => {
      const list = prev ?? [];
      return list.some((t) => t.id === template.id)
        ? list.map((t) => (t.id === template.id ? template : t))
        : [...list, template];
    });
  };

  const confirmDelete = async (): Promise<void> => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await api.templates.remove(toDelete.id);
      setItems((prev) => (prev ?? []).filter((t) => t.id !== toDelete.id));
      setToDelete(null);
      toast.show(
        res.keptSessions > 0
          ? `Horario borrado. Quedaron ${String(res.keptSessions)} clases con anotados.`
          : `Horario borrado (${String(res.deletedSessions)} clases futuras).`,
      );
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    } finally {
      setDeleting(false);
    }
  };

  const disciplinas = [...new Set((items ?? []).map((t) => t.discipline))];

  if (loadError) {
    return (
      <div className="space-y-3">
        <ErrorBanner>{loadError}</ErrorBanner>
        <Button variant="secondary" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="grid gap-2 lg:grid-cols-7" aria-busy="true">
        {WEEKDAYS.map((d) => (
          <Skeleton key={d.value} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay horarios"
        text="Cargá la grilla semanal: cada horario genera las clases de las próximas semanas."
        action={
          <Button
            onClick={() => {
              setEditing({ weekday: 1 });
            }}
          >
            Cargar el primer horario
          </Button>
        }
      />
    );
  }

  return (
    <>
      {/* 7 columnas en escritorio; en el teléfono, un bloque por día. */}
      <div className="grid gap-2 lg:grid-cols-7">
        {WEEKDAYS.map((day) => {
          const delDia = items.filter((t) => t.weekday === day.value).sort(byTime);
          return (
            <section key={day.value} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                {/* La abreviatura es solo visual (7 columnas no entran con
                    "Miércoles"): el nombre accesible es siempre el completo. */}
                <h2 className="text-sm font-medium text-ink-muted" aria-label={day.label}>
                  <span aria-hidden="true" className="lg:hidden">
                    {day.label}
                  </span>
                  <span aria-hidden="true" className="hidden lg:inline">
                    {day.short}
                  </span>
                </h2>
                <div className="flex gap-1">
                  {delDia.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setDuplicating(delDia);
                      }}
                      aria-label={`Duplicar ${day.label}`}
                      className="rounded-lg px-1.5 text-xs text-ink-dim hover:text-ink"
                    >
                      copiar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditing({ weekday: day.value });
                    }}
                    aria-label={`Agregar horario el ${day.label}`}
                    className="rounded-lg px-1.5 text-sm text-ink-dim hover:text-ink"
                  >
                    +
                  </button>
                </div>
              </div>

              {delDia.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-ink-dim">
                  Sin clases
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {delDia.map((t) => (
                    <li key={t.id}>
                      <Card className="space-y-1 p-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-display text-base font-semibold text-ink">
                            {t.startTime}
                          </span>
                          {!t.active && <Badge tone="neutral">Pausado</Badge>}
                        </div>
                        <p className="text-sm text-ink-muted">{t.discipline}</p>
                        <p className="text-xs text-ink-dim">
                          {t.capacity} lugares · {t.durationMin} min
                        </p>
                        <div className="flex gap-1 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(t);
                            }}
                            className="rounded-lg text-xs font-medium text-accent hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setToDelete(t);
                            }}
                            className="rounded-lg px-1.5 text-xs text-ink-dim hover:text-danger"
                          >
                            Borrar
                          </button>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <TemplateForm
        target={editing}
        disciplinas={disciplinas}
        onClose={() => {
          setEditing(null);
        }}
        onSaved={(template, note) => {
          upsert(template);
          setEditing(null);
          toast.show(note ?? 'Horario guardado.');
        }}
      />

      <DuplicateDayModal
        templates={duplicating}
        onClose={() => {
          setDuplicating(null);
        }}
        onDone={(creados) => {
          setDuplicating(null);
          void load();
          toast.show(`${String(creados)} horarios copiados.`);
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Borrar el horario"
        message="Se borran las clases futuras que todavía no tienen anotados. Las que ya tienen gente reservada quedan en pie y las manejás una por una."
        confirmLabel="Borrar"
        loading={deleting}
        onCancel={() => {
          setToDelete(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

/**
 * Alta y edición de un horario. Al editar avisa la propagación RN-05: las
 * clases futuras sin anotados se regeneran, las que tienen gente quedan como
 * están — el dueño se entera antes de guardar, no después.
 */
function TemplateForm({
  target,
  disciplinas,
  onClose,
  onSaved,
}: {
  target: TemplateDto | { weekday: number } | null;
  disciplinas: string[];
  onClose: () => void;
  onSaved: (template: TemplateDto, note?: string) => void;
}) {
  const editing = target !== null && 'id' in target ? target : null;

  const [weekday, setWeekday] = useState('1');
  const [startTime, setStartTime] = useState('18:00');
  const [discipline, setDiscipline] = useState('crossfit');
  const [capacity, setCapacity] = useState('12');
  const [durationMin, setDurationMin] = useState('60');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target === null) return;
    setError(null);
    if ('id' in target) {
      setWeekday(String(target.weekday));
      setStartTime(target.startTime);
      setDiscipline(target.discipline);
      setCapacity(String(target.capacity));
      setDurationMin(String(target.durationMin));
      setActive(target.active);
    } else {
      setWeekday(String(target.weekday));
      setStartTime('18:00');
      setDiscipline(disciplinas[0] ?? 'crossfit');
      setCapacity('12');
      setDurationMin('60');
      setActive(true);
    }
  }, [target, disciplinas]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const base = {
        weekday: Number(weekday),
        startTime,
        discipline: discipline.trim(),
        capacity: Number(capacity),
        durationMin: Number(durationMin),
      };
      if (editing) {
        const res = await api.templates.update(editing.id, { ...base, active });
        const partes: string[] = [];
        if (res.regeneratedSessions > 0) {
          partes.push(`${String(res.regeneratedSessions)} clases actualizadas`);
        }
        if (res.keptSessions > 0) {
          partes.push(`${String(res.keptSessions)} con anotados quedaron como estaban`);
        }
        onSaved(res.template, partes.length > 0 ? `Horario guardado: ${partes.join(', ')}.` : undefined);
      } else {
        const res = await api.templates.create(base);
        onSaved(
          res.template,
          res.details && res.details.overlaps.length > 0
            ? `Horario creado. Ojo: se superpone con ${res.details.overlaps.join(', ')}.`
            : undefined,
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      title={editing ? 'Editar horario' : 'Nuevo horario'}
      onClose={onClose}
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        {editing && (
          <p className="rounded-xl bg-raised px-3 py-2 text-sm text-ink-muted">
            Al guardar se actualizan las clases futuras que todavía no tienen anotados. Las que ya
            tienen gente reservada quedan como están.
          </p>
        )}

        <Select
          label="Día"
          value={weekday}
          onChange={(e) => {
            setWeekday(e.target.value);
          }}
        >
          {WEEKDAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
        <Input
          label="Hora"
          type="time"
          required
          hint="En la hora de tu gimnasio."
          value={startTime}
          onChange={(e) => {
            setStartTime(e.target.value);
          }}
        />

        <div className="space-y-1.5">
          <label htmlFor="tpl-discipline" className="block text-sm font-medium text-ink-muted">
            Disciplina
          </label>
          <input
            id="tpl-discipline"
            list="tpl-disciplines"
            required
            value={discipline}
            onChange={(e) => {
              setDiscipline(e.target.value);
            }}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-ink placeholder:text-ink-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          />
          <datalist id="tpl-disciplines">
            {disciplinas.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>

        <Input
          label="Lugares"
          type="number"
          min={1}
          required
          value={capacity}
          onChange={(e) => {
            setCapacity(e.target.value);
          }}
        />
        <Input
          label="Duración (min)"
          type="number"
          min={15}
          step={5}
          required
          value={durationMin}
          onChange={(e) => {
            setDurationMin(e.target.value);
          }}
        />

        {editing && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => {
                setActive(e.target.checked);
              }}
            />
            Activo (si lo pausás, deja de generar clases nuevas)
          </label>
        )}

        <Button type="submit" full loading={saving}>
          {editing ? 'Guardar cambios' : 'Crear horario'}
        </Button>
      </form>
    </Modal>
  );
}

/**
 * Copiar un día entero a otro: es lo que hace usable cargar una grilla de 6×6
 * sin morir de aburrimiento. Son N POSTs con progreso — la API no tiene un
 * endpoint de lote y no vale la pena inventarlo para esto.
 */
function DuplicateDayModal({
  templates,
  onClose,
  onDone,
}: {
  templates: TemplateDto[] | null;
  onClose: () => void;
  onDone: (creados: number) => void;
}) {
  const [target, setTarget] = useState('2');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProgress(null);
    setError(null);
  }, [templates]);

  const run = async (): Promise<void> => {
    if (!templates) return;
    setError(null);
    setProgress(0);
    let creados = 0;
    for (const t of templates) {
      try {
        await api.templates.create({
          weekday: Number(target),
          startTime: t.startTime,
          discipline: t.discipline,
          capacity: t.capacity,
          durationMin: t.durationMin,
        });
        creados += 1;
      } catch (err) {
        setError(errorMessage(err));
        break;
      }
      setProgress(creados);
    }
    setProgress(null);
    onDone(creados);
  };

  const origen = templates?.[0]?.weekday;

  return (
    <Modal open={templates !== null} title="Copiar el día" onClose={onClose}>
      <div className="space-y-3">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p className="text-sm text-ink-muted">
          Se copian los {templates?.length ?? 0} horarios de{' '}
          {WEEKDAYS.find((d) => d.value === origen)?.label ?? 'ese día'} al día que elijas.
        </p>
        <Select
          label="Copiar a"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
          }}
        >
          {WEEKDAYS.filter((d) => d.value !== origen).map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
        <Button full loading={progress !== null} onClick={() => void run()}>
          {progress !== null
            ? `Copiando ${String(progress)}/${String(templates?.length ?? 0)}…`
            : 'Copiar'}
        </Button>
      </div>
    </Modal>
  );
}

// ── Calendario (sesiones) ───────────────────────────────────────────────────

function SessionCalendar() {
  const toast = useToast();
  const { memberships, activeOrgId } = useAuth();
  const timeZone = memberships.find((m) => m.orgId === activeOrgId)?.timezone ?? 'UTC';

  const today = useMemo(() => todayInTz(timeZone), [timeZone]);
  const [weekStart, setWeekStart] = useState(() => startOfWeekYmd(today));
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const [sessions, setSessions] = useState<SessionDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDto | null>(null);
  const [newFor, setNewFor] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const from = days[0];
    const to = days[6];
    if (!from || !to) return;
    setLoadError(null);
    setSessions(null);
    try {
      const { items } = await api.sessions.list(from, to);
      setSessions(items);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => groupByDayInTz(sessions ?? [], timeZone), [sessions, timeZone]);

  const moveWeek = (delta: number): void => {
    setWeekStart((prev) => addDaysYmd(prev, delta * 7));
  };

  const replace = (session: SessionDto): void => {
    setSessions((prev) => (prev ?? []).map((s) => (s.id === session.id ? session : s)));
    setDetail((prev) => (prev && prev.id === session.id ? session : prev));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={() => { moveWeek(-1); }}>
          ← Anterior
        </Button>
        <p className="text-sm font-medium text-ink-muted">
          {shortDate(`${days[0] ?? today}T12:00:00Z`, 'UTC')} —{' '}
          {shortDate(`${days[6] ?? today}T12:00:00Z`, 'UTC')}
        </p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setWeekStart(startOfWeekYmd(today));
            }}
          >
            Hoy
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { moveWeek(1); }}>
            Siguiente →
          </Button>
        </div>
      </div>

      {loadError ? (
        <div className="space-y-3">
          <ErrorBanner>{loadError}</ErrorBanner>
          <Button variant="secondary" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : sessions === null ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((ymd) => {
            const delDia = byDay.get(ymd) ?? [];
            const { weekday, day } = dayLabel(ymd);
            return (
              <section key={ymd} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-medium text-ink-muted">
                    {weekday} {day}
                    {ymd === today && <span className="ml-2 text-accent">hoy</span>}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFor(ymd);
                    }}
                    className="rounded-lg px-1.5 text-sm text-ink-dim hover:text-ink"
                    aria-label={`Agregar clase el ${weekday} ${day}`}
                  >
                    + clase
                  </button>
                </div>

                {delDia.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-xs text-ink-dim">
                    Sin clases
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {delDia.map((s) => {
                      const tone = occupancyTone(s.bookedCount, s.capacity);
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setDetail(s);
                            }}
                            className="w-full rounded-2xl border border-line bg-surface p-3 text-left transition-colors hover:bg-raised/60"
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="font-display text-base font-semibold text-ink">
                                {timeInTz(s.startsAt, timeZone)}
                              </span>
                              <span
                                className={
                                  tone === 'danger'
                                    ? 'text-xs font-medium text-danger'
                                    : tone === 'warn'
                                      ? 'text-xs font-medium text-warn'
                                      : 'text-xs font-medium text-ink-muted'
                                }
                              >
                                {s.bookedCount}/{s.capacity}
                              </span>
                            </div>
                            <p className="text-sm text-ink-muted">{s.discipline}</p>
                            {s.status === 'cancelled' && (
                              <span className="mt-1 inline-block">
                                <Badge tone="danger">Cancelada</Badge>
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <SessionDetail
        session={detail}
        timeZone={timeZone}
        onClose={() => {
          setDetail(null);
        }}
        onChanged={(session, note) => {
          replace(session);
          if (note) toast.show(note);
        }}
      />

      <NewSessionModal
        day={newFor}
        onClose={() => {
          setNewFor(null);
        }}
        onCreated={() => {
          setNewFor(null);
          void load();
          toast.show('Clase creada.');
        }}
      />
    </div>
  );
}

/** Detalle de una clase: anotados, cupo y cancelación. */
function SessionDetail({
  session,
  timeZone,
  onClose,
  onChanged,
}: {
  session: SessionDto | null;
  timeZone: string;
  onClose: () => void;
  onChanged: (session: SessionDto, note?: string) => void;
}) {
  const toast = useToast();
  const [attendees, setAttendees] = useState<AttendeeDto[] | null>(null);
  const [capacity, setCapacity] = useState('');
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [capacityError, setCapacityError] = useState<string | undefined>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!session) return;
    setCapacity(String(session.capacity));
    setCapacityError(undefined);
    setAttendees(null);
    void (async () => {
      try {
        const { items } = await api.sessions.attendees(session.id);
        setAttendees(items);
      } catch {
        setAttendees([]); // la lista es contexto: si falla, no bloquea el resto
      }
    })();
  }, [session]);

  const saveCapacity = async (): Promise<void> => {
    if (!session) return;
    setCapacityError(undefined);
    setSavingCapacity(true);
    try {
      const { session: updated } = await api.sessions.update(session.id, {
        capacity: Number(capacity),
      });
      onChanged(updated, 'Cupo actualizado.');
    } catch (err) {
      setCapacityError(
        err instanceof ApiError && err.code === 'CAPACITY_BELOW_BOOKED'
          ? `Ya hay ${String(session.bookedCount)} anotados: el cupo no puede ser menor.`
          : errorMessage(err),
      );
    } finally {
      setSavingCapacity(false);
    }
  };

  const doCancel = async (): Promise<void> => {
    if (!session) return;
    setCancelling(true);
    try {
      const res = await api.sessions.cancel(session.id);
      onChanged(
        res.session,
        res.refundedBookings > 0
          ? `Clase cancelada: se devolvieron ${String(res.refundedBookings)} créditos.`
          : 'Clase cancelada.',
      );
      if (res.failedRefunds > 0) {
        toast.show(
          `Quedaron ${String(res.failedRefunds)} devoluciones sin hacer: revisalas a mano.`,
          'danger',
        );
      }
      setConfirmCancel(false);
      onClose();
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Modal
      open={session !== null}
      title={session ? `${timeInTz(session.startsAt, timeZone)} · ${session.discipline}` : ''}
      onClose={onClose}
    >
      {session && (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            {shortDate(session.startsAt, timeZone)} ·{' '}
            {session.status === 'cancelled' ? 'Cancelada' : `${session.bookedCount} de ${session.capacity} lugares`}
          </p>

          {session.status !== 'cancelled' && (
            <div className="flex items-end gap-2">
              <Input
                label="Cupo"
                type="number"
                min={1}
                value={capacity}
                error={capacityError}
                onChange={(e) => {
                  setCapacity(e.target.value);
                }}
              />
              <Button
                variant="secondary"
                loading={savingCapacity}
                disabled={capacity === String(session.capacity)}
                onClick={() => void saveCapacity()}
              >
                Guardar
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-ink-muted">Anotados</h3>
            {attendees === null ? (
              <Skeleton className="h-10 rounded-xl" />
            ) : attendees.length === 0 ? (
              <p className="text-sm text-ink-dim">Todavía no se anotó nadie.</p>
            ) : (
              <ul className="space-y-1">
                {attendees.map((a) => (
                  <li key={a.bookingId} className="flex justify-between gap-2 text-sm">
                    <span className="text-ink">{a.name}</span>
                    <span className="text-ink-dim">{timeInTz(a.bookedAt, timeZone)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {session.status !== 'cancelled' && (
            <Button
              variant="danger"
              full
              onClick={() => {
                setConfirmCancel(true);
              }}
            >
              Cancelar la clase
            </Button>
          )}

          <ConfirmDialog
            open={confirmCancel}
            title="Cancelar la clase"
            message={
              session.bookedCount > 0
                ? `Se cancelan las ${String(session.bookedCount)} reservas y se devuelven los créditos a cada cliente.`
                : 'La clase queda cancelada y nadie va a poder anotarse.'
            }
            confirmLabel="Cancelar la clase"
            cancelLabel="Volver"
            loading={cancelling}
            onCancel={() => {
              setConfirmCancel(false);
            }}
            onConfirm={() => void doCancel()}
          />
        </div>
      )}
    </Modal>
  );
}

/** Clase suelta: un feriado que se recupera, una clase especial. */
function NewSessionModal({
  day,
  onClose,
  onCreated,
}: {
  day: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [startTime, setStartTime] = useState('18:00');
  const [discipline, setDiscipline] = useState('crossfit');
  const [capacity, setCapacity] = useState('12');
  const [durationMin, setDurationMin] = useState('60');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [day]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!day) return;
    setError(null);
    setSaving(true);
    try {
      await api.sessions.create({
        date: day,
        startTime,
        discipline: discipline.trim(),
        capacity: Number(capacity),
        durationMin: Number(durationMin),
      });
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={day !== null} title="Nueva clase suelta" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p className="text-sm text-ink-muted">
          No queda en la grilla semanal: es solo para este día.
        </p>
        <Input
          label="Hora"
          type="time"
          required
          value={startTime}
          onChange={(e) => {
            setStartTime(e.target.value);
          }}
        />
        <Input
          label="Disciplina"
          required
          value={discipline}
          onChange={(e) => {
            setDiscipline(e.target.value);
          }}
        />
        <Input
          label="Lugares"
          type="number"
          min={1}
          required
          value={capacity}
          onChange={(e) => {
            setCapacity(e.target.value);
          }}
        />
        <Input
          label="Duración (min)"
          type="number"
          min={15}
          step={5}
          required
          value={durationMin}
          onChange={(e) => {
            setDurationMin(e.target.value);
          }}
        />
        <Button type="submit" full loading={saving}>
          Crear clase
        </Button>
      </form>
    </Modal>
  );
}
