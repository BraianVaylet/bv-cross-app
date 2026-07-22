# 09 — Bitácora de desarrollo

> Registro de **hasta dónde llegó la implementación**, qué decisiones se tomaron sobre la marcha y qué trampas aparecieron. Los docs 00-08 describen el diseño (estable); este describe el avance (cambiante). El estado tarea por tarea vive en [PLAN.md](../PLAN.md).
>
> **Última actualización**: 2026-07-22.

## 1. Dónde está cada cosa

`main` llega hasta **F4-02**: entró con el PR consolidado **#36** (F2-08 + F3-01/02/03 + F4-01/02), que a su vez reemplazó a #30-#35 (cerrados sin mergear).

**Quedan 2 PRs abiertos, los dos con CI verde. Se mergean en este orden:**

```
main
 └─ #40  F4-03..F4-06 + F3-04   BV Agenda completa + shell del CRM
     └─ #41  F3-05              sección Clientes
```

- **#40** consolida lo que habían sido #37, #38 y #39 (cerrados; su contenido está ahí commit por commit).
- **#41** sale de #40 porque usa el `AppShell` y el `membershipSummaryDto` ampliado.

Después de mergear los dos, `main` queda en **F3 5/12 · F4 6/8** y lo que sigue arranca desde `main` limpio.

### Por qué se consolida en vez de encadenar

Una pila larga obliga a mergear en orden exacto, borrar cada rama para que GitHub retargetee la siguiente, y aguantar que un advisory nuevo voltee el CI de todas a la vez. Un PR consolidado se revisa igual por commits (la historia individual queda intacta) y entra de una.

> Pasó tres veces: #29 reemplazó a #19-#28, #36 a #30-#35 y #40 a #37-#39. **Regla: no encadenar más de 2 o 3 PRs.** Si una tarea nueva necesita algo que está en un PR sin mergear, conviene pedir el merge antes de arrancar.

## 2. Estado por fase

| Fase | Estado | Qué falta |
|---|---|---|
| **F0** Fundaciones | 5/6 | F0-06: comprar dominio (decisión humana; solo bloquea F6) |
| **F1** API core | 11/12 | F1-12: deploy de la API — **necesita Atlas M0 + Railway creados por un humano** |
| **F2** Migración bv-cross | 7/8 | F2-07: deploy del FE — depende de F1-12 |
| **F3** CRM | 5/12 | `apps/crm` con onboarding y la sección Clientes operativa (alta, ficha, asignar pack). Faltan F3-06..F3-12 |
| **F4** Reservas | 6/8 | **La app del atleta está completa**: reserva, cancela, cambia de horario y ve su saldo. Falta el deploy (F4-07, depende de F1-12) y los E2E (F4-08) |
| **F5-F6** | — | No arrancadas |

### Lo que está implementado y funcionando

**API (`apps/api`)** — auth completa (registro, verificación por email, login, refresh rotativo con detección de reuso, reset, cambio de password), multi-tenancy por `X-Org-Id`, organizaciones con joinCode, members (CRM), exercises (catálogo + personales), entries (RMs), schedule (templates + sesiones), packs, assignments y el `booking-service` transaccional (reservar, cancelar, cancelar la clase entera). Dos jobs en el scheduler: `expire-packs` y `materialize-sessions`.

**CRM (`apps/crm`, "BV CRM")** — shell con sidebar en escritorio y barra inferior en el teléfono (`AppShell`, nuevo en `@bv/ui`), guard de rol (solo owner/admin; el atleta que entra por error ve una explicación, no un 403) y **onboarding del dueño**: crear el gimnasio, una clase y un pack —los dos últimos salteables— y el código de organización al final con el mensaje de invitación listo para copiar. **Clientes** (F3-05) ya opera: lista con `DataTable` (tabla en escritorio, cards abajo de 768px), búsqueda server-side con debounce, filtros por estado, alta manual y ficha con packs, asignación con el pago registrado, anulación con motivo, baja/reactivación e invitación al portapapeles. El resto son placeholders que dicen en qué tarea llegan (F3-06..F3-11).

**FE de agenda (`apps/schedule`, "BV Agenda")** — PWA propia del atleta: shell con bottom-nav de 4 secciones (Grilla, Mis reservas, Saldo, Cuenta), auth y join heredados de `apps/cross`, SSO por cookie compartida verificado a mano. **La grilla reserva de verdad** (F4-04): semana navegable con el horizonte como límite, cards con los 6 estados, saldo en el header y confirmación que dice de qué pack sale el crédito. **Mis reservas** (F4-05) muestra la ventana de cancelación antes del error ("Podés cancelar hasta las 16:00"), avisa si el crédito vuelve a un pack vencido y permite cambiar de horario (cancelar + volver a la grilla en ese día). **Saldo** (F4-06) separa activos e historial, marca cuál se consume primero y cuál todavía no arrancó.

**FE de cargas (`apps/cross`)** — migrado de v1 al monorepo: auth nueva (token en memoria, refresh single-flight), join a organización, Home con catálogo + personales y búsqueda, detalle con la calculadora de cargas de v1, cuenta, PWA con prompt de actualización.

**Suite de aislamiento multi-tenant** — creció de 39 a **196 tests generados** automáticamente. Cada ruta nueva se registra en `route-policies.ts` y la suite cruza esa tabla contra las rutas reales de Hono: **si agregás un endpoint y no lo registrás, el build falla**.

**Seed de desarrollo** (`pnpm --filter @bv/api db:seed`) — org demo `bahia-cross-demo` con owner, admin, 4 atletas + 1 pre-carga, grilla lun–sáb materializada 14 días, 2 packs, 4 asignaciones en distintos estados y 7 reservas sobre las 3 próximas clases.

**Migración v1→v2** (`db:migrate-v1`) — dry-run por defecto, `--commit`, `--rollback`. Ver [scripts/README-migrate.md](../apps/api/scripts/README-migrate.md).

## 3. Decisiones tomadas durante la implementación

Las que no estaban en los docs de diseño y se resolvieron al implementar:

| Tema | Decisión | Por qué |
|---|---|---|
| Athlete pidiendo `scope:'org'` al crear ejercicio | **403 explícito**, no coerción silenciosa a `personal` | La spec se contradecía consigo misma; ganó la tabla de endpoints. Un 403 le avisa al FE en vez de hacer algo distinto de lo pedido |
| Archivados del catálogo para el atleta | Los alcanza por el **detalle** (historial legible, RN-19), no por el listado | `GET /exercises?includeArchived=1` es admin-only. Exponer el listado de archivados-con-historial al atleta sería una mejora de API, no de FE |
| Edición de registros de carga | v2 **no** edita entries in-place: se borra y se recarga | No existe `PATCH /entries`; el historial es append-only salvo borrado |
| Matriz RN-14: conteo + update no atómicos | Aceptado a propósito, sin transacción | El snapshot RN-16 ya protege al cliente aunque un cambio se cuele en la ventana |
| Cancelar sesión con anotados | Resuelto en F4-01: `HAS_BOOKINGS` **eliminado**, la ruta devuelve `{ session, refundedBookings, failedRefunds }` | La sesión queda cancelada aunque una devolución falle; el conteo le dice al CRM qué revisar a mano |
| Cancelación del gym: una transacción o N | **Una transacción por reserva**, no una gigante | 40 anotados en una sola tx es conflicto de escritura asegurado, y una falla parcial dejaría todo sin devolver |
| Borde exacto de la ventana RN-08 | Regla `>=` (cancelar justo en el límite se permite), probada como **función pura** (`isCancellable`) | El instante exacto no se puede provocar con el reloj real sin flakear, y falsear el clock cerca de Mongo rompe el driver |
| Umbral de cobertura en `branches` | 90 en bookings, **80 en assignments** | Las ramas de assignments son spreads de campos opcionales: exigir 90 compra combinatoria de DTOs, no lógica probada |
| Reservas en el seed | Se crean con el **booking-service real**, no con inserts | El seed nunca debe inventar un estado que la API no podría producir (además deja la transición RN-13 a `exhausted` visible en la demo) |
| Refresh concurrente entre apps | **Ventana de gracia de 30 s** en la rotación (F4-03) | El SSO de apex hace que las apps compartan cookie: abrir dos a la vez presentaba el mismo token dos veces y la detección de reuso tumbaba la familia. Lo encontró la verificación del SSO, no un test |
| Íconos de la PWA nueva | SVG (`any` + `maskable`), sin PNG | No hay rasterizador en el entorno; el manifest acepta SVG con `sizes: "any"`. Si aparece un caso de instalación que los pida, se generan |
| Tz y horizonte en el FE | Viajan en `membershipSummaryDto` (`timezone`, `sessionGenerationDays`, `cancellationWindowHours`) | El FE tiene que pintar la hora del gimnasio y explicar los límites antes del error; pedirlos por separado sería un request extra en la pantalla más usada |
| Reserva optimista | **No**: la card espera el 201 (spinner mientras tanto) | Con créditos de por medio, mostrar una reserva que después falla es peor que medio segundo de espera |
| Fechas de agenda en los FEs | `@bv/ui` exporta `agendaTime` (Intl, sin dependencias) | Un solo lugar para agenda y CRM (F3-06). El servidor tiene el suyo (`lib/schedule-time.ts`): distinto runtime, misma regla — la hora es la del gimnasio |
| Ventana de cancelación en el cliente | Se calcula en el FE (`cancellationDeadline`, espejo de la del servidor) | El servidor sigue siendo la autoridad y re-valida; el cálculo cliente existe para **decir la hora límite antes** de que el atleta se coma un 409. Si los relojes discrepan, gana el 409 y la pantalla se recarga |
| Atleta que abre el CRM | Pantalla que lo explica, **no** onboarding | Mandarlo al wizard le crearía un gimnasio sin querer. Solo quien no tiene ninguna membresía cae en el onboarding (F3-04) |
| `AppShell` y el router | El shell recibe `currentPath` y un `renderLink`; no importa react-router | Queda testeable sin montar rutas y reutilizable por cualquier app admin. El `active` viaja al link para que ponga `aria-current` |
| Saldo del cliente en la tabla | **No** por fila: se ve al entrar a la ficha | Traer los packs de cada cliente en la lista serían N+1 requests en la pantalla que más se abre. La columna quedó para la última reserva (F4) |
| Orden del `DataTable` | Client-side, **de la página cargada** | Ordenar el total exige que el servidor pagine ordenado; para listas de gimnasio no compensa. Se avisa en el `title` del encabezado |
| CRM como PWA | **No** | Se usa desde el mostrador o el teléfono del dueño, siempre con conexión. Un service worker en una app que cambia seguido es un problema de despliegue, no una mejora |
| Password en la migración v1→v2 | No se migra el hash: se crea una **aleatoria** y el dueño usa "olvidé mi contraseña" | Cambia el esquema de identidad (alias → email) |
| DST con hora local inexistente | Se usa el resultado determinista de la librería (sesión corrida) | Preferible a dejar un hueco silencioso en la grilla |

## 4. Trampas de infraestructura (que van a volver)

- **Mongo para verificar el FE**: hace falta un **replica set**, no un mongod standalone — la rotación de refresh tokens usa transacciones y falla con `Transaction numbers are only allowed on a replica set member`.
- **CI flaky por `mongodb-memory-server`**: varios workers de vitest competían por descargar el binario y corrompían el lockfile. Resuelto con un **prewarm secuencial** (`apps/api/scripts/prewarm-mongo.mts`) + cache de `~/.cache/mongodb-binaries` en el workflow.
- **Tailwind v4 no escanea `node_modules`**, y `@bv/ui` entra por ahí (symlink del workspace): las clases que solo viven en los componentes del design system no se generaban en la app que los consume. Se ve como un componente "roto" sin error de build — lo agarró la verificación en el navegador, no un test. Resuelto con `@source "./"` en `packages/ui/src/tokens.css`, el CSS que importan las tres apps.
- **`osv-scanner` corta con CUALQUIER vulnerabilidad conocida**, sin umbral de severidad (a diferencia de `pnpm audit --audit-level=high`). El 21/07/26 apareció [GHSA-frvp-7c67-39w9](https://osv.dev/GHSA-frvp-7c67-39w9) en `@hono/node-server` 1.x (path traversal de `serve-static` en hosts Windows: no usamos `serve-static` y la API corre en Linux, impacto real nulo) y volteó el CI de todas las ramas. Se resolvió subiendo a `@hono/node-server@2`: `serve` y `getConnInfo` mantienen la firma — verificado levantando la API contra un Mongo efímero (`/healthz` 200 + login por la ruta rate-limited).
- **`pnpm audit --prod` puede romperse de un día para el otro** por advisories nuevos en dependencias transitivas de `eslint` (que es dependency real de `@bv/config` porque publica los presets). Se arregla con `overrides` en `pnpm-workspace.yaml` — **acotando la major**: un `>=` puede saltar a una API incompatible (pasó con `brace-expansion`: `minimatch@3` murió con "expand is not a function").
- **`vi.setSystemTime` expira los JWT del setup** (TTL 15 min): en tests con clock fijo hay que emitir un token fresco dentro del clock.
- **pnpm reenvía el separador `--`** a los scripts; `parseArgs` de Node lo toma como posicional y explota. Filtrarlo antes de parsear.
- **Commits multilínea**: usar `git commit -F <archivo>`; los here-strings de PowerShell se cuelan como `@` en el mensaje.

## 5. Cómo retomar

1. **Mergear #40 y después #41** (§1). Recién ahí `main` refleja todo y PLAN.md queda al día.
2. Antes de tomar una tarea, leer su spec completa en `docs/tasks/F*.md` — son el contrato (objetivo, casos de prueba, criterios de aceptación).
3. **Todo endpoint nuevo se registra en `apps/api/src/route-policies.ts`** en el mismo PR, con su factory en `src/test/factories.ts` si recibe un `:id`. Si no, el build falla (por diseño).
4. Si el módulo introduce datos, extender el seed (`src/seed.ts`) en el mismo PR.
5. Correr `pnpm turbo lint typecheck test build` + `pnpm audit --prod --audit-level=high` antes de abrir el PR.
6. **Verificar contra la API real, no solo con tests.** Los tres bugs más caros de esta fase (refresh concurrente, `POST /orgs` sin `membership`, Tailwind sin escanear `@bv/ui`) pasaron los tests y aparecieron recién al abrir la app. Cómo levantar el entorno: §6.

### Próximas tareas sin bloqueo humano

- **F3-06..F3-11** — el resto de las secciones del CRM, independientes entre sí. La más grande es F3-06 (Clases: grilla de templates, calendario de sesiones y anotados); las más chicas, F3-07 (Packs), F3-08 (Ejercicios) y F3-11 (Configuración).
- F4-07 y F3-12 (deploys) están bloqueados por F1-12; F4-08 (E2E) conviene después del deploy.

### Deuda anotada durante esta fase

- **Capturas y videos** que piden varios criterios de aceptación (F3-04, F3-05, F4-04, F4-06): quedaron pendientes en todos los PRs porque la herramienta de captura del entorno corta por timeout. La verificación funcional está hecha y documentada en cada PR.
- `src/auth` y `src/api` están copiados en las **tres** apps. Ya listado en F6-05 como candidato a `packages/app-kit`.

## 6. Levantar el entorno completo (API + un FE)

Sirve para verificar a mano y es la única forma de agarrar los bugs que los tests con mocks no ven.

1. `apps/api/.env` (gitignored) con `MONGODB_URI=mongodb://127.0.0.1:37017/bvcross-dev?directConnection=true` y el resto de `.env.example`.
2. Un `apps/api/mongo.tmp.mts` que levante `MongoMemoryReplSet` en el puerto 37017 — **replica set, no standalone**: las transacciones lo exigen.
3. Un `apps/api/dev.tmp.mts` con `process.loadEnvFile('.env')` y `await import('./src/index.ts')`: `src/index.ts` **no** lee `.env` por su cuenta (los scripts sí).
4. `pnpm --filter @bv/api db:seed` y levantar la API (8787) más el FE que toque: cross 5173 · schedule 5174 · crm 5175.
5. Al terminar: borrar los `*.tmp.mts`, matar el mongod por puerto y no commitear los puertos locales de `.claude/launch.json`.

Usuarios del seed: `owner@demo.test` / `admin@demo.test` / `atleta1..4@demo.test`, password `Demo!1234`.

### Bloqueadas por infraestructura (humano)

- **F1-12** (deploy API) → crear Atlas M0 `sa-east-1` + proyecto Railway.
- **F2-07** (deploy FE) → depende de F1-12.
- **F0-06** (dominio) → decisión + compra; solo bloquea F6.
