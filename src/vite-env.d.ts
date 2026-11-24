/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAS_URL?: string;
  readonly VITE_REPORT_MODE?: "manual";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
