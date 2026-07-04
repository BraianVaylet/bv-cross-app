# 04 — Design System (`@bv/ui`)

> Un solo sistema de diseño para las tres apps. Cambiar un color, una fuente o un radio en `@bv/ui` debe propagarse a bv-cross, bv-cross-schedule y el CRM con solo actualizar la dependencia. Este documento define el sistema; la implementación de referencia ya existe en `bv-cross/DESIGN_SYSTEM.md` (v1) y se **extrae y extiende** aquí.

## 1. Identidad

Se conserva la identidad v1 — probada y con personalidad:

- **Estética cálida**: fondos crema/verdosos (nunca blanco puro), acento naranja, sensación de calma y foco.
- **Dark mode de primera clase**: aplicado antes del primer paint (script `theme-init.js`, sin parpadeo), cada token tiene valor en ambos temas.
- **Redondeado y suave**: `rounded-xl`/`rounded-2xl`, bordes finos, transiciones en hover/active.
- **Tipografía con personalidad**: serif display para títulos y números grandes, sans del sistema para cuerpo, "Chewy" solo para el logotipo.

## 2. Arquitectura del sistema — por qué es flexible

**Regla central: las apps solo consumen tokens semánticos, jamás valores crudos.** Prohibido `bg-white`, `text-gray-500`, `#FF5722` en código de app. Siempre `bg-surface`, `text-ink-muted`, `bg-accent`.

```
@bv/ui
├── tokens.css        # LA fuente de verdad: variables CSS :root + .dark
├── theme-init.js     # anti-parpadeo dark mode (portado de v1)
├── components/       # React: Button, Input, Card, Modal, ...
└── index.ts          # barrel de componentes
```

Cadena de theming (Tailwind v4):

```css
/* tokens.css — cambiar acá repinta las 3 apps */
:root  { --c-accent: #FF5722; /* ... */ }
.dark  { --c-accent: #FF6E4A; /* ... */ }
@theme inline { --color-accent: var(--c-accent); /* ... */ }
```

Cada app hace `@import "@bv/ui/tokens.css"` en su `index.css`. Un rebrand completo (colores, fuentes, radios) = editar `tokens.css` en `packages/ui`: **el mismo PR repinta las 3 apps**. Nada más.

## 3. Tokens

### Color (heredados de v1, valores en `bv-cross/DESIGN_SYSTEM.md`)

| Token | Uso |
|---|---|
| `base` | Fondo de la app |
| `surface` | Cards, inputs, header |
| `raised` | Hover, segmented, skeletons |
| `ink` / `ink-muted` / `ink-dim` | Texto principal / secundario / terciario |
| `line` | Bordes y divisores |
| `accent` / `accent-strong` / `accent-soft` / `on-accent` | Acción primaria y estados |
| `danger` / `ok` | Error/destructivo · éxito |
| **`warn`** *(nuevo)* | Alertas no destructivas: pack por vencer, cupo casi lleno |
| **`info`** *(nuevo)* | Estados informativos en CRM |

### Tipografía
- `--font-display`: serif (títulos, números grandes — el "disco" de carga, contadores de créditos).
- `--font-body`: system sans.
- `--font-logo`: Chewy (solo logotipo).
- Escala: usar la de Tailwind; números tabulares (`tabular-nums`) en tablas y contadores.

### Espaciado, radio, sombra
- Radios: `--radius-card: 1rem`, `--radius-control: 0.75rem` (los componentes los referencian — un rebrand "cuadrado" es cambiar dos variables).
- Sombras mínimas: la elevación se expresa con `raised` + `line`, no con sombras fuertes.

## 4. Componentes

### Núcleo (portar de v1 `ui.tsx`, dividir en archivos)
`Button` (primary/ghost/danger · sm/md/lg · loading) · `Input`/`Field` (label, error, hint) · `Select` · `Card` · `Chip` (los % de la calculadora) · `Segmented` · `Skeleton` · `EmptyState` · `Modal/ConfirmDialog` · `Toast` · `Icons` (SVG propios, sin librería de íconos).

### Nuevos para agenda (bv-cross-schedule)
- `WeekGrid`: grilla semanal de sesiones, navegación por semana.
- `SessionCard`: horario, disciplina, ocupación (`7/12`), estado (disponible / casi lleno `warn` / lleno / reservado / cancelado).
- `CreditBadge`: "8 clases · vence 01/08" — el saldo siempre visible.

### Nuevos para CRM
- `AppShell`: **sidebar colapsable en desktop (≥1024px), bottom-nav en mobile** — el CRM es responsive real, misma SPA.
- `DataTable`: encabezado pegajoso, orden, paginación por cursor, estado vacío; en mobile colapsa a cards.
- `StatCard` (KPI con delta) · `SimpleChart` (línea/barras SVG propio; si crece, la única lib candidata es `recharts`) · `SearchInput` con debounce · `Tabs` · `Badge` de estado (mapea estados de dominio a colores: `active→ok`, `expired→danger`, `invited→info`...).

### Reglas de componentes
1. Sin lógica de negocio: un componente no sabe qué es un pack; recibe props presentacionales.
2. Estados obligatorios: loading / empty / error diseñados en cada vista (patrón v1: `Skeleton` + `EmptyState`).
3. Accesibilidad mínima no negociable: contraste AA, foco visible (`focus-visible` con anillo `accent`), targets táctiles ≥ 44px, `aria-label` en icon-buttons, modales con trap de foco.

## 5. Layout

- **Apps atleta**: columna única `max-w-md` centrada, mobile-first (patrón v1). Header fijo con logo + selector de org + avatar.
- **CRM**: `max-w-7xl` con sidebar; formularios en `max-w-2xl`. Breakpoints Tailwind estándar; diseñar mobile primero también en CRM (el dueño lo usa desde el celu en el gimnasio).

## 6. Voz y textos (UX writing)

- Español rioplatense, voseo, directo: "Reservá tu clase", "No tenés clases disponibles".
- Errores accionables: qué pasó + qué hacer ("El cupo se llenó. Elegí otro horario.").
- Confirmaciones solo para acciones destructivas o con costo (cancelar clase, archivar pack).
- Fechas relativas cuando ayudan ("vence en 5 días"), absolutas al hover/detalle.

## 7. Proceso de cambio del design system

1. PR que toca `packages/ui` (tokens o componentes) con captura en ambos temas.
2. Si el cambio es breaking en la API de un componente, el **mismo PR** ajusta las apps afectadas: la compilación de las 3 apps corre en CI, así que es imposible mergear un breaking a medias (DEC-06).
3. Sin versionado interno: las apps siempre consumen el estado actual vía `workspace:*`.
