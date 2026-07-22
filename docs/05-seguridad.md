# 05 — Seguridad

> La seguridad no es negociable. Este documento fija las prácticas obligatorias en cada capa y el proceso continuo de auditoría de dependencias. Hereda y extiende el trabajo de v1 (que ya era sólido para su alcance).

## 1. Autenticación y cuentas

- **Passwords**: scrypt (`node:crypto`); hashes nuevos con N=2^15, r=8, p=1. El formato almacenado `scrypt$N$r$p$salt_b64$hash_b64` es autodescriptivo: `verifyPassword` lee N/r/p del hash, así los hashes migrados de v1 (que usaba N=2^14) siguen verificando sin re-hash. Comparación en tiempo constante, timing uniforme aunque el email no exista (mitiga user enumeration). Política: mínimo 8 caracteres; sin reglas de composición arbitrarias; chequeo contra top-10k contraseñas comunes.
- **Tokens**: access JWT HS256 15 min (secret ≥ 256 bits) · refresh opaco 256 bits **rotativo con detección de reuso por familia** (reuso ⇒ revocar familia completa) · en DB solo hashes (SHA-256) de refresh/email tokens — un dump de DB no sirve para impersonar.
  - **Ventana de gracia de 30 s** para refresh concurrentes (F4-03): el SSO de apex hace que las tres apps compartan el mismo refresh token, así que abrir dos a la vez lo presenta dos veces. Sin gracia, el uso normal se leía como robo y expulsaba al usuario de todas las apps. Condiciones para la gracia — las tres: el token fue revocado **por una rotación** (`replacedBy` presente; logout y revocación por reuso no lo escriben), hace menos de 30 s, y su sucesor sigue vivo. Aceptado a cambio: un token robado y replicado dentro de esos 30 s obtiene un access token de 15 min (no un refresh nuevo, así que no extiende la sesión del atacante ni le da la cadena).
- **Cookies** (refresh): `httpOnly; Secure; SameSite=Lax; Domain=.<apex>; Path=/api/v1/auth`. El access token vive **solo en memoria** del FE (nunca localStorage/sessionStorage).
- **Verificación y reset por email**: tokens de un solo uso, 30 min de vida, invalidados al usarse; reset invalida **todas** las sesiones del usuario (herencia v1). Respuestas de forgot-password idénticas exista o no el email.
- **Rate limiting** (patrón v1 extendido): por IP y por cuenta en login/register/forgot/refresh/join-org. Lockout progresivo (backoff) tras fallas consecutivas por cuenta.

## 2. Autorización multi-tenant (el riesgo #1 de este producto)

El fallo grave posible: **un gimnasio viendo datos de otro** (IDOR cross-tenant). Defensa en tres capas, todas obligatorias:

1. **Middleware** `tenantGuard`: valida que el usuario tenga membresía activa en la org del header `X-Org-Id` y cuelga `{ userId, orgId, role }` al contexto.
2. **Repositorios**: todo filtro Mongo incluye `orgId` (o `ownerUserId` para recursos personales) como argumento obligatorio de la función — nunca leído "de contexto global". Buscar un documento por `_id` sin `orgId` en el filtro es un bug de seguridad aunque el middleware haya validado.
3. **Tests de aislamiento**: suite dedicada que crea 2 orgs y verifica que cada endpoint niega acceso cross-tenant (404, no 403 — no revelar existencia). Ver [Testing §5](08-testing.md).

Roles (RN-04): matriz de permisos en `@bv/contracts` (única fuente); `requireRole` en rutas + re-chequeo en servicios de acciones sensibles (regenerar joinCode, cancelar sesión con reservas, anular asignaciones).

## 3. Capa HTTP

Se portan de v1 y se ajustan a API separada de los FEs:

- **CSP estricta** en los FEs (hosting estático): `default-src 'self'`, `connect-src 'self' https://api.<apex>`, sin `unsafe-inline` en scripts.
- **CORS** en la API: allowlist explícita de los 3 orígenes FE (env var), `credentials: true`, métodos/headers mínimos. Nada de `*`.
- Guard de `Origin` en mutaciones (defensa CSRF adicional a SameSite, patrón v1).
- `secureHeaders` de Hono: HSTS, `X-Content-Type-Options`, `frame-ancestors 'none'`, etc.
- Límite de body 16 KB (v1) salvo endpoints específicos; límite de tamaño de URL/query; timeouts de request.
- Respuestas API `Cache-Control: private, no-store` (v1 — evita fugas por CDN).
- HTTPS obligatorio; `TRUST_PROXY` correcto para IPs reales detrás del proxy del hosting (afecta rate limiting).

## 4. Datos

- **Validación Zod en todo borde** (body, query, params, env). Campos desconocidos se rechazan (`.strict()`).
- Inyección: el driver Mongo parametriza, pero se bloquean operadores en input (`$` keys) — Zod `.strict()` + tipado ya lo impide; test explícito igual.
- **DTOs explícitos** (`toDto()`): jamás documentos crudos al cliente. `passwordHash`, `tokenHash`, `adminNotes` (fuera del CRM), emails de otros miembros: nunca salen.
- **Datos personales** (Ley 25.326 AR): recolectar el mínimo; `adminNotes` visibles solo a admin/owner de esa org; derecho al olvido = anonimización (RN-25); backups cifrados (Atlas lo hace at-rest por defecto).
- **Logs sin secretos ni PII**: nunca loguear tokens, passwords, bodies de auth; emails enmascarados (`b***@gmail.com`) fuera de nivel debug.

## 5. Cadena de suministro (supply chain)

Requisito explícito del producto: no usar paquetes comprometidos y poder validarlo.

### Prevención
- Lockfile (`pnpm-lock.yaml`) **único para todo el monorepo** commiteado — una sola superficie que auditar; CI instala con `--frozen-lockfile`.
- **`minimumReleaseAge: 4320`** (3 días, en `.npmrc`/config pnpm): no se instalan versiones publicadas hace menos de 3 días — mitiga la ventana típica de paquetes recién comprometidos (ataques tipo `event-stream`, `xz`).
- Versiones exactas o `^` con lockfile; prohibido `latest` o rangos `*`.
- Dependabot/Renovate en modo **agrupado semanal** (no auto-merge de deps de producción).

### Detección — script obligatorio en cada repo
```jsonc
// package.json
"scripts": { "audit:deps": "pnpm audit --prod --audit-level=high && osv-scanner scan --lockfile=pnpm-lock.yaml" }
```
- `pnpm audit`: advisories de npm. `osv-scanner` (Google, binario en CI): base OSV más amplia, cubre más ecosistemas.
- **CI falla** si hay vulnerabilidad `high`+ en deps de producción. Excepciones: solo con anotación en el PR (`# audit-exception: CVE-XXXX razón + fecha de revisión`).
- Job semanal programado (GitHub Actions `schedule`) que corre `audit:deps` sobre `main` y abre issue si falla — detecta CVEs nuevos sin esperar un PR.

## 6. Secretos y configuración

- Secretos solo en env vars del hosting (nunca en repo; `.env` en `.gitignore`, `.env.example` sin valores).
- `config.ts` valida con Zod al boot: **la app no arranca con config inválida** (fail-fast).
- Rotación documentada: `JWT_SECRET` (invalida access tokens — impacto 15 min), `RESEND_API_KEY`, connection string Atlas (usuario de DB con rol `readWrite` solo a su DB, IP allowlist del hosting).
- Secrets de GitHub Actions con environments protegidos para deploy.

## 7. Infraestructura

- Atlas: TLS obligatorio, cifrado at-rest, IP allowlist (o VPC peering a escala), usuario por servicio con mínimo privilegio, backups automáticos activados (M10+; en M0/M2/M5 script `mongodump` programado — ver [Deployment §6](06-deployment.md)).
- Backups: **restauración ensayada** trimestralmente (un backup no probado no es un backup).
- Monitoreo de seguridad: alertas Atlas (conexiones anómalas), logs de auth fallidos con alerta por umbral, `/healthz` sin información sensible.

## 8. Checklist por PR (bloqueante en review)

- [ ] ¿Todo input nuevo pasa por Zod `.strict()`?
- [ ] ¿Toda query nueva filtra por `orgId`/`ownerUserId`?
- [ ] ¿Endpoints nuevos tienen `requireAuth` + `tenantGuard` + rol correcto?
- [ ] ¿Respuestas nuevas usan `toDto()` (sin campos internos)?
- [ ] ¿Errores nuevos usan `DomainError` con código estable (sin stack al cliente)?
- [ ] ¿Dependencias nuevas justificadas + `audit:deps` verde?
- [ ] ¿Ninguna PII/secreto en logs nuevos?
- [ ] Si toca auth/bookings/assignments: ¿test de aislamiento cross-tenant?

## 9. Respuesta a incidentes (mínimo viable)

1. Revocar: rotar `JWT_SECRET` + revocar todas las familias de refresh (logout global).
2. Contener: suspender org/cuenta comprometida (`status: suspended`).
3. Evaluar: logs de acceso del período (Railway/Atlas retienen semanas).
4. Comunicar: si hubo acceso a datos personales, notificar a los gimnasios afectados con hechos y remediación.
5. Post-mortem en este repo (`docs/incidents/YYYY-MM-DD.md`) con acciones.
