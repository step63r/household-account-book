# CLAUDE.md

個人・家族向け家計簿Webアプリ。AWSサーバーレス構成でランニングコストを最小化し、PC/スマホ両対応のレスポンシブUIを提供する。

技術選定の検討経緯・コスト試算・非機能要件の論点整理は `C:\Users\step6\.claude\plans\web-aws-pc-ui-ux-spicy-lemur.md` を参照。

## Claude Codeに対する依頼事項

- ユーザーに対する最終応答は必ず日本語で行うこと

## 技術スタック

### フロントエンド
- React + TypeScript + Vite（SPA）
- UI: Tailwind CSS + shadcn/ui
- グラフ: Recharts（日/週/月/年推移、費目別ピボット、予実差、資産形成推移の累計）
- データフェッチ: TanStack Query
- フォーム: React Hook Form + Zod
- ホスティング: AWS Amplify Hosting。カスタムドメイン `https://household.minatoproject.com`（SES送信ドメイン`minatoproject.com`のサブドメイン）を使用。ただしこのカスタムドメイン紐付け（Route 53 / ACM証明書 / Amplifyドメイン設定）は本リポジトリのCDK（`infra/lib/hosting-stack.ts`）では一切管理しておらず、リポジトリ外（Amplifyコンソール等）で設定済みのものを前提としている点に注意

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
- 環境: prodのみ（個人利用のため。2026-07-24にdev/2環境構成からprod単一環境に切替済み。詳細は「実装状況」参照）

## ドメインモデル

- トランザクション種別は `income`（収入）/ `expense`（支出）/ `transfer`（振替）の3種
  - 積立・投資・保険（貯蓄型）・NISA拠出などは `transfer` として記録し、収支推移・予実差の集計対象からは除外する
  - `transfer` は別途「資産形成推移」グラフで扱う想定
- 費目（カテゴリ）は `type: fixed | variable`（固定費/変動費）を持つ。**支出専用**のマスタで、費目別ピボット・予算（予実差）はすべて `expense` のみが対象
  - プリセット費目（固定費11種＋変動費10種）はユーザー初回登録時にコピーして自動投入し、以後はユーザー所有データとして編集・削除する（プリセット定義自体は不変）
  - 費目の補足説明（括弧書き）はツールチップ表示用テキストとしてマスタに保持する
- `income`（収入）は費目マスタを使わない。`categoryId` は必ず `null` で、代わりに自由記述の `incomeSource`（給与、賞与など）を持つ。理由: 支出用の固定費/変動費プリセットを収入に流用すると選択肢が噛み合わず（「給与」に「食費」を選ぶような違和感）、かつ費目別ピボット・予算は元々expense専用で収入の`categoryId`は集計上使われていなかったため。UI（`TransactionsPage.tsx`）は `INCOME_SOURCE_PRESETS`（給与/賞与/副業/一時所得）からの選択＋「その他」選択時の自由入力を提供する。`transfer`の`transferLabel`と同じ設計パターン
  - バックエンドの`assertCategoryIdRule`（`transactionService.ts`）は `expense` のみ `categoryId` 必須、`income`/`transfer` は必ず `null` を要求する

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
- `pnpm --filter @household/frontend test` — フロントエンドのユニットテスト（vitest、DOM無し。`src/lib`配下の純粋関数のみが対象。2026-07-30時点でコンポーネントのレンダリングテストは未導入）
- `cd infra && pnpm exec cdk synth` / `cdk diff` — CDKの構文検証・差分確認（副作用なし、ローカルで安全に実行可）
- `cdk deploy` は実AWSへの課金・破壊的操作を伴うため、`infra-cdk`エージェント/CLAUDE.mdの方針どおり、実行前に必ずユーザーへ確認すること。`infra/cdk.json`の`stage`コンテキストは`"prod"`固定（個人利用でdev環境を廃止したため。過去に存在した`Household-dev-*`一式は2026-07-24に完全削除済み）。このAWSアカウントには本プロジェクト以外のCDK/SAMスタックも存在するため、`CDKToolkit`ブートストラップスタックなどアカウント共有リソースに触れる操作は特に慎重に

## 実装状況

- バックエンド: 費目（カテゴリ）・取引・予算・集計（推移/費目別ピボット/予実差）のCRUD・集計エンドポイントを実装済み（DynamoDB連携・監査ログ込み、`pnpm --filter @household/backend test`で全ユニットテスト green）。退会（`POST /users/me/withdraw`）も論理削除（`status: pendingDeletion`への遷移、`deletionScheduledAt`記録）まで実装済み
  - 未着手の既知ギャップ: 退会の**物理削除バッチ**（`deletionScheduledAt`経過後にDynamoDB項目を実削除するEventBridge + Lambdaのスケジュール実行）は未実装。着手時に追加すること
  - パスワードリセット（`apps/backend/src/handlers/customMessage.ts`）実装済み。Cognitoの`CustomMessage`トリガーとして、`triggerSource === 'CustomMessage_ForgotPassword'`のときのみメール本文を差し替え、確認コードを`${FRONTEND_BASE_URL}/reset-password?email=...&code=...`のリンクに埋め込む。他のtriggerSource（サインアップ確認等）はデフォルトテンプレートのまま。他の認証系機能と同様バックエンドAPIは経由せず、フロントは`ConfirmForgotPassword`をCognitoに直接呼ぶ
- フロントエンド:
  - 費目・取引・予算・退会はすべて実バックエンドAPIに配線済み（`src/lib/categories.ts` / `transactions.ts` / `budgets.ts` / `account.ts`、いずれも`apiFetch`経由）。localStorageモック（`local-store.ts`）は削除済み
  - ダッシュボードの集計（収支推移・費目別内訳・資産形成推移・予実差）は2026-07-30にバックエンドの`/aggregation/*`エンドポイント（`getTrend`/`getCategoryPivot`/`getBudgetVariance`）経由に切替済み（旧`src/lib/aggregate.ts`によるクライアント側全件集計は削除済み）。取引・予算の全件取得はやめ、`src/lib/aggregation.ts`から用途ごとに期間を絞った5クエリ（収支推移用・KPIタイル用・費目別ピボット用・予実差用・資産形成推移用）を投げる構成にした
    - 収支推移の日次/週次は当月のみ、新規追加した年次（`TrendGranularity`に`'year'`を追加）は当年のみを対象期間とする。月次は従来通り無期限（`getTrend`の`from`はoptional化済み）
    - 資産形成推移は収支推移の期間トグルから独立し、常に「全期間・月次・累計」を表示（`TrendPoint.transfer`を月次集計→フロントで単純なランニングサム）。期間トグルUIは持たない
    - ダッシュボード上部に当月サマリーKPIタイル（収入・支出・差引残高・貯蓄率、前月比バッジ、`SummaryStatTiles.tsx`）と費目別支出の内訳（`CategoryBreakdownChart.tsx`、上位6費目＋その他の横棒メーターリスト）を追加
    - グラフのY軸は「1k」等ではなく「◯万」表記（`src/lib/format.ts`の`formatManYenTick`）に統一。ツールチップ等の金額表示も`formatYen`に集約
  - 認証: `amazon-cognito-identity-js`でCognito User Poolに直接連携（サインアップ→確認コード→ログイン→ログアウト）を実装済み（`src/lib/auth.ts`）。バックエンドを経由しない設計（`/auth/*`エンドポイントは存在しない、CLAUDE.mdの方針どおり）。退会だけは例外的にバックエンドAPI（`POST /users/me/withdraw`）を叩く（`src/lib/account.ts`。`auth.ts`に置くと`api.ts`との循環importになるため分離）
  - 設定画面でのメールアドレス変更も実装済み（`SettingsPage.tsx`、`src/lib/auth.ts`の`requestEmailChange`/`confirmEmailChange`）。認証と同様バックエンドを経由せずCognitoに直接連携し、User Poolの`keepOriginal.email`設定（`infra/lib/auth-stack.ts`）により新アドレス宛の確認コード検証が完了するまで実際のメール属性は変わらない。バックエンドのDynamoDBはメールアドレスをキャッシュしていない（退会時にJWTクレームから都度読むのみ）ため、この変更に追随するバックエンド側の対応は不要
  - パスワードリセット実装済み（`src/pages/ResetPasswordPage.tsx`、`src/lib/auth.ts`の`forgotPassword`/`confirmForgotPassword`）。ログイン画面から遷移し、URLに`email`/`code`クエリパラメータが無ければメールアドレス入力フォーム（Cognito`ForgotPassword`を呼びメール送信）、両方あれば新パスワード入力フォーム（Cognito`ConfirmForgotPassword`を呼ぶ）を出し分ける。リンクの有効期限はCognito標準の固定値に依存しており、本プロジェクト側で短縮する仕組みは持たない（UI文言でも具体的な分数は明記していない）
  - ルート保護実装済み（未ログイン時はDashboard等から`/login`へリダイレクト、`src/components/auth/RequireAuth.tsx`）
  - 追加env: `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID` / `VITE_API_BASE_URL`（`Household-prod-Auth`/`Household-prod-Api`スタックの出力値。`apps/frontend/.env`に設定済み、gitignore対象）
  - prod環境の実APIに対して`GET /categories`が認証なしで401を返すことを確認済み（疎通そのものはOK）。実際のサインアップ〜ログイン〜画面操作のブラウザでの動作確認はまだ行っていない
- インフラ: 5スタック（Auth/Data/Api/Hosting/Monitoring）を`Household-prod-*`としてリージョン`ap-northeast-1`・アカウント`966191971257`にdeploy済み（2026-07-24。当初dev環境として作ったものを、個人利用でdev/prodを分ける必要が無いと判断しprod単一構成に切替。`Household-dev-*`一式は動作確認後に完全削除済み）。API Gatewayエンドポイントは`Household-prod-Api`スタックの`ApiEndpoint`出力を参照
  - stageを切り替える場合、CloudFormationスタック名自体に`stage`が埋め込まれる設計（`household-${stage}-*`）のためリネームはできず、新環境を丸ごとdeploy→動作確認→旧環境をdestroyという流れになる（`cdk destroy -c stage=<旧stage>`のように、cdk.json変更後は明示的に`-c stage=...`で上書きしないと旧stageのスタックをCDKアプリが見失う点に注意 — 実際にこれではまった）
  - Amplify HostingはGitHub連携済み。ブランチ名は`master`（このリポジトリの実際のデフォルトブランチ。`infra/lib/hosting-stack.ts`のCDK addBranchは元`main`とハードコードされておりビルド失敗の原因になっていたため修正済み）
  - GitHub接続はAWS推奨のGitHub App方式（Amplifyコンソールから移行済み、2026-07-24）。当初はPAT + Secrets Manager + `GitHubSourceCodeProvider`（`OauthToken`）で接続していたが、AWSがPAT/OAuthトークン方式を廃止しGitHub App方式への移行を促しているため切替。`infra/lib/hosting-stack.ts`のCDKコードはもう`OauthToken`/`AccessToken`を宣言せず、`Repository`のみをL1 (`CfnApp`) escape hatchで設定している（`amplify.GitHubSourceCodeProvider`はPAT前提でGitHub App接続を表現できないため使用不可。CloudFormationの`UpdateApp`は認証系プロパティを省略すると既存の接続を維持する挙動を利用）。PAT用シークレット（`household-dev-amplify-github-token`）は削除済み（2026-07-25、30日間の復旧期間あり）。GitHub側のPAT自体の失効はユーザー側で対応が必要
  - Amplifyのビルド環境変数（`VITE_API_BASE_URL`/`VITE_COGNITO_USER_POOL_ID`/`VITE_COGNITO_CLIENT_ID`）は`infra/lib/hosting-stack.ts`の`amplify.App`の`environmentVariables`でAuth/Apiスタックからクロススタック参照して注入（`bin/app.ts`でHostingStackにuserPoolId/userPoolClientId/apiEndpointを渡す構成。開発者ローカルの`.env`はgitignore対象でCodeBuild環境には見えないため、ここで明示的に渡さないとフロントが「認証設定が未構成です」のまま本番ビルドされる — 実際にこれで一度ハマって修正した）
  - 動作確認用に手動ビルド（`aws amplify start-job`）を実行しSUCCEED、Amplifyの`https://master.<appId>.amplifyapp.com/`（`aws amplify list-apps`で確認）のJSバンドルに実際のUser Pool IDが埋め込まれていることまで確認済み。以後はmasterへのpushで自動ビルド（**注意**: モノレポ構成だがAmplify Gen1にパスベースのビルドスキップ機能は無く、`apps/backend`や`infra`だけの変更でも毎回フロントのビルドが走る。実害は小さいので現状放置）。実ブラウザでのサインアップ〜ログイン操作自体はまだ未検証
  - アラート通知先メール（`alertEmail`）は未設定のまま（コンテキストパラメータが空文字）
  - パスワードリセット機能用に、Cognito User Poolへ`CustomMessage`トリガー（`customMessageFn`、`infra/lib/auth-stack.ts`）を追加済み。メールリンクに埋め込むフロントエンドURLは`infra/cdk.json`の`context.frontendBaseUrl`（`https://household.minatoproject.com`）から`AuthStack`経由でLambdaの環境変数`FRONTEND_BASE_URL`に注入している。`HostingStack`の出力に依存すると`Auth→Api→Hosting`の依存順と循環するため、あえてコンテキストパラメータ（`alertEmail`/`amplifyGithubRepoUrl`と同じパターン）で受け渡す設計にした
