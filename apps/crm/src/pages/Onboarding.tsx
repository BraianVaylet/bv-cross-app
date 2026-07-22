import { Button, Card, ErrorBanner, Input, Select, useToast } from '@bv/ui';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { usePageTitle } from '../lib/usePageTitle';

/** Timezones de Argentina y las vecinas: el 99% de los boxes de la beta. */
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

const WEEKDAYS = [
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' },
  { value: '0', label: 'Domingo' },
];

type Step = 'org' | 'class' | 'pack' | 'done';

/**
 * Onboarding del dueño (F1 del Funcional): de cuenta nueva a gimnasio
 * operativo. Los pasos 2 y 3 se pueden saltear — lo que no se puede saltear es
 * el 1, y lo que no se puede perder es el código de organización del final.
 */
export function Onboarding() {
  usePageTitle('Configurá tu gimnasio');
  const navigate = useNavigate();
  const toast = useToast();
  const { refreshMemberships, selectOrg } = useAuth();

  const [step, setStep] = useState<Step>('org');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [timezone, setTimezone] = useState(TIMEZONES[0] ?? 'America/Argentina/Buenos_Aires');

  const [weekday, setWeekday] = useState('1');
  const [startTime, setStartTime] = useState('18:00');
  const [discipline, setDiscipline] = useState('crossfit');
  const [capacity, setCapacity] = useState('12');

  const [packName, setPackName] = useState('8 clases');
  const [classCount, setClassCount] = useState('8');
  const [durationDays, setDurationDays] = useState('30');
  const [price, setPrice] = useState('25000');

  const createOrg = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { org } = await api.orgs.create({ name: orgName.trim(), timezone });
      // Queda como org activa: los pasos siguientes ya pegan contra ella.
      await refreshMemberships();
      selectOrg(org.id);
      setJoinCode(org.joinCode ?? null);
      setStep('class');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const createTemplate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.templates.create({
        weekday: Number(weekday),
        startTime,
        durationMin: 60,
        discipline: discipline.trim(),
        capacity: Number(capacity),
      });
      toast.show('Clase creada.');
      setStep('pack');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const createPack = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.packs.create({
        name: packName.trim(),
        classCount: Number(classCount),
        durationDays: Number(durationDays),
        price: Number(price),
        paymentMethod: 'cash',
      });
      toast.show('Pack creado.');
      setStep('done');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const invitation = `¡Sumate a ${orgName}! Descargá BV Cross para tus cargas y BV Agenda para reservar clases, y entrá con este código: ${joinCode ?? ''}`;

  const copyInvitation = (): void => {
    void navigator.clipboard
      .writeText(invitation)
      .then(() => {
        toast.show('Mensaje copiado.');
      })
      .catch(() => {
        toast.show('No pudimos copiar: seleccioná el texto a mano.', 'danger');
      });
  };

  const stepIndex = { org: 1, class: 2, pack: 3, done: 4 }[step];

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-4 py-10">
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium text-ink-dim">Paso {stepIndex} de 4</p>
        <h1 className="font-display text-2xl font-semibold text-ink">
          {step === 'org' && 'Creá tu gimnasio'}
          {step === 'class' && 'Tu primera clase'}
          {step === 'pack' && 'Tu primer pack'}
          {step === 'done' && '¡Listo!'}
        </h1>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {step === 'org' && (
        <Card>
          <form onSubmit={(e) => void createOrg(e)} className="space-y-4">
            <Input
              label="Nombre del gimnasio"
              required
              maxLength={60}
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
              }}
            />
            <Select
              label="Zona horaria"
              hint="Las clases y los vencimientos se muestran en esta hora."
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
            <Button type="submit" full loading={saving} disabled={orgName.trim().length < 2}>
              Crear gimnasio
            </Button>
          </form>
        </Card>
      )}

      {step === 'class' && (
        <Card>
          <form onSubmit={(e) => void createTemplate(e)} className="space-y-4">
            <p className="text-sm text-ink-muted">
              Cargá un horario para arrancar; después agregás la grilla completa.
            </p>
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
              label="Cupo"
              type="number"
              min={1}
              required
              value={capacity}
              onChange={(e) => {
                setCapacity(e.target.value);
              }}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                full
                onClick={() => {
                  setStep('pack');
                }}
              >
                Después
              </Button>
              <Button type="submit" full loading={saving}>
                Crear clase
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 'pack' && (
        <Card>
          <form onSubmit={(e) => void createPack(e)} className="space-y-4">
            <p className="text-sm text-ink-muted">
              Un pack es lo que le vendés al cliente: cantidad de clases y vigencia.
            </p>
            <Input
              label="Nombre"
              required
              value={packName}
              onChange={(e) => {
                setPackName(e.target.value);
              }}
            />
            <Input
              label="Clases"
              type="number"
              min={1}
              required
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
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
              }}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                full
                onClick={() => {
                  setStep('done');
                }}
              >
                Después
              </Button>
              <Button type="submit" full loading={saving}>
                Crear pack
              </Button>
            </div>
          </form>
        </Card>
      )}

      {step === 'done' && (
        <Card className="space-y-4 text-center">
          <p className="text-sm text-ink-muted">
            Este es el código de tu gimnasio. Tus clientes lo usan para entrar.
          </p>
          <p className="font-display text-2xl font-semibold tracking-wide text-accent">
            {joinCode ?? '—'}
          </p>
          <Button variant="secondary" full onClick={copyInvitation}>
            Copiar mensaje de invitación
          </Button>
          <Button
            full
            onClick={() => {
              navigate('/', { replace: true });
            }}
          >
            Ir al panel
          </Button>
        </Card>
      )}
    </div>
  );
}
