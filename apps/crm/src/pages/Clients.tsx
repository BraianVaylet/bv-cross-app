import type { MemberDto } from '@bv/contracts';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorBanner,
  Input,
  Modal,
  Segmented,
  Skeleton,
  Textarea,
  useToast,
  type DataTableColumn,
} from '@bv/ui';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { api, errorMessage } from '../api/endpoints';
import { usePageTitle } from '../lib/usePageTitle';

type Filter = 'all' | 'active' | 'invited' | 'disabled';

const STATUS_BADGE: Record<string, { tone: 'ok' | 'accent' | 'neutral'; label: string }> = {
  active: { tone: 'ok', label: 'Activo' },
  invited: { tone: 'accent', label: 'Invitado' },
  disabled: { tone: 'neutral', label: 'Deshabilitado' },
};

const nameOf = (m: MemberDto): string =>
  m.profile.displayName ?? m.user?.name ?? m.invitedEmail ?? 'Sin nombre';

/** Lista de clientes del gimnasio (F3-05). */
export function Clients() {
  usePageTitle('Clientes');
  const navigate = useNavigate();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MemberDto[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // Búsqueda server-side con debounce: escribir no dispara un request por tecla.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(search.trim());
    }, 300);
    return () => {
      clearTimeout(id);
    };
  }, [search]);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    setItems(null);
    try {
      const page = await api.members.list({
        ...(query ? { q: query } : {}),
        ...(filter !== 'all' ? { status: filter } : {}),
      });
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [query, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async (): Promise<void> => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.members.list({
        after: cursor,
        ...(query ? { q: query } : {}),
        ...(filter !== 'all' ? { status: filter } : {}),
      });
      setItems((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      toast.show(errorMessage(err), 'danger');
    } finally {
      setLoadingMore(false);
    }
  };

  const columns: DataTableColumn<MemberDto>[] = [
    {
      key: 'nombre',
      header: 'Nombre',
      primary: true,
      cell: (m) => nameOf(m),
      sortValue: (m) => nameOf(m).toLocaleLowerCase('es'),
    },
    {
      key: 'estado',
      header: 'Estado',
      cell: (m) => {
        const badge = STATUS_BADGE[m.status] ?? STATUS_BADGE.active;
        return badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null;
      },
      sortValue: (m) => m.status,
    },
    {
      key: 'contacto',
      header: 'Contacto',
      cell: (m) => m.user?.email ?? m.invitedEmail ?? m.profile.phone ?? '—',
    },
    {
      // El saldo del cliente vive en su ficha: traerlo por fila serían N+1
      // requests en la pantalla que más se abre. Se muestra al entrar.
      key: 'ultima',
      header: 'Última reserva',
      cell: () => '—',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Clientes</h1>
        <Button
          onClick={() => {
            setNewOpen(true);
          }}
        >
          Nuevo cliente
        </Button>
      </div>

      <div className="space-y-3">
        <Input
          label="Buscar"
          placeholder="Nombre o email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
        />
        <Segmented<Filter>
          options={[
            { value: 'all', label: 'Todos' },
            { value: 'active', label: 'Activos' },
            { value: 'invited', label: 'Invitados' },
            { value: 'disabled', label: 'Baja' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {loadError ? (
        <div className="space-y-3">
          <ErrorBanner>{loadError}</ErrorBanner>
          <Button variant="secondary" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : items === null ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-14 rounded-2xl" />
        </div>
      ) : (
        <DataTable
          caption="Clientes del gimnasio"
          columns={columns}
          rows={items}
          rowKey={(m) => m.id}
          onRowClick={(m) => {
            navigate(`/clients/${m.id}`);
          }}
          hasMore={cursor !== null}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
          empty={
            <EmptyState
              title={query || filter !== 'all' ? 'Sin resultados' : 'Todavía no hay clientes'}
              text={
                query || filter !== 'all'
                  ? 'Probá con otro nombre o quitá el filtro.'
                  : 'Cargá a tus clientes o pasales el código del gimnasio para que se sumen solos.'
              }
            />
          }
        />
      )}

      <NewClientModal
        open={newOpen}
        onClose={() => {
          setNewOpen(false);
        }}
        onCreated={(member) => {
          setNewOpen(false);
          toast.show('Cliente cargado.');
          navigate(`/clients/${member.id}`);
        }}
      />
    </div>
  );
}

/** Alta manual: el cliente queda `invited` hasta que se registre (RN-02). */
function NewClientModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (member: MemberDto) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [invitedEmail, setInvitedEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { member } = await api.members.create({
        profile: {
          displayName: displayName.trim(),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        },
        ...(invitedEmail.trim() ? { invitedEmail: invitedEmail.trim() } : {}),
        ...(adminNotes.trim() ? { adminNotes: adminNotes.trim() } : {}),
      });
      setDisplayName('');
      setInvitedEmail('');
      setPhone('');
      setAdminNotes('');
      onCreated(member);
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'ALREADY_MEMBER'
          ? 'Ese email ya está en el gimnasio.'
          : errorMessage(err),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Nuevo cliente" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
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
        <Input
          label="Email"
          type="email"
          hint="Con el email, al registrarse se vincula solo a esta ficha."
          value={invitedEmail}
          onChange={(e) => {
            setInvitedEmail(e.target.value);
          }}
        />
        <Input
          label="Teléfono"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
        />
        <Textarea
          label="Notas internas"
          hint="Solo las ve el equipo del gimnasio."
          rows={2}
          value={adminNotes}
          onChange={(e) => {
            setAdminNotes(e.target.value);
          }}
        />
        <Button type="submit" full loading={saving} disabled={displayName.trim().length === 0}>
          Cargar cliente
        </Button>
      </form>
    </Modal>
  );
}
