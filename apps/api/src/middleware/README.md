# Middlewares de autorización y rate limiting

Trío de guards (docs/02-arquitectura.md §5, RN-03/04) + limitador. Se apilan en este orden — cada uno asume el anterior:

```ts
import { requireAuth } from '../middleware/auth.js';
import { tenantGuard } from '../middleware/tenant.js';
import { requireRole } from '../middleware/roles.js';
import { rateLimit } from '../middleware/rate-limit.js';

// Endpoint de org con rol: Bearer válido → membresía activa en X-Org-Id → acción permitida
router.patch(
  '/current',
  requireAuth(config),          // JWT → c.get('userId'). TOKEN_EXPIRED ≠ TOKEN_INVALID.
  tenantGuard(),                // X-Org-Id + membership activa → c.get('org') = { orgId, role, membershipId }
  requireRole('org:settings'),  // acción de la matriz PERMISSIONS (@bv/contracts) — roles sueltos no compilan
  handler,
);

// Rate limit: ventana fija en Mongo (sobrevive deploys, comparte contador entre réplicas)
router.post(
  '/login',
  rateLimit(config, { scope: 'login:ip', keyBy: 'ip', limit: 10, windowSec: 900 }),
  rateLimit(config, { scope: 'login:email', keyBy: 'body-email', limit: 5, windowSec: 900 }),
  handler,
);
```

Reglas:

- `tenantGuard` responde el mismo `NOT_A_MEMBER` para membresía inexistente, `disabled` o `invited`: no filtra estado a no-miembros.
- `requireRole` recibe **acciones**, no roles — la matriz `PERMISSIONS` es la única fuente (RN-04).
- `rateLimit` excede → `RATE_LIMITED` 429 con `Retry-After` (segundos hasta el fin de la ventana). Claves: `ip` (respeta `TRUST_PROXY`), `body-email` (normalizado), `user` (requiere `requireAuth` antes).
- La defensa en profundidad no termina acá: todo repo filtra por `orgId` igual (docs/05-seguridad.md §2).
