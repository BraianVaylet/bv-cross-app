# 03 — Documento Técnico

> Define **cómo se escribe el código** en todos los repos: estándares, estructura de carpetas, patrones, nomenclatura, linters y flujo de trabajo. Objetivo: que cualquier tarea del [PLAN.md](../PLAN.md), tomada por cualquier desarrollador o modelo, produzca código indistinguible del resto del proyecto.

## 1. Principios

1. **Pocas dependencias.** Cada dependencia nueva se justifica en el PR (qué problema resuelve, por qué no lo resolvemos nosotros, cuántas deps transitivas trae). Herencia directa de v1.
2. **TypeScript estricto en todo.** `strict: true`, sin `any` (usar `unknown` + narrowing). Los tipos del dominio se **derivan** de schemas Zod (`z.infer`), nunca se duplican a mano.
3. **Validar en los bordes, confiar adentro.** Todo input externo (HTTP body/query/params, env vars, webhooks) pasa por Zod al entrar. Del borde hacia adentro circulan tipos ya validados.
4. **El dominio no conoce HTTP ni Mongo.** Servicios de dominio puros (reciben repos como dependencias) → testeables sin red ni DB.
5. **Errores explícitos.** Los servicios lanzan `DomainError(code, message)`; un solo `onError` los traduce a HTTP. Prohibido `throw new Error('algo')` en flujos esperables.
6. **Código en inglés, UI en español.** Identificadores, comentarios de código y commits en inglés; textos visibles al usuario en español.

## 2. Stack fijado (todas las apps)

| Pieza | Elección | Notas |
|---|---|---|
| Runtime | Node 22 LTS | `engines` en package.json |
| Lenguaje | TypeScript 5.x, ESM (`"type": "module"`) | |
| Package manager | pnpm 10.x (workspaces) | lockfile único commiteado siempre |
| Monorepo | Turborepo | orquestación de tareas con grafo + cache local y de CI |
| API | Hono 4.x + `@hono/node-server` | DEC-01 |
| DB | driver oficial `mongodb` 6.x | DEC-02 |
| Validación | Zod 3.x | schemas en `@bv/contracts` |
| FE | React 18 + Vite 6 + React Router 6 + Tailwind v4 | igual a v1 |
| Fechas | `date-fns` + `@date-fns/tz` | prohibido moment/dayjs |
| Tests | Vitest + mongodb-memory-server + Playwright | ver [Testing](08-testing.md) |
| Lint/format | ESLint 9 (flat) + typescript-eslint strict + Prettier | config compartida `@bv/config` |
| Email | Resend detrás de interfaz `EmailProvider` | swap a SES sin tocar dominio |

**Server state en FEs**: fase 1 con un fetcher propio tipado por `@bv/contracts` (patrón `api.ts` de v1). Si la invalidación de cache se vuelve compleja (CRM), adoptar TanStack Query — decisión por app, documentar en el PR.

## 3. Scaffolding

### Raíz del monorepo

```
bv-cross-v2/
├── apps/{api, cross, schedule, crm}
├── packages/{ui, contracts, config}
├── docs/ · PLAN.md
└── pnpm-workspace.yaml · turbo.json · package.json (scripts globales)
```

- Dependencias internas: **`workspace:*`**. Prohibido que una app importe de otra app por path relativo — todo lo compartido pasa por `packages/`.
- `turbo run lint typecheck test` corre sobre el grafo completo con cache; `pnpm --filter @bv/api dev` para trabajar un paquete puntual.
- Los scripts estándar de §7 existen en cada workspace con el mismo nombre — así `turbo run <task>` funciona uniforme.

### `apps/api`

```
src/
├── index.ts              # bootstrap: config → mongo → jobs → serve
├── app.ts                # instancia Hono: middlewares globales + mounts
├── config.ts             # env vars validadas con Zod (falla al arrancar si falta algo)
├── db/
│   ├── client.ts         # conexión Mongo (singleton), health check
│   ├── indexes.ts        # TODOS los índices declarados acá; ensureIndexes() al boot
│   └── collections.ts    # getters tipados: users(), bookings(), ...
├── middleware/
│   ├── auth.ts           # requireAuth (JWT) → c.set('userId')
│   ├── tenant.ts         # tenantGuard (X-Org-Id + membership) → c.set('org', ...)
│   ├── roles.ts          # requireRole('admin' | ...)
│   └── rate-limit.ts     # por IP y por cuenta (patrón v1)
├── modules/              # UN DIRECTORIO POR AGREGADO DE DOMINIO
│   └── <modulo>/
│       ├── <modulo>.routes.ts    # rutas Hono: parse Zod → llamar servicio → responder
│       ├── <modulo>.service.ts   # reglas de negocio (RN-XX citadas en comentarios)
│       ├── <modulo>.repo.ts      # queries Mongo; orgId obligatorio en cada filtro
│       └── <modulo>.test.ts      # unit + integration del módulo
│   # módulos: auth, orgs, members, exercises, entries, schedule (templates+sessions),
│   #          bookings, packs, assignments, stats
├── jobs/
│   ├── scheduler.ts      # node-cron: registra los jobs
│   ├── materialize-sessions.ts
│   └── expire-packs.ts
└── lib/
    ├── crypto.ts         # scrypt + tokens (portado de v1)
    ├── email.ts          # interfaz EmailProvider + impl Resend + impl consola (dev)
    ├── errors.ts         # DomainError + códigos + mapeo a HTTP
    └── http.ts           # helpers de respuesta, paginación por cursor
```

Reglas del scaffolding API:
- `routes` no toca Mongo; `repo` no contiene reglas de negocio; `service` no conoce Hono. Dependencias en una sola dirección: `routes → service → repo`.
- Nada importa desde `modules/otro-modulo/*.repo.ts` — la comunicación entre módulos pasa por servicios.
- Todo índice nuevo se agrega en `db/indexes.ts` en el mismo PR que la query que lo necesita.

### Frontends (los 3 comparten esta forma)

```
src/
├── main.tsx / App.tsx    # router + providers
├── auth/                 # AuthContext (access token en memoria, refresh, org activa)
├── api/                  # fetcher tipado + funciones por recurso (usa @bv/contracts)
├── components/           # componentes propios de ESTA app (los genéricos van a @bv/ui)
├── pages/                # una carpeta o archivo por ruta
├── lib/                  # hooks y utilidades locales
└── index.css             # importa tokens de @bv/ui + overrides mínimos
```

- El CRM agrega `layouts/` (sidebar desktop / bottom-nav mobile) y `features/` si una sección crece (ej. `features/stats/`).
- **Regla de promoción**: un componente usado (o previsiblemente usable) por 2+ apps se promueve a `@bv/ui`; hasta entonces vive en la app.

### `packages/`

```
packages/
├── ui/         # @bv/ui — tokens.css + componentes React (ver 04-design-system.md)
├── contracts/  # @bv/contracts — schemas Zod por recurso + tipos inferidos + códigos de error
└── config/     # @bv/config — eslint flat config, tsconfig base, prettier
```

Sin versionado interno ni publicación: se consumen por `workspace:*` y la "versión" es el commit (DEC-06). Un breaking change en un package se arregla en todas las apps **en el mismo PR**.

## 4. Contratos compartidos (`@bv/contracts`)

El contrato de cada endpoint se define **una vez**:

```ts
// packages/contracts/src/bookings.ts
export const createBookingBody = z.object({ sessionId: objectIdString });
export const bookingDto = z.object({
  id: objectIdString, sessionId: objectIdString, status: bookingStatus,
  bookedAt: isoDate, /* ... */
});
export type CreateBookingBody = z.infer<typeof createBookingBody>;
export type BookingDto = z.infer<typeof bookingDto>;
```

- La API los usa para **validar** (entrada) y como tipo de retorno (salida).
- Los FEs los usan para **tipar** el fetcher. Un cambio de contrato rompe la compilación de todos los consumidores: eso es una feature.
- Los DTOs nunca exponen campos internos (`passwordHash`, `tokenHash`, `adminNotes` fuera del CRM). Cada módulo tiene su función `toDto()` explícita — prohibido devolver documentos Mongo crudos.

## 5. Nomenclatura

| Qué | Convención | Ejemplo |
|---|---|---|
| Archivos TS | kebab-case | `booking-service.ts`, `rate-limit.ts` |
| Componentes React | PascalCase (archivo y símbolo) | `PackCard.tsx` |
| Variables/funciones | camelCase, verbos para funciones | `assignPack()`, `remainingClasses` |
| Tipos/interfaces | PascalCase, sin prefijo `I` | `PackAssignment` |
| Constantes globales | SCREAMING_SNAKE | `MAX_BODY_SIZE` |
| Colecciones Mongo | camelCase plural | `packAssignments` |
| Campos Mongo | camelCase | `expiresAt`, `bookedCount` |
| Rutas API | kebab-case, recursos en plural | `/api/v1/pack-assignments` |
| Códigos de error | SCREAMING_SNAKE estables | `NO_CREDITS`, `SESSION_FULL`, `BAD_ORIGIN` |
| Branches | `feat/`, `fix/`, `chore/`, `docs/` + kebab | `feat/booking-cancellation` |
| Commits | Conventional Commits | `feat(bookings): enforce cancellation window (RN-08)` |

Fechas en nombres de campos: sufijo `At` para instantes (`expiresAt: Date`), campo `date` string `YYYY-MM-DD` solo para fechas de calendario sin hora (RM entries).

## 6. Manejo de errores (patrón único)

```ts
// lib/errors.ts
export class DomainError extends Error {
  constructor(public code: ErrorCode, message: string, public status = 400,
              public details?: unknown) { super(message); }
}
// modules/bookings/bookings.service.ts
if (!pack) throw new DomainError('NO_CREDITS', 'No tenés clases disponibles.', 409);
// app.ts — único punto de traducción a HTTP
app.onError((err, c) => {
  if (err instanceof DomainError)
    return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  logger.error(err);                       // stack solo al log, nunca al cliente
  return c.json({ error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado.' } }, 500);
});
```

Los FEs mapean `code` → comportamiento (ej. `SESSION_FULL` → refrescar grilla) y muestran `message` (ya viene en español, apto para usuario final).

## 7. Linters y formato (`@bv/config`)

- **ESLint 9 flat config** con `typescript-eslint` preset `strictTypeChecked` + `eslint-plugin-react-hooks` (FEs). Reglas clave: `no-floating-promises` (error), `no-explicit-any` (error), `consistent-type-imports`, import cycles prohibidos.
- **Prettier** (100 cols, single quotes, trailing commas) — sin discusiones de estilo en PRs.
- **Scripts estándar en todos los repos** (mismos nombres, CI uniforme): `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `test:watch`, `audit:deps`.

## 8. Flujo de trabajo Git

1. `main` protegida; todo entra por PR con CI verde (lint + typecheck + test + audit).
2. PRs chicos (< ~400 líneas netas). Una tarea del PLAN = un PR (idealmente).
3. La descripción del PR referencia la tarea (`PLAN F3-04`) y las RN/DEC que toca.
4. Deploy automático al mergear a `main`, **por app y con filtros por path**: solo se redeploya lo que el PR tocó (su app + `packages/` si cambió). Rollback = revert.

## 9. Documentación viva

- Cada repo: `README.md` con quickstart (< 5 min a levantar) + `.env.example` completo.
- Decisiones nuevas de arquitectura: agregar DEC-XX en [02-arquitectura.md](02-arquitectura.md) vía PR a este repo.
- Si una tarea contradice un doc: **primero** PR al doc, después el código.
