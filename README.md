# Intac Daily Report Generator

One-click generator for the Intac Advisory CRM daily report email (Non-GA and GA). Logs into the CRM, screenshots each section (KPI cards, 30/60/90-day renewals, New Policies Bound, Producer Activity), and produces a clean HTML email ready to paste into Outlook — or downloads it as an `.eml` file.

## Architecture

```
You ──browser──▶ Netlify (frontend) ──fetch──▶ Cloudflare Quick Tunnel ──▶ Local PC :3001 ──Playwright──▶ crm.intacadvisory.com
```

- **`frontend/`** — static site served by Netlify (free tier). Login screen, "Generate Non-GA" / "Generate GA" buttons, live preview, `Copy HTML` / `Download .eml` handoff.
- **`worker/`** — Node + Express + Playwright. Runs on your local PC on port 3001. Logs into the CRM as Nick, navigates to Daily Report, screenshots each report section with chrome (sticky topbar, password banner, section headings, KPI grid where redundant) hidden first.
- **`launch.js` / `launch.bat`** — single-command boot: starts the worker, starts a Cloudflare Quick Tunnel pointed at `localhost:3001`, captures the random `*.trycloudflare.com` URL, writes it into `frontend/config.js`, and pushes so Netlify auto-redeploys with the fresh URL.

## Daily flow

Already on autopilot via a Windows scheduled task (`IntacReportLauncher`) that runs `launch.bat` at user logon. After login:

1. A console window opens; the worker + tunnel come up; the tunnel URL is pushed to Netlify.
2. Open <https://intac-daily-reporting.netlify.app>, sign in with the team password, click `Generate Non-GA` or `Generate GA`.
3. `Copy HTML` → new Outlook message → Ctrl+V → Send. Or `Download .eml` → double-click → opens pre-filled in Outlook.

## Local development

```bash
cd worker
npm install
npx playwright install chromium
cp .env.example .env
# Fill CRM_USER, CRM_PASSWORD, TEAM_PASSWORD
```

Then from the repo root:

```bash
node launch.js
```

Or double-click `launch.bat`. Open <http://localhost:3000> (start a static server in `frontend/`, e.g. `npx serve frontend -l 3000`) or just open `frontend/index.html` directly.

## When the CRM changes

If a section disappears or starts coming back blank, the most likely cause is CSS class/text changes in the CRM. The selectors live in [`worker/crm.js`](worker/crm.js) under `SEL`.

To pin new selectors, set `DEBUG_DUMP=1` in `worker/.env`, restart, click Generate. The worker writes `worker/debug-non-ga.html` with the current DOM — inspect that and update the `SEL` object.

## Files

```
report-generator/
├── README.md            ← you are here
├── launch.js / .bat     ← one-shot boot (worker + tunnel + push)
├── netlify.toml         ← Netlify build config (publish frontend/)
├── frontend/
│   ├── index.html       ← login + Generate buttons + preview
│   ├── app.js           ← fetch worker, copy HTML, download .eml
│   ├── config.js        ← auto-updated tunnel URL (never cached)
│   └── styles.css
└── worker/
    ├── server.js        ← Express, /generate/:scope, usage log
    ├── crm.js           ← Playwright login + section screenshots
    ├── email.js         ← HTML email + .eml builder
    ├── config.js        ← env + recipients
    ├── .env.example
    └── package.json
```
