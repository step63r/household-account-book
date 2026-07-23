/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** バックエンド API のベース URL（例: https://xxxx.execute-api.ap-northeast-1.amazonaws.com） */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
