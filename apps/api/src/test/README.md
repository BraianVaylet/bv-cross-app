# Suite de aislamiento multi-tenant (F1-09)

`isolation.test.ts` corre en cada `turbo run test` (sin flag). Garantiza que
ninguna ruta filtra datos entre organizaciones ni saltea la matriz de roles.
Tres tests, generados desde `route-policies.ts`:

1. **Completitud** — cruza `ROUTE_POLICIES` contra las rutas reales de Hono
   (`app.routes`). Una ruta sin política, o una política sin ruta, rompe el build.
2. **Matriz de acceso** — por cada política org-scoped: sin token → 401;
   `outsider`/`disabled` → 403; rol insuficiente → 403.
3. **IDOR cross-org** — por cada política con `resource`: un `:id` de otra org
   respondido como miembro de la propia → **404** (no revelar existencia).

## Registrar una ruta nueva (3 pasos)

1. Agregá el endpoint a su módulo (`routes.ts`) con sus guards.
2. Sumá una línea a `ROUTE_POLICIES` en [`src/route-policies.ts`](../route-policies.ts)
   con `method`, `path` (tal cual lo registra Hono, con `:params`) y `access`
   (`public` | `user` | `member` | `admin` | `owner`).
3. Si la ruta recibe un `:id` de recurso org-scoped, agregá `resource: '<kind>'`.
   Si el body es obligatorio para pasar Zod, agregá `sampleBody`.

Si te olvidás del paso 2, el Test 1 falla con "registrá la ruta en
route-policies.ts". El olvido es un build rojo, no un hueco de seguridad.

## Agregar una factory de recurso (para el test de IDOR)

Cuando una fase nueva expone un recurso org-scoped por `:id`
(`exercise`, `entry`, `template`, `session`, `pack`, `assignment`, `booking`):

1. Sumá el nombre al type `ResourceKind` en `route-policies.ts`.
2. Agregá su factory a `RESOURCE_FACTORIES` en [`factories.ts`](./factories.ts):
   `(orgId) => Promise<string>` — crea el recurso en esa org y devuelve su `:id` hex.
3. Referenciala desde la política con `resource: '<kind>'`. El Test 3 la usa sola.
