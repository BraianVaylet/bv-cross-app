import type { PackDto } from '@bv/contracts';
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
  Textarea,
  shortDate,
  useToast,
} from '@bv/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { fmtMoney, fmtPaymentMethod } from '../lib/format';
import { usePageTitle } from '../lib/usePageTitle';

type Tab = 'active' | 'archived';

/** Catálogo de packs (F3-07): lo que el gimnasio vende. */
export function Packs() {
  usePageTitle('Packs');
  const toast = useToast();
  const { memberships, activeOrgId } = useAuth();
  const timeZone = memberships.find((m) => m.orgId === activeOrgId)?.timezone ?? 'UTC';

  const [tab, setTab] = useState<Tab>('active');
  const [packs, setPacks] = useState<PackDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PackDto | 'new' | null>(null);
  const [toArchive, setToArchive] = useState<PackDto | null>(null);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    setPacks(null);
    try {
      const { items } = await api.packs.list(true);
      setPacks(items);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activos = (packs ?? []).filter((p) => p.archivedAt === undefined);
  // RN-15: el archivo es el registro de cómo evolucionaron los precios, así que
  // se lee de lo más reciente a lo más viejo.
  const archivados = (packs ?? [])
    .filter((p) => p.archivedAt !== undefined)
    .sort((a, b) => Date.parse(b.archivedAt ?? '') - Date.parse(a.archivedAt ?? ''));
  const visibles = tab === 'active' ? activos : archivados;

  const upsert = (pack: PackDto): void => {
    setPacks((prev) => {
      const list = prev ?? [];
      return list.some((p) => p.id === pack.id)
        ? list.map((p) => (p.id === pack.id ? pack : p))
        : [pack, ...list];
    });
  };

  const confirmArchive = async (): Promise<void> => {
    if (!toArchive) return;
    setArchiving(true);
    try {
      const { pack } = await api.packs.archive(toArchive.id);
      upsert(pack);
      setToArchive(null);
      toast.show('Pack archivado.');
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    } finally {
      setArchiving(false);
    }
  };

  const restore = async (pack: PackDto): Promise<void> => {
    try {
      const { pack: restored } = await api.packs.restore(pack.id);
      upsert(restored);
      toast.show('Pack restaurado: ya se puede asignar.');
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Packs</h1>
        <Button
          onClick={() => {
            setEditing('new');
          }}
        >
          Nuevo pack
        </Button>
      </div>

      <Segmented<Tab>
        options={[
          { value: 'active', label: `Activos (${String(activos.length)})` },
          { value: 'archived', label: `Archivados (${String(archivados.length)})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {loadError ? (
        <div className="space-y-3">
          <ErrorBanner>{loadError}</ErrorBanner>
          <Button variant="secondary" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : packs === null ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : visibles.length === 0 ? (
        <EmptyState
          title={tab === 'active' ? 'Todavía no hay packs' : 'No hay packs archivados'}
          text={
            tab === 'active'
              ? 'Creá el primero: es lo que le vas a vender a tus clientes.'
              : 'Cuando archives un pack va a quedar acá, con su precio y su período de vigencia.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {visibles.map((pack) => (
            <li key={pack.id}>
              <Card className="space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-base font-semibold text-ink">{pack.name}</p>
                    <p className="text-sm text-ink-muted">
                      {pack.classCount} clases · {pack.durationDays} días ·{' '}
                      <span className="font-medium text-ink">{fmtMoney(pack.price)}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge>{fmtPaymentMethod(pack.paymentMethod)}</Badge>
                    {pack.archivedAt ? (
                      <Badge tone="warn">Archivado</Badge>
                    ) : pack.activeAssignments > 0 ? (
                      <Badge tone="accent">
                        {pack.activeAssignments} {pack.activeAssignments === 1 ? 'cliente' : 'clientes'}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                {pack.internalNotes && <p className="text-sm text-ink-muted">{pack.internalNotes}</p>}

                <p className="text-xs text-ink-dim">
                  {pack.archivedAt
                    ? `Vigente del ${shortDate(pack.createdAt, timeZone)} al ${shortDate(pack.archivedAt, timeZone)}`
                    : `En el catálogo desde el ${shortDate(pack.createdAt, timeZone)}`}
                </p>

                <div className="flex flex-wrap gap-2">
                  {pack.archivedAt ? (
                    <Button variant="secondary" size="sm" onClick={() => void restore(pack)}>
                      Restaurar
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditing(pack);
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setToArchive(pack);
                        }}
                      >
                        Archivar
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <PackForm
        pack={editing}
        onClose={() => {
          setEditing(null);
        }}
        onSaved={(pack) => {
          upsert(pack);
          setEditing(null);
          toast.show('Pack guardado.');
        }}
      />

      <ConfirmDialog
        open={toArchive !== null}
        title="Archivar el pack"
        message="No se va a poder asignar más. Los clientes que ya lo tienen no se ven afectados: siguen con sus clases hasta que se les venzan."
        confirmLabel="Archivar"
        danger={false}
        loading={archiving}
        onCancel={() => {
          setToArchive(null);
        }}
        onConfirm={() => void confirmArchive()}
      />
    </div>
  );
}

/**
 * Alta y edición. La matriz RN-14 se **comunica**: con clientes vigentes, los
 * campos que les cambiarían el trato llegan deshabilitados y con la explicación
 * arriba. Descubrir la regla con un 409 después de escribir todo es peor.
 */
function PackForm({
  pack,
  onClose,
  onSaved,
}: {
  pack: PackDto | 'new' | null;
  onClose: () => void;
  onSaved: (pack: PackDto) => void;
}) {
  const editing = pack !== null && pack !== 'new' ? pack : null;
  const locked = (editing?.activeAssignments ?? 0) > 0;

  const [name, setName] = useState('');
  const [classCount, setClassCount] = useState('8');
  const [durationDays, setDurationDays] = useState('30');
  const [price, setPrice] = useState('25000');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [internalNotes, setInternalNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pack === null) return;
    setError(null);
    if (pack === 'new') {
      setName('');
      setClassCount('8');
      setDurationDays('30');
      setPrice('25000');
      setPaymentMethod('cash');
      setInternalNotes('');
    } else {
      setName(pack.name);
      setClassCount(String(pack.classCount));
      setDurationDays(String(pack.durationDays));
      setPrice(String(pack.price));
      setPaymentMethod(pack.paymentMethod);
      setInternalNotes(pack.internalNotes ?? '');
    }
  }, [pack]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (editing) {
        // Con clientes vigentes solo viajan los campos permitidos (RN-14).
        const { pack: saved } = await api.packs.update(editing.id, {
          name: name.trim(),
          internalNotes: internalNotes.trim() === '' ? null : internalNotes.trim(),
          ...(locked
            ? {}
            : {
                classCount: Number(classCount),
                durationDays: Number(durationDays),
                price: Number(price),
                paymentMethod: paymentMethod as 'cash' | 'debit' | 'transfer' | 'other',
              }),
        });
        onSaved(saved);
      } else {
        const { pack: created } = await api.packs.create({
          name: name.trim(),
          classCount: Number(classCount),
          durationDays: Number(durationDays),
          price: Number(price),
          paymentMethod: paymentMethod as 'cash' | 'debit' | 'transfer' | 'other',
          ...(internalNotes.trim() ? { internalNotes: internalNotes.trim() } : {}),
        });
        onSaved(created);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={pack !== null} title={editing ? 'Editar pack' : 'Nuevo pack'} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        {error && <ErrorBanner>{error}</ErrorBanner>}

        {locked && editing && (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
            Este pack tiene {editing.activeAssignments}{' '}
            {editing.activeAssignments === 1 ? 'cliente vigente' : 'clientes vigentes'}: solo podés
            editar el nombre y las notas. Para cambiar el precio o las clases, archivalo y creá uno
            nuevo.
          </p>
        )}

        <Input
          label="Nombre"
          required
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <Input
          label="Clases"
          type="number"
          min={1}
          required
          disabled={locked}
          value={classCount}
          onChange={(e) => {
            setClassCount(e.target.value);
          }}
        />
        <Input
          label="Días de vigencia"
          type="number"
          min={1}
          required
          disabled={locked}
          value={durationDays}
          onChange={(e) => {
            setDurationDays(e.target.value);
          }}
        />
        <Input
          label="Precio"
          type="number"
          min={0}
          required
          disabled={locked}
          hint={locked ? undefined : 'En pesos, sin centavos.'}
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
          }}
        />
        <Select
          label="Medio de pago"
          disabled={locked}
          value={paymentMethod}
          onChange={(e) => {
            setPaymentMethod(e.target.value);
          }}
        >
          <option value="cash">Efectivo</option>
          <option value="debit">Débito</option>
          <option value="transfer">Transferencia</option>
          <option value="other">Otro</option>
        </Select>
        <Textarea
          label="Notas internas"
          rows={2}
          value={internalNotes}
          onChange={(e) => {
            setInternalNotes(e.target.value);
          }}
        />

        <Button type="submit" full loading={saving} disabled={name.trim().length === 0}>
          {editing ? 'Guardar cambios' : 'Crear pack'}
        </Button>
      </form>
    </Modal>
  );
}
