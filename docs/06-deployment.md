# 06 — Deployment

> Escenarios comparados para desplegar la plataforma, con instrucciones por servicio. La arquitectura (API stateless + 3 SPAs estáticas + Atlas) hace que **cambiar de proveedor sea barato**: ninguna pieza depende de features propietarias del hosting.

## 1. Restricciones invariantes (aplican a todo escenario)

1. **Un solo apex domain** para todo: `api.<apex>`, `app.<apex>`, `agenda.<apex>`, `crm.<apex>`. Sin esto el SSO por cookie no funciona ([Arquitectura §5](02-arquitectura.md)). Comprar el dominio es el paso 0 del deploy.
2. **MongoDB Atlas** como DB en todos los escenarios (replica set, backups, métricas, upgrade sin downtime). Autohostear Mongo solo se contempla en el escenario E (VPS) y no se recomienda.
3. La API lee toda su config de **env vars** (validadas al boot). Los FEs solo necesitan `VITE_API_URL` en build.
4. Región: **más cercana a los usuarios y única para API + Atlas** (misma región = latencia de DB de un dígito de ms). Para Argentina: `sa-east-1` (São Paulo) en Atlas + hosting con región São Paulo o us-east como fallback.
5. Deploy automático desde `main` del monorepo, **con filtros por path**: cada servicio observa su `apps/<x>` + `packages/` — mergear un cambio del CRM no redeploya la API. Preview deploys por PR donde el proveedor lo dé gratis.

## 2. Matriz de escenarios

| Escenario | API | FEs | Costo inicial/mes | Esfuerzo ops | Cuándo elegirlo |
|---|---|---|---|---|---|
| **A — Railway todo** *(recomendado para arrancar)* | Railway service (Dockerfile) | Railway static (3 services) | ~USD 5–15 + Atlas M0 gratis | Mínimo | Ya conocés Railway (v1 vive ahí); todo en un dashboard |
| **B — Vercel FEs + Railway API** | Railway | Vercel (3 proyectos, plan hobby/pro) | ~USD 5–15 (+ Vercel 0–20) | Bajo | CDN global + previews de PR de primera para FEs |
| **C — Render todo** | Render web service | Render static sites (gratis) | ~USD 7 + Atlas | Mínimo | Alternativa 1:1 a Railway; static sites gratis |
| **D — Fly.io API + Netlify/Cloudflare FEs** | Fly machines | Netlify o Cloudflare Pages | ~USD 5–10 | Medio | Región São Paulo real para la API (menor latencia AR) |
| **E — VPS (Hetzner/DO) + Docker Compose** | Compose: Caddy + API | Caddy sirve estáticos | ~USD 6–12 fijo | Alto | Control total y costo fijo; solo si hay ganas de hacer ops |

**Decisión fase 1: Escenario A** (menor fricción, conocimiento previo). La migración A→B (FEs a Vercel) o A→D es de horas, no días.

## 3. Escenario A — Railway (guía)

**API (`apps/api`)**
1. New Project → Deploy from GitHub → monorepo. Config: Dockerfile path `apps/api/Dockerfile` (contexto de build = raíz del repo; el Dockerfile usa `turbo prune --scope=@bv/api` para copiar solo lo necesario). **Watch paths**: `apps/api/**`, `packages/**`, `pnpm-lock.yaml`.
2. Variables: `NODE_ENV=production`, `MONGODB_URI` (Atlas SRV), `JWT_SECRET` (256 bits: `openssl rand -base64 48`), `RESEND_API_KEY`, `APP_ORIGINS=https://app.<apex>,https://agenda.<apex>,https://crm.<apex>`, `COOKIE_DOMAIN=.<apex>`, `TRUST_PROXY=true`. Opcional: `ENABLE_JOBS=false` en réplicas que no deban correr jobs (default `true`, DEC-09).
3. Settings → Networking → custom domain `api.<apex>` (CNAME).
4. Healthcheck path `/healthz`. Restart policy on-failure.

**Cada FE** (mismo repo, un service por app)
1. New service → monorepo. Build: `pnpm install --frozen-lockfile && pnpm --filter @bv/cross build`. Output: `apps/cross/dist` como static (análogo para `@bv/crm` y `@bv/schedule`). **Watch paths**: `apps/cross/**`, `packages/**`, `pnpm-lock.yaml`.
2. Build-time env: `VITE_API_URL=https://api.<apex>`.
3. Custom domain (`app.` / `agenda.` / `crm.`). Los cache headers para assets con hash ya los maneja el patrón v1 (portar `cacheControlFor`).

**Atlas**
1. Cluster M0 (gratis) región `sa-east-1` → usuario `bvcross-api` con `readWrite@bvcross` → Network Access: IPs de egreso de Railway (o `0.0.0.0/0` + TLS + password fuerte mientras Railway no dé IP fija; revisar al pasar a M10).
2. `MONGODB_URI` con `retryWrites=true&w=majority`.

## 4. Escenario B/D — FEs en CDN (delta sobre A)

- Vercel/Netlify/Cloudflare Pages: importar el **monorepo** con Root Directory `apps/<x>` (detectan pnpm workspaces y buildean desde la raíz), framework Vite, output `dist`, env `VITE_API_URL`. En Vercel, agregar `npx turbo-ignore` como Ignored Build Step: saltea builds cuando el commit no toca esa app ni `packages/`. Asignar subdominio custom. SPA fallback (`/* → /index.html`) — en Netlify `_redirects`, en Vercel/CF Pages automático.
- Ventaja concreta: previews por PR (QA visual de cada cambio de UI antes de mergear) y assets servidos desde edge.

## 5. Escenario E — VPS (para tener la opción documentada)

```yaml
# docker-compose.yml (esqueleto)
services:
  caddy:
    image: caddy:2
    ports: ["80:80", "443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile, ./sites:/srv, caddy_data:/data]
  api:
    build:
      context: .                       # raíz del monorepo
      dockerfile: apps/api/Dockerfile
    env_file: .env.api
    expose: ["8787"]
```
```
# Caddyfile — TLS automático (Let's Encrypt)
api.example.com  { reverse_proxy api:8787 }
app.example.com  { root * /srv/app;  try_files {path} /index.html; file_server }
agenda.example.com { root * /srv/agenda; try_files {path} /index.html; file_server }
crm.example.com  { root * /srv/crm;  try_files {path} /index.html; file_server }
```
- Deploy: GitHub Action que buildea imágenes/estáticos y hace `ssh + docker compose up -d` (o Watchtower).
- Sigue usando Atlas. Endurecer el VPS: ufw (80/443/22), fail2ban, actualizaciones automáticas, usuario no-root.

## 6. Backups y datos

- **M0/M2/M5** (sin backups automáticos): GitHub Action nocturna con `mongodump` → artefacto cifrado a un bucket (Cloudflare R2 gratis 10 GB). Retención 30 días.
- **M10+** (al escalar): backups continuos de Atlas con point-in-time restore. El disparador para pasar a M10 está en [Escalabilidad §2](07-escalabilidad.md).
- Ensayo de restore trimestral (baja un backup, restaura a un cluster temporal, corre smoke tests).

## 7. Entornos

| Entorno | Para qué | Infra |
|---|---|---|
| `dev` local | desarrollo | API local + Mongo local en Docker (`mongod --replSet rs0` — las transacciones requieren replica set) o Atlas M0 dev |
| `staging` *(opcional fase 1)* | probar integraciones (emails reales, dominios) | réplica barata del escenario A con DB `bvcross-staging` |
| `production` | usuarios reales | escenario elegido |

- Seed de desarrollo: script `db:seed` que crea 1 org demo + admin + 5 atletas + grilla + packs (tarea F1-11 del PLAN).
- Emails en dev: `EmailProvider` consola (loguea el link) — no requiere Resend para desarrollar.

## 8. Checklist de go-live

- [ ] Dominio + 4 subdominios con TLS activo
- [ ] `JWT_SECRET` único de producción (jamás el de dev), secrets cargados
- [ ] CORS allowlist con los 3 orígenes finales; cookie `Domain=.<apex>` verificada logueándose desde las 3 apps
- [ ] Atlas: usuario mínimo privilegio, allowlist, backup nocturno andando (restaurado 1 vez)
- [ ] `/healthz` monitoreado (UptimeRobot/BetterStack gratis) con alerta
- [ ] `audit:deps` verde en el monorepo
- [ ] Migración de datos v1 ejecutada y verificada (tarea F2-08)
- [ ] Rollback probado: revert de un commit en main redeploys la versión anterior
