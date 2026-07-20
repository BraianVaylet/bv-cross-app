/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  /** Base de la API en prod (https://api.<apex>); vacío en dev (proxy de Vite). */
  readonly VITE_API_URL?: string;
  /** Identificador de build para mostrar al pie de la cuenta (F2-06). */
  readonly VITE_BUILD_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
