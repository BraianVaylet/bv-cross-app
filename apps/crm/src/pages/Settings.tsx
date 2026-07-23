import type { MemberDto, OrgDto } from '@bv/contracts';
import { can } from '@bv/contracts';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorBanner,
  Input,
  Select,
  Skeleton,
  useToast,
} from '@bv/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../lib/usePageTitle';

const TIMEZONES = [
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Cordoba',
  'America/Argentina/Mendoza',
  'America/Argentina/Salta',
  'America/Argentina/Ushuaia',
  'America/Montevideo',
  'America/Santiago',
  'America/Asuncion',
  'America/Sao_Paulo',
];

const WINDOW_HOURS = [0, 1, 2, 3, 4, 6, 8, 12, 24, 48, 72];
const GENERATION_DAYS = [7, 14, 21, 30, 45, 60];

/**
 * Configuración de la organización (F3-11). Las secciones de owner se ocultan
 * al admin usando la MISMA matriz `can()` que aplica la API: si algún día
 * cambia un permiso, cambia en los dos lados a la vez.
 */
export function Settings() {
  usePageTitle('Configuración');
  const { memberships, activeOrgId } = useAuth();
  const role = memberships.find((m) => m.orgId === activeOrgId)?.role ?? 'athlete';
  const isOwner = can(role, 'org:settings');

  const [org, setOrg] = useState<OrgDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      const { org: current } = await api.orgs.current();
      setOrg(current);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (!org) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink">Configuración</h1>

      {!isOwner && (
        <p className="rounded-xl bg-raised px-3 py-2 text-sm text-ink-muted">
          Sos admin de {org.name}. La configuración del gimnasio la maneja el dueño.
        </p>
      )}

      {isOwner && (
        <>
          <IdentityCard org={org} onSaved={setOrg} />
          <PoliciesCard org={org} onSaved={setOrg} />
          <JoinCodeCard org={org} onChanged={setOrg} />
          <AdminsCard />
        </>
      )}
    </div>
  );
}

function IdentityCard({ org, onSaved }: { org: OrgDto; onSaved: (org: OrgDto) => void }) {
  const toast = useToast();
  const [name, setName] = useState(org.name);
  const [timezone, setTimezone] = useState(org.timezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = name !== org.name || timezone !== org.timezone;

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { org: updated } = await api.orgs.update({ name: name.trim(), timezone });
      onSaved(updated);
      toast.show('Datos del gimnasio actualizados.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={(e) => void save(e)} className="space-y-3">
        <h2 className="font-display text-base font-semibold text-ink">Tu gimnasio</h2>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <Input
          label="Nombre"
          required
          maxLength={60}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <Select
          label="Zona horaria"
          hint="Todas las clases y los vencimientos se muestran en esta hora, para vos y para tus clientes."
          value={timezone}
          onChange={(e) => {
            setTimezone(e.target.value);
          }}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace('America/', '').replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" loading={saving} disabled={!dirty}>
          Guardar
        </Button>
      </form>
    </Card>
  );
}

/** Las dos políticas que el atleta siente todos los días. */
function PoliciesCard({ org, onSaved }: { org: OrgDto; onSaved: (org: OrgDto) => void }) {
  const toast = useToast();
  const [windowHours, setWindowHours] = useState(String(org.settings.cancellationWindowHours));
  const [generationDays, setGenerationDays] = useState(String(org.settings.sessionGenerationDays));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    Number(windowHours) !== org.settings.cancellationWindowHours ||
    Number(generationDays) !== org.settings.sessionGenerationDays;

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { org: updated } = await api.orgs.update({
        settings: {
          cancellationWindowHours: Number(windowHours),
          sessionGenerationDays: Number(generationDays),
        },
      });
      onSaved(updated);
      toast.show('Políticas actualizadas.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <form onSubmit={(e) => void save(e)} className="space-y-3">
        <h2 className="font-display text-base font-semibold text-ink">Reglas de reserva</h2>
        {error && <ErrorBanner>{error}</ErrorBanner>}

        <Select
          label="Cancelación"
          hint={
            Number(windowHours) === 0
              ? 'Se puede cancelar hasta que la clase empieza.'
              : `Tus clientes pueden cancelar hasta ${windowHours} h antes de la clase. Después, la clase se les descuenta igual.`
          }
          value={windowHours}
          onChange={(e) => {
            setWindowHours(e.target.value);
          }}
        >
          {WINDOW_HOURS.map((h) => (
            <option key={h} value={h}>
              {h === 0 ? 'Hasta que empieza' : `${h} h antes`}
            </option>
          ))}
        </Select>

        <Select
          label="Reservas abiertas"
          hint={`La grilla se publica con ${generationDays} días de anticipación: más allá de eso, nadie puede anotarse todavía.`}
          value={generationDays}
          onChange={(e) => {
            setGenerationDays(e.target.value);
          }}
        >
          {GENERATION_DAYS.map((d) => (
            <option key={d} value={d}>
              {d} días
            </option>
          ))}
        </Select>

        <Button type="submit" variant="secondary" loading={saving} disabled={!dirty}>
          Guardar
        </Button>
      </form>
    </Card>
  );
}

function JoinCodeCard({ org, onChanged }: { org: OrgDto; onChanged: (org: OrgDto) => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const copy = async (text: string, note: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(note);
    } catch {
      toast.show('No pudimos copiar: seleccioná el texto a mano.', 'danger');
    }
  };

  const regenerate = async (): Promise<void> => {
    setRegenerating(true);
    try {
      const { org: updated } = await api.orgs.regenerateCode();
      onChanged(updated);
      setConfirming(false);
      toast.show('Código nuevo generado.');
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    } finally {
      setRegenerating(false);
    }
  };

  const invitation = `¡Sumate a ${org.name}! Descargá BV Cross para tus cargas y BV Agenda para reservar clases, y entrá con este código: ${org.joinCode ?? ''}`;

  return (
    <Card className="space-y-3">
      <h2 className="font-display text-base font-semibold text-ink">Código de acceso</h2>
      <p className="text-sm text-ink-muted">
        Con este código tus clientes se suman solos desde las apps.
      </p>
      <p className="font-display text-xl font-semibold tracking-wide text-accent">
        {org.joinCode ?? '—'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void copy(org.joinCode ?? '', 'Código copiado.')}
        >
          Copiar código
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void copy(invitation, 'Invitación copiada: pegala en WhatsApp.')}
        >
          Copiar invitación
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setConfirming(true);
          }}
        >
          Regenerar
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Regenerar el código"
        message="El código anterior deja de funcionar al instante: si lo pegaste en algún lado, va a dejar de servir. Tus clientes actuales no se ven afectados."
        confirmLabel="Regenerar"
        loading={regenerating}
        onCancel={() => {
          setConfirming(false);
        }}
        onConfirm={() => void regenerate()}
      />
    </Card>
  );
}

/** Quién más administra el gimnasio (RN-04). */
function AdminsCard() {
  const toast = useToast();
  const [members, setMembers] = useState<MemberDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState('');
  const [pending, setPending] = useState<{ member: MemberDto; role: 'admin' | 'athlete' } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const { items } = await api.members.list({ status: 'active', limit: 100 });
      setMembers(items);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (): Promise<void> => {
    if (!pending) return;
    setSaving(true);
    try {
      const { member } = await api.members.update(pending.member.id, { role: pending.role });
      setMembers((prev) => (prev ?? []).map((m) => (m.id === member.id ? member : m)));
      setPending(null);
      setPromoting('');
      toast.show(pending.role === 'admin' ? 'Ahora es administrador.' : 'Ya no es administrador.');
    } catch (err) {
      toast.show(
        err instanceof ApiError && err.code === 'CANNOT_MODIFY_OWNER'
          ? 'La cuenta del dueño no se puede cambiar.'
          : errorMessage(err),
        'danger',
      );
    } finally {
      setSaving(false);
    }
  };

  const nameOf = (m: MemberDto): string =>
    m.profile.displayName ?? m.user?.name ?? m.invitedEmail ?? 'Sin nombre';

  const staff = (members ?? []).filter((m) => m.role === 'owner' || m.role === 'admin');
  // Solo los que ya tienen cuenta: a una pre-carga no se le puede dar permisos.
  const candidatos = (members ?? []).filter((m) => m.role === 'athlete' && m.user);

  return (
    <Card className="space-y-3">
      <h2 className="font-display text-base font-semibold text-ink">Quién administra</h2>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {members === null ? (
        <Skeleton className="h-20 rounded-xl" />
      ) : (
        <>
          <ul className="space-y-2">
            {staff.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{nameOf(m)}</p>
                  {m.user && <p className="truncate text-xs text-ink-dim">{m.user.email}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>
                    {m.role === 'owner' ? 'Dueño' : 'Admin'}
                  </Badge>
                  {m.role === 'admin' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPending({ member: m, role: 'athlete' });
                      }}
                    >
                      Quitar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {candidatos.length > 0 && (
            <div className="flex items-end gap-2 border-t border-line pt-3">
              <Select
                label="Sumar administrador"
                hint="Va a poder gestionar clientes, clases y packs."
                value={promoting}
                onChange={(e) => {
                  setPromoting(e.target.value);
                }}
              >
                <option value="">Elegí a alguien…</option>
                {candidatos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {nameOf(m)}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                disabled={promoting === ''}
                onClick={() => {
                  const member = candidatos.find((m) => m.id === promoting);
                  if (member) setPending({ member, role: 'admin' });
                }}
              >
                Sumar
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.role === 'admin' ? 'Sumar administrador' : 'Quitar administrador'}
        message={
          pending?.role === 'admin'
            ? `${pending.member.profile.displayName ?? 'Esta persona'} va a poder gestionar clientes, clases, packs y ejercicios. No va a poder cambiar la configuración del gimnasio ni sumar otros administradores.`
            : `${pending ? (pending.member.profile.displayName ?? 'Esta persona') : ''} deja de administrar y vuelve a ser un cliente más. No pierde su historial ni sus packs.`
        }
        confirmLabel={pending?.role === 'admin' ? 'Sumar' : 'Quitar'}
        danger={pending?.role === 'athlete'}
        loading={saving}
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={() => void changeRole()}
      />
    </Card>
  );
}
