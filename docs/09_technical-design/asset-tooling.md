# Asset Tooling

## 基本方針

MVP初期はプレースホルダーで実装し、ゲームルールと描画パイプラインを先に固めます。正式アセットは後続PhaseでBlender生成物へ置き換えます。

ソースアセット、生成中間物、ゲームで読み込む成果物を分離します。

```text
assets/source/
assets/intermediate/
public/assets/
```

## 形式

MVP初期の読み込み形式:

- PNG
- JSON atlas

アトラス形式はPixiJSで扱いやすい形式を採用します。最終形式は未確定事項として残しますが、描画コードはアトラスローダーを差し替えられるようにします。

## IDとファイル名

ゲーム側は `assetId` を参照します。

ファイルパスはアセットマニフェストで解決します。

```text
assetId -> atlasId + frameName
```

ユニットID、建物ID、地形IDからファイル名を直接組み立てません。

## 生成

Blender生成パイプラインはMVP後半から導入します。

MVP前半では次を優先します。

1. 地形タイルのプレースホルダー
2. 建物の占有サイズが分かるプレースホルダー
3. ユニットの向きと選択状態が分かるプレースホルダー
4. オーバーレイ

初期CLIは `packages/asset-tools` に置きます。

```text
pnpm run generate:assets
pnpm run validate:assets
pnpm run clean:assets
```

`generate:assets` は `assets/source/placeholder-assets.json` を読み、`public/assets/placeholders/` にPNGプレースホルダーと `manifest.json` を生成します。実装初期はSharpでSVGテンプレートをPNG化し、正式アセット導入前でも描画・マニフェスト参照・差し替え手順を検証できるようにします。

`validate:assets` は manifest の `assetId` 重複、参照ファイルの存在、PNGの実寸を検証します。

`clean:assets` は生成済みの `public/assets/placeholders/` を削除します。

生成物はビルド成果物として扱い、手編集しません。変更が必要な場合は `assets/source/placeholder-assets.json` を更新して再生成します。

## アプリケーションとの契約

アプリケーション側は、初期段階では次のmanifestを読むだけでアセットを解決します。

```text
public/assets/placeholders/manifest.json
```

manifestの各要素:

- `assetId`: コンテンツ定義や描画コードが参照する安定ID
- `kind`: `terrain`、`unit`、`building`、`overlay`
- `file`: `public/assets/` からの相対パス
- `width` / `height`: PNGの実寸
- `anchor`: 描画基準点

## 検証

アセット検証で確認する項目:

- マニフェストに記載されたファイルが存在する
- `assetId` が重複しない
- 参照されるframeNameが存在する
- 画像サイズが想定範囲内
- 透過PNGとして読める

## 再現性

生成スクリプトは入力ファイルと設定値から同じ成果物を作れるようにします。手作業で `public/assets/` の生成物だけを編集しません。

## 制約

- `../01_overview/design-principles.md`に従う
- `../10_development/mvp-scope.md`の範囲を超えない
- 未確定事項は`../10_development/unresolved-issues.md`へ記録する
