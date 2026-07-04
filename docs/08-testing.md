# 08 — Testing

> v1 no tiene tests; v2 no puede darse ese lujo: maneja cupos, créditos y plata de terceros. Estrategia: **testear fuerte donde el negocio duele** (dominio de reservas/packs, aislamiento multi-tenant) y liviano donde no (UI presentacional).

## 1. Herramientas

| Capa | Herramienta | Dónde corre |
|---|---|---|
| Unit (servicios de dominio, helpers) | **Vitest** | cada PR, < 30 s |
| Integration (repos + API real contra Mongo) | Vitest + **mongodb-memory-server** (replica set: transacciones) + `app.request()` de Hono (sin red) | cada PR |
| E2E (flujos críticos en browser) | **Playwright** | pre-release / nightly |
| Contratos | los schemas Zod de `@bv/contracts` validan las respuestas en integration tests | cada PR |

Convención: `*.test.ts` junto al código (patrón módulo, [Técnico §3](03-tecnico.md)). Los tests de integración usan factories (`makeOrg()`, `makeAthleteWithPack()`) — nunca fixtures JSON gigantes.

## 2. Pirámide y presupuesto

- **Unit** (~60%): reglas puras — cálculo de vencimientos (RN-18), ventana de cancelación (RN-08), selección FIFO de pack (RN-12), estados (RN-13), RM vigente (RN-22).
- **Integration** (~35%): cada endpoint feliz + errores de dominio + authz. Es la capa que más bugs reales atrapa en una API.
- **E2E** (~5%): 4 flujos — registro+join con código, reservar y cancelar clase, asignar pack desde CRM, registrar carga y verla en CRM.

## 3. Regla de oro: toda RN tiene su test

Cada regla de negocio RN-XX de [Funcional §5](01-funcional.md) mapea a al menos un test que la cita:

```ts
// bookings.service.test.ts
describe('RN-08 cancellation window', () => {
  it('rejects cancellation inside the window', async () => { /* ... */ });
  it('returns the credit to the source pack when outside the window', async () => { /* ... */ });
});
```

Si una RN cambia en el doc, el test que la cita es el checklist de qué código tocar.

## 4. Concurrencia de reservas (la suite más importante del proyecto)

Contra Mongo real (memory-server replica set):

1. **Cupo exacto**: sesión con capacity=1, 2 reservas en `Promise.all` → exactamente 1 éxito y 1 `SESSION_FULL`; `bookedCount === 1`.
2. **Carrera de créditos**: pack con 1 crédito, 2 reservas simultáneas a sesiones distintas → 1 éxito; `classesUsed === 1`.
3. **Idempotencia doble-tap**: mismo atleta, misma sesión, 2 requests → 1 booking (índice único RN-07).
4. **Rollback**: forzar fallo en paso 3 de la transacción → `bookedCount` y `classesUsed` intactos.
5. **Cancelación concurrente a reserva**: no deja contadores negativos ni cupo fantasma.
6. Stress liviano: 20 reservas concurrentes a capacity=10 → 10/10 y contadores exactos.

## 5. Aislamiento multi-tenant (suite de seguridad)

Setup: `orgA`, `orgB`, un usuario miembro solo de A. Para **cada** endpoint org-scoped, generado desde una tabla de rutas:
- con `X-Org-Id: B` → 403 `NOT_A_MEMBER`;
- con `X-Org-Id: A` pero `:id` de un recurso de B → **404** (no revelar existencia);
- athlete llamando endpoints de admin → 403 (RN-04).

Esta suite es bloqueante en CI: endpoint nuevo sin entrada en la tabla = test rojo (la tabla se autovalida contra las rutas registradas en Hono).

## 6. Frontends

- Lógica extraída a hooks/funciones puras (formateo de créditos, agrupado de grilla por día, cálculo de porcentajes de la calculadora — portar de v1) → unit tests Vitest.
- Componentes de `@bv/ui` con render tests mínimos (Testing Library): estados loading/empty/error/disabled.
- No se persigue cobertura de páginas: los 4 E2E cubren el wiring real.

## 7. CI (GitHub Actions, un solo workflow para el monorepo)

```
on: [pull_request, push a main]
jobs: pnpm install --frozen-lockfile → turbo run lint typecheck test → audit:deps
```

Turborepo cachea por paquete: un PR que solo toca `apps/crm` no re-testea la API (cache hit). El lockfile único se audita una sola vez.
- Todo verde para mergear (branch protection). Duración objetivo < 5 min.
- E2E: workflow aparte contra preview/staging, manual o nightly.
- Cobertura: se **mide** y publica en el PR (c8), sin umbral duro global; umbral 90%+ solo en `modules/bookings` y `modules/assignments` (donde está la plata).
