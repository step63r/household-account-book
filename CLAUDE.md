# CLAUDE.md

個人・家族向け家計簿Webアプリ。AWSサーバーレス構成でランニングコストを最小化し、PC/スマホ両対応のレスポンシブUIを提供する。

技術選定の検討経緯・コスト試算・非機能要件の論点整理は `C:\Users\step6\.claude\plans\web-aws-pc-ui-ux-spicy-lemur.md` を参照。

## Claude Codeに対する依頼事項

- ユーザーに対する最終応答は必ず日本語で行うこと
- gitのcommitおよびpushはユーザが行うので、いかなる場合もClaude Codeは実行しないこと
- ファイルを新規作成・編集したら、ユーザーへの完了報告の前に必ずルートで `pnpm format` を実行してPrettierの差分を解消すること。このリポジトリにはpre-commitフック等のローカル強制手段が無く、GitHub Actions（`.github/workflows/ci.yml`の`pnpm format:check`）でのみ検出されるため、Claude Codeが編集直後にフォーマットしないとほぼ毎回CIの`format:check`が失敗する（実際に発生した事象。2026-08-04、`EditHouseholdNameDialog.tsx`のJSX折り返しがPrettier規約と不一致でCI失敗）

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
- CI/CD: GitHub Actions（lint/typecheck/test/build/`cdk synth`）+ Amplify Hostingの自動ビルド・デプロイ。`cdk deploy`はCIに組み込まず、手動実行＋ユーザー確認のフローとする（詳細は実装状況セクション参照）
- 環境: prodのみ（個人利用のため。2026-07-24にdev/2環境構成からprod単一環境に切替済み。詳細は「実装状況」参照）

## ドメインモデル

- トランザクション種別は `income`（収入）/ `expense`（支出）/ `transfer`（振替）の3種
  - 積立・投資・保険（貯蓄型）・NISA拠出などは `transfer` として記録し、収支推移・予実差の集計対象からは除外する
  - `transfer` の `amount` は正（積立・入金）・負（解約・引き出し）どちらも許容する（income/expenseは引き続き正の整数のみ）。解約返戻金は元本・運用損益を分けず全額をマイナスの`transfer`として記録する（積立時に支出計上しなかったのと対称的な扱い）。type別の符号制約はスキーマではなく`transactionService.ts`の`assertAmountSignRule`（サービス層）で課している
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
- コストアラート（AWS Budgets）: AWSアカウント側でBudgets「月間予算」（月次$300、予測ベース100%超過で通知）を設定済み（2026-08-05）。ただしカスタムドメインと同様に本リポジトリのCDK（`infra/lib/monitoring-stack.ts`）では意図的に管理外としており、Budgetsコンソール等リポジトリ外で設定されたものである点に注意。通知先は`uchi63rs@yahoo.co.jp`（`alertEmail`コンテキストの`ryo-uchiyama@minatoproject.com`とは別アドレス）
- 監査ログ: 更新系APIの操作ログをCloudWatch Logsに残す
- アクセス解析: Google Analytics 4（`apps/frontend/src/lib/analytics.ts`、ルート遷移ごとの送信は`AnalyticsPageView.tsx`）を導入済み（2026-11-02）。以下の制約を崩さないこと
  - ページビューは**クエリ・ハッシュを除いた`origin + pathname`だけ**を手動送信する（`send_page_view: false`）。理由: URLのクエリに個人情報・秘匿情報が載るため。パスワードリセットの`?email=&code=`、招待リンクの`?token=`、ログイン後リダイレクトの`?redirect=`（招待トークン入りのパスを含みうる）が該当し、GAに送ると第三者（Google）へ漏れる。GA4側の自動送信は生URLを送るので使わない
  - GA4管理画面の「拡張計測機能」は**全体をOFF**にしている。ONのままだと「ページの変更に基づくページビュー」が生URL（クエリ込み）でpage_viewを自動送信し、上記の対策が無効になり二重計測にもなる。拡張計測機能の個別項目（サイト内検索・フォーム操作など）も、家計簿の入力内容に触れうるため有効化しない
  - `allow_google_signals` / `allow_ad_personalization_signals`は無効。プライバシーポリシー（`legalContent.tsx`）の「広告配信・行動追跡を目的としない」という記載との整合のため
  - `import.meta.env.PROD`かつ`VITE_GA_MEASUREMENT_ID`設定時のみ有効。`pnpm dev`では送信しない（本番統計を汚さないため）
  - 測定IDは秘匿情報ではなく、`infra/cdk.json`の`context.gaMeasurementId`から`HostingStack`経由でAmplifyのビルド環境変数`VITE_GA_MEASUREMENT_ID`に注入する。Amplifyコンソールで手動追加するとCDKデプロイで消えるため、必ずCDK経由にする
  - GAの利用内容を変える（送信項目の追加、広告機能の有効化など）場合は、プライバシーポリシー本文の更新と`packages/shared/src/consent.ts`の`CURRENT_TERMS_VERSION`更新（全ユーザーへの再同意要求）が必要

## リポジトリ構成

```
household-account-book/
├── apps/
│   ├── frontend/        # React + Vite SPA（Tailwind + shadcn/ui, TanStack Query, Recharts）
│   └── backend/         # Lambda関数群（TypeScript, apps/backend/src/handlers/<name>.ts）
├── packages/
│   └── shared/          # フロント/バック共有の型定義・Zodスキーマ（ビルド不要、TSソースを直接参照）
├── infra/                # AWS CDK (TypeScript)。infra/lib/{auth,data,batch,api,hosting,monitoring}-stack.ts
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

- バックエンド: 費目（カテゴリ）・取引・予算・集計（推移/費目別ピボット/予実差）のCRUD・集計エンドポイントを実装済み（DynamoDB連携・監査ログ込み、`pnpm --filter @household/backend test`で全ユニットテスト green）。退会（`POST /users/me/withdraw`）は論理削除（`status: pendingDeletion`への遷移、`deletionScheduledAt`記録、`userService.ts`の`requestWithdrawal`）に加え、猶予期間経過後の**物理削除バッチ**も実装済み（2026-08-03）。`apps/backend/src/handlers/deleteWithdrawnUsers.ts`（`ScheduledHandler`、EventBridge Ruleから1日1回起動）が`withdrawalBatchService.ts`の`runWithdrawalDeletionBatch`を呼び、`userDeletionRepository.ts`の`DynamoUserDeletionRepository`で①Scan+FilterExpressionで猶予期間切れの`pendingDeletion`ユーザーを検索（テーブル本来の「Query常時・Scanなし」方針への意図的な例外。GSIなしでstatus×日付条件を表現できないため、個人・家族向け規模の1日1回バッチに限定して許容）②該当ユーザーのPK配下の全アイテム（PROFILE/TXN/CATEGORY/BUDGET）をQuery→25件チャンクでBatchWriteItem削除、を行う。1ユーザーの削除失敗は他ユーザーの処理を止めず、バッチ全体で失敗があれば最後にthrowして既存のLambdaエラーアラームに乗せる設計
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
  - パスキー（WebAuthn）ログインを実装済み（2026-11-07。本番ドメインで登録・ログインとも成功を確認。ただしTOTP有効ユーザーはログイン不可。下記「パスキーとTOTP MFAは同一ユーザーで併用できない」参照）。パスワードを置き換えない追加手段で、ログイン画面は2段階（メールアドレス入力→「次へ」→パスキー画面かパスワード画面に自動で振り分け）で、振り分けは`passkey.ts`の`discoverSignInMethod`（`USER_AUTH`を`PREFERRED_CHALLENGE=WEB_AUTHN`で開始し、`WEB_AUTHN`チャレンジが返ればパスキー画面、それ以外はパスワード画面。存在しないメール・TOTP有効・通信エラーも画面上は区別せずパスワード画面に倒す。`LoginPage.tsx`）。パスキー画面でも「パスワードでログインする」へ逃げられる。認証器の呼び出しは直前のタップが必要なブラウザがあるため自動起動せずボタンにしている。登録・一覧・削除は設定画面の`PasskeySection.tsx`から使う。ログイン失敗の原因調査用に、`signInWithPasskey`の失敗時はコンソールに例外名を出す（画面には汎用文言のみ）。`amazon-cognito-identity-js`はCognitoの`USER_AUTH`/WebAuthnに非対応のため、パスキー関連のAPI呼び出しだけ`src/lib/passkey.ts`で`@aws-sdk/client-cognito-identity-provider`を使う（`auth.ts`からは`passkey.ts`をimportしない。循環回避）。得たトークンは`auth.ts`の`establishSession`で`setSignInUserSession`に渡して既存のセッション保存形式に載せるので、`getCurrentSession`/`apiFetch`/`RequireAuth`は無改修。保存キーはSRPログインと同じCognito内部ユーザー名（IDトークンの`cognito:username`）に揃えており、メールをキーにすると同一ユーザーのトークンが二重に残る。TOTP有効ユーザーに追加チャレンジが返ったら既存の`mfaRequired`に合流させる設計だが、上記のとおりTOTP有効ユーザーはそもそもパスキー認証に到達できないため、この分岐は現状Cognitoから実際に返ってきたことがない（`passkey.test.ts`のモックでのみ検証）
  - ルート保護実装済み（未ログイン時はDashboard等から`/login`へリダイレクト、`src/components/auth/RequireAuth.tsx`）
  - 追加env: `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID` / `VITE_API_BASE_URL`（`Household-prod-Auth`/`Household-prod-Api`スタックの出力値。`apps/frontend/.env`に設定済み、gitignore対象）
  - prod環境の実APIに対して`GET /categories`が認証なしで401を返すことを確認済み（疎通そのものはOK）。実際のサインアップ〜ログイン〜画面操作のブラウザでの動作確認はまだ行っていない
- インフラ: 5スタック（Auth/Data/Api/Hosting/Monitoring）を`Household-prod-*`としてリージョン`ap-northeast-1`・アカウント`966191971257`にdeploy済み（2026-07-24。当初dev環境として作ったものを、個人利用でdev/prodを分ける必要が無いと判断しprod単一構成に切替。`Household-dev-*`一式は動作確認後に完全削除済み）。API Gatewayはカスタムドメイン`https://api.household.minatoproject.com`経由でのみ到達可能（デフォルトの`execute-api`エンドポイントは無効化済み。下記参照）
  - 退会物理削除バッチ用に`infra/lib/batch-stack.ts`（`BatchStack`）を追加済み（2026-08-03）。`deleteWithdrawnUsers` Lambda（Scan/Query/BatchWriteItemのみ最小権限付与）とEventBridge Rule（`aws-events`/`aws-events-targets`、毎日UTC 18:10=JST 3:10のcron）を定義し、`bin/app.ts`で`DataStack`の後・`ApiStack`の前に配置。`MonitoringStack`への`functions`は`{...apiStack.functions, ...batchStack.functions}`にマージ済みでエラーアラームも自動付与される。`cdk deploy Household-prod-Batch Household-prod-Monitoring -c stage=prod`でdeploy済み（2026-08-03）。`Household-prod-Batch`新規作成、`Household-prod-Monitoring`にエラーアラーム追加、Auth/Data/Apiは依存関係でデプロイ対象に含まれたが実変更なし（no changes）。以後、猶予期間経過後の退会ユーザーは毎日JST 3:10に自動で物理削除される
  - stageを切り替える場合、CloudFormationスタック名自体に`stage`が埋め込まれる設計（`household-${stage}-*`）のためリネームはできず、新環境を丸ごとdeploy→動作確認→旧環境をdestroyという流れになる（`cdk destroy -c stage=<旧stage>`のように、cdk.json変更後は明示的に`-c stage=...`で上書きしないと旧stageのスタックをCDKアプリが見失う点に注意 — 実際にこれではまった）
  - Amplify HostingはGitHub連携済み。ブランチ名は`master`（このリポジトリの実際のデフォルトブランチ。`infra/lib/hosting-stack.ts`のCDK addBranchは元`main`とハードコードされておりビルド失敗の原因になっていたため修正済み）
  - GitHub接続はAWS推奨のGitHub App方式（Amplifyコンソールから移行済み、2026-07-24）。当初はPAT + Secrets Manager + `GitHubSourceCodeProvider`（`OauthToken`）で接続していたが、AWSがPAT/OAuthトークン方式を廃止しGitHub App方式への移行を促しているため切替。`infra/lib/hosting-stack.ts`のCDKコードはもう`OauthToken`/`AccessToken`を宣言せず、`Repository`のみをL1 (`CfnApp`) escape hatchで設定している（`amplify.GitHubSourceCodeProvider`はPAT前提でGitHub App接続を表現できないため使用不可。CloudFormationの`UpdateApp`は認証系プロパティを省略すると既存の接続を維持する挙動を利用）。PAT用シークレット（`household-dev-amplify-github-token`）は削除済み（2026-07-25、30日間の復旧期間あり）。GitHub側のPAT自体の失効はユーザー側で対応が必要
  - Amplifyのビルド環境変数（`VITE_API_BASE_URL`/`VITE_COGNITO_USER_POOL_ID`/`VITE_COGNITO_CLIENT_ID`）は`infra/lib/hosting-stack.ts`の`amplify.App`の`environmentVariables`でAuth/Apiスタックからクロススタック参照して注入（`bin/app.ts`でHostingStackにuserPoolId/userPoolClientId/apiEndpointを渡す構成。開発者ローカルの`.env`はgitignore対象でCodeBuild環境には見えないため、ここで明示的に渡さないとフロントが「認証設定が未構成です」のまま本番ビルドされる — 実際にこれで一度ハマって修正した）
  - 動作確認用に手動ビルド（`aws amplify start-job`）を実行しSUCCEED、Amplifyの`https://master.<appId>.amplifyapp.com/`（`aws amplify list-apps`で確認）のJSバンドルに実際のUser Pool IDが埋め込まれていることまで確認済み。以後はmasterへのpushで自動ビルド（**注意**: モノレポ構成だがAmplify Gen1にパスベースのビルドスキップ機能は無く、`apps/backend`や`infra`だけの変更でも毎回フロントのビルドが走る。実害は小さいので現状放置）。実ブラウザでのサインアップ〜ログイン操作自体はまだ未検証
  - APIのカスタムドメイン`https://api.household.minatoproject.com`を設定済み（2026-11-06、フロントの動作確認まで完了）。`infra/lib/api-stack.ts`が`apigwv2.DomainName`と`HttpApi`の`defaultDomainMapping`を管理し、ドメイン名とACM証明書ARNは`infra/cdk.json`の`apiDomainName`/`apiCertificateArn`コンテキストで渡す（両方指定か両方省略。片方だけだとエラー）。HostingStackの`VITE_API_BASE_URL`には`apiDomainName`が設定されていればこのドメインを渡す（`bin/app.ts`）。ただし以下はフロントのカスタムドメインと同様に**本リポジトリのCDK管理外**で、リポジトリ外で設定済みである点に注意
    - ACM証明書: ap-northeast-1に手動作成（HTTP APIのリージョナルドメインは同リージョンの証明書が必須で、us-east-1の証明書は使えない）。CDKで作るとCloudflareでの手動DNS検証が済むまでデプロイが止まるため、あえて管理外にしている
    - DNS: `minatoproject.com`はCloudflareで管理（Route 53のホストゾーンは無い）。`api.household`のCNAMEの向き先は`ApiRegionalDomainName`出力（`d-xxxx.execute-api.ap-northeast-1.amazonaws.com`）で、**Proxy status は DNS only**。向き先にAPIのデフォルトエンドポイント（`<apiId>.execute-api...`）を指定すると証明書名の不一致で接続できない（実際にこれでハマった）
    - デフォルトの`execute-api`エンドポイントは`disableExecuteApiEndpoint: true`で無効化（カスタムドメイン設定時のみ。ドメイン未設定で無効化するとAPIに到達できなくなるため）。CDKは無効時に`apiEndpoint`の参照を拒否するので、`ApiEndpoint`出力はドメイン未設定時のみ出し、設定時は`ApiRegionalDomainName`のみ出力する
    - `HttpApi`のCORS `allowOrigins`は`frontendBaseUrl`のオリジンと`http://localhost:5173`（Vite devサーバー）に限定。devステージが無く、ローカルの`pnpm dev`も本番APIを叩くため localhost を残している（CORSは認可境界ではなく全ルートでJWT必須）。`frontendBaseUrl`未設定時のみ`*`にフォールバック
  - アラート通知先メール（`alertEmail`）は`ryo-uchiyama@minatoproject.com`を設定しdeploy済み（2026-08-03、`infra/cdk.json`）。SNSサブスクリプション（`household-prod-alerts`トピック）も確認（confirm）済みで、Lambdaエラーアラーム・DynamoDBスロットリングアラームの通知が実際に届く状態
  - **パスキーとTOTP MFAは同一ユーザーで併用できない（2026-11-07、本番で確認）**: TOTP MFAを有効化したユーザーでは、パスキーが選択型サインインの選択肢に出ず（`USER_AUTH`の`AvailableChallenges`が`PASSWORD`/`PASSWORD_SRP`のみ。`WEB_AUTHN`を選ぶと`Password Challenge is Required to SignIn`）、ログイン画面の「パスキーでログイン」が汎用エラー（「パスキーでログインできませんでした」）で失敗する。同じアカウントでTOTPを無効化したところ、パスキーでログインできるようになった。Cognito公式の[MFA設定ドキュメント](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html)（「Things to know about user pool MFA」節）にも原文で記載がある: "In user pools where MFA is optional, users who have configured an MFA factor can only sign in with username-password authentication flows in choice-based sign-in."、および同節の表の「Optional / Configured」行は "Can set up WebAuthn but can't sign in with passkey"。同節には "Passkeys cannot be used as a second factor to password sign-in." ともある。`FactorConfiguration=MULTI_FACTOR_WITH_USER_VERIFICATION`の例外は「パスキー自体をMFAとして扱う」場合の記述で、TOTPとパスキーの併用を許すものではないと思われる。そのため設定画面（`SettingsPage.tsx`）で互いの状態を見て排他制御している（MFA有効なら`PasskeySection`の「追加」を、パスキー登録済みなら`MfaSection`の「設定する」を無効化して理由を小さく表示。「無効化」「削除」は常に押せる。状態の取得前・失敗時は止めない）。これはUI上の制御だけで、サーバー側（Cognito・バックエンド）は両方の登録を拒否しない点に注意。つまり**パスキーを使うならTOTPは外す必要がある**（登録済みパスキーはTOTPを再有効化しても残るが、その間パスキーでのログインはできない）。`WebAuthnFactorConfiguration=MULTI_FACTOR_WITH_USER_VERIFICATION`はdeploy済みだが、TOTP有効ユーザーの症状は変わらなかった。この設定がTOTP無効ユーザーのパスキーログインに必要だったかは未検証（TOTP有効状態でのみ効果を確認しており、外した状態との比較はしていない）。TOTP無効ユーザーがパスキー後に追加のチャレンジを求められるかも未確認
  - パスキー用に`infra/lib/auth-stack.ts`を変更済み（2026-11-07、deploy済み。`cdk diff Household-prod-Auth -c stage=prod`で置換が無く、UserPoolの`SignInPolicy`/`WebAuthn*`/`WebAuthnFactorConfiguration`とクライアントの`ALLOW_USER_AUTH`追加のみであることは確認済み）。RP IDは`frontendBaseUrl`のホスト名（`household.minatoproject.com`）から導出し、本人確認は`required`、`featurePlan`は既存の`ESSENTIALS`を明示。**RP IDは1プールに1つで、パスキーはそのドメインでしか動かない**（`localhost:5173`や`*.amplifyapp.com`では登録・ログインとも不可。`pnpm dev`ではパスワードログインのみ確認できる）。RP IDを後から変えると登録済みパスキーが全て無効になる。`featurePlan`のCDK既定は「新規作成プールはESSENTIALS、それ以外はLITE」（CDKの型定義コメントによる）で、LITEと非パスワード要素の組み合わせはCDKが拒否するため、明示指定を外さないこと
  - パスワードリセット機能用に、Cognito User Poolへ`CustomMessage`トリガー（`customMessageFn`、`infra/lib/auth-stack.ts`）を追加済み。メールリンクに埋め込むフロントエンドURLは`infra/cdk.json`の`context.frontendBaseUrl`（`https://household.minatoproject.com`）から`AuthStack`経由でLambdaの環境変数`FRONTEND_BASE_URL`に注入している。`HostingStack`の出力に依存すると`Auth→Api→Hosting`の依存順と循環するため、あえてコンテキストパラメータ（`alertEmail`/`amplifyGithubRepoUrl`と同じパターン）で受け渡す設計にした
