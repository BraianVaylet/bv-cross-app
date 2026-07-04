# 07 — Escalabilidad

> El producto puede pasar de 1 gimnasio a cientos en poco tiempo. Este documento define **etapas de escala con disparadores medibles**: qué señal mirar, qué cambiar y qué NO construir antes de tiempo. La regla: la arquitectura ya soporta escalar (API stateless, DB gestionada); escalar es ejecutar pasos conocidos, no rediseñar.

## 0. Números de referencia (para dimensionar sin fantasía)

Un gimnasio típico: ~150 atletas activos, ~70 sesiones/semana, ~800 reservas/mes, ~2.000 registros de carga/mes. Cargas pico: 7:00–9:00 y 17:00–21:00 (reservas del día). **100 gimnasios ≈ 15k usuarios ≈ 80k reservas/mes ≈ 3–5 req/s promedio con picos de ~50 req/s.** Conclusión: una API Node bien escrita y una M10 aguantan la etapa "éxito inicial" sin heroísmos. El plan existe para cuando eso quede corto.

## 1. Qué ya es escalable por diseño (no tocar)

- **API stateless** (JWT access + refresh en DB): N réplicas detrás del LB del hosting sin sesiones pegajosas.
- **Multi-tenancy por `orgId`** con índices compuestos: el working set por gimnasio es chico; Mongo escala vertical mucho antes de necesitar sharding.
- **Contadores denormalizados** (DEC-08): las pantallas calientes (grilla, saldo) son lecturas O(1), no agregaciones.
- **FEs estáticos en CDN**: los usuarios no tocan la API para assets; escalar frontend es gratis.
- **Jobs idempotentes** (DEC-09): duplicar ejecución no corrompe — requisito para pasar a N réplicas o a un worker.

## 2. Etapas con disparadores

### Etapa 0 — Lanzamiento (1–10 gimnasios, hasta ~2k usuarios)
Infra: 1 réplica API (512 MB–1 GB), Atlas **M0/M5**, jobs in-process. Costo ~USD 5–15/mes.
**Obligación de esta etapa: instrumentar.** Sin métricas no hay disparadores. Mínimo: logs estructurados con `durationMs` por request, Atlas metrics, uptime monitor. Revisar p95 semanalmente.

### Etapa 1 — Tracción (10–50 gimnasios) — **disparadores: p95 API > 300 ms sostenido · CPU > 60% en picos · conexiones Atlas > 80% del límite M5**
1. Atlas → **M10** (backups continuos incluidos, sin downtime).
2. API → 2+ réplicas. **Prerrequisito**: mover rate limiting de memoria a Mongo (colección TTL) o Redis, y jobs con lock distribuido (documento `jobLocks` con `findOneAndUpdate` + TTL) o réplica única dedicada a jobs.
3. Índices: revisar `explain()` de las 10 queries más lentas (Atlas Query Profiler).

### Etapa 2 — Crecimiento (50–200 gimnasios) — **disparadores: p95 > 300 ms con M10 al 60%+ · dashboards de stats > 500 ms · jobs tardan minutos**
1. **Redis** (Upstash/hosting): rate limiting, cache de lecturas calientes (grilla semanal por org, TTL 30 s + invalidación al reservar), locks de jobs.
2. **Worker separado** para jobs y tareas diferidas (emails, notificaciones) con cola (BullMQ sobre Redis). La API deja de hacer trabajo de fondo.
3. **Stats pre-agregadas**: job nocturno escribe `statsDaily` por org; los dashboards leen snapshots (los del día se calculan on-demand solo para "hoy").
4. Atlas M20/M30 según métricas.

### Etapa 3 — Escala (200+ gimnasios, decenas de miles de usuarios)
1. Read replicas Atlas + `readPreference: secondaryPreferred` **solo** en queries tolerantes a lag (stats, historiales) — nunca en booking.
2. Sharding solo si una colección supera cientos de GB (lejos): shard key candidata `{ orgId: 1, _id: 1 }` — el aislamiento por org lo hace natural.
3. Revisar separación del módulo de bookings como servicio si el equipo creció (no antes: un monolito modular bien testeado se opera con una persona; microservicios no).

## 3. Performance en el código (reglas permanentes, desde el día 1)

1. Toda query nueva tiene índice que la cubre (`db/indexes.ts` en el mismo PR) — [Técnico §3](03-tecnico.md).
2. Paginación por cursor en toda lista sin tope natural (nunca `skip` grande, nunca "traer todo").
3. `projection` en queries de listado: traer solo campos del DTO.
4. Sin N+1: los listados que necesitan datos relacionados usan `$lookup` puntual o batch por `$in`.
5. FEs: code-splitting por ruta (`React.lazy`) en CRM; bundle inicial apps atleta < 200 KB gzip; imágenes de ejercicios en WebP con tamaño fijo (patrón v1).
6. Presupuesto de performance en CI (fase 2): Lighthouse CI en PRs de FEs — regresión de score = warning.

## 4. Qué NO hacer antes de su disparador (anti-sobre-ingeniería)

| Tentación | Por qué esperar |
|---|---|
| Redis desde el día 1 | Una pieza más que operar para 3 req/s; Mongo TTL cubre rate limiting en etapa 0–1 |
| Microservicios | 1 dev; el costo de operación/observabilidad supera cualquier beneficio hasta etapa 3 |
| Sharding | M10→M30 vertical cubre 2 órdenes de magnitud |
| GraphQL | 3 clientes propios con contratos compartidos tipados: REST + Zod ya da type-safety end-to-end |
| Kubernetes | El hosting PaaS escala réplicas con un slider hasta etapa 2 inclusive |

## 5. Observabilidad (qué mirar para disparar etapas)

- **Logs estructurados JSON** (pino): `requestId`, `userId`, `orgId`, ruta, status, `durationMs`. Correlación request→error.
- **Métricas mínimas**: p50/p95/p99 por ruta (se derivan de logs en etapa 0; Grafana Cloud free/Axiom si se quiere dashboard), error rate 5xx, conexiones Mongo, memoria/CPU del servicio.
- **Alertas**: uptime `/healthz` (ya en go-live), error rate > 2% en 5 min, p95 > 500 ms en 15 min.
- **Sentry** (free tier) en API y FEs desde etapa 0: los errores de usuarios reales son el insumo de calidad más barato que existe.
