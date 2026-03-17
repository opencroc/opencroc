<p align="center">
  <img src="assets/banner.png" alt="OpenCroc バナー" width="820" />
</p>

<h1 align="center">OpenCroc</h1>

<p align="center">
  <strong>ソースコードを読み取り、テストを生成し、失敗を自己修復する AI ネイティブな E2E テストフレームワーク。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/opencroc"><img src="https://img.shields.io/npm/v/opencroc?color=green" alt="npm version" /></a>
  <a href="https://github.com/opencroc/opencroc/actions/workflows/ci.yml"><img src="https://github.com/opencroc/opencroc/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://github.com/opencroc/opencroc/blob/main/LICENSE"><img src="https://img.shields.io/github/license/opencroc/opencroc" alt="MIT License" /></a>
  <a href="https://opencroc.com"><img src="https://img.shields.io/badge/docs-opencroc.com-blue" alt="Documentation" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.ja.md">日本語</a>
</p>

---

## OpenCroc とは

OpenCroc は [Playwright](https://playwright.dev) を土台にした AI ネイティブなエンドツーエンドテストフレームワークです。大量のテストスクリプトを手書きする代わりに、OpenCroc はバックエンドのソースコードを読み取り、モデル、コントローラ、DTO、関連を理解したうえで、シードデータ、リクエストボディ、API チェーン、アサーションを含む E2E スイートを自動生成します。

テストが失敗した場合も、単にエラーを表示するだけではありません。リクエストチェーンを横断して原因を追跡し、根本原因の候補を整理し、修正案を生成し、制御されたフローの中で再検証できます。

## 主な機能

| 機能 | 説明 |
| --- | --- |
| ソースコード認識型生成 | Sequelize、TypeORM、Prisma、Drizzle の構造を解析し、モジュール、モデル、ルート、DTO を把握 |
| AI 設定生成 | リクエストテンプレート、シード計画、パラメータマッピング、テスト雛形を生成し、検証ゲートを通過 |
| チェーン計画 | 依存 DAG を構築し、より高い API カバレッジの実行順を計画 |
| ログ駆動完了判定 | `networkidle` だけに頼らず、バックエンドの完了シグナルでも判定 |
| 失敗の帰属分析 | フロントの要求、バックエンドログ、依存チェーンを結びつけて原因を追跡 |
| 制御された自己修復 | backup、patch、dry-run、re-run、verify、rollback のループを提供 |
| 可視化 Studio | グラフ探索、Agent 状態確認、ピクセルオフィス表示のためのローカル Web UI を提供 |

## クイックスタート

### 前提条件

- Node.js 18 以上
- Express または NestJS を使うバックエンドプロジェクト
- サポート対象の ORM またはスキーマ構造

### インストール

```bash
npm install opencroc --save-dev
```

### 初期化

```bash
npx opencroc init
```

このコマンドは次を実行します。

1. プロジェクト構造のスキャン
2. フレームワークと ORM パターンの検出
3. `opencroc.config.ts` の生成
4. 初期出力構成の生成

### テスト生成

```bash
# 単一モジュールのテスト生成
npx opencroc generate --module=knowledge-base

# すべての検出モジュールのテスト生成
npx opencroc generate --all

# 書き込みなしのプレビュー
npx opencroc generate --all --dry-run
```

### テスト実行

```bash
# 生成済みテストをすべて実行
npx opencroc test

# 単一モジュールのみ実行
npx opencroc test --module=knowledge-base

# headed モードで実行
npx opencroc test --headed

# CLI からフックを上書き
npx opencroc test --setup-hook="npm run e2e:setup" --auth-hook="node scripts/auth.js" --teardown-hook="npm run e2e:cleanup"
```

### AI 設定の検証

```bash
npx opencroc validate --all
npx opencroc compare --baseline=report-a.json --current=report-b.json
```

## OpenCroc Studio

OpenCroc Studio は OpenCroc のローカル可視化ワークスペースです。知識グラフ、ピクセルオフィス運用ビュー、3D オフィスランタイムを、CLI から起動する 1 つの Web 体験にまとめています。

### Studio の起動

```bash
# Studio を起動し、ブラウザを開く
npx opencroc serve

# カスタムポート
npx opencroc serve --port 3000

# ブラウザ自動起動を無効化
npx opencroc serve --no-open

# 公開 host にバインド
npx opencroc serve --host 0.0.0.0 --port 8765
```

### 現在の Web アーキテクチャ

- Fastify がローカル Studio アプリと API を配信
- フロントエンドは単一エントリの Vite SPA
- 主要ルートは `/`、`/studio`、`/pixel`
- Web ソースは `src/web` 配下で `app`、`pages`、`features`、`shared`、`styles`、`public` に整理
- 旧 URL である `/index-studio.html` と `/index-v2-pixel.html` は SPA ルートへリダイレクト

### Studio の機能

- モジュール、API、関連を可視化する知識グラフキャンバス
- Agent の稼働状況を見せるピクセルオフィスダッシュボード
- 没入感のある監視用 3D オフィスランタイムビュー
- WebSocket によるリアルタイム更新
- ルート切替対応のサイドナビゲーション
- `GET /api/project`、`GET /api/agents`、`POST /api/project/refresh` などの REST API

## フルパイプライン

```bash
# フルパイプラインを実行
npx opencroc run

# 単一モジュールに自己修復とレポートを付けて実行
npx opencroc run --module=users --self-heal --report html,json
```

## CI/CD 統合

```bash
npx opencroc ci --platform github
npx opencroc ci --platform gitlab --self-heal
```

## ダッシュボードとレポート

```bash
npx opencroc dashboard
npx opencroc report --format html,json,markdown
```

## アーキテクチャ

```text
+-------------------------------------------------------------------+
| OpenCroc Studio                                                   |
| Fastify サーバー + 単一エントリ Vite SPA + WebSocket 更新         |
| ルート: /, /studio, /pixel                                        |
+-------------------------------------------------------------------+
| CLI / Orchestrator                                                |
+--------------+--------------+---------------+----------------------+
| ソース解析   | チェーン計画 | テスト生成    | 実行 / 観測          |
+--------------+--------------+---------------+----------------------+
| 自己修復     | 影響分析     | レポート      | Dashboard / Studio   |
+--------------+--------------+---------------+----------------------+
```

### 6 段階パイプライン

```text
Source Scan -> ER Diagram -> API Analysis -> Chain Planning -> Test Generation -> Failure Analysis
```

## 仕組み

### 1. ソース解析

OpenCroc は [ts-morph](https://ts-morph.com) とフレームワーク認識型パーサを使って次を解析します。

- モデルと関連
- コントローラとルート
- DTO フィールドとバリデーションルール
- モジュール境界と依存面

### 2. AI 設定生成

各モジュールに対して OpenCroc は次を生成できます。

- リクエストボディテンプレート
- シードデータ計画
- パラメータマッピング
- ID エイリアス規則

各設定は以下の検証を通過します。

1. Schema 検証
2. Semantic 検証
3. Dry-run 検証

### 3. ログ駆動完了判定

ブラウザのアイドル状態だけに頼らず、バックエンドの完了シグナルも使ってリクエストが本当に終了したかを判定します。

### 4. 自己修復ループ

```text
Test Failure
-> Attribution
-> Proposed Fix
-> Dry-Run Validation
-> Apply Patch
-> Re-run
-> Verify
-> Rollback if needed
```

## 実プロジェクト検証

OpenCroc は 100 を超える Sequelize モデル、数十のコントローラ、埋め込み関連定義を含む本番スタイルの RBAC システムで検証されています。

```bash
$ npx tsx examples/rbac-system/smoke-test.ts

Modules        : 5
ER Diagrams    : 5
Chain Plans    : 5
Generated Files: 78
Duration       : 1153ms
```

主な結果:

- フラットなモデル構成から 102 テーブルと 65 外部キー関連を抽出
- 専用 association ファイルなしで埋め込み関連を検出
- 5 モジュールに対して 78 テストファイルを生成
- フラット構成とネスト構成の両方に対応

## 設定例

```typescript
import { defineConfig } from 'opencroc';

export default defineConfig({
  backend: {
    modelsDir: 'src/models',
    controllersDir: 'src/controllers',
    servicesDir: 'src/services',
  },

  baseUrl: 'http://localhost:3000',
  apiBaseUrl: 'http://localhost:3000/api',

  ai: {
    provider: 'openai',
    apiKey: process.env.AI_API_KEY,
    model: 'gpt-4o-mini',
  },

  execution: {
    workers: 4,
    timeout: 30_000,
    retries: 1,
  },

  logCompletion: {
    enabled: true,
    endpoint: '/internal/test-logs',
    pollIntervalMs: 500,
    timeoutMs: 10_000,
  },

  selfHealing: {
    enabled: false,
    fixScope: 'config-only',
    maxFixRounds: 3,
    dryRunFirst: true,
  },
});
```

## サポート技術スタック

| レイヤー | 対応済み | 今後 |
| --- | --- | --- |
| ORM | Sequelize, TypeORM, Prisma, Drizzle | 必要に応じて拡張 |
| Framework | Express | NestJS, Fastify, Koa |
| Test Runner | Playwright | 追加ランナー |
| LLM | OpenAI, ZhiPu, Ollama | Anthropic |
| Database | MySQL, PostgreSQL | SQLite, MongoDB |

## 比較

| 機能 | OpenCroc | Playwright | Metersphere | auto-playwright |
| --- | --- | --- | --- | --- |
| ソース認識型生成 | Yes | No | No | No |
| AI 設定生成と検証 | Yes | No | No | No |
| ログ駆動完了判定 | Yes | No | No | No |
| 失敗帰属分析 | Yes | No | Partial | No |
| 自己修復とロールバック | Yes | No | No | No |
| API 依存 DAG | Yes | No | No | No |
| ゼロ設定テスト生成 | Yes | Limited | Manual | Prompt-driven |
| 影響分析 | Yes | No | No | No |

## ロードマップ

- [x] 6 段階ソースからテストへのパイプライン
- [x] AI 設定生成と検証
- [x] 制御された自己修復ループ
- [x] ログ駆動完了判定
- [x] 失敗帰属分析と影響分析
- [x] Prisma と Drizzle への対応
- [x] Ollama ローカルモデル対応
- [x] CI 統合
- [x] VS Code 拡張スキャフォールド
- [x] プラグインシステム
- [x] HTML、JSON、Markdown レポート
- [x] 可視化 Studio ダッシュボード
- [x] Runtime 基盤
- [x] フルオーケストレーション
- [x] 高度なレポーター
- [x] OpenCroc Studio のルートベース Web アプリ化

## リリーススナップショット

- この README が対象とする製品スナップショット: `1.8.3`
- Studio アーキテクチャスナップショット: Fastify + 単一エントリ Vite SPA + ルートベースビュー
- 主な Studio ルート: `/`、`/studio`、`/pixel`
- フルスイート品質ゲート: 41 テストファイル、414 テスト通過

### バージョンの流れ

- `0.3.x`: プラグインシステム、CI テンプレート、レポーター、VS Code スキャフォールド
- `0.4.x`: NestJS コントローラパーサ
- `0.5.x`: Drizzle ORM アダプタ
- `0.6.x`: 可視化ダッシュボードと Windows Vitest 安定化
- `0.7.x - 0.9.x`: runtime 基盤、認証、ログ駆動検出、ルールエンジン
- `1.0.0`: フルオーケストレーション
- `1.1.0`: 高度な自己修復
- `1.2.0`: 高度なレポーターと移行作業
- `1.3.0`: OpenCroc Studio M1
- `1.8.3`: Vite SPA ルーティング、Web アーキテクチャ整理、配布パッケージ軽量化

### リリース検証

```bash
npm run lint
npm run typecheck
npm test
npm view opencroc version dist-tags --json
```

## ドキュメント

詳細は **[opencroc.com](https://opencroc.com)** を参照してください。あわせて次も確認できます。

- [Architecture Guide](docs/architecture.md)
- [Configuration Reference](docs/configuration.md)
- [Backend Instrumentation Guide](docs/backend-instrumentation.md)
- [AI Provider Setup](docs/ai-providers.md)
- [Self-Healing Guide](docs/self-healing.md)
- [Troubleshooting](docs/troubleshooting.md)

## コントリビュート

コントリビューションを歓迎します。詳細は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## ライセンス

[MIT](LICENSE) Copyright 2026 OpenCroc Contributors
