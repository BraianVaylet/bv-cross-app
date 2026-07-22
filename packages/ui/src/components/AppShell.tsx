import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { cx } from '../cx.js';
import { Logo } from './Logo.js';
import { CloseIcon, LogoutIcon, MoonIcon, SunIcon } from './Icons.js';
import { Modal } from './Modal.js';

export interface AppShellNavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** En mobile, los que no entran en la barra viven detrás de "Más". */
  primary?: boolean;
}

export interface AppShellOrg {
  id: string;
  name: string;
}

export interface AppShellProps {
  appName: string;
  nav: AppShellNavItem[];
  /** Ruta activa (`location.pathname`): el shell no conoce el router. */
  currentPath: string;
  /**
   * Render del link: cada app usa el suyo (react-router, anchor, etc.).
   * `active` viaja para que el link ponga `aria-current="page"`: el shell no
   * puede hacerlo por él sin clonar elementos ajenos.
   */
  renderLink: (item: {
    to: string;
    className: string;
    active: boolean;
    children: ReactNode;
  }) => ReactNode;
  orgs?: AppShellOrg[];
  activeOrgId?: string | null;
  onSelectOrg?: (orgId: string) => void;
  userName?: string;
  onLogout?: () => void;
  children: ReactNode;
}

const isActive = (currentPath: string, to: string): boolean =>
  to === '/' ? currentPath === '/' : currentPath === to || currentPath.startsWith(`${to}/`);

function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('bv-theme', next ? 'dark' : 'light');
    } catch {
      /* storage no disponible */
    }
    setDark(next);
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema"
      className={cx(
        'flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-raised hover:text-ink',
        className,
      )}
    >
      {dark ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
    </button>
  );
}

/**
 * Shell del CRM (F3-04): sidebar fija en escritorio, barra inferior en el
 * teléfono. El dueño de un box atiende desde el mostrador y desde el celular,
 * así que las dos formas son de primera clase, no una adaptación de la otra.
 *
 * No conoce el router: recibe `currentPath` y un `renderLink`. Así queda
 * reutilizable por cualquier app admin (y testeable sin montar rutas).
 */
export function AppShell({
  appName,
  nav,
  currentPath,
  renderLink,
  orgs = [],
  activeOrgId = null,
  onSelectOrg,
  userName,
  onLogout,
  children,
}: AppShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = nav.filter((item) => item.primary !== false);
  const secondary = nav.filter((item) => item.primary === false);

  // Navegar cierra la hoja de "Más" sin que el shell tenga que interceptar el
  // click de un link que no construye él.
  useEffect(() => {
    setMoreOpen(false);
  }, [currentPath]);

  const orgSwitcher =
    orgs.length > 0 && onSelectOrg ? (
      <label className="block">
        <span className="sr-only">Gimnasio activo</span>
        <select
          value={activeOrgId ?? ''}
          onChange={(e) => {
            onSelectOrg(e.target.value);
          }}
          className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
        >
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </label>
    ) : null;

  const navLinkCx = (active: boolean): string =>
    cx(
      'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
      active ? 'bg-accent-soft text-accent-strong' : 'text-ink-muted hover:bg-raised hover:text-ink',
    );

  return (
    <div className="min-h-dvh lg:flex">
      {/* Escritorio: sidebar fija. */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface lg:flex lg:flex-col">
        <div className="flex items-center gap-2 px-4 py-4">
          <Logo label={appName} />
          <span className="font-display text-lg font-semibold text-ink">{appName}</span>
        </div>

        <nav aria-label="Secciones" className="flex-1 space-y-1 px-3">
          {nav.map((item) => {
            const active = isActive(currentPath, item.to);
            return (
              <div key={item.to}>
                {renderLink({
                  to: item.to,
                  className: navLinkCx(active),
                  active,
                  children: (
                    <>
                      <item.Icon className="h-4.5 w-4.5" aria-hidden="true" />
                      {item.label}
                    </>
                  ),
                })}
              </div>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-line p-3">
          {orgSwitcher}
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-ink-muted">{userName}</span>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  aria-label="Cerrar sesión"
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  <LogoutIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Teléfono: header compacto. */}
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <Logo label={appName} />
            <span className="font-display text-base font-semibold text-ink">{appName}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                aria-label="Cerrar sesión"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-raised hover:text-ink"
              >
                <LogoutIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 pb-28 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Teléfono: barra inferior. Lo que no entra vive detrás de "Más". */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="flex">
          {primary.map((item) => {
            const active = isActive(currentPath, item.to);
            return (
              <li key={item.to} className="flex-1">
                {renderLink({
                  to: item.to,
                  className: cx(
                    'flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.6875rem] font-medium transition-colors',
                    active ? 'text-accent' : 'text-ink-muted hover:text-ink',
                  ),
                  active,
                  children: (
                    <>
                      <item.Icon className="h-5 w-5" aria-hidden="true" />
                      {item.label}
                    </>
                  ),
                })}
              </li>
            );
          })}
          {secondary.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(true);
                }}
                className="flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.6875rem] font-medium text-ink-muted transition-colors hover:text-ink"
              >
                <span aria-hidden="true" className="text-lg leading-5">
                  ···
                </span>
                Más
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Modal
        open={moreOpen}
        onClose={() => {
          setMoreOpen(false);
        }}
      >
        <div className="space-y-1">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-ink">Más</h2>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
              }}
              aria-label="Cerrar"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted hover:bg-raised"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          {secondary.map((item) => (
            <div key={item.to}>
              {renderLink({
                to: item.to,
                className: navLinkCx(isActive(currentPath, item.to)),
                active: isActive(currentPath, item.to),
                children: (
                  <>
                    <item.Icon className="h-4.5 w-4.5" aria-hidden="true" />
                    {item.label}
                  </>
                ),
              })}
            </div>
          ))}
          {orgSwitcher && <div className="pt-2">{orgSwitcher}</div>}
        </div>
      </Modal>
    </div>
  );
}
