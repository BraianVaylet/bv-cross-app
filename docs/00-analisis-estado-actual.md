# 00 — Análisis del estado actual (bv-cross v1)

> Objetivo: entender qué tenemos hoy, qué se conserva, qué se reemplaza y por qué. Este documento es la línea de base de todas las decisiones del proyecto.

## 1. Qué es bv-cross v1

Web app **mobile-first** de uso personal (un solo usuario real) para registrar RMs (repetition maximum) de ejercicios de CrossFit y calcular cargas por porcentaje. Está en producción en Railway como un único servicio Node que sirve la API y el frontend compilado.

### Stack actual

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS + React Router | 18 / 6 / v4 / 6 |
| Backend | Hono sobre Node + better-sqlite3 + Zod | 4.x / 22 / 11.x / 3.x |
| Base de datos | SQLite (archivo único, modo WAL) | — |
| Lenguaje | TypeScript (ESM) en ambos paquetes | 5.7 |
| Gestión | pnpm workspaces (client + server en un repo) | 11.x |
| Deploy | Railway, single service + volumen persistente | — |

> **Nota importante**: el backend actual es **Hono**, no Express. Hono corre sobre Node, es más rápido, tiene tipos de primera clase y middleware moderno. Cumple el requisito "React, Node y MongoDB" del producto. **Decisión: se mantiene Hono** (ver DEC-01 en [Arquitectura](02-arquitectura.md)).

### Modelo de datos actual (SQLite)

```
users        (id, alias UNIQUE, alias_display, password_hash,
              security_question_id, security_answer_hash, created_at)
sessions     (token_hash PK, user_id FK, expires_at, created_at)
exercises    (id, user_id FK, name, observacion, dolor, gimnastico,
              created_at, updated_at)
rm_entries   (id, exercise_id FK, rm_kg NULL, reps NULL, date, comment, created_at)
```

Puntos a destacar:

- `exercises.gimnastico`: un ejercicio puede medirse por **kg** (RM) o por **repeticiones máximas** (gimnástico). Este concepto se conserva en v2 (`type: 'weight' | 'reps'`).
- `exercises.observacion` y `dolor`: notas y flag de dolor por ejercicio. Se conservan.
- El RM "vigente" es el de fecha más reciente (no el más alto). Regla de negocio que se conserva.
- No existe email, ni organización, ni nada multi-usuario más allá del `user_id`.

## 2. Fortalezas (se conservan)

1. **Seguridad bien resuelta para su alcance**: scrypt con comparación en tiempo constante, sesiones de 256 bits con solo el hash en DB, cookies `httpOnly + SameSite=Lax + Secure`, rate limiting por IP, CSP estricta, prepared statements, guard de `Origin` en mutaciones, invalidación de sesiones al recuperar contraseña. **Esta filosofía se traslada íntegra a la v2.**
2. **Design system documentado** (`DESIGN_SYSTEM.md`): tokens semánticos CSS (`--c-base`, `--c-ink`, `--c-accent`...) expuestos a Tailwind v4 con `@theme inline`, dark mode sin parpadeo, componentes propios en un único `ui.tsx`. Ya fue pensado para reutilizarse en la familia BV. **Es la semilla del paquete `@bv/ui`** (ver [Design System](04-design-system.md)).
3. **Pocas dependencias**: 4 deps de producción en el server. Menos superficie de ataque, menos mantenimiento. Filosofía a conservar: cada dependencia nueva se justifica.
4. **PWA instalable** con `vite-plugin-pwa`, íconos y manifest. Se conserva y se replica en las apps nuevas.
5. **Validación con Zod en los bordes** y formato de error uniforme `{ error: { code, message } }`. Se conserva y se estandariza para toda la API v2.
6. **Cache headers pensados para CDN** (assets inmutables con hash, HTML no-cache). Patrón a replicar.

## 3. Limitaciones (motivan la v2)

| # | Limitación | Impacto | Resolución en v2 |
|---|---|---|---|
| L1 | **SQLite = un archivo en un volumen** | Un solo nodo de escritura, sin réplicas, backup manual, no escala horizontal | MongoDB Atlas (replica set gestionado, backups automáticos) |
| L2 | **Sin email** (alias + pregunta de seguridad) | No hay recuperación segura ni comunicación con el usuario | Auth por email + password con verificación y reset vía email |
| L3 | **Sin multi-tenancy** | Imposible servir a más de un gimnasio | Modelo `organizations` + `memberships` con scoping por `orgId` en toda la API |
| L4 | **Server acoplado a un solo frontend** | Sirve su propio FE estático; no puede servir a 3 apps | API independiente (`apps/api`), frontends desplegados como estáticos |
| L5 | **Cero tests** | Refactors a ciegas; el dominio de créditos/cupos de v2 no se puede sostener sin tests | Estrategia de testing por capa (ver [Testing](08-testing.md)) |
| L6 | **Sin linter ni CI** | Estilo inconsistente entre colaboradores (humanos o modelos) | ESLint + Prettier compartidos vía `@bv/config`, CI único del monorepo |
| L7 | **Ejercicios 100% del usuario** | El gimnasio no puede curar el catálogo ni ver la evolución de sus atletas | Ejercicios de organización (catálogo) + ejercicios personales (privados) |
| L8 | **Rate limiting en memoria** | Se resetea en cada deploy; no funciona con más de una instancia | Fase 1 igual (1 instancia); documentado el paso a Redis (ver [Escalabilidad](07-escalabilidad.md)) |

## 4. Qué pasa con los datos existentes

Hay **un** usuario real con historial de RMs. Migración:

- Script one-shot `sqlite → mongo` que mapea: `users` → `users` (pidiendo email al migrar), `exercises` → `exercises` personales, `rm_entries` → `rmEntries`.
- Es la tarea F2-08 del [PLAN.md](../PLAN.md). Bajo riesgo: si falla, el usuario puede recargar sus ~10 ejercicios a mano.

## 5. Qué se reescribe vs qué se migra

| Pieza | Estrategia |
|---|---|
| Server (auth, repos, rutas) | **Se reescribe** en `apps/api`: el modelo multi-tenant cambia todo el corazón. Se copian patrones (crypto, rate limit, formato de errores, middleware CSP), no archivos. |
| Client bv-cross (páginas, componentes) | **Se migra**: las pantallas de ejercicios/RM/calculadora sobreviven casi intactas; cambia la capa de API, el login y se agrega selector de organización. |
| Design system | **Se extrae** a `packages/ui` del monorepo como `@bv/ui` (tokens + componentes) y se extiende para desktop (CRM). |
| SQLite | **Se descarta** tras migrar datos. |
| Deploy single-service | **Se descarta**: API y frontends se despliegan por separado (ver [Deployment](06-deployment.md)). |

## 6. Riesgos identificados al partir de esta base

1. **La lógica de reservas/créditos no existe hoy** — es dominio nuevo, el de mayor complejidad (concurrencia por cupos, vencimientos, ventanas de cancelación). Se aborda con tests primero (ver RN-XX en [Funcional](01-funcional.md)).
2. **Timezones**: v1 nunca lidió con horarios. Las clases sí. Regla: todo se guarda en UTC, la organización tiene timezone IANA (`America/Argentina/Buenos_Aires`), las instancias de clase se computan en la zona del gimnasio. Es la fuente de bugs #1 en sistemas de agenda: tratado explícitamente en [Arquitectura §7](02-arquitectura.md).
3. **SSO entre 3 apps en dominios distintos**: las cookies solo viajan entre subdominios del mismo apex. Restricción de deployment de primer orden (ver [Arquitectura §5](02-arquitectura.md) y [Deployment](06-deployment.md)).
