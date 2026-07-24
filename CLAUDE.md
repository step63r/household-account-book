# CLAUDE.md

個人・家族向け家計簿Webアプリ。AWSサーバーレス構成でランニングコストを最小化し、PC/スマホ両対応のレスポンシブUIを提供する。

技術選定の検討経緯・コスト試算・非機能要件の論点整理は `C:\Users\step6\.claude\plans\web-aws-pc-ui-ux-spicy-lemur.md` を参照。

## 技術スタック

### フロントエンド
- React + TypeScript + Vite（SPA）
- UI: Tailwind CSS + shadcn/ui
- グラフ: Recharts（日/週/月推移、費目別ピボット、予実差）
- データフェッチ: TanStack Query
- フォーム: React Hook Form + Zod
- ホスティング: AWS Amplify Hosting（デフォルトドメイン運用、独自ドメインは取得しない）

### バックエンド
- API Gateway (HTTP API) + AWS Lambda（Node.js 22.x / TypeScript）
- 認証: Amazon Cognito User Pool（メール/パスワード認証。将来的に外部IdP連携・MFAを追加する前提でCognitoを選定しているため、その拡張を妨げない設計にする）
- DB: Amazon DynamoDB（オンデマンドキャパシティ、シングルテーブル設計、Point-in-Time Recovery有効化）
  - パーティションキー `PK`、ソートキー `SK`（**大文字**。DynamoDBの属性名として実際にCDK側でこの名前でテーブルを作成しているため、リポジトリ層のコードも必ずこれに合わせること）
  - キー値の形式: `USER#<userId>` / `PROFILE`（ユーザープロフィール・退会ステータス） / `TXN#<date>#<txnId>` / `CATEGORY#<categoryId>` / `BUDGET#<yyyymm>#<categoryId>`（`apps/backend/src/repository/keys.ts` 参照）
  - 集計・ピボット（日次/週次/月次推移、費目別ピボット、予実差）はDBに任せず、対象期間のQuery結果をLambda側でインメモリ集計する方針

### インフラ
- IaC: AWS CDK (TypeScript)。フロント（Amplify Hostingのapp設定）とバックエンドを1つのCDKアプリで管理
- CI/CD: GitHub Actions（`cdk deploy` 実行）+ Amplify Hostingの自動ビルド・デプロイ
- 環境: dev / prod の2環境

## ドメインモデル

- トランザクション種別は `income`（収入）/ `expense`（支出）/ `transfer`（振替）の3種
  - 積立・投資・保険（貯蓄型）・NISA拠出などは `transfer` として記録し、収支推移・予実差の集計対象からは除外する
  - `transfer` は別途「資産形成推移」グラフで扱う想定
- 費目（カテゴリ）は `type: fixed | variable`（固定費/変動費）を持つ
  - プリセット費目（固定費11種＋変動費10種）はユーザー初回登録時にコピーして自動投入し、以後はユーザー所有データとして編集・削除する（プリセット定義自体は不変）
  - 費目の補足説明（括弧書き）はツールチップ表示用テキストとしてマスタに保持する

## 非機能要件の決定事項

- 対応ブラウザ: モダンブラウザのみ（Chrome/Safari/Edge最新版、iOS/Android標準ブラウザ）。IE11等のレガシー対応は不要
- 多言語対応: 日本語のみ。i18nライブラリは導入しない
- 退会時のデータ削除: 退会操作時点で論理削除し、30日程度の猶予期間後にバッチで物理削除する
- コストアラート（AWS Budgets）: 現時点では未設定（必要になれば追加）
- 監査ログ: 更新系APIの操作ログをCloudWatch Logsに残す

## リポジトリ構成

```
household-account-book/
├── apps/
│   ├── frontend/        # React + Vite SPA（Tailwind + shadcn/ui, TanStack Query, Recharts）
│   └── backend/         # Lambda関数群（TypeScript, apps/backend/src/handlers/<name>.ts）
├── packages/
│   └── shared/          # フロント/バック共有の型定義・Zodスキーマ（ビルド不要、TSソースを直接参照）
├── infra/                # AWS CDK (TypeScript)。infra/lib/{auth,data,api,hosting,monitoring}-stack.ts
└── .github/workflows/    # CI
```

pnpmワークスペース（`pnpm-workspace.yaml`）。ルート`package.json`に`packageManager: pnpm@9.15.4`を固定しているが、開発機のグローバルpnpmが古い場合は `npx pnpm@9 <command>` を使うこと（pnpm 6系では`workspace:*`が解決できない）。

## 開発コマンド

- `pnpm install` — 依存関係インストール（ルートで実行、全ワークスペース対象）
- `pnpm -r typecheck` / `pnpm -r lint` / `pnpm -r test` / `pnpm -r build` — 各ワークスペース横断で実行
- `pnpm --filter @household/frontend dev` — フロントエンド開発サーバー起動（Vite）
- `pnpm --filter @household/backend test` — バックエンドのユニットテスト（vitest、AWSには接続しない）
- `cd infra && pnpm exec cdk synth` / `cdk diff` — CDKの構文検証・差分確認（副作用なし、ローカルで安全に実行可）
- `cdk deploy` は実AWSへの課金・破壊的操作を伴うため、`infra-cdk`エージェント/CLAUDE.mdの方針どおり、実行前に必ずユーザーへ確認すること（2026-07-24にdev環境へ初回deploy済み。このAWSアカウントには本プロジェクト以外のCDK/SAMスタックも存在するため、`CDKToolkit`ブートストラップスタックなどアカウント共有リソースに触れる操作は特に慎重に）

## 実装状況

- バックエンド: 費目（カテゴリ）・取引・予算・集計（推移/費目別ピボット/予実差）のCRUD・集計エンドポイントを実装済み（DynamoDB連携・監査ログ込み、`pnpm --filter @household/backend test`で全ユニットテスト green）。退会（`POST /users/me/withdraw`）も論理削除（`status: pendingDeletion`への遷移、`deletionScheduledAt`記録）まで実装済み
  - 未着手の既知ギャップ: 退会の**物理削除バッチ**（`deletionScheduledAt`経過後にDynamoDB項目を実削除するEventBridge + Lambdaのスケジュール実行）は未実装。着手時に追加すること
- フロントエンド:
  - 費目・取引・予算・退会はすべて実バックエンドAPIに配線済み（`src/lib/categories.ts` / `transactions.ts` / `budgets.ts` / `account.ts`、いずれも`apiFetch`経由）。localStorageモック（`local-store.ts`）は削除済み
  - ダッシュボードの集計（収支推移・資産形成推移・予実差）は`src/lib/aggregate.ts`によるクライアント側計算のまま。バックエンドの`/aggregation/*`エンドポイントは実装済みだがフロントからはまだ未使用（既知の積み残し。切り替える場合は取引・予算の全件取得をやめてこのエンドポイントを叩く形に変更する）
  - 認証: `amazon-cognito-identity-js`でCognito User Poolに直接連携（サインアップ→確認コード→ログイン→ログアウト）を実装済み（`src/lib/auth.ts`）。バックエンドを経由しない設計（`/auth/*`エンドポイントは存在しない、CLAUDE.mdの方針どおり）。退会だけは例外的にバックエンドAPI（`POST /users/me/withdraw`）を叩く（`src/lib/account.ts`。`auth.ts`に置くと`api.ts`との循環importになるため分離）
  - ルート保護実装済み（未ログイン時はDashboard等から`/login`へリダイレクト、`src/components/auth/RequireAuth.tsx`）
  - 追加env: `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID` / `VITE_API_BASE_URL`（`Household-dev-Auth`/`Household-dev-Api`スタックの出力値。`apps/frontend/.env`に設定済み、gitignore対象）
  - dev環境の実APIに対して`GET /categories`が認証なしで401を返すことを確認済み（疎通そのものはOK）。実際のサインアップ〜ログイン〜画面操作のブラウザでの動作確認はまだ行っていない
- インフラ: 5スタック（Auth/Data/Api/Hosting/Monitoring）を2026-07-24にdev環境へ初回deploy済み（`Household-dev-*`、リージョン`ap-northeast-1`、アカウント`966191971257`）。API Gatewayエンドポイントは`Household-dev-Api`スタックの`ApiEndpoint`出力を参照。Amplify HostingのGitHub連携とアラート通知先メールはコンテキストパラメータのプレースホルダーのまま（`amplifyGithubRepoUrl`, `amplifyGithubTokenSecretName`, `alertEmail`が空のため、Amplifyアプリ自体は作成済みだがビルド用ブランチは無し）。prodへは未deploy
