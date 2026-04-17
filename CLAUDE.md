# Retaining Wall Karte Editor

## プロジェクト概要
鉄道**擁壁（土留め構造物）**点検用のExcelフォーム（調査票）を現場で編集できるPWAアプリ。
`slope-karte-dx`(斜面カルテ)の**亜種**として構築する。Excel職人が作成した既存テンプレートをソースオブトゥルースとし、
現場で写真撮影・コメント入力・損傷図手書きし、そのままExcelに保存できることが最大の価値。

### ベースプロジェクト
- `slope-karte-dx` (/Users/kiyoshiinuzuka/slope-karte-dx)
- 単一ファイル構成（index.html にHTML/CSS/JS全含む）、ExcelJS＋xlsx-populate＋JSZip、Capacitor 6、IndexedDB、Google Drive API
- 既存機能（ExcelJS列幅保全、PIN暗号化、IndexedDB自動保存、Google Drive連携、Capacitorネイティブ対応）はそのまま流用

### 擁壁版との主な違い
| 項目 | slope-karte-dx (斜面) | retaining_wall (擁壁) |
|------|----------------------|---------------------|
| 編集対象シート | `BL瑜18 Photo` のみ | `調査票 (2)` / `損傷図 (2)` / `Photo(2)` の**3シート** |
| 写真の格納方式 | Excel内埋め込み画像 | **セル値としてパス文字列** (`"Z:\...\*.JPG"`) ※要置換 |
| 写真枠のラベル | 五十音 (ア,イ,ウ...) | **通し番号** (BL列に 1,2,3...) |
| ページ構成 | 単一長大シート | **69行ごとにページヘッダ繰り返し** (「調査結果写真」) |
| 列スパン | A(col1), V(col22), AQ(col43) 各19列 | A(col1), V(col22), AQ(col43) 各21列 |
| 画像配置 | ラベル行の直上 | コメント行の**24行上**（B列/W列/AR列、行4/37/...） |

## Excelテンプレート構造（実測）

### シート一覧
| シート名 | 用途 | max_row × max_col | 編集対象 |
|---------|------|------------------|---------|
| 表紙2 | 表紙 | 21 × 23 | - |
| 平面図 (2) | 平面図・メタ情報マスタ | 54 × 41 | - |
| **調査票 (2)** | 変状記録表 | 70 × 66 | ✅ |
| **損傷図 (2)** | 劣化損傷図＋写真位置図 | 615 × 41 | ✅ |
| **Photo(2)** | 調査写真シート | 1449 × 64 | ✅ |
| Photo123 | Photo(2)の参照ソース | 1449 × 63 | - |
| 選択 (2) | プルダウン選択肢 | 329 × 28 | - |

多くのセルは `='平面図 (2)'!xxx` 参照でメタ情報を共有している。

### 調査票 (2) の構造
- 変状ごとの行を追加・編集する表形式
- 列: `変状・変化の種類 / 変状番号 / 発生キロ程 / 位置・方向 / 程度 / 規模 / 箇所数 / 目測値・状態 / 写真番号` など
- 結合セル 405個（フォーム罫線）
- 写真番号列が **Photo(2) と連携**する設計

#### プルダウン（データ検証）
- `<extLst>` 以下の **Excel 2010 拡張 `x14:dataValidation`** として 23 件格納（シートXML直読みで確認）
- 参照は `'選択 (2)'!$A$4:$A$6` のような**直接セル参照**（Named Range 経由ではない）
- 主要マッピング:
  | セル範囲 | 参照先 | 意味 |
  |---------|--------|------|
  | `G8:H8`, `G11:H11`, `G13:H16` | `'選択 (2)'!$A$4:$A$6` | 位置・方向 |
  | `I8`, `I11`, `I13:I16` | `'選択 (2)'!$B$4:$B$6` | 程度 |
  | `L8`, `L11`, `L13:L16` | `'選択 (2)'!$C$4:$C$6` | 規模 |
  | `G17:H19` → `'選択 (2)'!$A$14:$A$15` ほか変状種別ごとに別ブロック参照 |
- `#REF!` になっている Named Range (`ひび割れ位置` 等) は**残骸で実害なし**。プルダウンは直接セル参照なので正常動作
- openpyxl は DV extension を警告して捨てるので、解析は **JSZip で `xl/worksheets/sheet*.xml` を直パース**する必要あり

### 損傷図 (2) の構造
- 615行の縦長シート（おそらく複数ページの図面展開）
- 平面図・断面図＋写真位置マーカーを重ねる用途
- 手書き（スタイラス/Apple Pencil, PointerEvent）での注記が主機能になる見込み
- 実装方針: 既存画像レイヤの上に `<canvas>` で手書きオーバーレイ → 保存時に画像化してExcel埋め込み

### Photo(2) の構造（重要）
- **3列レイアウト**: col 1(A) / col 22(V) / col 43(AQ) — 各21列分
- **ページヘッダ**「調査結果写真」が F列(col 6) の rows `2, 71, 140, 209, 278, 347, 416, 485, 554, 623, 692, 761, 830, 899, 968, 1037, 1106, 1175, 1244, 1313, 1382` に出現（**21ページ、69行周期**）
- **写真フレーム**: 1ページあたり最大 2行 × 3列 = 6枠。イメージセル位置:
  - 1ページ目: `B4 / W4 / AR4` (上段), `B37 / W37 / AR37` (下段)
  - 2ページ目: `B73 / W73 / AR73`, `B106 / W106 / AR106`
  - ...以下 69 行周期で繰り返し
- **コメント行**: イメージ行 + 24 行 (例: 画像 B4 → コメント A28)
- コメント形式: `(コメント)\n本文...` (slope-karteと同じ)
- **画像の格納(訂正)**: 当初「パス文字列のみで埋め込みなし」と見ていたが、実際は**両方同時に存在**:
  - `xl/drawings/drawing3.xml` に 91 個の `twoCellAnchor` が定義され、画像は **埋め込まれている** (55 media ファイル、合計 4.77 MB)
  - 同時に、画像の張られたセル位置 (B4 等) に **sharedString 参照のパス文字列** (`"Z:\...\*.JPG"`) も格納されている（代替テキスト/印刷時ラベル相当）
  - openpyxl は DrawingML 警告を出して images=0 と返してしまうが、ExcelJS/JSZip で見れば画像は存在
  - したがって UI の「link lost」判定は `画像 なし && パス文字列 あり` の時のみ成立 (約 35 枠想定)
- **通番**: BL列 (col 64) の値はページ内ローカル行番号 (34行周期でリセット) で、フレーム通番ではない → UI ラベルは通し番号 1..126 を採用
- 実データ件数: 126 フレーム中、埋め込み画像 91 枠 + パス文字列のみ ≈35 枠

### ⚠️ パフォーマンス上の既知課題
- `sheet5.xml` (Photo(2)) は **92,694 セル**、`sheet6.xml` (Photo123) は **91,287 セル** と非常に密度が高い (1449 行 × 64 列がほぼ full populated)
- **重要**: Claude Preview の iframe/eval 環境では擁壁 Excel (5.7MB) も **slope-karte Demo (4.6MB) も** 3分経っても `ExcelJS.xlsx.load()` が終わらない。slope-karte は本番で動いているため、**preview 環境固有のサンドボックス遅延**の可能性大。実ブラウザでの検証が必要
- Phase 1g (実装済み): ロード前に `Photo\d+$` パターンのレガシーシート (Photo123) を JSZip で空 worksheet スタブに置換し、保存時に原本 XML を復元する。ロジックとしては ExcelJS のパース対象セルを半減できる見込み
- さらなる対策候補 (実ブラウザでも遅い場合):
  - (a) JSZip + 手動 XML パースで必要シートだけ読む (selective loading)
  - (c) Web Worker にロードを逃がして UI ブロックを回避
  - (d) 別ライブラリ検討 (xlsx/SheetJS の方が速いケースあり)

## フィールドで編集する3シートの実装優先度
1. **Photo(2)** — slope-karte とほぼ同じUIで流用できる。**最初に完成**させる
2. **調査票 (2)** — フォーム入力UI（新規、slope-karteにはない）
3. **損傷図 (2)** — 手書きキャンバス（新規、slope-karteの将来機能として計画されていた）

## インフラ・運用ルール

### 🚫 絶対禁止
- **Excelファイル（.xlsx/.xlsm/.xls/.xlsb）を Git にコミットしないこと**
  - `.gitignore` で全拡張子をブロック済み
  - テンプレートの原本は別途 Google Drive / ローカル管理
  - テスト用サンプルもコミット禁止（外部で管理するか、完全ダミーの最小ファイルに限定）

### リポジトリ
- GitHub: `kiyoshi-terrain/retaining_wall_karte_editor`
- ブランチ戦略: main = 本番、機能ブランチから PR

### デプロイ（予定、slope-karte-dxに準拠）
- Web(PWA): Cloudflare Pages + Cloudflare Access
- ネイティブ: Capacitor 6 (iOS/Android)
- バンドルID(仮): `jp.retainingwallkarte.app`

## 技術スタック（slope-karte-dx 踏襲）
- HTML5 / JavaScript / CSS（フレームワーク不使用、単一ファイル構成）
- Capacitor 6 — ネイティブアプリ化
- ExcelJS 4.4.0 (CDN) — Excel読み書き
- xlsx-populate 1.21.0 (CDN) — AES-256 暗号化/復号
- JSZip 3.10.1 (CDN) — ZIP シート参照修正
- Web Crypto API — PIN認証 (SHA-256)
- IndexedDB — ローカル自動保存
- PointerEvent API — スタイラス手書き

## 実装ロードマップ
### Phase 0: 基盤（slope-karte-dx から移植）
- [ ] `index.html` のコピー＆擁壁向けリブランディング
- [ ] 定数の書き換え（bundleId, IDB_NAME, GDRIVE_SHARED_FOLDER_ID など）
- [ ] ExcelJS列幅保全ロジックをそのまま移植

### Phase 1: Photo(2) シート
- [ ] シート自動検出 (`"Photo"` 含む & `"fig"`/`"123"` 含まない)
- [ ] 3列×ページ構造の解析（69行周期ページヘッダ基準）
- [ ] パス文字列セルを「未撮影枠」として認識
- [ ] カメラ撮影→画像をExcel埋め込み、BL列に通番記入
- [ ] コメント編集（`(コメント)\n...` 形式）
- [ ] 列幅保全

### Phase 2: 調査票 (2) シート
- [ ] 変状行のフォームUI（選択(2)シートの選択肢をプルダウンに）
- [ ] 写真番号 ↔ Photo(2) 通番の連携

### Phase 3: 損傷図 (2) シート
- [ ] 既存図面の画像化表示
- [ ] `<canvas>` オーバーレイで手書き
- [ ] 保存時に画像として埋め込み

## コーディング規約（slope-karte-dx 踏襲）
- 単一ファイル構成（index.html に全含む）
- CDN経由でライブラリ読込（ビルドツール不使用、Capacitorのnpmのみ）
- iOS / Android / Web 全対応、タッチUI / safe-area 対応
- プラットフォーム分岐: `isNative` (Capacitor) / `supportsFileSystemAccess` (Web FSA)
- ダークテーマ（背景 #1a1a2e, カード #2a2a4a, アクセント #667eea）

---

## 実装進捗 (2026-04-17 現在)

### 本番稼働中の機能
- **GitHub Pages デプロイ**: `https://kiyoshi-terrain.github.io/retaining_wall_karte_editor/` (パブリック、フィールドテスト用)
- **Service Worker**: オフライン動作可、キャッシュ名 `rw-karte-v16-lens-picker` で都度 bump してキャッシュ更新
- **PWA**: `manifest.json` + `icon-192/512.png` でホーム画面追加対応

### Phase 1 (Photo(2)) - 完成
- ✅ Photo(2) 自動選択 (`Photo(N)` 形式優先、Photo123 除外)
- ✅ パーサー: 126フレーム(21ページ×6枠)、パス文字列 + 埋込画像両対応
- ✅ Link-lost UI (画像なし + パス文字列あり の枠を黄色表示)
- ✅ **Delta save**: 原本 zip を JSZip で直接編集、ExcelJS writeBuffer は呼ばない
- ✅ 画像配置: twoCellAnchor + a:xfrm でアスペクト保持
- ✅ Retake: `<xdr:pic>` のみ座標マッチで削除、図形(`<xdr:sp>`)は温存
- ✅ コメント保存 (inline string `(コメント)\n...`)
- ✅ ファイル名書き込み (画像セルに裸のファイル名)、再ロードで復元
- ✅ **Excel 図形レンダリング**: drawing3.xml の `<xdr:sp>` / `<xdr:cxnSp>` を抽出し、Canvas で写真に合成表示 (フリーフォーム/rect/ellipse/line 対応)

### 撮影機能
- ✅ ネイティブカメラ (file input) + 正規化 + EXIF GPS 注入 + IDB raw 保存 + Drive raw アップ
- ✅ GPS/EXIF/IDB/Drive をバックグラウンド化 (UI ブロック回避)
- ✅ **オーバーレイカメラ** (`getUserMedia` + 前回写真半透明)
  - 重ねる/並列 2 モード切替
  - ズームスライダー (ハードウェアズーム, `applyConstraints({ zoom })`)
  - 画質プリセット (960 / 1280 / 1920 / 2560 / 3840)
  - レンズ切替 (メイン / 広角 / 望遠 / 統合、`enumerateDevices()` ベース)

### 保存機能
- ✅ Save: FSA + Capacitor + IDB に多層保存 (Drive は触らない)
- ✅ **Drive ↑**: メニューから既存 Drive ファイルを上書き
- ✅ **Drive ↑ (as...)**: カスタム名で新規アップロード、元ファイル温存
- ✅ **Drive auto-backup**: トグル ON で通常 Drive 保存時に timestamped コピー追加
- ✅ **Save As (local)**: iPad Safari でも動作する prompt モーダル + IDB + ブラウザダウンロード
- ✅ PIN 暗号化 (xlsx-populate AES-256)
- ✅ Excel 破壊対策 (validateXlsxBlob 構造検証 + IDB 5世代ローリングバックアップ)
- ✅ Pristine 原本バックアップ (ロード時 IDB 専用枠に永続保存)

### 損傷図 (Phase 3)
- ✅ ページ分割表示 (5ページ縦連結ではなく Prev/Next ナビゲーション)
- ✅ Add memo (per-page 手書き、delta save 経由で追加)
- ✅ **iPad 手書き改善**: パームリジェクション、DPR 対応、予測イベント、筆圧 sqrt カーブ

### Phase 2 (調査票) - 未着手
- [ ] 変状行のフォームUI (選択(2)シートのプルダウン連携)
- [ ] 写真番号 ↔ Photo(2) 通番の連携

## 既知の制約・TODO
- Excel 図形レンダリングの座標系は列幅 304000 EMU / 行高 190500 EMU を固定前提。実ファイルでズレあれば要調整
- Cloudflare Pages への正式デプロイ (Access 保護) 未着手
- Capacitor ネイティブビルド (iOS/Android) 未生成 (必要なら `npm run cap:sync` → Xcode/Android Studio)
- 写真撮影の最大解像度は 4K (3840×2160)。ネイティブカメラと違いセンサー max には届かない

## セッション引き継ぎ時のチェック順序
1. `git log --oneline | head -20` で直近の変更履歴確認
2. Service Worker キャッシュ名 (`service-worker.js` の `CACHE_NAME`) を見て現在のバージョン把握
3. iPad フィールドテストのフィードバックを起点に次タスク決定
