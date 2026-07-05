# ワークスペースとGit運用フロー

## ワークスペース: 1エージェント = 1クローン(完全分離)

```
~/workspace/asama          # 統合用(ユーザー+統括メインセッション、main を保持。統括の役割定義は 01_agent-split.md)
~/workspace/asama-art-a    # branch: agent/art-a
~/workspace/asama-art-b    # branch: agent/art-b
~/workspace/asama-sim      # branch: agent/sim
~/workspace/asama-content  # branch: agent/content
~/workspace/asama-ui       # branch: agent/ui
```

- git worktree ではなくフルクローンを採用。`.git`(約213MB)×6 のディスクコストと引き換えに
  完全分離が得られ、クラウドエージェント(Copilot等)と同じ動作モデルになる。
- pnpm はグローバルストア共有のため `node_modules` の実コストは小さい。
- Blenderレンダーキャッシュ(`assets/intermediate/`、gitignore済)はアートA/Bの
  ワークスペースのみ構築すればよい。他エージェントはレンダー不要
  (生成PNGはコミット済みのため pull で受領)。

## フロー: ブランチ → PR → CI → main

1. 各エージェントは自ブランチに vYYMMDDHHMM スナップショットコミットを継続
2. **1日1回以上 push → PR 作成**(溜めない。並列化の失敗パターンはほぼ「長期ブランチの巨大マージ」)
3. CI(GitHub Actions)がマージゲートを検証
4. マージ後、他エージェントは作業開始時に必ず main を自ブランチへ取り込む
5. PRベースにすることで Copilot レビュー / Codex 委任との接続も自然になる

マージ方式(squash か merge commit か)は未確定。スナップショット履歴文化を保つなら
merge commit、main を綺麗にするなら squash。

## マージゲート(統合前に必ず通すチェック)

| チェック | 対象 |
|---|---|
| `pnpm run typecheck` | 全エージェント |
| `pnpm test` | 全エージェント |
| `pnpm run assets:audit:production` | アートA/B(candidate ゼロ要求) |
| `pnpm run assets:blender:calibration` | アートA(共通基盤変更時) |

いずれもBlender実行なしでCI可能(監査はコミット済みPNGと定義の検査)。

## バイナリアセットの扱い

- `public/assets/generated/` と `assets/definitions/` へのコミットは**アートA/Bのみ**。
  直近の `.git` 肥大(213MB)の主因はPNG churn のため、コミット権を限定して抑制する。
- 担当アセットのファイル名がA/Bで重ならないため、PNG単位で排他になる。
- `manifest.json` 等の生成物はコンフリクトしてもマージせず、統合後に `assets:all` で再生成
  (キャッシュ差分レンダーのため安価)。

## エージェント間連携: requests/ 規約の一般化

既存の `requests/main2img` ↔ `requests/img2main`(依頼書↔完了報告)の実績を一般化する。

- ディレクトリ: `requests/<from>2<to>/`(例: `requests/content2sim/`、`requests/ui2sim/`)
- 依頼書: `YYYY-MM-DD-<テーマ>.md` — 目的・受け入れ条件・関連仕様を記載
- 完了報告: `YYYY-MM-DD-<テーマ>-ready.md` — 実施内容・実行コマンド・検証結果・残件
- `packages/shared` の型変更はシミュレーションエージェントが変更通知を書く

## 環境の分離

- 複数ワークスペースで同時に `pnpm run dev` するとポート衝突(5173/3000)するため、
  ワークスペースごとにポートをずらす(env 等で設定。規約詳細は運用開始時に確定)
- `saves/` は各クローンでローカルに分離(意図通り)

## その他

- リポジトリ(github.com:yuwki0131/asama)は**パブリック**(2026-07-05確認)。
  確定事項の「ローカル実行・インターネット非公開」は**ゲームを公開デプロイしない**という
  意味であり、リポジトリの可視性とは別の話。
- **Git LFSは採用しない**: publicリポジトリではLFS帯域(無料1GiB/月)が
  第三者のcloneでもオーナー負担で消費されるため、バイナリは素のgitで持つ。
  決定論レンダーにより内容不変のPNGはバイト一致(=コミット差分ゼロ)なので、
  ルック確定後のchurnは自然に収束する。
- `AGENTS.md` に「自分の担当バックログ(`future/04_agent-backlogs.md`)を読み、
  所有権外のディレクトリは触らない」ルールを追記する(運用開始時)
