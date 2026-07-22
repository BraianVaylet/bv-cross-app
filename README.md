# BV Cross — Plataforma de gestión para centros de CrossFit

[![CI](https://github.com/BraianVaylet/bv-cross-app/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/BraianVaylet/bv-cross-app/actions/workflows/ci.yml)

> **Monorepo del producto**: acá viven el código de todas las apps y paquetes compartidos, la documentación funcional/técnica y el plan de acción (ver [Arquitectura](docs/02-arquitectura.md)).

## ¿Qué es?

BV Cross evoluciona de una app personal de registro de cargas a una **plataforma SaaS multi-tenant** para gimnasios donde se practica CrossFit y disciplinas afines (Hyrox, funcional, musculación).

La plataforma se compone de tres aplicaciones y un backend compartido, todo en este monorepo:

| Pieza | Path | Usuario | Propósito |
|---|---|---|---|
| **bv-cross** (cargas) | `apps/cross` | Atleta | Registro de RMs y cálculo de cargas (se migra desde el repo v1) |
| **bv-cross-schedule** | `apps/schedule` | Atleta | Agenda de clases: reservar, cancelar, ver créditos |
| **bv-cross-crm** | `apps/crm` | Dueño/admin | Gestión de clientes, clases, packs y estadísticas |
| **API** | `apps/api` | — | Backend único (Hono) para las 3 apps |
| **Design system** | `packages/ui` | — | Tokens + componentes React compartidos (`@bv/ui`) |
| **Contratos** | `packages/contracts` | — | Schemas Zod + tipos compartidos API⇄FEs (`@bv/contracts`) |
| **Config** | `packages/config` | — | ESLint/Prettier/tsconfig base (`@bv/config`) |

**Stack**: React 18 + Vite + Tailwind CSS v4 (frontends) · Node 22 + Hono + TypeScript (API) · MongoDB Atlas (datos) · Zod (validación compartida) · pnpm workspaces + Turborepo (monorepo).

> El repo `bv-cross` (v1) sigue en producción intacto hasta que la Fase 2 migre su cliente a `apps/cross`; se archiva en el go-live (F6).

## Mapa de documentación

Leé los documentos en este orden si sos nuevo en el proyecto:

| # | Documento | Qué responde |
|---|---|---|
| 00 | [Análisis del estado actual](docs/00-analisis-estado-actual.md) | ¿De dónde partimos? Qué se conserva y qué se reemplaza de bv-cross v1 |
| 01 | [Funcional](docs/01-funcional.md) | ¿Cómo funciona el negocio? Roles, flujos, reglas de negocio, roadmap |
| 02 | [Arquitectura](docs/02-arquitectura.md) | ¿Cómo se estructura el sistema? Multi-tenancy, modelo de datos, auth, diagramas |
| 03 | [Técnico](docs/03-tecnico.md) | ¿Cómo escribimos código? Estándares, scaffolding, patrones, linters, nomenclatura |
| 04 | [Design System](docs/04-design-system.md) | ¿Cómo se ve y se siente el producto? Tokens, componentes, theming |
| 05 | [Seguridad](docs/05-seguridad.md) | ¿Cómo protegemos datos y cuentas? Prácticas, auditoría de dependencias, checklist |
| 06 | [Deployment](docs/06-deployment.md) | ¿Dónde y cómo se despliega? Escenarios comparados (Railway, Render, Fly, VPS, Vercel) |
| 07 | [Escalabilidad](docs/07-escalabilidad.md) | ¿Qué hacemos cuando crezca? Etapas de escala con disparadores concretos |
| 08 | [Testing](docs/08-testing.md) | ¿Cómo garantizamos calidad? Estrategia de tests por capa |
| 09 | [**Bitácora**](docs/09-bitacora.md) | ¿Hasta dónde llegó la implementación? Estado real, decisiones tomadas al implementar y trampas conocidas |
| — | [**PLAN.md**](PLAN.md) | **Tablero de ejecución**: estado de las 58 tareas, prioridades y dependencias |
| — | [docs/tasks/F0..F6](docs/tasks/) | **Especificaciones por tarea**: objetivo, alcance, especificación técnica, casos de prueba y criterios de aceptación de cada una |

## Estado del proyecto

- **Fase actual**: F3 — CRM. F0 5/6 · F1 11/12 · F2 7/8 · F3 3/12 · F4 6/8 (ver [PLAN.md](PLAN.md)).
- La **API** está completa hasta reservas: auth, multi-tenancy, organizaciones, clientes, ejercicios, registros de carga, agenda, packs, asignaciones y el booking-service transaccional con sus endpoints. El **FE de cargas** (`apps/cross`) está migrado y **BV Agenda** (`apps/schedule`) ya reserva contra la API real.
- Lo que falta para el go-live de F2 es **infraestructura**: crear Atlas + Railway (F1-12) desbloquea los deploys.
- Qué hay en `main`, qué está en PRs y las trampas conocidas: [bitácora](docs/09-bitacora.md).
- **bv-cross v1**: en producción (Railway), un solo usuario, SQLite. Sigue operativa hasta que la v2 la reemplace.

## Convenciones de este repo

- Los documentos usan **RN-XX** para reglas de negocio y **DEC-XX** para decisiones de arquitectura, así se pueden referenciar desde tareas y PRs.
- Las tareas del plan se marcan `[ ]` → `[x]` a medida que se completan. Cada tarea es autocontenida: cualquier desarrollador (humano o modelo) puede tomarla sin contexto adicional.
- Idioma: documentación y UI en **español**; código, commits e identificadores en **inglés**.
