# AsciiDoc Zero-Network Preview for Chrome and Edge

[English](README.md) | 日本語

[`YoshihideShirai/asciidoc-local-preview-vscode`](https://github.com/YoshihideShirai/asciidoc-local-preview-vscode)
の Chrome / Edge ブラウザー拡張版です。

`.adoc`, `.ad`, `.asciidoc`, `.asc` ファイルを、同梱されたローカルアセットでプレビューします。プレビュー処理では CDN、Kroki サーバー、リモートの図表サービスを使用しません。

## 機能

- Chrome または Edge で開いた raw AsciiDoc ドキュメントを検出し、拡張機能のビューアーへリダイレクトします。
- GitHub pull request と許可済み GitLab merge request で、変更された AsciiDoc ファイル向けに **Full diff preview** ボタンを追加します。
- ローカルファイル選択用の明示的な **Open** ボタンを提供します。
- Asciidoctor.js によりブラウザー内で AsciiDoc を変換します。
- MathJax, Mermaid, PlantUML, Nomnoml, Vega, Vega-Lite, WaveDrom, Bytefield を同梱アセットで描画します。
- `emoji:name[]` をローカル Unicode 絵文字として扱います。
- `asciidoctor-numbered-captions` による章番号対応のキャプション番号付けを適用します。
- リモート画像はデフォルトでブロックし、オプションページで完全一致ホストを許可できます。
- 同梱プレビューレンダラースクリプトの読み込み前に、ブラウザーのネットワーク API ガードを導入します。

## 開発

```sh
npm install
npm run test
```

`npm run test` は TypeScript チェック、`dist/` のビルド、no-network 監査を実行します。

ブラウザーにインストールできる zip パッケージを作成するには、次を実行します。

```sh
npm run package:zip
```

zip ファイルは `packages/` 配下に出力されます。

## 拡張機能の読み込み

1. `npm run build` を実行します。
2. `chrome://extensions` または `edge://extensions` を開きます。
3. デベロッパーモードを有効にします。
4. 生成された `dist/` ディレクトリを、展開済み拡張機能として読み込みます。
5. ローカルの `file://` プレビューを使う場合は、この拡張機能の **Allow access to file URLs** を有効にします。

## GitHub / GitLab の差分プレビュー

GitHub pull request と許可済み GitLab merge request では、拡張機能がフローティングの **Full diff preview** ボタンを追加します。クリックすると、base と head のリビジョンから変更された AsciiDoc ファイルを取得し、拡張機能ビューアーでローカルの全文 before/after プレビューを開きます。

このプレビューの対象は、`.adoc`, `.ad`, `.asciidoc`, `.asc` で終わる変更ファイルに限定されます。GitHub pull request は `github.com` でサポートされます。GitLab merge request は拡張機能のオプションに登録されたホストでのみサポートされ、`https://gitlab.com` はデフォルトで許可されています。

差分プレビューは通常の AsciiDoc プレビューと同じ同梱レンダリング処理を使用します。ローカル図表レンダラーとリモート画像ブロックも同じように適用されます。レビュー用メタデータと変更された AsciiDoc ファイル内容のネットワーク取得は、レビュー画面で **Full diff preview** をクリックした場合にだけ行われます。

## オプション

拡張機能のオプションページで、プレビューに使用する許可リストを設定できます。

| 設定項目 | デフォルト | 説明 |
| --- | --- | --- |
| Allowed remote image hosts | 空 | レンダリングされたプレビュー内でリモート画像の読み込みを許可する完全一致ホストです。ホスト名だけの入力は、そのホストの `http` と `https` の両方を許可します。URL 入力では URL のホストを使用します。それ以外のホストのリモート画像はブロックされます。 |
| GitLab full diff preview hosts | `https://gitlab.com` | **Full diff preview** ボタンを表示し、GitLab merge request のメタデータと変更された AsciiDoc ファイルを取得してよい GitLab ホストです。ホスト名だけの入力は `https` として扱われます。自己ホストの HTTP GitLab インスタンスでは `http://` を明示してください。 |

## CI/CD

GitHub Actions は push、pull request、手動実行で拡張機能をビルドして検証します。ワークフローはパッケージ化された zip を artifact としてアップロードします。

`v0.1.0` のようなバージョンタグを push すると、GitHub Release も作成または更新され、生成された zip が添付されます。

## ブラウザーに関する注意

ブラウザー拡張機能は、ブラウザーがそのファイルアクセスパスを許可していない限り、すでに開かれているドキュメントの任意の兄弟ファイルを読み取れません。インラインの図表ブロックは完全にサポートされます。ローカル図表ファイルマクロは、暗黙にディスクから読み取るのではなく、ビューアー上で利用不可として報告されます。

リモート画像は、完全一致ホストが拡張機能のオプションに登録されていない限りブロックされます。

コードレビューの全文差分プレビューはオプトインです。**Full diff preview** ボタンをクリックすると、拡張機能は GitHub (`api.github.com` と `raw.githubusercontent.com`) または許可済み HTTPS GitLab ホストから、レビューメタデータと変更された AsciiDoc の base/head ファイルを取得し、同じ同梱プレビュー処理でローカルに全文ドキュメントを描画します。GitLab.com はデフォルトで許可されています。セルフマネージド GitLab ホストは、ボタン表示または API リクエスト許可の前に拡張機能のオプションへ追加する必要があります。このレビュー専用の取得処理は、通常のローカルまたは raw AsciiDoc プレビューでは使用されません。
