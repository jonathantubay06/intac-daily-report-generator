import { chromium } from 'playwright';
import { writeFile, stat, chmod } from 'node:fs/promises';
import { config } from './config.js';

const DEBUG = process.env.DEBUG_DUMP === '1';
const NAV_TIMEOUT = 30_000;

// Logged-in CRM session kept between runs so most reports skip the ~6 s login. Holds session cookies:
// gitignored, file mode 600, and dropped after SESSION_MAX_AGE_MS or as soon as it stops working.
const SESSION_FILE = '.crm-session.json';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const SESSION_CHECK_MS = 8_000;

async function savedSession() {
  try {
    const s = await stat(SESSION_FILE);
    return Date.now() - s.mtimeMs < SESSION_MAX_AGE_MS ? SESSION_FILE : undefined;
  } catch {
    return undefined;
  }
}

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

// mode 'daily' (Tue-Fri) sends only New policies + Producer activity (no KPI cards, no 30/60/90).
// timeZone: the clock the CRM page runs in, so its "today" and renewal windows match the US client.
export async function generateReport(scope, mode = 'weekly', timeZone = 'America/Chicago') {
  if (!config.crmUser || !config.crmPassword) {
    throw new Error('CRM_USER / CRM_PASSWORD not set');
  }

  const session = await savedSession();
  const browser = await chromium.launch({ headless: true });
  let ctx;
  try {
    const opts = { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, timezoneId: timeZone };
    // A damaged session file must not block the report: fall back to a fresh login.
    ctx = await browser.newContext({ ...opts, storageState: session }).catch(() => browser.newContext(opts));
    const page = await ctx.newPage();

    // The CRM app keeps background requests open (mail assets), so 'networkidle' never fires; wait for the report UI instead.
    const openReport = async (timeout) => {
      await page.goto(`${config.crmUrl}/#/daily-report`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      return page.locator('.dr-pill-group').first().waitFor({ timeout }).then(() => true, () => false);
    };
    // Try the saved session first; if the report page does not appear, log in fresh and save the new session.
    if (!session || !(await openReport(SESSION_CHECK_MS))) {
      await login(page);
      await ctx.storageState({ path: SESSION_FILE });
      await chmod(SESSION_FILE, 0o600).catch(() => {});
      if (!(await openReport(NAV_TIMEOUT))) throw new Error('CRM daily report page did not load after login');
    }
    await page.locator(SEL.kpiGrid).first().waitFor({ timeout: NAV_TIMEOUT }).catch(() => {});
    await settle(page);

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
        /* "What's new in Intac One" card (added Nov 2026) and the round chat dock button float over the tables. */
        .wn-card, .ch-dock { display: none !important; }
      `,
    });

    let kpiCards = null;
    let renewals30 = null, renewals60 = null, renewals90 = null;
    if (mode !== 'daily') {
      // Capture KPI cards before hiding them.
      kpiCards = await shotOf(page, `${SEL.renewalsSection} ${SEL.kpiGrid}`);

      // Inside the renewals section: hide the duplicate section heading and the
      // KPI grid so each 30/60/90 screenshot is filter-bar + summary + table only.
      await page.addStyleTag({
        content: `
          ${SEL.renewalsSection} .dr-section-h,
          ${SEL.renewalsSection} .dr-kpi-grid { display: none !important; }
        `,
      });

      renewals30 = await shotRenewalsAt(page, 30);
      renewals60 = await shotRenewalsAt(page, 60);
      renewals90 = await shotRenewalsAt(page, 90);
    }

    const newPolicies = await shotOf(page, SEL.newPoliciesSection);
    const producerActivity = await shotOf(page, SEL.producerActivitySection);

    return {
      scope,
      mode,
      generatedAt: new Date().toISOString(),
      timeZone,
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
    // Always shut the browser, even if the context never opened.
    await ctx?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// The CRM never goes network-idle, so after an action wait for the watched element's text to change
// (up to maxMs; unchanged content just costs the timeout), then a short pause for layout.
async function settle(page, selector, before, maxMs = 6000) {
  if (selector && before !== undefined) {
    await page.waitForFunction(
      ([sel, old]) => { const el = document.querySelector(sel); return el && el.innerText !== old; },
      [selector, before],
      { timeout: maxMs }
    ).catch(() => {});
  }
  await page.waitForTimeout(350);
}

const textOf = (page, selector) => page.locator(selector).first().innerText().catch(() => '');

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
  await clickPill(page, page.locator(`.dr-pill-group ${SEL.scopePill(label)}`).first());
}

async function shotRenewalsAt(page, days) {
  await clickPill(page, page.locator(SEL.windowPill(days)).first());
  return shotOf(page, SEL.renewalsSection);
}

// A pill that is already selected ("is-active") changes nothing when clicked, so skip the click and the
// 6 s wait for a change that never comes (that wait was about half of a weekly report's run time).
async function clickPill(page, pill) {
  const isActive = await pill.evaluate((el) => el.classList.contains('is-active')).catch(() => false);
  if (isActive) return;
  const before = await textOf(page, SEL.renewalsSection);
  await pill.click();
  await settle(page, SEL.renewalsSection, before);
}

// Hide anything floating (position: fixed) that is not part of the report, right before each screenshot.
// The CRM keeps adding floating UI (Nov 2026: the "What's new" card and the chat dock covered the tables);
// this catches new ones without a code change. Elements that hold report sections are left alone.
async function hideFloatingUi(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      if (getComputedStyle(el).position !== 'fixed') continue;
      if (el.closest('section.dr-section') || el.querySelector('section.dr-section')) continue;
      el.style.setProperty('display', 'none', 'important');
    }
  });
}

async function shotOf(page, selector) {
  await hideFloatingUi(page);
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  const buf = await el.screenshot({ type: 'jpeg', quality: 70 });
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}
