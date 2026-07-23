# PLAN — BV Cross v2

> Tablero de ejecución. Cada tarea tiene su **especificación completa** (objetivo, alcance, especificación técnica, casos de prueba, criterios de aceptación) en `docs/tasks/F*.md` — este archivo es el índice de estado.

## Cómo usar este plan

- Marcar `[ ]` → `[x]` al completar (con el PR mergeado y CI verde, no antes).
- **Antes de tomar una tarea**: leer su spec completa en `docs/tasks/` y los docs que referencia (RN-XX en [Funcional](docs/01-funcional.md), DEC-XX en [Arquitectura](docs/02-arquitectura.md)). La spec es el contrato: si al implementar aparece una contradicción con los docs, primero se corrige el doc (PR), después el código.
- ⛔ = bloqueante: las tareas posteriores de la fase (o la fase siguiente) dependen de ella.
- **Dificultad y modelo sugerido**: 🟢 Junior → Haiku/Sonnet · 🟡 Semi-senior → Sonnet/Opus · 🔴 Senior → Opus/Fable.
- **Definition of Done global** (toda tarea): PR con CI verde · [checklist de seguridad](docs/05-seguridad.md#8-checklist-por-pr-bloqueante-en-review) · endpoints nuevos registrados en la suite de aislamiento (F1-09) · seed extendido si el módulo introduce datos (F1-11) · docs actualizados si cambió una decisión.

## Estado por fase

| Fase | Nombre | Tareas | Specs | Estado |
|---|---|---|---|---|
| F0 | Fundaciones (monorepo + estándares) | 6 | [docs/tasks/F0.md](docs/tasks/F0.md) | 🔨 5/6 (F0-06 espera decisión de dominio — humano) |
| F1 | API core: auth + organizaciones | 12 | [docs/tasks/F1.md](docs/tasks/F1.md) | 🔨 11/12 |
| F2 | Migración de bv-cross (cargas) | 8 | [docs/tasks/F2.md](docs/tasks/F2.md) | 🔨 7/8 |
| F3 | CRM: gestión del gimnasio | 12 | [docs/tasks/F3.md](docs/tasks/F3.md) | 🔨 7/12 |
| F4 | bv-cross-schedule: reservas | 8 | [docs/tasks/F4.md](docs/tasks/F4.md) | 🔨 6/8 |
| F5 | Estadísticas + hardening | 7 | [docs/tasks/F5.md](docs/tasks/F5.md) | — |
| F6 | Go-live | 5 | [docs/tasks/F6.md](docs/tasks/F6.md) | — |

---

## F0 — Fundaciones · [specs](docs/tasks/F0.md)

- [x] **F0-01** ⛔ 🟡 Opus — Inicializar el monorepo (pnpm + Turborepo + `.npmrc`) + `@bv/config` (ESLint/Prettier/tsconfig)
- [x] **F0-02** ⛔ 🟡 Opus — `@bv/contracts` núcleo: primitivas Zod, enums del dominio, catálogo de errores, matriz de permisos
- [x] **F0-03** ⛔ 🟡 Opus — `@bv/ui`: extraer design system de v1 (tokens + componentes + Modal/Toast nuevos + playground)
- [x] **F0-04** 🟢 Sonnet — CI del monorepo (turbo + cache + `audit:deps` con osv-scanner) · *verde en `main` (repo bv-cross-app)*
- [x] **F0-05** 🟢 Haiku — Gobierno del repo (branch protection, Dependabot, template de PR) · *branch protection activa y probada (push directo rechazado)*
- [ ] **F0-06** 🟢 humano — Decidir y comprar dominio (apex único — restricción SSO)

## F1 — API core: auth + organizaciones · [specs](docs/tasks/F1.md)

- [x] **F1-01** ⛔ 🟡 Opus — Scaffolding `apps/api`: config Zod fail-fast, middlewares de seguridad, errores, pino, Dockerfile turbo-prune *(docker build queda para verificar con Docker disponible)*
- [x] **F1-02** ⛔ 🟡 Opus — Capa Mongo: cliente, colecciones tipadas, TODOS los índices, harness de tests con replica set
- [x] **F1-03** ⛔ 🟡 Opus — `lib/crypto` (scrypt v1 + tokens) y `lib/email` (Resend + consola + templates)
- [x] **F1-04** ⛔ 🔴 Fable — Auth: register + verify + login (JWT 15 min + refresh rotativo en cookie)
- [x] **F1-05** ⛔ 🔴 Fable — Auth: refresh con detección de reuso + logout + forgot/reset + change-password
- [x] **F1-06** ⛔ 🔴 Opus — Middlewares `requireAuth`/`tenantGuard`/`requireRole` + rate limiting en Mongo
- [x] **F1-07** ⛔ 🟡 Opus — Módulo `orgs`: crear org, settings, joinCode regenerable, join con vinculación de invitados, `/me`
- [x] **F1-08** 🟡 Opus — Módulo `members`: CRUD de clientes del CRM (pre-carga, adminNotes, disable/enable)
- [x] **F1-09** ⛔ 🔴 Fable — Suite de aislamiento multi-tenant (tabla de políticas autovalidante + IDOR cross-org)
- [x] **F1-10** 🟡 Sonnet — Scheduler de jobs + `expire-packs` idempotente
- [x] **F1-11** 🟢 Sonnet — Seed de desarrollo (org demo completa; se extiende en cada fase)
- [ ] **F1-12** 🟢 Sonnet — Deploy de la API (Railway + Atlas M0 + verificación por HTTP real)

## F2 — Migración de bv-cross · [specs](docs/tasks/F2.md)

- [x] **F2-01** ⛔ 🟡 Opus — Módulo `exercises`: catálogo de org + personales (una colección, dos alcances, TYPE_LOCKED) · *seed de ejercicios pendiente hasta mergear F1-11 (#20)*
- [x] **F2-02** ⛔ 🟡 Opus — Módulo `entries`: registros kg/reps (XOR), RM vigente, vista admin solo-catálogo · *seed de RMs pendiente hasta mergear F1-11 (#20)*
- [x] **F2-03** ⛔ 🔴 Opus — FE: migración al monorepo + auth nueva (token en memoria, refresh single-flight, selector de org)
- [x] **F2-04** 🟢 Sonnet — Pantalla de join a organización (código + mapeo de errores)
- [x] **F2-05** 🟡 Sonnet — Home: catálogo del gimnasio + "Mis ejercicios" (paridad v1 en detalle/calculadora)
- [x] **F2-06** 🟢 Sonnet — PWA (prompt de actualización) + pantalla de cuenta (nombre, password, cambiar de gym)
- [ ] **F2-07** 🟢 Sonnet — Deploy de bv-cross v2 (estático + smoke e2e en producción)
- [x] **F2-08** 🟡 Opus — Script de migración v1→v2 (SQLite→Mongo, dry-run, verificación, rollback)

## F3 — CRM · [specs](docs/tasks/F3.md)

- [x] **F3-01** ⛔ 🔴 Fable — Módulo `schedule`: templates + materialización con timezones + sesiones (la tarea de fechas)
- [x] **F3-02** ⛔ 🟡 Opus — Módulo `packs`: catálogo con matriz de edición RN-14 y archivado
- [x] **F3-03** ⛔ 🔴 Fable — Módulo `assignments`: snapshot inmutable, vencimiento en tz org, pago manual
- [x] **F3-04** ⛔ 🟡 Opus — CRM scaffolding + `AppShell` responsive + onboarding wizard (F1 del Funcional)
- [x] **F3-05** 🟡 Opus — Sección Clientes: `DataTable`, ficha, asignar pack, invitación por WhatsApp
- [ ] **F3-06** 🟡 Opus — Sección Clases: grilla de templates (duplicar día) + calendario de sesiones + anotados
- [x] **F3-07** 🟢 Sonnet — Sección Packs: matriz RN-14 comunicada en la UI + historial de precios
- [x] **F3-08** 🟢 Sonnet — Sección Ejercicios: CRUD de catálogo + carga rápida del set básico
- [ ] **F3-09** 🟡 Opus — Evolución de atletas: gráfico de progreso (`SimpleChart`) + feed de PRs (definición de PR)
- [ ] **F3-10** 🟡 Opus — Módulo `stats` + Dashboard (números verificados a mano, presupuesto p95 con `loadgen`)
- [ ] **F3-11** 🟢 Sonnet — Configuración de la org: settings, joinCode, gestión de admins (+ extensión de roles en API)
- [ ] **F3-12** 🟢 Sonnet — Deploy del CRM (onboarding real cronometrado < 10 min)

## F4 — bv-cross-schedule: reservas · [specs](docs/tasks/F4.md)

- [x] **F4-01** ⛔ 🔴 Fable — `booking-service` transaccional: book/cancel/cancel-session (suite de concurrencia 14 casos, cobertura ≥90%)
- [x] **F4-02** ⛔ 🟡 Opus — Endpoints de bookings + `GET /me/credits` (respuestas con saldo para UI sin refetch)
- [x] **F4-03** ⛔ 🟢 Sonnet — Scaffolding `apps/schedule` (PWA propia + verificación del SSO)
- [x] **F4-04** 🔴 Opus — Grilla semanal + flujo de reserva (`WeekGrid`/`SessionCard`/`CreditBadge`; <10 s y ≤3 taps)
- [x] **F4-05** 🟡 Sonnet — Mis reservas + cancelación (ventana comunicada antes del error)
- [x] **F4-06** 🟢 Sonnet — Pantalla de saldo (packs FIFO, estados, usableFrom)
- [ ] **F4-07** 🟢 Sonnet — Deploy de bv-cross-schedule (smoke: reserva reflejada en el CRM)
- [ ] **F4-08** 🟡 Opus — E2E Playwright de los 4 flujos críticos (5 corridas verdes sin flakes)

## F5 — Estadísticas + hardening · [specs](docs/tasks/F5.md)

- [ ] **F5-01** 🟡 Opus — Stats de Clases: heatmap de ocupación (tz en pipeline), cancelación, tendencia
- [ ] **F5-02** 🟡 Opus — Stats de Clientes y Packs: renovación, breakage, export CSV
- [ ] **F5-03** 🟢 Sonnet — Sentry (API + 3 FEs) + redacción de logs verificada por test
- [ ] **F5-04** 🔴 Fable — Auditoría de seguridad pre-lanzamiento (procedimiento adversarial + informe con hallazgos)
- [ ] **F5-05** 🟡 Opus — Performance pass: 5 presupuestos medidos antes/después (bundles, Lighthouse, k6, explain)
- [ ] **F5-06** 🟢 Haiku — Job semanal de auditoría de dependencias (issue automática sin duplicar)
- [ ] **F5-07** 🟡 Sonnet — Backup nocturno cifrado a R2 + ensayo de restore cronometrado (RTO < 1 h)

## F6 — Go-live · [specs](docs/tasks/F6.md)

- [ ] **F6-01** 🟢 Sonnet — Dominios definitivos + SSO verificado entre las 3 apps + Resend en dominio propio
- [ ] **F6-02** 🟢 Sonnet — Migración final de datos v1 + apagado y archivado de v1
- [ ] **F6-03** 🔴 humano+Opus — Beta con el primer gimnasio real (protocolo de 2 semanas + gate: 1 semana autónoma)
- [ ] **F6-04** 🟡 Sonnet — Runbook de operación (validado por ejecución de un tercero)
- [ ] **F6-05** 🔴 humano+Fable — Retro con métricas reales + deuda técnica + roadmap F7 + pricing

---

## Dependencias entre fases

```
F0 ──► F1 ──► F2 (necesita F1-04..07 + F2-01/02)
        │
        └───► F3 (necesita F1 completa; F3-01..03 son API y bloquean F4)
                └──► F4 (necesita F3-01 sesiones + F3-03 assignments)
                        └──► F5 ──► F6
```

Paralelización posible con más de un desarrollador/modelo: F2 (FE cargas) y F3-01..03 (API de agenda/packs) no se pisan; F3-05..08 (secciones CRM) son independientes entre sí una vez mergeado F3-04.
