## Tarea

<!-- ID del PLAN, ej: F1-04 (link a docs/tasks/FX.md) -->

## RN / DEC que toca

<!-- ej: RN-08, DEC-04 — o "ninguna" -->

## Qué cambia

<!-- 2-4 líneas: qué hace este PR y por qué así -->

## Cómo se probó

<!-- tests agregados, corridas manuales, capturas si hay UI -->

## Checklist de seguridad ([docs/05-seguridad.md §8](../docs/05-seguridad.md#8-checklist-por-pr-bloqueante-en-review))

- [ ] Input nuevo pasa por Zod `.strict()`
- [ ] Queries nuevas filtran por `orgId`/`ownerUserId`
- [ ] Endpoints nuevos con `requireAuth` + `tenantGuard` + rol correcto, registrados en la suite de aislamiento
- [ ] Respuestas usan `toDto()` (sin campos internos)
- [ ] Errores con `DomainError` y código estable
- [ ] Dependencias nuevas justificadas, `audit:deps` verde
- [ ] Sin PII/secretos en logs nuevos
- [ ] N/A — este PR no toca API/datos
