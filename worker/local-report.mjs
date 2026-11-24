// Local fallback: generate the Intac report email drafts (.eml) on this PC when the VPS worker is down.
// Run via "Generate Reports Locally.bat". Monday (and weekends) = GA + Non-GA weekly; Tue-Fri = Non-GA daily.
// Override: node local-report.mjs weekly|daily
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReport } from './crm.js';
import { buildHtmlEmail, buildEml, buildSubject } from './email.js';
import { REPORT_TZ, ymdInTz } from './ops.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// The client's day (US Central), not this PC's: a Manila Tuesday morning is still Monday in the US.
const usWeekday = new Intl.DateTimeFormat('en-US', { timeZone: REPORT_TZ, weekday: 'short' }).format(new Date());
const mode = process.argv[2] || (['Tue', 'Wed', 'Thu', 'Fri'].includes(usWeekday) ? 'daily' : 'weekly');
const scopes = mode === 'daily' ? ['non-ga'] : ['non-ga', 'ga'];
const stamp = ymdInTz(new Date()); // YYYY-MM-DD, US Central
const outDir = join(root, 'reports', stamp);
await mkdir(outDir, { recursive: true });

console.log(`Mode: ${mode}. Making ${scopes.join(' + ')}. Each takes about 30-40 seconds.\n`);
for (const scope of scopes) {
  const t = Date.now();
  process.stdout.write(`${scope}: working... `);
  try {
    const report = await generateReport(scope, mode, REPORT_TZ);
    const html = buildHtmlEmail({ scope, report });
    const eml = buildEml({ scope, report, html });
    const name = `Intac-${scope}-${mode}-${stamp}.eml`;
    await writeFile(join(outDir, name), Buffer.from(eml.content, 'base64'));
    console.log(`done in ${Math.round((Date.now() - t) / 1000)}s -> ${name}`);
    console.log(`   subject: ${buildSubject({ scope, report })}`);
  } catch (err) {
    console.log('FAILED');
    console.log(`   ${String(err.message).split('\n')[0]}`);
    if (/Executable doesn't exist/.test(err.message)) console.log('   Browser missing. Tell Claude: "Playwright browser missing for the local fallback".');
  }
}
console.log(`\nFiles are in: ${outDir}`);
