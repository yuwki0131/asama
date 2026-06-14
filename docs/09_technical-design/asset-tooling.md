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
