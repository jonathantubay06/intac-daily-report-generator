import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { config } from './config.js';

const DEBUG = process.env.DEBUG_DUMP === '1';
const NAV_TIMEOUT = 30_000;

const SEL = {
  // Login
  loginUserSelect: '#username',
  loginPasswordInput: '#password',
  loginSubmit: '#login-form button[type="submit"]',
  loginError: '#login-form #error',

  // Daily report — scope tabs (Non-GA / GA pills inside the filter bar)
  // ":text-is" is exact-match — needed because "Non-GA" contains "GA" as a substring.
  scopePill: (label) => `.dr-pill:text-is("${label}")`,
  windowPill: (days) => `.dr-pill:has-text("Next ${days} days")`,

  // Sections (each is a <section class="dr-section">)
  renewalsSection: 'section.dr-section:has(.dr-kpi-grid)',
  newPoliciesSection: 'section.dr-section:has(h3.dr-section-h:has-text("New policies bound"))',
  producerActivitySection: 'section.dr-section:has(h3.dr-section-h:has-text("Producer activity"))',

  // Inner pieces
  kpiGrid: '.dr-kpi-grid',
  renewalsTable: '.dr-table',
};

export async function generateReport(scope) {
  if (!config.crmUser || !config.crmPassword) {
    throw new Error('CRM_USER / CRM_PASSWORD not set');
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  try {
    await login(page);
    await page.goto(`${config.crmUrl}/#/daily-report`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });

    await selectScopeTab(page, scope);

    if (DEBUG) {
      const html = await page.content();
      await writeFile(`debug-${scope}.html`, html, 'utf8');
      console.log(`[debug] wrote debug-${scope}.html (${html.length} bytes)`);
    }

    // Disable chrome that overlaps element screenshots.
    await page.addStyleTag({
      content: `
        .topbar, header.topbar { position: static !important; }
        #banner-host { display: none !important; }
        .lead-view-backdrop, .lead-view { display: none !important; }
      `,
    });

    // Capture KPI cards before hiding them.
    const kpiCards = await shotOf(page, `${SEL.renewalsSection} ${SEL.kpiGrid}`);

    // Inside the renewals section: hide the duplicate section heading and the
    // KPI grid so each 30/60/90 screenshot is filter-bar + summary + table only.
    await page.addStyleTag({
      content: `
        ${SEL.renewalsSection} .dr-section-h,
        ${SEL.renewalsSection} .dr-kpi-grid { display: none !important; }
      `,
    });

    const renewals30 = await shotRenewalsAt(page, 30);
    const renewals60 = await shotRenewalsAt(page, 60);
    const renewals90 = await shotRenewalsAt(page, 90);

    const newPolicies = await shotOf(page, SEL.newPoliciesSection);
    const producerActivity = await shotOf(page, SEL.producerActivitySection);

    return {
      scope,
      generatedAt: new Date().toISOString(),
      images: {
        kpiCards,
        renewals30,
        renewals60,
        renewals90,
        newPolicies,
        producerActivity,
      },
    };
  } finally {
    await ctx.close();
    await browser.close();
  }
}

async function login(page) {
  await page.goto(`${config.crmUrl}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  const user = config.crmUser.trim();
  const selectArg = user.includes(' ') ? { label: user } : { value: user.toLowerCase() };
  await page.locator(SEL.loginUserSelect).selectOption(selectArg);
  await page.locator(SEL.loginPasswordInput).fill(config.crmPassword);
  await page.locator(SEL.loginSubmit).click();

  await Promise.race([
    page.waitForURL((u) => !/\/login$/.test(u.toString()), { timeout: NAV_TIMEOUT }),
    page.locator(`${SEL.loginError}:not([hidden])`).waitFor({ timeout: NAV_TIMEOUT })
      .then(async () => {
        const msg = await page.locator(SEL.loginError).innerText().catch(() => 'login failed');
        throw new Error(`CRM login failed: ${msg}`);
      }),
  ]);
}

async function selectScopeTab(page, scope) {
  const label = scope === 'ga' ? 'GA' : 'Non-GA';
  // Several .dr-pill exist; the one inside .dr-pill-group with matching text is the scope filter.
  await page.locator(`.dr-pill-group ${SEL.scopePill(label)}`).first().click();
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
}

async function shotRenewalsAt(page, days) {
  await page.locator(SEL.windowPill(days)).first().click();
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(250);
  return shotOf(page, SEL.renewalsSection);
}

async function shotOf(page, selector) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  const buf = await el.screenshot({ type: 'png' });
  return `data:image/png;base64,${buf.toString('base64')}`;
}
