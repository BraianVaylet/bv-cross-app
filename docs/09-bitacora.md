# 09 — Bitácora de desarrollo

> Registro de **hasta dónde llegó la implementación**, qué decisiones se tomaron sobre la marcha y qué trampas aparecieron. Los docs 00-08 describen el diseño (estable); este describe el avance (cambiante). El estado tarea por tarea vive en [PLAN.md](../PLAN.md).
>
> **Última actualización**: 2026-07-21.

## 1. Dónde está cada cosa

`main` contiene F0 (5/6), **F1-01..11 y F2-01..06** — entró con el PR consolidado #29. Lo que sigue vive en **5 PRs abiertos**, todos con CI verde.

### PRs abiertos y orden de merge

```
main
 ├─ #30  F2-08  migración v1→v2      (independiente)
 └─ #31  F3-01  schedule
     └─ #32  F3-02  packs
         └─ #33  F3-03  assignments
             └─ #34  F4-01  booking-service
```

**#30 y #31 salen de `main` y se pueden mergear en cualquier orden.** #32, #33 y #34 están encadenados: mergear #31 → #32 → #33 → #34, borrando cada rama para que GitHub retargetee la siguiente.

> #29 reemplazó un stack previo de 8 PRs (#19-#28) que quedaron **cerrados sin mergear**: su contenido está íntegro en `main`.

## 2. Estado por fase

| Fase | Estado | Qué falta |
|---|---|---|
| **F0** Fundaciones | 5/6 | F0-06: comprar dominio (decisión humana; solo bloquea F6) |
| **F1** API core | 11/12 | F1-12: deploy de la API — **necesita Atlas M0 + Railway creados por un humano** |
| **F2** Migración bv-cross | 7/8 | F2-07: deploy del FE — depende de F1-12 |
| **F3** CRM | 3/12 | F3-04..12: el CRM (frontend). **La API que F4 necesita (F3-01/02/03) ya está completa** |
| **F4** Reservas | 1/8 | F4-01 (el núcleo transaccional) listo; sigue F4-02, los endpoints que lo exponen |
| **F5-F6** | — | No arrancadas |

### Lo que está implementado y funcionando

**API (`apps/api`)** — auth completa (registro, verificación por email, login, refresh rotativo con detección de reuso, reset, cambio de password), multi-tenancy por `X-Org-Id`, organizaciones con joinCode, members (CRM), exercises (catálogo + personales), entries (RMs), schedule (templates + sesiones), packs, assignments y el `booking-service` transaccional (reservar, cancelar, cancelar la clase entera). Dos jobs en el scheduler: `expire-packs` y `materialize-sessions`.

**FE de cargas (`apps/cross`)** — migrado de v1 al monorepo: auth nueva (token en memoria, refresh single-flight), join a organización, Home con catálogo + personales y búsqueda, detalle con la calculadora de cargas de v1, cuenta, PWA con prompt de actualización.

**Suite de aislamiento multi-tenant** — creció de 39 a **179 tests generados** automáticamente. Cada ruta nueva se registra en `route-policies.ts` y la suite cruza esa tabla contra las rutas reales de Hono: **si agregás un endpoint y no lo registrás, el build falla**.

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
| Password en la migración v1→v2 | No se migra el hash: se crea una **aleatoria** y el dueño usa "olvidé mi contraseña" | Cambia el esquema de identidad (alias → email) |
| DST con hora local inexistente | Se usa el resultado determinista de la librería (sesión corrida) | Preferible a dejar un hueco silencioso en la grilla |

## 4. Trampas de infraestructura (que van a volver)

- **Mongo para verificar el FE**: hace falta un **replica set**, no un mongod standalone — la rotación de refresh tokens usa transacciones y falla con `Transaction numbers are only allowed on a replica set member`.
- **CI flaky por `mongodb-memory-server`**: varios workers de vitest competían por descargar el binario y corrompían el lockfile. Resuelto con un **prewarm secuencial** (`apps/api/scripts/prewarm-mongo.mts`) + cache de `~/.cache/mongodb-binaries` en el workflow.
- **`pnpm audit --prod` puede romperse de un día para el otro** por advisories nuevos en dependencias transitivas de `eslint` (que es dependency real de `@bv/config` porque publica los presets). Se arregla con `overrides` en `pnpm-workspace.yaml` — **acotando la major**: un `>=` puede saltar a una API incompatible (pasó con `brace-expansion`: `minimatch@3` murió con "expand is not a function").
- **`vi.setSystemTime` expira los JWT del setup** (TTL 15 min): en tests con clock fijo hay que emitir un token fresco dentro del clock.
- **pnpm reenvía el separador `--`** a los scripts; `parseArgs` de Node lo toma como posicional y explota. Filtrarlo antes de parsear.
- **Commits multilínea**: usar `git commit -F <archivo>`; los here-strings de PowerShell se cuelan como `@` en el mensaje.

## 5. Cómo retomar

1. **Mergear los PRs abiertos** siguiendo §1. Después de eso `main` refleja todo y PLAN.md queda al día (los contadores de F3 viajan en esos PRs).
2. Antes de tomar una tarea, leer su spec completa en `docs/tasks/F*.md` — son el contrato (objetivo, casos de prueba, criterios de aceptación).
3. **Todo endpoint nuevo se registra en `apps/api/src/route-policies.ts`** en el mismo PR, con su factory en `src/test/factories.ts` si recibe un `:id`. Si no, el build falla (por diseño).
4. Si el módulo introduce datos, extender el seed (`src/seed.ts`) en el mismo PR.
5. Correr `pnpm turbo lint typecheck test build` + `pnpm audit --prod --audit-level=high` antes de abrir el PR.

### Próximas tareas sin bloqueo humano

- **F4-02** — endpoints de bookings + `GET /me/credits`. El servicio ya devuelve la sesión y el pack actualizados, así que las respuestas pueden traer el saldo sin refetch.
- **F3-04+** — el CRM (frontend): scaffolding, AppShell, secciones de clientes/clases/packs.

### Bloqueadas por infraestructura (humano)

- **F1-12** (deploy API) → crear Atlas M0 `sa-east-1` + proyecto Railway.
- **F2-07** (deploy FE) → depende de F1-12.
- **F0-06** (dominio) → decisión + compra; solo bloquea F6.
