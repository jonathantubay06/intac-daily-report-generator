# Deploy Guide

End-to-end: a working daily report tool in ~20 minutes.

## 0. One-time CRM prep

Create a dedicated CRM user named **`Reporting Bot`** with read access to the Daily Report page. This keeps the bot's password isolated from anyone's personal account.

Note the password — you'll paste it into Render env vars in step 2.

---

## 1. Push to GitHub

From `report-generator/`:

```bash
git add .
git commit -m "Initial scaffold"
gh repo create intac-report-generator --private --source=. --push
```

(or create the repo on github.com and push manually.)

---

## 2. Deploy the worker to Render

1. Log into [render.com](https://render.com) → **New +** → **Blueprint**
2. Connect the GitHub repo you just pushed
3. Render will detect `worker/render.yaml`. Confirm.
4. Set these env vars (Render will prompt for the `sync: false` ones):
   - `CRM_USER` → `Reporting Bot`
   - `CRM_PASSWORD` → the bot password from step 0
   - `TEAM_PASSWORD` → pick a strong password — this is what teammates type on the Netlify site
   - `ALLOWED_ORIGINS` → `https://<your-netlify-site>.netlify.app` (fill after step 3)
   - `MAIL_FROM` → `Jonathan Tubay <jonathan@sentrystrategy.com>`
5. Deploy. Wait for the service to go green. Copy the URL — looks like `https://intac-report-worker.onrender.com`.
6. Smoke test: open `https://<your-worker>.onrender.com/health` — should return `{"ok":true}`.

> **Free tier note:** the service sleeps after ~15 minutes of inactivity. First request of the day takes ~30s to wake. Subsequent requests are instant.

---

## 3. Deploy the frontend to Netlify

1. In `frontend/config.js`, replace `http://localhost:3001` with your Render URL from step 2.
2. Commit and push.
3. On [netlify.com](https://netlify.com) → **Add new site** → **Import from Git** → pick the repo
4. Build settings:
   - Base directory: `frontend`
   - Publish directory: `frontend`
   - Build command: *(leave blank)*
5. Deploy. Copy the Netlify URL.
6. Go back to Render → update `ALLOWED_ORIGINS` to include the real Netlify URL → redeploy.

---

## 4. First run

1. Open the Netlify URL
2. Enter the `TEAM_PASSWORD`
3. Click **Generate Non-GA**
4. First run: ~30s while Render wakes up + ~10s to log into the CRM and scrape
5. Preview appears. Click **Copy HTML** → open a new email in Outlook → paste → done. Or click **Download .eml** → double-click the file → it opens in Outlook with everything pre-loaded.

---

## 5. Iterate on selectors

The first run will likely fail at scraping — the selectors in `worker/crm.js` are placeholders. To dial them in:

```bash
cd worker
npm install
npx playwright install chromium
cp .env.example .env   # fill CRM_USER, CRM_PASSWORD
npx playwright codegen https://crm.intacadvisory.com/login
```

Use codegen to find real selectors for: the "Who are you?" dropdown, each scope tab (Non-GA / GA), the summary cards block, and each of the three tables. Update the `SEL` object in `crm.js`, push, and Render auto-redeploys.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `worker unreachable` on login | Render service is asleep — wait 30s, retry. Or check `/health` directly. |
| `401 unauthorized` | Wrong `TEAM_PASSWORD`. |
| Login succeeds but scrape returns empty | Selectors in `crm.js` need updating. Run codegen locally. |
| `.eml` opens but images are broken | Inline data URIs should already be CID-converted; if not, check `buildEml`. |
| CORS error in browser console | `ALLOWED_ORIGINS` on Render doesn't include the Netlify URL exactly. |
