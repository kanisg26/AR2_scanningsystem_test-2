# AR2_scanningsystem_test-2

配管経路記録（Web 版）の社内デモ配信用リポジトリです（GitHub Pages）。

## 配信用の追加

配信用の追加：kokuban-link.js と index.html の1行。元ソース（PipeScannerWebChrome）にはない。差し替え時は新しい Web アプリに正式に組み込む。

| 追加 | 内容 |
|------|------|
| `kokuban-link.js` | ヘッダーに「黒板」ボタンを差し込み、`./kokuban/` へ移る |
| `index.html` の1行 | `<script src="kokuban-link.js" defer></script>`（`js/main.js` の行の次） |
| `kokuban/` | 電子小黒板（kokuban）のビルド結果。ソースは非公開リポジトリ。版とビルド日時は `kokuban/README.md` |

既存の `js/`・`css/` は変更していない。

### 元ソースへ戻すときの手がかり

- **差し込み先**：`#app-header .header-actions` の先頭（「設定」の左）。見た目は既存の `#app-header button` の CSS をそのまま使い、幅 360px でもタイトルや既存のボタンが折り返さないよう、このボタンだけ左右の余白を詰めている（インラインの style。幅 44px）。要素が見つからなければボタンは出ない（何もしない）。
- **AR 中に出さない仕組み**：`js/main.js` が AR 開始時にヘッダーを隠す処理（217–218 行：`$('app-main').hidden = true;`・`$('app-header').hidden = true;`）と、終了時に戻す処理（250–252 行：`ar-overlay`・`app-main`・`app-header` の `hidden` を戻す）に依存している。念のため `kokuban-link.js` でも `#ar-overlay` の `hidden` を監視し、AR 用の表示が出ている間はボタンを隠す。行番号はコミット `cd0c042` 時点の `js/main.js`。
- **未保存の確認**：スキャン側は「保存」を押したときだけ localStorage（`pipe_scanner_project`）に保存する。移動前に `#point-count` の表示（「(N点)」）から点数を読み、0 点と読めたとき以外（1点以上、要素がない、数が読めない）は確認を出す。
- 正式に組み込むときは、表示の切り替え・点数・保存状態を `main.js` から直接扱うのが望ましい。

## kokuban の更新

kokuban リポジトリで `corepack pnpm export:demo` を実行し、`out/kokuban/` をこのリポジトリの `kokuban/` だけに反映する（`robocopy <kokuban>\out\kokuban .\kokuban /MIR`）。他のファイルには触れない。
