# asama — 日本城郭RTS(ローカル・シングルプレイヤー)

Stronghold風の固定アイソメトリック2D RTS。城と城下町を築き、兵糧を回し、攻め寄せる波状攻撃から本丸を守り抜きます。MVP実装済み(詳細は `docs/10_development/mvp-scope.md`)。

## 起動

```sh
nix-shell          # nodejs / pnpm / blender が入る
pnpm install
pnpm run dev       # クライアント http://127.0.0.1:5173
```

セーブ機能を使う場合は別ターミナルでローカルAPIも起動します:

```sh
pnpm --filter @asama/game dev:server   # http://127.0.0.1:3000 (viteがproxy)
```

## 主な操作

| 操作 | 動作 |
|---|---|
| 左クリック / 左ドラッグ | ユニット選択 / 範囲選択(Shiftで追加・除外) |
| 右クリック | 移動(陣形展開)・敵を攻撃 |
| A + 左クリック | 攻撃移動 |
| S | 停止 |
| 自軍の門を左クリック | 開閉 |
| 矢印キー / 中ボタンドラッグ / ミニマップ | カメラ移動 |
| ホイール | ズーム |
| Space / ⏸ 1x 2x 4x | 一時停止・速度変更 |
| 梯子設置・堀埋めボタン | 工兵を選択して対象セルを指定 |

## 開発コマンド

```sh
pnpm run typecheck
pnpm test
pnpm run assets:all                  # アセットパイプライン(Blenderレンダー+検証)
pnpm run assets:blender:calibration  # アイソメ契約のキャリブレーション検証
pnpm run assets:alignment:contact-sheet
```

Blenderレンダーはキャッシュされ、`assets/source/blender/scripts/render_asset.py`(全モデルの手続き定義)や対象ジオメトリが変わった分だけ再実行されます。

## 構成

- `apps/game` — Vite/React クライアント、PixiJS レンダラー、Web Worker シミュレーションループ、Fastify セーブAPI
- `packages/simulation` — ゲームロジック(経路探索・戦闘・兵糧・経済・敵AI・勝敗)。React/DOM非依存
- `packages/content` — データ定義(建物・ユニット・シナリオ)
- `packages/shared` — 型と定数
- `packages/asset-tools` — アセットパイプラインCLI(Blenderレンダー、後処理、検証、監査)
- `docs/` — 仕様書一式(読み順は `docs/README.md`)

## 設計の要点

- ランタイムはアセットの出所(Blender/ラスター)を認識しない(`docs/05_map-and-art/asset-pipeline.md`)
- アイソメ配置はピクセル契約で固定(`docs/05_map-and-art/isometric-alignment.md`)。Blenderカメラリグが構築時に保証し、`assets:blender:calibration` が常時検証
- 未確定のバランス値は `FOOD_BALANCE` / `ECONOMY_BALANCE` / `SIEGE_BALANCE` 等の定数と `packages/content` のシナリオデータに集約(`docs/10_development/unresolved-issues.md`)
