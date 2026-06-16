# 血圧記録WEBアプリ v1

GitHub Pagesで `Blood_Pressuer.xlsx` の「記録」シートを読み込み、スマホで表とグラフを確認するための初期版です。

## ファイル構成

- `index.html`
- `style.css`
- `app.js`
- `Blood_Pressuer.xlsx` ← ご自身のExcelをこの名前で同じフォルダに置いてください

## GitHub Pagesで確認する手順

1. GitHubで新しいリポジトリを作成します。
2. このフォルダ内の `index.html`, `style.css`, `app.js`, `Blood_Pressuer.xlsx` をアップロードします。
3. GitHubの `Settings` → `Pages` を開きます。
4. `Deploy from a branch` を選び、`main` / `root` を指定します。
5. 表示されたURLをスマホで開きます。

## 注意

GitHub Pagesは静的WEBサーバなので、ブラウザからExcelファイルへ直接保存することはできません。
このv1では「Excelを読み込んで表とグラフで見る」ことを確認します。
入力データを永続保存するには、次のいずれかが必要です。

- 端末内保存: LocalStorage / IndexedDB
- GitHubへ保存: GitHub API + 認証
- Googleスプレッドシートへ保存: Apps Script
- サーバDBへ保存: Supabase / Firebase など
