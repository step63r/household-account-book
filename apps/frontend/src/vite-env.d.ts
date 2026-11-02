/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** バックエンド API のベース URL（例: https://xxxx.execute-api.ap-northeast-1.amazonaws.com） */
  readonly VITE_API_BASE_URL: string;
  /** Amazon Cognito User Pool ID（infra の `Household-<stage>-Auth` スタック出力 UserPoolId） */
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  /** Cognito User Pool アプリクライアント ID（同スタック出力 UserPoolClientId） */
  readonly VITE_COGNITO_CLIENT_ID?: string;
  /** Google Analytics 4 の測定ID（`G-XXXXXXXXXX`）。未設定ならGAは無効（本番ビルドでのみ有効） */
  readonly VITE_GA_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
