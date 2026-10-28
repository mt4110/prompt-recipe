# GTK経路のセキュリティ修正

Tauri 2のLinux向けGTK3依存はGLib 0.18に固定されており、GLib 0.20への単純な置換はABIとRustの型の互換性を保証できません。Tauri 3もまだalphaのため、必要な3クレートのみをMITライセンス・COPYRIGHTとともに `src-tauri/vendor/` へ同梱し、`[patch.crates-io]` で置き換えます。配布元のバージョン番号は維持します。

## 修正内容

- `glib 0.18.5`: [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)。[上流PR #1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343)に合わせ、`VariantStrIter::impl_get` のポインタ変数を `let mut p`、FFIへの出力引数を `&mut p` に修正します。共有参照の指す変数を書き換える未定義動作を除去します。
- `glib-macros 0.18.5` と `gtk3-macros 0.18.2`: [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html)の保守終了依存を除去し、[proc-macro-error3 3.1.1](https://docs.rs/crate/proc-macro-error3/3.1.1)へ移行。依存名・Rustの参照名を揃え、両クレートが使用するsyn 2に合わせ `default-features = false, features = ["syn2-error"]` を指定します。proc-macro-error2も保守終了しているため採用しません。

## 来歴と確認

`vendor/PATCHES.json` には、元のcrates.io配布アーカイブのSHA-256、元の全ファイルのSHA-256、変更したファイルのSHA-256を記録します。Cargo.toml.origは配布元の記録として残しています。

```sh
# オフライン: 同梱ファイル・必要な修正・lockfileを照合
python3 scripts/check-vendor-patches.py
# オンライン: 元アーカイブのチェックサムと元の全ファイルも照合
python3 scripts/check-vendor-patches.py --upstream --audit-upstream
rustup run 1.99.1 cargo test --manifest-path src-tauri/Cargo.toml -p glib-regression --release --locked
cargo audit --file src-tauri/Cargo.lock --deny warnings
```

`--audit-upstream` は、実際のlockfileを変更せず、標準入力上で同梱3クレートを元のレジストリ識別子へ戻して追加監査します。固定差分で解消したGLibの既知の1件以外に、新しい脆弱性・警告・yankがあれば失敗します。path依存にしたことで将来の警告まで見えなくなることを防ぎます。先に通常のcargo auditでDBを更新してください。

Python 3.11以上、cargo-audit 0.22.2を使用します。GLib試験にはpkg-configとネイティブGLib開発ライブラリが必要です（Linux: libglib2.0-dev、Mac: glib）。アプリの通常ビルド・テストにはこの試験用依存を追加しません。専用workspaceメンバーを明示指定したときだけ有効です。

macOS ARM64、Rust 1.99.1、GLib 2.90.0で最適化した回帰試験3件が成功。前進・後退・nth・nth_back・last・空配列・空文字・日本語と、GLibのBoxedマクロ展開・値の保持を検証しました。gtk3-macrosも試験パッケージの依存としてコンパイルします。GTKウィジェットのマクロ展開やLinuxのアプリ全体の動作確認とは区別します。CIにはUbuntu上で同じGLib回帰試験を実行するジョブを追加しています。

cargo-audit 0.22.2はpathクレートを既知アドバイザリの照合対象から除外します。監査の0件をソース修正の証明として扱わず、上記の固定差分の検査と回帰試験を必須にします。ignore指定や架空の修正版番号は使いません。

## 保守上の制約

同梱した3クレートの修正保守をこのリポジトリで引き受けます。GLib 0.18自体の上流サポートが復活したことを意味しません。Tauri側が対応したときは同梱の必要性を再評価し、次回の依存更新でも新しいアドバイザリと上流変更を確認します。依存修正の試験では、古い上流ソースに新しいRustの通常コンパイラ警告が出ます。これは今回の監査警告2件とは別で、抑制していません。
