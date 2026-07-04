import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  Input,
  Logo,
  Modal,
  MoonIcon,
  Segmented,
  Select,
  Skeleton,
  SunIcon,
  Textarea,
  ToastProvider,
  useToast,
} from '../src/index.js';
import './styles.css';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Demo() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const [seg, setSeg] = useState<'kg' | 'reps'>('kg');
  const [chip, setChip] = useState(80);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('bv-theme', next ? 'dark' : 'light');
    setDark(next);
  };

  return (
    <main className="mx-auto max-w-md space-y-8 px-4 py-8">
      <header className="flex items-center justify-between">
        <Logo size="lg" />
        <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Cambiar tema">
          {dark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
        </Button>
      </header>

      <Section title="Botones">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Campos">
        <Input label="Email" placeholder="vos@mail.com" hint="Nunca lo compartimos." />
        <Input label="Peso" suffix="kg" error="Tiene que ser mayor a 0." defaultValue="0" />
        <Select label="Disciplina" defaultValue="cross">
          <option value="cross">CrossFit</option>
          <option value="hyrox">Hyrox</option>
        </Select>
        <Textarea label="Observaciones" placeholder="Lesión de hombro..." rows={2} />
      </Section>

      <Section title="Chips y Segmented">
        <div className="flex flex-wrap gap-2">
          {[65, 75, 80, 85, 90, 95].map((p) => (
            <Chip key={p} selected={chip === p} onClick={() => setChip(p)}>
              {p}%
            </Chip>
          ))}
        </div>
        <Segmented
          label="Tipo de registro"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'kg', label: 'Peso (kg)' },
            { value: 'reps', label: 'Repeticiones' },
          ]}
        />
      </Section>

      <Section title="Superficies y estados">
        <Card>
          Una card estándar con <strong className="text-accent">acento</strong>.
        </Card>
        <ErrorBanner>No pudimos guardar el registro. Probá de nuevo.</ErrorBanner>
        <div className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <EmptyState
          title="Sin ejercicios todavía"
          text="Cargá tu primer ejercicio para empezar a registrar tus RMs."
          action={<Button size="sm">Crear ejercicio</Button>}
        />
        <div className="flex gap-2 text-sm">
          <span className="rounded-full bg-warn-soft px-2.5 py-1 text-warn">Vence pronto</span>
          <span className="rounded-full bg-info-soft px-2.5 py-1 text-info">Invitado</span>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent-strong">Activo</span>
        </div>
      </Section>

      <Section title="Overlays">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setModal(true)}>
            Abrir modal
          </Button>
          <Button variant="secondary" onClick={() => setConfirm(true)}>
            Confirmación
          </Button>
          <Button variant="secondary" onClick={() => toast.show('Reserva confirmada')}>
            Toast
          </Button>
        </div>
      </Section>

      <Modal open={modal} title="Asignar pack" onClose={() => setModal(false)}>
        <div className="space-y-3">
          <Select label="Pack">
            <option>8 clases · 30 días · $25.000</option>
          </Select>
          <Input label="Fecha de inicio" type="date" />
          <Button full onClick={() => setModal(false)}>
            Asignar
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm}
        title="¿Archivar pack?"
        message="No se podrá asignar más. Los clientes vigentes no se ven afectados."
        confirmLabel="Archivar"
        onConfirm={() => {
          setConfirm(false);
          toast.show('Pack archivado', 'info');
        }}
        onCancel={() => setConfirm(false)}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Demo />
    </ToastProvider>
  </StrictMode>,
);
