import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell, type AppShellNavItem } from './AppShell.js';
import { CalendarIcon, HomeIcon, SettingsIcon, UsersIcon } from './Icons.js';

const NAV: AppShellNavItem[] = [
  { to: '/', label: 'Dashboard', Icon: HomeIcon },
  { to: '/clients', label: 'Clientes', Icon: UsersIcon },
  { to: '/classes', label: 'Clases', Icon: CalendarIcon },
  { to: '/settings', label: 'Configuración', Icon: SettingsIcon, primary: false },
];

type ShellProps = React.ComponentProps<typeof AppShell>;

function setup(over: Partial<ShellProps> = {}) {
  const props: ShellProps = {
    appName: 'BV CRM',
    nav: NAV,
    currentPath: '/clients',
    renderLink: ({ to, className, active, children }) => (
      <a href={to} className={className} aria-current={active ? 'page' : undefined}>
        {children}
      </a>
    ),
    children: <p>contenido</p>,
    ...over,
  };
  render(<AppShell {...props} />);
  return props;
}

/**
 * El shell es responsive por CSS (`lg:` de Tailwind), no por JS: en jsdom
 * conviven los dos árboles y el navegador oculta uno con `display:none`, que
 * además lo saca del árbol de accesibilidad. Por eso acá se verifica que cada
 * variante exista con la clase que la muestra u oculta, y el comportamiento
 * (activo, "Más", switcher) que sí es lógica.
 */
describe('AppShell (F3-04)', () => {
  it('sidebar solo desde lg, barra inferior solo hasta lg', () => {
    const { container } = render(
      <AppShell
        appName="BV CRM"
        nav={NAV}
        currentPath="/"
        renderLink={({ to, className, children }) => (
          <a href={to} className={className}>
            {children}
          </a>
        )}
      >
        <p>contenido</p>
      </AppShell>,
    );
    const sidebar = container.querySelector('aside');
    expect(sidebar?.className).toContain('hidden');
    expect(sidebar?.className).toContain('lg:flex');

    const bottom = container.querySelector('nav.fixed');
    expect(bottom?.className).toContain('lg:hidden');
    expect(screen.getByText('contenido')).toBeTruthy();
  });

  it('marca la sección activa con aria-current, y solo esa', () => {
    setup({ currentPath: '/clients' });
    const current = screen.getAllByRole('link', { current: 'page' });
    // Aparece en las dos variantes (sidebar y barra), siempre la misma sección.
    expect(current.length).toBeGreaterThan(0);
    expect(new Set(current.map((el) => el.textContent))).toEqual(new Set(['Clientes']));
  });

  it('una subruta mantiene activa su sección', () => {
    setup({ currentPath: '/clients/6a5fcf10ee11044b99d0dce9' });
    expect(
      new Set(screen.getAllByRole('link', { current: 'page' }).map((el) => el.textContent)),
    ).toEqual(new Set(['Clientes']));
  });

  it('el dashboard no queda activo en el resto de las rutas', () => {
    setup({ currentPath: '/classes' });
    const current = screen.getAllByRole('link', { current: 'page' });
    expect(current.every((el) => el.textContent === 'Clases')).toBe(true);
  });

  it('lo que no entra en la barra vive detrás de "Más"', () => {
    setup();
    const bottom = screen.getAllByRole('navigation').at(-1);
    if (!bottom) throw new Error('sin barra inferior');
    // Configuración no está en la barra: está en la hoja.
    expect(within(bottom).queryByText('Configuración')).toBeNull();

    fireEvent.click(within(bottom).getByRole('button', { name: /Más/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Configuración')).toBeTruthy();
  });

  it('el switcher de gimnasio avisa cuál se eligió', () => {
    const onSelectOrg = vi.fn();
    setup({
      orgs: [
        { id: 'o1', name: 'Bahía Cross' },
        { id: 'o2', name: 'Box del Puerto' },
      ],
      activeOrgId: 'o1',
      onSelectOrg,
    });
    const select = screen.getAllByRole('combobox', { name: 'Gimnasio activo' })[0];
    if (!select) throw new Error('sin switcher');
    fireEvent.change(select, { target: { value: 'o2' } });
    expect(onSelectOrg).toHaveBeenCalledWith('o2');
  });

  it('sin organizaciones no se dibuja el switcher', () => {
    setup({ orgs: [] });
    expect(screen.queryByRole('combobox', { name: 'Gimnasio activo' })).toBeNull();
  });

  it('cerrar sesión está a mano en las dos variantes', () => {
    const onLogout = vi.fn();
    setup({ onLogout, userName: 'Olivia' });
    const buttons = screen.getAllByRole('button', { name: 'Cerrar sesión' });
    expect(buttons.length).toBe(2); // sidebar y header compacto
    fireEvent.click(buttons[0] as HTMLElement);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
