# 02 — Arquitectura

> Define la estructura del sistema completo: topología, decisiones fundamentales (DEC-XX), modelo de datos, autenticación/SSO, multi-tenancy y los puntos técnicamente delicados (concurrencia de reservas, timezones, jobs). Todo lo que un desarrollador necesita para entender **dónde vive cada cosa y por qué**.

## 1. Topología del sistema

```
                        ┌─────────────────────────────────────┐
                        │            MongoDB Atlas             │
                        │        (replica set gestionado)      │
                        └──────────────────▲───────────────────┘
                                           │
                                  ┌────────┴────────┐
                                  │  API (apps/api) │   Node 22 + Hono + TS
                                  │  api.<dominio>  │   (stateless, escalable N réplicas)
                                  └────────▲────────┘
                                           │ HTTPS + cookie de sesión (apex compartido)
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
     ┌────────┴────────┐         ┌─────────┴────────┐         ┌─────────┴────────┐
     │    bv-cross     │         │ bv-cross-schedule│         │   bv-cross-crm   │
     │ app.<dominio>   │         │ agenda.<dominio> │         │  crm.<dominio>   │
     │ PWA atleta:     │         │ PWA atleta:      │         │ Web responsive:  │
     │ cargas y RMs    │         │ reservas         │         │ gestión del gym  │
     └─────────────────┘         └──────────────────┘         └──────────────────┘
              └────────── comparten @bv/ui + @bv/contracts (packages/ del monorepo) ──────────┘
```

- Los tres frontends son **SPAs estáticas** (React + Vite) desplegadas en hosting estático/CDN.
- La API es **un solo servicio stateless**: puede correr 1 réplica hoy y N mañana sin cambios de código (ver [Escalabilidad](07-escalabilidad.md)).
- Todos los subdominios cuelgan del **mismo apex** (ej. `bvcross.app`) — restricción necesaria para el SSO por cookie (§5).

## 2. Estructura del monorepo

Todo el producto vive en **un solo repo** (`bv-cross-v2`): apps desplegables, paquetes compartidos y documentación. Orquestación con **pnpm workspaces + Turborepo** (tareas con grafo de dependencias y cache).

```
bv-cross-v2/
├── apps/
│   ├── api/        # @bv/api — backend Hono (el único servicio de red)
│   ├── cross/      # @bv/cross — FE atleta: cargas (migra del repo v1)
│   ├── schedule/   # @bv/schedule — FE atleta: agenda
│   └── crm/        # @bv/crm — FE administración (responsive desktop+mobile)
├── packages/
│   ├── ui/         # @bv/ui — design system (tokens + componentes)
│   ├── contracts/  # @bv/contracts — schemas Zod + tipos API⇄FEs
│   └── config/     # @bv/config — ESLint / Prettier / tsconfig base
├── docs/           # esta documentación
├── PLAN.md
├── pnpm-workspace.yaml · turbo.json · package.json
```

Reglas:

- **Dependencias internas siempre `workspace:*`**: un cambio en `packages/` aplica a todos los consumidores en el mismo PR. Si es breaking, la compilación rompe en CI — nunca en producción.
- **Deploys independientes por app**: cada servicio del hosting observa su `apps/<x>` + `packages/` con filtros por path; mergear un cambio del CRM no redeploya la API (ver [Deployment](06-deployment.md)).
- **Repo v1 (`bv-cross`)**: sigue en producción intacto hasta F2 (su `client/` se migra a `apps/cross`); se archiva en F6.

### DEC-06 — Monorepo (revisada 2026-07-02)

La definición original del producto era multirepo (4 repos de código + `bv-shared` consumido por git tag). **Se revisó a monorepo antes de escribir la primera línea de código**, por tres razones:

1. El design system y los contratos son el corazón del sistema y cambian seguido: en multirepo cada cambio exigía tag + N PRs de bump, y las apps derivaban a versiones distintas.
2. Un cambio de contrato debe **romper la compilación de los FEs en el PR**, no descubrirse en runtime: es la promesa del type-safety end-to-end.
3. Un solo dev: 5 CIs, 5 Dependabots y una matriz de versiones era overhead sin beneficio.

Multirepo vuelve a evaluarse solo si aparecen equipos separados con permisos o cadencias de release propias.

## 3. Decisiones de arquitectura (DEC)

| ID | Decisión | Por qué | Alternativas descartadas |
|---|---|---|---|
| DEC-01 | **Hono** como framework HTTP (se conserva de v1) | Ya probado en v1, rápido, TS first-class, middleware moderno, corre en Node 22 | Express (más lento, tipos pobres, ecosistema legacy); Fastify (válido, pero implica reescribir patrones v1 sin ganancia clara) |
| DEC-02 | **Driver oficial `mongodb` + patrón repository + Zod**, sin ODM | Coherente con v1 (validación Zod en bordes, pocas deps); los repos encapsulan queries e índices; tipos derivados de schemas compartidos en `@bv/contracts` | Mongoose (doble validación vs Zod, tipos mediocres, magia de middleware que esconde queries); Prisma (soporte Mongo limitado) |
| DEC-03 | **Multi-tenancy por discriminador `orgId`** en colecciones compartidas | Miles de gimnasios chicos: una DB por tenant es inviable operativamente; índices compuestos `{orgId, ...}` dan aislamiento lógico y performance | DB-per-tenant (overhead de conexiones, migraciones ×N, costo Atlas); collection-per-tenant (límites de namespaces, mismo problema) |
| DEC-04 | **Sesiones: access token JWT corto (15 min) + refresh token opaco rotativo en cookie httpOnly** | Access stateless = las réplicas de API no consultan DB por request autenticado; refresh opaco en Mongo = revocable (logout global, robo de token) | Solo sesiones opacas (1 lectura DB por request, no escala gratis); solo JWT largo (irrevocable) |
| DEC-05 | **Auth propia** (email+password, verificación y reset por email vía Resend) | Costo ~0 a escala, control total, v1 ya tiene la base criptográfica correcta (scrypt) | Clerk/Auth0 (USD/MAU a escala, dependencia dura); Firebase (lock-in, orgs a mano igual) |
| DEC-06 | **Monorepo** (pnpm workspaces + Turborepo) | Código compartido (ui/contracts/config) cambia atómicamente; breaking changes se detectan compilando en el PR; overhead operativo de 1 repo para 1 dev; ver §2 | Multirepo + `bv-shared` por git tag (definición original, revisada 2026-07-02 antes de escribir código) |
| DEC-07 | **Materialización de sesiones de clase** (instancias persistidas) en vez de calcular la grilla al vuelo | Las reservas necesitan un documento contra el cual hacer update atómico de cupo; permite excepciones por fecha (feriados, cambios puntuales) | Grilla virtual calculada desde plantillas (elegante pero convierte cada reserva en lógica condicional frágil) |
| DEC-08 | **Contadores denormalizados** (`bookedCount` en sesión, `classesUsed` en pack asignado) mantenidos por operaciones atómicas | Lecturas O(1) para pantallas calientes (grilla de la semana); la atomicidad de Mongo (`findOneAndUpdate` condicionado / transacciones) garantiza consistencia | Contar bookings en cada lectura (agregación por pantalla = lento y caro) |
| DEC-09 | **Jobs in-process con `node-cron`** en fase 1 (expiración de packs, materialización de sesiones) | 1 instancia de API: simple y suficiente; los jobs son idempotentes, así que duplicarlos con N réplicas no corrompe (solo desperdicia) | Worker separado + cola (correcto a escala; documentado como etapa 2 en Escalabilidad) |
| DEC-10 | **API versionada bajo `/api/v1`** desde el día 1 | 3 clientes desplegados independientemente: los breaking changes necesitan convivencia de versiones | Sin versionado (obliga lockstep deploys de 4 artefactos) |

## 4. Modelo de datos (MongoDB)

> Convención: `_id: ObjectId` en todo; fechas como `Date` (UTC) salvo indicación; los campos de snapshot son inmutables tras crear el documento. Los schemas Zod canónicos viven en `@bv/contracts` — esto es la referencia conceptual.

### `users` — cuentas globales (no pertenecen a ninguna org)
```ts
{ _id, email,            // único, lowercase
  emailVerifiedAt: Date | null,
  name, phone?: string,
  passwordHash,          // scrypt, formato v1
  createdAt, updatedAt }
```
Índices: `{ email: 1 } unique`.

### `organizations`
```ts
{ _id, name, slug,                    // slug único, para URLs
  joinCode,                           // RN-01, único, regenerable
  timezone,                           // IANA, ej. 'America/Argentina/Buenos_Aires'
  settings: {
    cancellationWindowHours: number,  // RN-08, default 2
    sessionGenerationDays: number,    // RN-05, default 14
  },
  status: 'active' | 'suspended',     // suspended = gym no pagó el SaaS
  createdAt, updatedAt }
```
Índices: `{ joinCode: 1 } unique`, `{ slug: 1 } unique`.

### `memberships` — usuario ↔ org
```ts
{ _id, orgId, userId,
  role: 'owner' | 'admin' | 'coach' | 'athlete',
  status: 'invited' | 'active' | 'disabled',   // RN-03
  profile: {                          // datos que carga el gimnasio (F2)
    displayName?, phone?, emergencyContact?, birthdate?,
  },
  adminNotes?: string,                // observaciones (lesiones, etc.) — solo visibles en CRM
  invitedEmail?: string,              // para pre-cargas antes del registro del atleta
  joinedAt?: Date, createdAt, updatedAt }
```
Índices: `{ orgId: 1, userId: 1 } unique`, `{ userId: 1 }`, `{ orgId: 1, status: 1 }`, `{ orgId: 1, invitedEmail: 1 }`.

### `refreshTokens`
```ts
{ _id, userId, tokenHash,            // solo hash, como v1
  familyId,                          // detección de reuso (rotación)
  expiresAt, revokedAt?: Date, createdAt, userAgent?, ip? }
```
Índices: `{ tokenHash: 1 } unique`, `{ userId: 1 }`, `{ expiresAt: 1 } TTL`.

### `exercises` — catálogo de org **y** personales (una colección)
```ts
{ _id,
  scope: 'org' | 'personal',
  orgId: ObjectId | null,            // requerido si scope='org'
  ownerUserId: ObjectId | null,      // requerido si scope='personal' (RN-20/21)
  name, discipline?: string,         // 'crossfit' | 'hyrox' | 'funcional' | ...
  type: 'weight' | 'reps',           // RN-23 (hereda 'gimnastico' de v1)
  imageUrl?: string, notes?: string,
  archivedAt?: Date,                 // RN-19
  createdAt, updatedAt }
```
Índices: `{ orgId: 1, archivedAt: 1 }`, `{ ownerUserId: 1 }`.

### `rmEntries` — registros de carga
```ts
{ _id, exerciseId, userId,
  orgId: ObjectId | null,            // org del contexto si el ejercicio es de catálogo (RN-21)
  kg?: number, reps?: number,        // exactamente uno (RN-23)
  date: string,                      // 'YYYY-MM-DD' — fecha "de calendario", sin hora (decisión v1)
  comment?, painFlag?: boolean,      // hereda 'dolor' v1
  createdAt }
```
Índices: `{ userId: 1, exerciseId: 1, date: -1 }`, `{ orgId: 1, exerciseId: 1, date: -1 }` (estadísticas CRM).

### `classTemplates` — grilla semanal (RN-05)
```ts
{ _id, orgId,
  weekday: 0..6,                     // 0=domingo, en timezone de la org
  startTime: 'HH:mm',                // hora local de la org
  durationMin: number,
  discipline: string, description?: string,
  capacity: number,
  active: boolean,
  createdAt, updatedAt }
```
Índices: `{ orgId: 1, active: 1 }`.

### `classSessions` — instancias reservables (DEC-07)
```ts
{ _id, orgId, templateId: ObjectId | null,   // null = sesión creada a mano
  startsAt: Date,                    // UTC (computado desde template + timezone org)
  endsAt: Date,
  discipline, description?,
  capacity: number,                  // copiada del template, editable por sesión
  bookedCount: number,               // DEC-08, mantenido atómicamente
  status: 'scheduled' | 'cancelled', // RN-09
  createdAt, updatedAt }
```
Índices: `{ orgId: 1, startsAt: 1 }`, `{ templateId: 1, startsAt: 1 } unique` (idempotencia del job de materialización).

### `packs` — catálogo (RN-14/15)
```ts
{ _id, orgId, name,
  classCount: number, durationDays: number,
  price: number, currency: 'ARS',
  paymentMethod: 'cash' | 'debit' | 'transfer' | 'other',
  internalNotes?: string,
  archivedAt?: Date,
  createdAt, updatedAt }
```
Índices: `{ orgId: 1, archivedAt: 1 }`.

### `packAssignments` — el "saldo" del atleta (RN-12/13/16/17/18)
```ts
{ _id, orgId, userId, packId,
  snapshot: { name, classCount, durationDays, price, currency, paymentMethod }, // RN-16
  startsAt: Date, expiresAt: Date,   // RN-18
  classesUsed: number,               // DEC-08
  status: 'active' | 'exhausted' | 'expired' | 'cancelled',
  payment: { amount, method, paidAt: Date, notes? },   // registro manual fase 1
  cancelledReason?: string,
  createdAt, updatedAt }
```
Índices: `{ orgId: 1, userId: 1, status: 1 }`, `{ userId: 1, status: 1, expiresAt: 1 }` (selección FIFO RN-12), `{ orgId: 1, status: 1, expiresAt: 1 }` (job de expiración + alertas CRM).

### `bookings` (RN-06/07/08)
```ts
{ _id, orgId, sessionId, userId, packAssignmentId,
  status: 'booked' | 'cancelled_by_user' | 'cancelled_by_gym'
        | 'attended' | 'no_show',    // últimos dos: fase 2
  bookedAt: Date, cancelledAt?: Date }
```
Índices: `{ sessionId: 1, userId: 1 } unique partial (status='booked')` (RN-07), `{ userId: 1, status: 1, bookedAt: -1 }`, `{ orgId: 1, sessionId: 1 }`.

### `emailTokens` — verificación y reset
```ts
{ _id, userId, purpose: 'verify' | 'reset',
  tokenHash, expiresAt, usedAt?: Date, createdAt }
```
Índices: `{ tokenHash: 1 } unique`, `{ expiresAt: 1 } TTL`.

## 5. Autenticación y SSO entre apps

### Flujo
1. **Login** (`POST /api/v1/auth/login`): valida credenciales → emite **access token** (JWT firmado HS256, 15 min, claims: `userId`) + **refresh token** (opaco 256 bits, rotativo, 30 días) en cookie `httpOnly; Secure; SameSite=Lax; Domain=.<apex>; Path=/api/v1/auth`.
2. El cliente guarda el access token **en memoria** (nunca localStorage — mitiga XSS) y lo manda como `Authorization: Bearer`.
3. Al expirar (o al abrir la app), llama `POST /auth/refresh`: la cookie viaja sola → nuevo par access+refresh. **Rotación con detección de reuso**: si llega un refresh ya usado (familia `familyId`), se revoca toda la familia (posible robo).
4. **Selección de organización**: el access token identifica al *usuario*; la org activa viaja como header `X-Org-Id` en cada request. El middleware `tenantGuard` valida la membresía y cuelga `{ userId, orgId, role }` del contexto. Cambiar de org no requiere re-login (F7).

### Por qué funciona el SSO
La cookie de refresh tiene `Domain=.<apex>`: cualquier subdominio (`app.`, `agenda.`, `crm.`) la envía a `api.<apex>` (mismo *site* según eTLD+1 ⇒ `SameSite=Lax` no la bloquea). Loguearse en una app deja logueadas a las tres. **Restricción resultante: producción exige que las 4 piezas compartan apex** — condiciona el deployment (ver [Deployment §1](06-deployment.md)). En desarrollo, el proxy de Vite (`/api` → `localhost:8787`) hace todo same-origin.

### Autorización
- Middleware en capas: `requireAuth` (JWT válido) → `tenantGuard` (membresía activa en `X-Org-Id`) → `requireRole('admin')` donde aplique.
- **Regla de oro (defensa en profundidad): todo método de repositorio que toca datos de una org recibe `orgId` como argumento obligatorio y lo incluye en el filtro Mongo.** Nunca se confía solo en el middleware. Un repo sin `orgId` en el filtro es un bug de seguridad, no de estilo.

## 6. Concurrencia en reservas (RN-06) — el punto más delicado

Dos atletas reservan el último cupo a la vez. Solución: **transacción de MongoDB** (Atlas siempre es replica set) con verificaciones condicionadas dentro de los updates, no antes:

```
withTransaction:
  1. session = findOneAndUpdate(
       { _id, orgId, status:'scheduled', startsAt > now,
         $expr: { $lt: ['$bookedCount', '$capacity'] } },   // cupo DENTRO del filtro
       { $inc: { bookedCount: 1 } })
     → null ⇒ abort: "sin cupo" (o sesión cancelada/pasada)
  2. pack = findOneAndUpdate(
       { userId, orgId, status:'active', expiresAt > now,
         $expr: { $lt: ['$classesUsed', '$snapshot.classCount'] } },
       { $inc: { classesUsed: 1 } },
       sort: { expiresAt: 1 })                              // FIFO RN-12
     → null ⇒ abort (rollback del inc anterior): "sin créditos"
  3. insertOne(bookings, { status:'booked', ... })
     → E11000 (índice único parcial RN-07) ⇒ abort: "ya reservado"
```

La cancelación es la transacción inversa (con `$inc: -1`) validando la ventana RN-08 en el servidor. **Esta función se implementa una sola vez, en un servicio de dominio (`booking-service`), con la batería de tests de concurrencia más completa del proyecto** (ver [Testing §4](08-testing.md)).

## 7. Timezones — la fuente de bugs #1 en agendas

Reglas fijas, sin excepción:

1. **Persistencia y API: siempre UTC** (`Date` nativo, serializado ISO-8601 con `Z`).
2. La organización define su `timezone` IANA una vez.
3. **Materialización**: "Lunes 18:00" del template se convierte a UTC **usando la timezone de la org en esa fecha específica** (los offsets cambian con DST en otros países; Argentina hoy no tiene DST, pero el código no debe asumirlo).
4. Los frontends muestran horas formateando el UTC con `Intl.DateTimeFormat` en la timezone **de la org** (no la del dispositivo): un atleta de viaje ve la clase a la hora del gimnasio.
5. Cálculos de vencimiento (RN-18) y de "día de calendario" se hacen en la timezone de la org.
6. Librería: `date-fns` + `@date-fns/tz` (liviana, tree-shakeable). Prohibido `moment`.

## 8. Jobs programados (DEC-09)

| Job | Frecuencia | Qué hace | Idempotencia |
|---|---|---|---|
| `materialize-sessions` | 1×/hora | Crea `classSessions` futuras hasta `sessionGenerationDays` por org | Índice único `{templateId, startsAt}` — reinsertar no duplica |
| `expire-packs` | 1×/hora | `active` + `expiresAt < now` → `expired` (RN-13) | Update condicionado por estado |
| `purge-tokens` | — | Lo hace Mongo solo (índices TTL) | — |

Los estados dependientes del tiempo **también se validan en lectura** (un pack con `expiresAt < now` no es usable aunque el job no haya corrido): el job materializa el estado, no lo define.

## 9. Diseño de API (resumen)

REST bajo `/api/v1`, JSON, errores `{ error: { code, message, details? } }` (formato v1). Autenticación Bearer + `X-Org-Id` (§5). Paginación por cursor (`?after=<id>&limit=`). Grupos de rutas:

```
/auth        register, login, refresh, logout, verify-email, forgot/reset-password
/me          perfil, mis membresías (para el selector de org)
/orgs        alta de org (owner), settings, regenerar joinCode, join (con código)
/members     CRUD de miembros de la org [admin] · perfil+notas · asignación de packs
/exercises   catálogo org [admin] + personales [athlete] (query ?scope=)
/entries     registros de carga (athlete escribe los suyos; CRM lee por miembro)
/templates   CRUD plantillas de clase [admin]
/sessions    grilla por rango de fechas · cancelar sesión [admin] · anotados [admin]
/bookings    reservar, cancelar, mis reservas
/packs       CRUD catálogo [admin] (RN-14: validación de asignaciones vigentes)
/assignments packs asignados: crear [admin], listar por miembro/por usuario
/stats       endpoints de agregación por sección del CRM [admin]
```

El contrato completo (schemas Zod de request/response por endpoint) vive en `@bv/contracts` y es la única fuente de tipos para FEs y API (ver [Técnico §4](03-tecnico.md)).

## 10. Flujo de datos de estadísticas

Fase 1: **agregaciones de Mongo on-demand** con los índices de §4 (suficiente hasta miles de registros por org). Los endpoints `/stats/*` encapsulan cada pipeline. Cuando un dashboard supere ~300 ms p95: snapshots pre-agregados nocturnos por org (colección `statsDaily`) — documentado en [Escalabilidad §3](07-escalabilidad.md), no se construye ahora.
