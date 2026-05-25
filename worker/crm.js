import { chromium } from 'playwright';
import { config } from './config.js';

const NAV_TIMEOUT = 30_000;

export async function generateReport(scope) {
  if (!config.crmUser || !config.crmPassword) {
    throw new Error('CRM_USER / CRM_PASSWORD not set');
  }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  try {
    await login(page);
    await page.goto(`${config.crmUrl}/#/daily-report`, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });

    await selectScopeTab(page, scope);

    const summaryCardImg = await screenshotRegion(page, SEL.summaryCardsBlock);
    const renewals = await scrapeRenewalsTable(page);
    const policies = await scrapeNewPoliciesTable(page);
    const activity = await scrapeProducerActivityTable(page);

    return {
      scope,
      generatedAt: new Date().toISOString(),
      images: {
        summaryCards: summaryCardImg,
      },
      tables: {
        renewals,
        newPolicies: policies,
        producerActivity: activity,
      },
    };
  } finally {
    await ctx.close();
    await browser.close();
  }
}

// ============================================================
// TODO selectors — fill these in once we can probe the live CRM.
// The screenshots show the structure; the actual DOM attribute
// names (class/id) are not yet known.
// ============================================================
const SEL = {
  // Login page (crm.intacadvisory.com/login)
  loginNameDropdown: 'select, [role="combobox"]', // TODO: locator for "WHO ARE YOU?"
  loginPasswordInput: 'input[type="password"]',
  loginSubmit: 'button:has-text("Sign in")',

  // Daily report page
  scopeNonGaTab: 'button:has-text("Non-GA")',
  scopeGaTab: 'button:has-text("GA"):not(:has-text("Non-GA"))',
  windowNext30: 'button:has-text("Next 30 days")',

  summaryCardsBlock: 'section:has-text("RENEWALS — UPCOMING PIPELINE")', // TODO
  renewalsTable: 'section:has-text("UPCOMING RENEWALS") table',          // TODO
  newPoliciesTable: 'section:has-text("NEW POLICIES BOUND") table',      // TODO
  producerActivityTable: 'section:has-text("PRODUCER ACTIVITY") table',  // TODO
};

async function login(page) {
  await page.goto(`${config.crmUrl}/login`, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });

  // The CRM uses a "Who are you?" dropdown + team password.
  // TODO: replace with the real dropdown interaction once we know the widget.
  // Naive attempt — try native <select>, then a combobox role.
  const dropdown = page.locator(SEL.loginNameDropdown).first();
  if (await dropdown.evaluate(el => el.tagName === 'SELECT').catch(() => false)) {
    await dropdown.selectOption({ label: config.crmUser });
  } else {
    await dropdown.click();
    await page.locator(`role=option[name="${config.crmUser}"]`).click({ timeout: 5000 }).catch(async () => {
      // Fallback: type the name and pick first match
      await page.keyboard.type(config.crmUser);
      await page.keyboard.press('Enter');
    });
  }

  await page.locator(SEL.loginPasswordInput).fill(config.crmPassword);
  await page.locator(SEL.loginSubmit).click();
  await page.waitForURL(/#\/(daily-report|dashboard)/, { timeout: NAV_TIMEOUT });
}

async function selectScopeTab(page, scope) {
  const sel = scope === 'ga' ? SEL.scopeGaTab : SEL.scopeNonGaTab;
  await page.locator(sel).first().click();
  // Default window: Next 30 days
  await page.locator(SEL.windowNext30).first().click().catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT });
}

async function screenshotRegion(page, selector) {
  const el = page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  const buf = await el.screenshot({ type: 'png' });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

async function scrapeTable(page, selector) {
  return await page.locator(selector).first().evaluate((table) => {
    const headers = Array.from(table.querySelectorAll('thead th'))
      .map(th => th.innerText.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
      Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
    );
    return { headers, rows };
  });
}

async function scrapeRenewalsTable(page) {
  return scrapeTable(page, SEL.renewalsTable);
}
async function scrapeNewPoliciesTable(page) {
  return scrapeTable(page, SEL.newPoliciesTable);
}
async function scrapeProducerActivityTable(page) {
  return scrapeTable(page, SEL.producerActivityTable);
}
