# Local Server

## 基本方針

MVPはローカルNode.jsサーバーを起動し、ブラウザから `localhost` でプレイします。

サーバーの責務:

- 静的ファイル配信
- 定義データ配信
- アセット配信
- セーブ一覧取得
- セーブ書き込み
- セーブ読み込み
- セーブ削除

ゲームシミュレーションはサーバーでは実行しません。

## サーバーフレームワーク

MVP初期は小さなHTTP APIで足ります。ExpressまたはFastifyのどちらでも成立しますが、初期決定はFastifyにします。

理由:

- TypeScriptで型を付けやすい
- ルーティングとスキーマ検証を整理しやすい
- MVPのAPI規模に対して過剰ではない

## API

MVP初期API:

```text
GET    /api/content/index
GET    /api/content/:type/:id
GET    /api/saves
GET    /api/saves/:saveId
POST   /api/saves
DELETE /api/saves/:saveId
GET    /assets/*
```

保存時はサーバー側でファイル名を正規化し、クライアントから任意パスを書けないようにします。

## 保存ディレクトリ

```text
saves/manual/
saves/autosave/
saves/quicksave/
```

このディレクトリはプロジェクトルート基準にします。将来デスクトップアプリ化する場合は、ユーザーデータディレクトリへ移動できるようにサーバー設定値で切り替えます。

## セキュリティ

- デフォルトbindは `127.0.0.1`
- 外部公開しない
- セーブAPIは保存ディレクトリ外へアクセスしない
- パス区切り、`..`、絶対パスを拒否する
- CORSは原則無効

## 開発サーバー

開発時はVite dev serverとNode API serverを併用して構いません。本番相当のローカル起動では、Nodeサーバーがビルド済みクライアントを配信します。

## 制約

- `../01_overview/design-principles.md`に従う
- `../10_development/mvp-scope.md`の範囲を超えない
- 未確定事項は`../10_development/unresolved-issues.md`へ記録する
