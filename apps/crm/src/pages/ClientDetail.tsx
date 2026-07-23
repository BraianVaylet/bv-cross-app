import type { AssignmentDto, MemberDto, PackDto } from '@bv/contracts';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorBanner,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  expiryLabel,
  shortDate,
  useToast,
} from '@bv/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { BackLink } from '../components/BackLink';
import { fmtMoney } from '../lib/format';
import { usePageTitle } from '../lib/usePageTitle';

const STATUS_BADGE: Record<string, { tone: 'ok' | 'accent' | 'neutral' | 'warn' | 'danger'; label: string }> = {
  active: { tone: 'ok', label: 'Activo' },
  invited: { tone: 'accent', label: 'Invitado' },
  disabled: { tone: 'neutral', label: 'Deshabilitado' },
  exhausted: { tone: 'neutral', label: 'Agotado' },
  expired: { tone: 'warn', label: 'Vencido' },
  cancelled: { tone: 'danger', label: 'Anulado' },
};

/** Ficha del cliente (F3-05): datos, packs y acciones. */
export function ClientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { memberships, activeOrgId } = useAuth();
  const timeZone = memberships.find((m) => m.orgId === activeOrgId)?.timezone ?? 'UTC';

  const [member, setMember] = useState<MemberDto | null>(null);
  const [assignments, setAssignments] = useState<AssignmentDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [toCancel, setToCancel] = useState<AssignmentDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [statusChange, setStatusChange] = useState<'active' | 'disabled' | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);

  usePageTitle(member ? (member.profile.displayName ?? 'Cliente') : 'Cliente');

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      const [{ member: m }, { items }] = await Promise.all([
        api.members.get(id),
        api.members.assignments(id),
      ]);
      setMember(m);
      setAssignments(items);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (status: 'active' | 'disabled'): Promise<void> => {
    setSavingStatus(true);
    try {
      const { member: updated } = await api.members.update(id, { status });
      setMember(updated);
      setStatusChange(null);
      toast.show(status === 'disabled' ? 'Cliente deshabilitado.' : 'Cliente reactivado.');
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    } finally {
      setSavingStatus(false);
    }
  };

  const confirmCancelAssignment = async (): Promise<void> => {
    if (!toCancel) return;
    setCancelling(true);
    try {
      const { assignment } = await api.assignments.cancel(toCancel.id, cancelReason.trim());
      setAssignments((prev) => prev.map((a) => (a.id === assignment.id ? assignment : a)));
      setToCancel(null);
      setCancelReason('');
      toast.show('Asignación anulada.');
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    } finally {
      setCancelling(false);
    }
  };

  const copyInvitation = async (): Promise<void> => {
    try {
      const { org } = await api.orgs.current();
      const mensaje = `¡Te esperamos en ${org.name}! Descargá BV Cross para tus cargas y BV Agenda para reservar clases, y entrá con este código: ${org.joinCode ?? ''}`;
      await navigator.clipboard.writeText(mensaje);
      toast.show('Invitación copiada: pegala en WhatsApp.');
    } catch {
      toast.show('No pudimos copiar la invitación.', 'danger');
    }
  };

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

  if (!member) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  const badge = STATUS_BADGE[member.status];

  return (
    <div className="space-y-4">
      <BackLink to="/clients">Clientes</BackLink>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-2xl font-semibold text-ink">
            {member.profile.displayName ?? member.user?.name ?? 'Sin nombre'}
          </h1>
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void copyInvitation()}>
            Copiar invitación
          </Button>
          <Button
            variant={member.status === 'disabled' ? 'secondary' : 'danger'}
            onClick={() => {
              setStatusChange(member.status === 'disabled' ? 'active' : 'disabled');
            }}
          >
            {member.status === 'disabled' ? 'Reactivar' : 'Deshabilitar'}
          </Button>
        </div>
      </div>

      <ProfileCard
        member={member}
        onSaved={(updated) => {
          setMember(updated);
          toast.show('Ficha actualizada.');
        }}
      />

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-ink">Packs</h2>
          <Button
            onClick={() => {
              setAssignOpen(true);
            }}
          >
            Asignar pack
          </Button>
        </div>

        {assignments.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-muted">
              Todavía no tiene packs. Asignale uno para que pueda reservar clases.
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const packBadge = STATUS_BADGE[a.status];
              const used = a.snapshot.classCount - a.remaining;
              const ratio = a.snapshot.classCount > 0 ? used / a.snapshot.classCount : 0;
              return (
                <li key={a.id}>
                  <Card className="space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-ink">{a.snapshot.name}</p>
                        <p className="text-sm text-ink-muted">
                          {a.remaining} de {a.snapshot.classCount} clases ·{' '}
                          {fmtMoney(a.payment.amount)} {a.payment.method === 'cash' ? 'efectivo' : a.payment.method}
                        </p>
                      </div>
                      {packBadge && <Badge tone={packBadge.tone}>{packBadge.label}</Badge>}
                    </div>

                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-raised"
                      role="progressbar"
                      aria-label={`Clases usadas de ${a.snapshot.name}`}
                      aria-valuenow={used}
                      aria-valuemin={0}
                      aria-valuemax={a.snapshot.classCount}
                    >
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${String(Math.round(ratio * 100))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-ink-dim">
                        Vence el {shortDate(a.expiresAt, timeZone)} ·{' '}
                        {expiryLabel(a.expiresAt, timeZone)}
                      </p>
                      {a.status === 'active' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setToCancel(a);
                          }}
                        >
                          Anular
                        </Button>
                      )}
                    </div>
                    {a.cancelledReason && (
                      <p className="text-xs text-ink-dim">Motivo: {a.cancelledReason}</p>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AssignPackModal
        open={assignOpen}
        memberId={id}
        timeZone={timeZone}
        onClose={() => {
          setAssignOpen(false);
        }}
        onAssigned={(assignment) => {
          setAssignments((prev) => [assignment, ...prev]);
          setAssignOpen(false);
          toast.show('Pack asignado.');
        }}
      />

      <ConfirmDialog
        open={toCancel !== null}
        title="Anular la asignación"
        message="El cliente pierde las clases que le quedan. Contá por qué: queda registrado en la ficha."
        confirmLabel="Anular"
        loading={cancelling}
        confirmDisabled={cancelReason.trim().length === 0}
        onCancel={() => {
          setToCancel(null);
          setCancelReason('');
        }}
        onConfirm={() => void confirmCancelAssignment()}
      >
        <Input
          label="Motivo"
          required
          value={cancelReason}
          onChange={(e) => {
            setCancelReason(e.target.value);
          }}
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={statusChange !== null}
        title={statusChange === 'disabled' ? 'Deshabilitar cliente' : 'Reactivar cliente'}
        message={
          statusChange === 'disabled'
            ? 'No va a poder reservar ni entrar al gimnasio desde la app. Su historial y sus packs quedan intactos: se puede reactivar cuando quieras.'
            : 'Vuelve a poder reservar con los packs que tenga vigentes.'
        }
        confirmLabel={statusChange === 'disabled' ? 'Deshabilitar' : 'Reactivar'}
        danger={statusChange === 'disabled'}
        loading={savingStatus}
        onCancel={() => {
          setStatusChange(null);
        }}
        onConfirm={() => void (statusChange && changeStatus(statusChange))}
      />

      {member.status === 'invited' && (
        <p className="text-center text-xs text-ink-dim">
          Todavía no se registró: pasale el código del gimnasio con “Copiar invitación”.
        </p>
      )}

      <div className="pt-2">
        <Button
          variant="ghost"
          onClick={() => {
            navigate('/clients');
          }}
        >
          Volver a la lista
        </Button>
      </div>
    </div>
  );
}

/**
 * Datos de la ficha. `adminNotes` se guarda explícitamente (no autosave) y
 * avisa mientras hay cambios sin guardar: son notas del gimnasio sobre una
 * persona, perderlas o guardarlas a medias es peor que un click de más.
 */
function ProfileCard({
  member,
  onSaved,
}: {
  member: MemberDto;
  onSaved: (member: MemberDto) => void;
}) {
  const [displayName, setDisplayName] = useState(member.profile.displayName ?? '');
  const [phone, setPhone] = useState(member.profile.phone ?? '');
  const [emergencyContact, setEmergencyContact] = useState(member.profile.emergencyContact ?? '');
  const [adminNotes, setAdminNotes] = useState(member.adminNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    displayName !== (member.profile.displayName ?? '') ||
    phone !== (member.profile.phone ?? '') ||
    emergencyContact !== (member.profile.emergencyContact ?? '') ||
    adminNotes !== (member.adminNotes ?? '');

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { member: updated } = await api.members.update(member.id, {
        profile: {
          displayName: displayName.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(emergencyContact.trim() ? { emergencyContact: emergencyContact.trim() } : {}),
        },
        adminNotes: adminNotes.trim(),
      });
      onSaved(updated);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={(e) => void save(e)} className="space-y-3">
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <Input
          label="Nombre"
          required
          maxLength={80}
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value);
          }}
        />
        {member.user && (
          <Input label="Email" value={member.user.email} readOnly disabled hint="Lo maneja el cliente desde su cuenta." />
        )}
        <Input
          label="Teléfono"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
        />
        <Input
          label="Contacto de emergencia"
          value={emergencyContact}
          onChange={(e) => {
            setEmergencyContact(e.target.value);
          }}
        />
        <Textarea
          label="Notas internas"
          hint="Solo las ve el equipo del gimnasio; el cliente nunca."
          rows={3}
          value={adminNotes}
          onChange={(e) => {
            setAdminNotes(e.target.value);
          }}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" loading={saving} disabled={!dirty}>
            Guardar cambios
          </Button>
          {dirty && <span className="text-xs text-warn">Hay cambios sin guardar</span>}
        </div>
      </form>
    </Card>
  );
}

/** Asignar pack: se elige del catálogo y se registra el pago (RN-16). */
function AssignPackModal({
  open,
  memberId,
  timeZone,
  onClose,
  onAssigned,
}: {
  open: boolean;
  memberId: string;
  timeZone: string;
  onClose: () => void;
  onAssigned: (assignment: AssignmentDto) => void;
}) {
  const [packs, setPacks] = useState<PackDto[] | null>(null);
  const [packId, setPackId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const { items } = await api.packs.list();
        const activos = items.filter((p) => p.archivedAt === undefined);
        setPacks(activos);
        const first = activos[0];
        if (first) {
          setPackId(first.id);
          setAmount(String(first.price));
        }
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
  }, [open]);

  const selected = packs?.find((p) => p.id === packId);

  const pickPack = (id: string): void => {
    setPackId(id);
    const pack = packs?.find((p) => p.id === id);
    if (pack) setAmount(String(pack.price));
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setSaving(true);
    try {
      const { assignment } = await api.members.assign(memberId, {
        packId: selected.id,
        payment: {
          amount: Number(amount),
          method: method as 'cash' | 'debit' | 'transfer' | 'other',
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      setNotes('');
      onAssigned(assignment);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Vencimiento estimado para el resumen: el server lo calcula igual (RN-18).
  const expiryPreview = selected
    ? shortDate(
        new Date(Date.now() + selected.durationDays * 86_400_000).toISOString(),
        timeZone,
      )
    : null;

  return (
    <Modal open={open} title="Asignar pack" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        {packs === null ? (
          <Skeleton className="h-10 rounded-xl" />
        ) : packs.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No hay packs en el catálogo. Creá uno en la sección Packs.
          </p>
        ) : (
          <>
            <Select
              label="Pack"
              value={packId}
              onChange={(e) => {
                pickPack(e.target.value);
              }}
            >
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.classCount} clases · {p.durationDays} días · {fmtMoney(p.price)}
                </option>
              ))}
            </Select>
            <Input
              label="Monto cobrado"
              type="number"
              min={0}
              required
              hint="Viene del precio de lista; editalo si hiciste un descuento."
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
              }}
            />
            <Select
              label="Medio de pago"
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
              }}
            >
              <option value="cash">Efectivo</option>
              <option value="debit">Débito</option>
              <option value="transfer">Transferencia</option>
              <option value="other">Otro</option>
            </Select>
            <Input
              label="Nota del pago"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
            />

            {selected && (
              <p className="rounded-xl bg-raised px-3 py-2 text-sm text-ink">
                {selected.classCount} clases · vence el {expiryPreview} · {fmtMoney(Number(amount) || 0)}{' '}
                {method === 'cash' ? 'efectivo' : method}
              </p>
            )}

            <Button type="submit" full loading={saving} disabled={!selected}>
              Asignar
            </Button>
          </>
        )}
      </form>
    </Modal>
  );
}
