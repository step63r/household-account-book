/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** バックエンド API のベース URL（例: https://xxxx.execute-api.ap-northeast-1.amazonaws.com） */
  readonly VITE_API_BASE_URL: string;
  /** Amazon Cognito User Pool ID（infra の `Household-<stage>-Auth` スタック出力 UserPoolId） */
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  /** Cognito User Pool アプリクライアント ID（同スタック出力 UserPoolClientId） */
  readonly VITE_COGNITO_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
