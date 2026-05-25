# Intac Daily Report Generator

Generates the Intac Advisory CRM daily report email (Non-GA and GA) with one click — captures the summary cards, rebuilds the row tables as clean HTML, and hands off to Outlook as either a downloadable `.eml` file or a clipboard-copied HTML payload.

## Architecture

```
┌─────────────────────┐       ┌──────────────────────┐       ┌─────────────────────┐
│  Netlify (frontend) │ ────▶ │  Render (worker)     │ ────▶ │  crm.intacadvisory  │
│  - Team login       │       │  - Playwright login  │       │                     │
│  - Generate buttons │ ◀──── │  - Screenshot cards  │ ◀──── │                     │
│  - Preview + handoff│       │  - Scrape tables     │       │                     │
└─────────────────────┘       │  - Build .eml + HTML │       │                     │
                              └──────────────────────┘       │                     │
```

- **`frontend/`** — static site (Netlify). Login screen, two big "Generate" buttons, live preview, "Download .eml" and "Copy HTML" handoff.
- **`worker/`** — Node + Express + Playwright service (Render). Logs into the CRM, screenshots the summary cards, scrapes the three tables, builds the email.

## Deploy

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for step-by-step deploy to Netlify + Render.

## Local dev

```bash
cd worker
npm install
npx playwright install chromium
cp .env.example .env
# fill in CRM_USER, CRM_PASSWORD, TEAM_PASSWORD
npm run dev
```

In a second terminal:

```bash
cd frontend
npx serve .       # or just open index.html
```

## Status

v0 scaffold. The CRM scraping selectors in [`worker/crm.js`](worker/crm.js) are stubs — they need to be filled in once we can probe the live page. See `TODO` markers in that file.
