# E2E テスト体系

## 概要

`apps/game/e2e/` に Playwright-core + Vitest を用いたブラウザ E2E テスト基盤を置く。  
ユニットテスト（Vitest / Node）とは設定ファイルを分離し、実行コマンドも独立している。

## 構成

```
apps/game/
├── e2e/
│   ├── helpers.ts          # ブラウザ/サーバー管理・PNG解析ユーティリティ
│   ├── smoke.test.ts       # スモークスイート
│   └── functional.test.ts  # 機能 E2E スイート
├── src/client/
│   └── testBridge.ts       # window.__asamaTest 型定義 (DEV only)
└── vitest.e2e.config.ts    # E2E 専用 Vitest 設定
```

## デバッグブリッジ (`window.__asamaTest`)

`import.meta.env.DEV` が true のビルド（`pnpm dev`）でのみ公開される。  
プロダクションビルドには含まれない。

| メソッド | 説明 |
|---------|------|
| `getSnapshot()` | 最新の `WorldSnapshot` を返す（未初期化時 null） |
| `enqueue(command)` | `PlayerCommand` をシミュレーションワーカーに送信 |
| `setSpeed(0\|1\|2\|4)` | シミュレーション速度を変更 |
| `waitForTick(tick)` | `currentTick >= tick` になるまで待機する Promise |
| `getBuildTool()` | 現在の建設ツールモードを返す（null = 選択モード） |
| `cellToScreenPoint(cell)` | セル座標をスクリーン絶対座標に変換 |

## 実行コマンド

```bash
# スモークテストのみ（CI 向け）
pnpm run test:e2e:smoke

# 全 E2E テスト
pnpm run test:e2e
```

dev サーバーが未起動の場合、テストランナーが自動起動する。  
既存の `http://127.0.0.1:5173` が応答すればそれを再利用する。

## スモークスイート (`smoke.test.ts`)

1. **コンソールエラー 0 件** — ページロード後の `[error]` ログを検査
2. **ワーカー ready** — `__asamaTest.getSnapshot()` が非 null を返す
3. **ユニット > 0** — 初回スナップショットに units が存在する
4. **建物 > 0** — 初回スナップショットに buildings が存在する
5. **フォールバックスプライト検出** — キャンバスのスクリーンショットを取得し、  
   `overlay.cell.selected` のゴールデン色（`#f0c86a`, RGB ≈ 240/200/106）の  
   ピクセル群が 0 件であることを確認する。  
   初期状態（未選択）でこの色が出現する場合はアセット欠落によるフォールバックを意味する。

## 機能 E2E スイート (`functional.test.ts`)

各テストは独立したブラウザページで実行する。

### 全員移動
- プレイヤー全ユニットをブリッジ経由で `selectUnits` + `moveUnits`
- 速度 4x、400 tick 後に全ユニットが目的地 ±8 マス以内にいることを確認

### ドラッグ建設
- 壁ツールを選択し、実ポインタイベント（pointerdown → move × 4 → pointerup）で 5 セルをなぞる
- スナップショットの wall 建物数が 5 増加していることを確認

### 右クリック解除
- 壁ツールを選択後、キャンバス上で右クリック
- `getBuildTool()` が null（選択モード）に戻ることを確認

## PNG ピクセル解析

`helpers.ts` の `parsePng()` は Node.js 組み込みの `zlib.inflateSync` のみを使い、  
外部 PNG ライブラリなしで RGBA ピクセルデータを展開する。  
PNG フィルタタイプ 0–4（None/Sub/Up/Average/Paeth）を完全サポート。

## 使用ライブラリ

- `playwright-core` — ブラウザ自動化（システム Chromium を使用）
- `vitest` — テストランナー（ユニットテストと共用）

システム Chromium のパス: `/run/current-system/sw/bin/chromium`
