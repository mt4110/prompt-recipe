# Prompt Recipe app icon v1

青いタイル、白いレシピカード、プロンプトの `>` と短い行。macOSのアプリアイコンと通常画面ヘッダーで使用する。

`source.png` はbuilt-in image_genで生成した透過背景の原本。既存の `icons/icon.png` は保持した。`generated/` はTauri CLIの標準変換出力。モバイルやWindows向けファイルが生成されるが、対応OSやビルド検証済みという意味ではない。

再生成コマンド（既存出力の変更になるため、必要時にのみ実行）：

```sh
npm exec tauri icon -- src-tauri/icons/recipe-v1/source.png --output src-tauri/icons/recipe-v1/generated
```

生成プロンプト：

> A polished macOS desktop icon for Prompt Recipe. Transparent outside a cobalt/azure rounded-square tile. A warm white recipe card with a small folded corner, a bold blue greater-than chevron and one short horizontal line. Front-facing, centered, generous whitespace, recognizable at small sizes. Gentle blue gradient and restrained tactile depth. No lettering, app name, robot, utensils, sparkle, watermark or mockup.

新規画像生成を使用。外部のブランドマークや既存アプリのアイコンを参照素材として使用していない。
