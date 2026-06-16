# Production Art Farm 4x4 Request

## 背景

農地が1x1タイル表現のままだと、ユニットや大型建物と並べたときに小さすぎる。
MVPの建物スケール方針を更新し、農地は最小4x4 footprintとして扱う。

実装側では一時的に既存1x1農地画像を4x4 canvasへ拡大してruntime整合性を保つが、これはぼやけるためproduction replacementが必要。

## 対象

既存runtime assetIdを維持する。

| assetId | output | canvas | anchor | footprint |
|---|---|---:|---:|---:|
| `building.farm` | `building-farm.png` | 256x128 | 128,64 | 4x4 |

## Source Output

以下に配置してほしい。

```text
assets/source/raster/approved-production/farm-4x4/
```

期待ファイル:

```text
building-farm-4x4.png
generation-report.md
asset-map.json
validation-summary.json
contact-sheet.png
```

## Visual Direction

- 日本戦国期の城下・農村周辺に見える畑/田畑。
- 4x4の広い区画として一目で農地だと分かること。
- 単純に1x1畑を拡大した見た目にしない。
- 複数の畝、畦道、土の区切り、作物の帯を入れて、広い耕作地として読ませる。
- 建物ではなく地面系タイル。高さのある小屋、塔、人物、家屋は入れない。
- 周辺の草地タイルと馴染む接地感。外周に不自然な緑線や明るい縁取りを出さない。
- 透明背景PNG。canvas四隅は透明。
- 実ゲーム上ではpassableな低い地面表現として使うため、ユニットが上を歩いても違和感が少ない密度にする。

## Geometry

- 1タイルは64x32のアイソメトリック地面。
- 4x4 footprintの見かけ上の接地範囲は、おおむね256x128 canvas中央に収まる。
- anchorはcanvas中心 `128,64`。
- 地面系なので、画像の接地面中心がanchorに一致すること。
- 透明余白は最小限。ただしcanvas外にはみ出さない。

## Runtime Integration Notes

実装側で既に以下へ更新予定/更新済み:

- `building.farm` logical footprint: 4x4
- generated manifest canvas: 256x128
- production definition geometry: 4x4, 256x128, anchor 128,64

完了後、実装側で `assets/definitions/production-assets.json` の source pathを以下へ差し替える。

```text
assets/source/raster/approved-production/farm-4x4/building-farm-4x4.png
```

## Validation

- PNG dimensions are exactly 256x128.
- Alpha channel exists.
- Canvas corners are transparent.
- No visible seam/color fringe at the diamond edge.
- Contact sheet or simple preview should include the farm on grass terrain if possible.
