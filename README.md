# Myダイエット記録

食事・体重・運動を記録するダイエットアプリです。  
データ保存は **Supabase**、AI 評価は **Gemini** を使います。

---

## 本番公開の手順（Supabase + Vercel）

Takeさん・なべさん流の **Supabase** 構成です。

### ステップ1：Supabase プロジェクトを作る

1. [Supabase](https://supabase.com/) にログイン
2. **New project** でプロジェクトを作成

### ステップ2：データベースを用意する

1. 左メニュー **SQL Editor** を開く
2. `supabase/schema.sql` の内容をコピーして **Run** する

### ステップ3：匿名ログインを有効にする

1. 左メニュー **Authentication** → **Providers**
2. **Anonymous sign-ins** を **Enable** にする

### ステップ4：API キーを取得する

1. 左メニュー **Project Settings** → **API**
2. 次の2つをコピー
   - **Project URL**
   - **anon public** キー

### ステップ5：Gemini API キーを取得する

1. [Google AI Studio](https://aistudio.google.com/apikey) で API キーを作成

### ステップ6：`.env` を作る

```bash
cd ~/my-diet-app
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GEMINI_API_KEY=your-gemini-key
```

### ステップ7：ローカルで確認

```bash
npm install
npm run dev
```

### ステップ8：Vercel で公開（スマホから使える URL を作る）

1. [Vercel](https://vercel.com/) にログイン
2. GitHub にプロジェクトを push して Vercel と連携  
   または Vercel CLI で `vercel` を実行
3. 環境変数に `.env` と同じ3つを設定
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GEMINI_API_KEY`
4. デプロイ後、表示された URL をスマホで開く

### ステップ9：ホーム画面に追加

- **iPhone**：Safari → 共有 → ホーム画面に追加
- **Android**：Chrome → ホーム画面に追加

---

## ローカル開発

```bash
npm install
npm run dev
```

Supabase 未設定の場合は **デモモード**（データは保存されません）。

---

## 構成

| 役割 | サービス |
|------|----------|
| データ保存 | Supabase（PostgreSQL） |
| ログイン | Supabase 匿名認証 |
| AI 評価 | Gemini API |
| 公開 | Vercel など |

---

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| データが保存されない | `.env` の Supabase 設定を確認。`schema.sql` を実行済みか確認 |
| ログインエラー | Authentication → Anonymous sign-ins が有効か確認 |
| AI 評価が動かない | `VITE_GEMINI_API_KEY` を確認して再デプロイ |
| デモモードの表示 | Supabase の URL と anon キーが未設定 |
