/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API server's origin, e.g. http://localhost:3000. */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
