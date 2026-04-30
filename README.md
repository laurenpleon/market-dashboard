# Market Dashboard — Coverage Intelligence Tool

A lightweight tool for tracking analyst coverage and matching news alerts to the right people.

## Deploy to Vercel (5 minutes, free)

### Option A: Drag & Drop (easiest)
1. Go to [vercel.com](https://vercel.com) and sign up / log in (free)
2. Click **"Add New Project"**
3. Choose **"Deploy from your computer"** and drag this entire `market-dashboard` folder
4. Vercel will auto-detect it as a Vite/React app
5. Click **Deploy** — you'll get a live URL like `https://market-dashboard-xyz.vercel.app`

### Option B: Via GitHub (recommended for updates)
1. Create a free GitHub account at github.com
2. Create a new repository and upload this folder
3. In Vercel, click "Import Git Repository" and connect your GitHub
4. Vercel will auto-deploy every time you push changes

## Local Development

```bash
npm install
npm run dev
```
Then open http://localhost:5173

## How to Use

1. **Setup tab** — paste your CSV with columns: `user_id, name, ticker, company, industry`
   - Use multiple rows per user for multiple tickers
   - Keep names anonymous with User1, User2, etc.
2. **Alerts tab** — paste a news headline; the tool matches it to covered analysts
3. **Dashboard** — see who to reach out to, draft emails, mark as contacted
4. **Coverage** — view your full analyst/ticker database

## CSV Format

```
user_id,name,ticker,company,industry
User1,Analyst A,AAPL,Apple Inc,Consumer Technology
User1,Analyst A,MSFT,Microsoft Corp,Enterprise Software
User2,Analyst B,JPM,JPMorgan Chase,Banking & Finance
```

## Notes
- All data is saved in your browser's localStorage — nothing is sent to any server
- Data persists between visits on the same browser/device
- To use on multiple devices, re-paste your CSV on each device
