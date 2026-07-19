/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base de la API en prod (https://api.<apex>); vacío en dev (proxy de Vite). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
