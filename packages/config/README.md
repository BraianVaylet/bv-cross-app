# @bv/config

Configuración compartida de lint, formato y TypeScript ([docs/03-tecnico.md §7](../../docs/03-tecnico.md)).

## Uso en un paquete

```jsonc
// package.json
"devDependencies": { "@bv/config": "workspace:*" }
```

```js
// eslint.config.js (paquete Node)
export { default } from '@bv/config/eslint/base';
// eslint.config.js (paquete React)
export { default } from '@bv/config/eslint/react';
```

```jsonc
// tsconfig.json (paquete Node)
{ "extends": "@bv/config/tsconfig.base.json", "compilerOptions": { "outDir": "dist", "rootDir": "src" }, "include": ["src"] }
// tsconfig.json (frontend Vite)
{ "extends": "@bv/config/tsconfig.vite.json", "include": ["src"] }
```

Prettier se configura una sola vez en la raíz del repo (`.prettierrc.json`, espejo de `./prettier.json`).

## Scripts estándar (mismos nombres en todo workspace)

`dev` · `build` · `typecheck` · `lint` · `test` — así `turbo run <task>` funciona uniforme.
