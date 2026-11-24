# Intac Daily Report Generator

Owner: Intac (client tool), run by Jojo on his Advin VPS.

One-click generator for the Intac Advisory CRM daily report email (Non-GA and GA). Logs into the CRM, screenshots each section (KPI cards, 30/60/90-day renewals, New Policies Bound, Producer Activity), and produces a clean HTML email ready to paste into Outlook, or downloads it as an `.eml` draft.

## Architecture

```
browser ──▶ Netlify (frontend) ──fetch──▶ https://23-137-105-53.sslip.io (Caddy, Advin VPS)
        ──▶ worker :3001 (systemd report-intac, /opt/reporttools/intac) ──Playwright──▶ crm.intacadvisory.com
```

- **`frontend/`**: static site on Netlify (intac-daily-reporting.netlify.app). Login screen, Monday/Daily switch, "Generate Non-GA" / "Generate GA", preview, `Copy HTML` / `Download .eml`. `config.js` holds the worker URL.
- **`worker/`**: Node + Express + Playwright on the VPS. Logs into the CRM (saved session reused for up to 8 h), opens Daily Report in US Central time, hides floating CRM widgets and screenshots each section.
- Caddy passes only `/health`, `/generate/*` and `/eml/*`. Tailscale Funnel (`alison-relay-vps.tailea90ac.ts.net`) reaches the same worker as a slow fallback.
- VPS operations (status, restart, deploy steps): `/opt/reporttools/README.md` on the VPS.

## Daily flow

1. Open <https://intac-daily-reporting.netlify.app>, sign in with your name and the team password.
2. Monday (US day) is pre-selected on Mondays, Daily (Tue-Fri) otherwise. Click `Generate Non-GA` (and `Generate GA` on Mondays).
3. `Copy HTML` into a new Outlook message, or `Download .eml` and open it as a draft. Recipients are added in Outlook (the draft has none on purpose).

If the VPS is down: `LOCAL-FALLBACK.md` (double-click `Generate Reports Locally.bat`).

## Local development

```bash
cd worker
npm install
npx playwright install chromium
cp .env.example .env   # fill CRM_USER, CRM_PASSWORD, TEAM_PASSWORD
node server.js         # worker on :3001
```

Serve `frontend/` (e.g. `npx serve frontend -l 3000`) and put `http://localhost:3001` in the Worker URL field on the sign-in screen.

## When the CRM changes

A blank or tiny section triggers an alert (see below). The selectors live in [`worker/crm.js`](worker/crm.js) under `SEL`. Set `DEBUG_DUMP=1` in `worker/.env`, restart, click Generate: the worker writes `worker/debug-non-ga.html` with the current DOM to compare against.

## Files

```
report-generator/
├── README.md                    you are here
├── LOCAL-FALLBACK.md            what to do when the VPS is down
├── Generate Reports Locally.bat local fallback (runs worker/local-report.mjs)
├── Restart Report Tools.bat     restart / stop / status of the VPS workers over SSH
├── View Usage.bat               who generated what (reads the VPS logs)
├── netlify.toml                 Netlify config (publish frontend/, skip builds without frontend changes)
├── frontend/                    index.html, app.js, config.js (worker URL), styles.css
└── worker/
    ├── server.js                Express routes: /health, /generate/:scope, /eml/:id
    ├── ops.js                   logs, time zones, alerts, password guard, .eml cache, one-at-a-time
    ├── crm.js                   Playwright: CRM login/session + section screenshots
    ├── email.js                 HTML email + .eml builder
    ├── config.js                env + recipients
    ├── local-report.mjs         local fallback generator
    └── .env.example
```

## Logs, time zones and safety (since 2026-11-24)

All of this lives in `worker/ops.js` (the same file in the Intac, V3 BOL and Kingdomland workers).

- **Time zones.** Dates the client sees (report "today", date ranges, email subject and body) use US Central (`REPORT_TIMEZONE`, default `America/Chicago`); the headless browser runs in that zone too. Log times are Philippine time (`LOG_TIMEZONE`, default `Asia/Manila`) for debugging.
- **Transaction log.** `worker/access.log` gets one JSON line per request (not `/health`): `ts` (UTC), `logTime`, `id`, `status`, `event` (`finish` or `aborted`), `user`, `userTz`, scope/range, `buildMs`, `totalMs`, `bytes`, `gzip`, `ip`, `ua`, `warnings`, `error`. The same `id` is returned as the `X-Request-Id` header and shown in page errors as "(ref ...)". On the VPS: `tail -f /opt/reporttools/<tool>/worker/access.log` or `journalctl -u report-<tool> -f`. The file is rotated weekly by `/etc/logrotate.d/reporttools`.
- **Alerts.** A failed report, a report that was built but never reached the page, a report with suspiciously small screenshots, and a blocked password guesser are sent to Jojo's alert hub on the VPS (`ALERT_HUB_KEY` in the worker `.env`); the hub handles muting and repeats.
- **Team password.** Checked in constant time; an address with 10 wrong passwords in an hour gets HTTP 429 for the rest of that hour (`LOGIN_FAIL_LIMIT`).
- **Smaller replies.** The web page sends `X-Eml-On-Demand: 1`, so the reply leaves out the `.eml` (and V3's raw images), which repeat every screenshot; Download fetches `GET /eml/<id>` (kept 30 minutes). Scripted callers without that header, such as Emmi's GitHub flow, still get the full reply. Replies are gzipped when the caller accepts gzip.
