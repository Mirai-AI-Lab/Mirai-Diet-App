# ダイエットアプリ Phase 1 接続マニュアル

**ゴール**：家計簿と同じ型で、**LINE → Vercel → GAS → スプシ** までつなぎ、**記録が1件保存できる** 状態にする。

**Phase 1でやらないこと**（Phase 3以降）：インボディ写真AI読取・伴走型コメント・目標タブ

**参照**
- 画面：`index.html`（Vercel用）／`diet_index.html`（開発用・中身同じ）
- GAS：`gas/Code.gs`
- 家計簿の手順詳細：`../家計簿アプリ/マニュアル_家計簿アプリの作り方.md`

---

## 重要：家計簿と別物として作る

| 項目 | 家計簿 | ダイエット |
|------|--------|-----------|
| スプレッドシート | 家計簿用（既存） | **新規作成** |
| GAS | 家計簿用（既存） | **新規デプロイ** |
| GitHub | My-budget-App | **Mirai-Diet-App（新規）** |
| LINE公式 | 家計簿用 | **ダイエット専用（新規）** |

`memo.text` に家計簿のIDが入っていたら **使わない**。ダイエット専用で取り直す。

---

## 進捗チェック（Phase 1 完了条件）

- [ ] Step 1〜3：スプシ＋Driveフォルダ＋IDメモ
- [ ] Step 4：GASデプロイ＋exec URLメモ
- [ ] Step 5〜6：GitHub新規＋Vercel連携（404までOK）
- [ ] Step 7〜8：LINE公式＋LIFF＋Webhook
- [ ] Step 9：`index.html` の LIFF_ID / GAS_URL 差替＋push
- [ ] Step 10：スマホから **体重 or お通じを1件** 保存→スプシに1行増える

---

## Step 1：スプレッドシートを新規作成

1. Googleドライブ → **新規** → **Googleスプレッドシート**
2. 名前例：`みちこ健康管理_記録`
3. 中身は **空でOK**（「ユーザー」「記録」シートはGASが初回保存時に自動作成）

※ 家計簿の配布スプシをコピー **しない**（列構成が違うため）。

---

## Step 2：スプレッドシートIDをメモ

1. 作成したスプレッドシートを開く
2. URLから **`/edit` の直前** をコピー

```
https://docs.google.com/spreadsheets/d/【ここがID】/edit
```

3. `memo.text` の「スプレッドシートID」に貼る

---

## Step 3：Google Driveに写真フォルダを作る

1. **マイドライブ** → **新規フォルダ**（例：`ダイエットアプリ_写真`）
2. フォルダを開き、URLの **`folders/` の後ろ** がフォルダID

```
https://drive.google.com/drive/folders/【ここがフォルダID】
```

3. `memo.text` に貼る

---

## Step 4：GASの設定とデプロイ

### 4-A. プロジェクト作成

**方法A（おすすめ）**：スプレッドシート → **拡張機能** → **Apps Script**

**方法B**：https://script.google.com → 新規プロジェクト

### 4-B. コードを貼る

1. エディタの `Code.gs` を **すべて削除**
2. プロジェクト内の `gas/Code.gs` の内容を **丸ごとコピー＆ペースト**
3. 先頭2行を自分のIDに差し替え：

```javascript
const SHEET_ID = "Step2でメモしたID";
const DRIVE_FOLDER_ID = "Step3でメモしたID";
```

4. **保存**（フロッピーディスク）

### 4-C. Gemini APIキー（AI分析用・後からでも可）

記録だけ先に試すなら **スキップ可**。サマリーの「AIに分析してもらう」を使うときに設定。

1. GASエディタ → **プロジェクトの設定**（歯車）
2. **スクリプト プロパティ** → **プロパティを追加**
   - プロパティ：`GEMINI_API_KEY`
   - 値：Google AI Studio で取得したキー
3. **コード内にAPIキーを直書きしない**

### 4-D. デプロイ

1. 右上 **デプロイ** → **新しいデプロイ**
2. 種類：**ウェブアプリ**
3. 設定：
   - 説明：`diet v1`
   - 実行ユーザー：**自分**
   - アクセス：**全員**
4. **デプロイ** → 初回は **アクセスを承認**
   - 「Googleはこのアプリを検証していません」→ **詳細** → **（プロジェクト名）に移動**
5. **ウェブアプリ URL**（`.../exec`）をコピー → `memo.text`

⚠️ コードを直したら **デプロイ → デプロイを管理 → 鉛筆 → 新しいバージョン** で再デプロイ。

---

## Step 5：GitHubに新規リポジトリ

1. https://github.com → **New repository**
2. 名前例：**Mirai-Diet-App**
3. **Create repository**（READMEだけでOK）

4. ローカルフォルダのリモートを差し替え（今は家計簿 repo を向いている可能性あり）：

```bash
cd "04_AI実践起業塾/app/ダイエットアプリ"
git remote set-url origin https://github.com/Mirai-AI-Lab/Mirai-Diet-App.git
```

5. `memo.text` に GitHub URL をメモ

---

## Step 6：VercelとGitHub連携

1. https://vercel.com にログイン（家計簿と同じアカウントでOK）
2. **Add New → Project**
3. **Mirai-Diet-App** を Import → **Deploy**

#### 404が出たら正常

GitHubにまだ `index.html` が無い段階では **404 Not Found**。連携できていればOK。

4. **Domains** の URL（例 `mirai-diet-app.vercel.app`）を `memo.text` にメモ  
   → 後で **LIFFのエンドポイント** に使う

---

## Step 7：LINE公式アカウント（ダイエット専用・新規）

家計簿用とは **別アカウント** を作る（TAKEさんの型）。

1. LINE Official Account Manager → **新規作成**
2. 名前例：**みちこ健康管理** / **ダイエット記録**
3. 業種：**個人・その他**
4. 設定：
   - 挨拶メッセージ：**オフ**
   - **Messaging API：利用する**
5. LINE Developers コンソールへ

---

## Step 8：LINE Developers

### 8-A. Webhook

1. **Messaging API** チャネル → **Webhook URL**
2. Step 4 の **GAS exec URL** を貼る
3. **Webhookの利用：オン**

### 8-B. LINE Loginチャネル（新規）

1. **新規チャネル** → **LINE Login**
2. **Webアプリ** にチェック
3. 作成

### 8-C. LIFF

1. LINE Loginチャネル → **LIFF** → **追加**
2. 名前：健康管理 など
3. サイズ：**Full**
4. **エンドポイントURL** → Step 6 の **Vercel URL**（404でもそのURL）
5. **OpenID・profile・友だち追加オプション（Aggressive）** — **3つともチェック**
6. **LIFF ID** と **LIFF URL** を `memo.text` へ

### 8-D. チャネルを「公開」

開発中 → **公開** に変更

### 8-E. リッチメニュー

1. Official Account Manager → **リッチメニュー**
2. ボタン例：**健康管理を開く**
3. リンク：**LIFF URL**（`https://liff.line.me/...`）

---

## Step 9：index.html をGitHubに載せる

1. `index.html` を開き、2か所を **memo.text の値** に差し替え：

```javascript
const LIFF_ID = "あなたのLIFF ID";
const GAS_URL = "あなたのGAS exec URL";
```

2. GitHubへ push：

```bash
cd "04_AI実践起業塾/app/ダイエットアプリ"
git add index.html gas/Code.gs memo.text
git commit -m "Phase 1: ダイエットアプリ接続用 index.html と GAS"
git push -u origin main
```

3. **1〜2分待つ** → Vercelが更新 → 404が **ダイエット画面** に変わる

※ Cursorに「Phase 1用に push して」と頼んでもOK（LIFF_ID / GAS_URL は先に自分で入れておく）。

---

## Step 10：動作確認（Phase 1 完了テスト）

1. スマホのLINE → ダイエット用公式 → リッチメニュー
2. 画面が開く（LIFFログイン）
3. **お通じ** → あり → **記録する**
4. スプレッドシートの **記録** シートに **1行増えたか** 確認
5. **履歴** タブに表示されるか確認

余裕があれば **食事（写真1枚）** も試す → Driveフォルダに画像が増えるか。

---

## つまずき辞書

| 症状 | 対処 |
|------|------|
| Vercel 404 | `index.html` が repo ルートにあるか。push 後1〜2分待つ |
| 保存できない | `GAS_URL` 間違い、GAS **再デプロイ** 忘れ |
| LIFF真っ白 | LIFF 3チェック、チャネル **公開**、エンドポイントURL |
| 家計簿データが混ざる | **スプシ・GAS・LINEを家計簿と共有していないか** 確認 |
| AIだけ動かない | スクリプトプロパティ `GEMINI_API_KEY`（記録はキー無しでも可） |

---

## Phase 1 のあと（予告）

| Phase | 内容 |
|-------|------|
| Phase 2 | 2週間、食事・カーブス・お通じを実運用 |
| Phase 3 | インボディ **写真だけ** ＋ AI読取 |
| Phase 4 | ChatGPT型 **伴走コメント** |

---

## Cursorへの頼み方

```
04_AI実践起業塾/app/ダイエットアプリ/マニュアル_Phase1_接続手順.md を読んで、
Step 9 の push まで一緒に進めて。LIFF_ID と GAS_URL は memo.text の値を使って。
```

---

*2026-05-22 初版（みちこ版 Phase 1）*
