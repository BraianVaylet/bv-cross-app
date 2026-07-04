# @bv/contracts

Fuente única de tipos y validación entre la API y los frontends ([docs/03-tecnico.md §4](../../docs/03-tecnico.md)).

## Qué vive acá

- `core.ts` — primitivas: `objectIdString`, `isoDateString`, `calendarDate`, `email`, `joinCode`.
- `enums.ts` — enums del dominio (valores congelados por test).
- `errors.ts` — catálogo `ERROR_CODES` + envelope de error.
- `permissions.ts` — matriz rol→acción (RN-04) + `can()`.
- `pagination.ts` — paginación por cursor.
- Un archivo por recurso a medida que los módulos de API los agregan (`auth.ts`, `orgs.ts`, `bookings.ts`, …).

## Cómo agregar un DTO nuevo (convención)

1. Archivo por recurso: `src/<recurso>.ts`.
2. Nombres: `<accion><Recurso>Body` (entrada), `<recurso>Dto` (salida), `<recurso>Query` (query params).
3. Todo objeto con `.strict()`. Tipos solo con `z.infer` — jamás interfaces duplicadas a mano.
4. Exportar desde `index.ts`. La API lo usa para validar; el FE para tipar. Un breaking acá debe romper la compilación de ambos.
5. Los DTOs nunca incluyen campos internos (`passwordHash`, `tokenHash`, `adminNotes` fuera del CRM).
