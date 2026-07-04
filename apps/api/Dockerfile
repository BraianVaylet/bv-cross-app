# Contexto de build = RAÍZ del monorepo:
#   docker build -f apps/api/Dockerfile .
# turbo prune copia solo lo que @bv/api necesita (docs/06-deployment.md §3).

FROM node:22-slim AS base
RUN corepack enable pnpm
WORKDIR /repo

# --- Prune: subconjunto del monorepo que necesita @bv/api ---
FROM base AS pruner
RUN pnpm add -g turbo@2
COPY . .
RUN turbo prune @bv/api --docker

# --- Build ---
FROM base AS builder
# Lockfile + package.json primero (cache de capa de deps)
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /repo/.npmrc ./.npmrc
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@bv/api
# Deps de producción solamente, desplegables fuera del workspace
RUN pnpm --filter @bv/api deploy --prod /app

# --- Runtime ---
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd -r bv && useradd -r -g bv bv
COPY --from=builder /app .
COPY --from=builder /repo/apps/api/dist ./dist
USER bv
EXPOSE 8787
CMD ["node", "dist/index.js"]
