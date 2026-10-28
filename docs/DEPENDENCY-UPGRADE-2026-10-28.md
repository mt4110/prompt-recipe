# 依存更新と移行検証（2026-10-28）

公開レジストリの安定版を基準に、メジャー／0.xの破壊的更新も含めて更新。プレリリースは採用しません。コード・lockfile・Rustツールチェーン・CIを同じ状態へ揃えています。アプリ版は0.2.0へ更新。マージ・署名タグ・リリース公開はこの変更の対象外です。

## 直接依存

| 対象 | 変更前 | 変更後 |
| --- | --- | --- |
| Lucide React | 0.577.0 | 1.62.0 |
| React / React DOM | 19.3.0 | 19.3.1 |
| Tauri JS API / CLI | 2.12.1 | 2.12.4 |
| Vite | 8.3.2 | 8.3.5 |
| TypeScript | 7.0.2 | 7.0.2（安定版最新、beta/nextは除外） |
| Node型定義 | 26.6.4 | 26.6.5 |
| React / React DOM型定義 | 19.3.0 | 19.3.0（安定版最新） |
| Rustコンパイラ | 検証ホストのHomebrew 1.98.1 | プロジェクトで1.99.1固定 |
| Tauri Rust | 2.12.1 | 2.12.5 |
| tauri-build | 2.7.1 | 2.7.4 |
| dialog plugin | 2.8.1 | 2.8.4 |
| clipboard-manager plugin | 2.4.1 | 2.5.0 |
| global-shortcut plugin | 2.4.0 | 2.4.1 |
| OS plugin（JS/Rust） | 2.4.0 | 2.4.0（安定版最新） |
| rusqlite | 0.40.2 | 0.41.0 |
| sha2 | 0.10.9（制約0.10） | 0.11.1 |
| serde_json | 1.0.151 | 1.0.154 |
| uuid | 1.27.0 | 1.29.0 |
| serde / quick-xml / regex | 1.0.229 / 0.42.0 / 1.13.1 | 同版（安定版最新） |

Tauriの3系はalphaで、TypeScriptの7.1系もbeta/nextだったため採用しません。間接依存は新しい直接依存の互換性制約の中で更新しました。無関係な最新メジャーを強制的に上書きするpatchは行いません。

## 移行

- [Lucide v1の移行資料](https://lucide.dev/guide/react/migration)を確認。アプリが使用するBookOpen/Folder/MessageSquare/Search等は削除対象のブランドアイコンではなく、既存のインポートを維持できました。アイコンのデフォルトaria-hiddenと可視ラベルも画面で確認しました。
- [sha2 0.11.1](https://docs.rs/sha2/0.11.1/sha2/)ではダイジェスト配列に以前のLowerHex実装を使えないため、`hash::sha256`へ小文字16進文字列の生成を集約。空入力とhello worldの既知値を固定し、プレビュー・コピー・Import・検出無視で使う既存表現を維持します。
- rusqlite 0.41.0と更新されたbundled SQLiteに対し、不変版・割当・Import/Export・トランザクションの既存試験を維持。DBスキーマの変更や既存データのリセットはありません。
- `rust-toolchain.toml` は1.99.1とrustfmt/clippyを固定。システムのHomebrew Rustやrustupのグローバルdefaultを変更しません。npmのRust関連スクリプトとTauri CLIも `rustup run 1.99.1` を通し、HomebrewのcargoがPATHの先頭でも固定ツールチェーンで実行します。
- CIは同じRustを明示導入し、全JS試験、npm audit、Rustfmt、全ターゲットClippy、Rust試験、desktop cargo checkを実行するよう更新。リモートCIの実行結果ではなく、ワークフローの変更です。

## 監査

- `npm audit`: 更新前high 1件（Viteの複数アドバイザリを集約）→ 更新後0件。
- `npm outdated --json`: 更新後 `{}`。
- `cargo-audit 0.22.2`: 脆弱性0件、警告0件。監査DBのcommitは `99670cfc0bc574433034b75876a4b791ccaa2efb`（2026-10-27更新）。
- 更新でTokioのINFO unsound警告とyank済みclipboard-win 5.4.1を解消。
- 当初残ったGLibの不健全なFFI出力引数と、保守終了したproc-macro-errorを[ローカル修正](SECURITY-PATCHES.md)で解消。警告ignore・バージョン偽装は使用していません。

cargo-auditはpath依存のソースを検査しません。0件という結果だけを修正の証拠にはせず、配布元・パッチ適用後のSHA-256照合と、最適化したGLib実行テストを併用します。さらに元のレジストリ識別子でも追加監査し、修正対象以外の新規警告があればCIを失敗させます。監査は取得時点のデータベースによる結果です。

## ローカル検証

Mac ARM64、Node 26.9.0、Rust 1.99.1で以下を確認しました。

- `npm test`: 14件成功。
- Rustのno-default-features試験: 49件成功（ライブラリ46件、別の統合試験3件）。
- Rustfmt、全ターゲットClippy `-D warnings`、TypeScript、フロントビルド、通信境界チェック。
- `npm run tauri -- build --no-bundle`: release最適化、custom-protocol付きmacOS ARM64デスクトップ実行ファイルのコンパイルとリンクまで成功。
- `glib-regression`のrelease試験3件: 文字列反復の境界・日本語・空文字・逆方向と、移行後マクロの展開・値の保持を確認。GLibネイティブライブラリ2.90.0を使用。
- 一時DBと既存ChromeのPlaywright試験: 保存しない案内、明示登録・重複防止、行フォーカスとセットの分離、マスク・明示原文コピー・無視、小窓の再開、電話/カード候補と表示の一致、ブラウザ注意文の初回限定を確認。クリップボードはスタブ、実際のOS操作とは別です。

Lucide 1系の `"use client"` がSPAバンドルでは保存されない旨のMODULE_LEVEL_DIRECTIVE警告が出ます。Server Componentsを使用する構成ではなく、ビルド・画面試験は成功しています。この警告は抑制していません。

Windows/Linuxのビルド・実機、ネイティブのOSクリップボード・グローバルショートカット、署名・notarization、リモートCIはローカル検証の対象外です。CIにはLinux上のGLib回帰試験も追加しました。
