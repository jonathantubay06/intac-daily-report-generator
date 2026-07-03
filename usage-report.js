// Reads the access.log from both report tools and prints a friendly usage summary.
// Run via "View Usage.bat" or: node usage-report.js

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SOURCES = [
  { tool: 'Intac', file: path.join(ROOT, 'worker', 'access.log') },
  { tool: 'V3 BOL', file: path.join(ROOT, '..', 'V3 BOL daily report', 'worker', 'access.log') },
];

function device(ua = '') {
  if (/iPhone|iPad/i.test(ua)) return 'iPhone/iPad';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Other';
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

async function loadRows() {
  const rows = [];
  for (const src of SOURCES) {
    let text = '';
    try { text = await readFile(src.file, 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      const s = line.trim();
      if (!s) continue;
      try {
        const e = JSON.parse(s);
        rows.push({
          tool: src.tool,
          ts: e.ts,
          when: fmtTime(e.ts),
          what: e.range ? `${e.scope}/${e.range}` : e.scope,
          ok: e.ok,
          user: e.user || 'Unknown',
          device: device(e.ua),
          ip: e.ip || '',
        });
      } catch { /* skip malformed */ }
    }
  }
  rows.sort((a, b) => new Date(b.ts) - new Date(a.ts));
  return rows;
}

function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

const rows = await loadRows();

console.log('');
console.log('==================================================================');
console.log('                   SENTRY REPORT TOOLS — USAGE');
console.log('==================================================================');
console.log('');

if (!rows.length) {
  console.log('No usage recorded yet.');
} else {
  // Summary
  const byTool = {};
  const byUser = {};
  const devices = new Set();
  for (const r of rows) {
    byTool[r.tool] = (byTool[r.tool] || 0) + 1;
    byUser[r.user] = (byUser[r.user] || 0) + 1;
    devices.add(r.device);
  }
  console.log('SUMMARY');
  console.log('  Total reports generated : ' + rows.length);
  for (const [t, c] of Object.entries(byTool)) console.log(`  ${pad(t, 22)}: ${c}`);
  console.log('  Devices seen            : ' + [...devices].join(', '));
  console.log('  Most recent             : ' + rows[0].when + '  (' + rows[0].tool + ', ' + rows[0].user + ')');
  console.log('');

  console.log('BY PERSON');
  const sortedUsers = Object.entries(byUser).sort((a, b) => b[1] - a[1]);
  for (const [u, c] of sortedUsers) console.log(`  ${pad(u, 22)}: ${c} report${c === 1 ? '' : 's'}`);
  console.log('');

  // Recent activity table (last 25)
  console.log('RECENT ACTIVITY (newest first)');
  console.log('  ' + pad('WHEN', 18) + pad('WHO', 14) + pad('TOOL', 10) + pad('REPORT', 16) + pad('DEVICE', 13) + 'STATUS');
  console.log('  ' + '-'.repeat(78));
  for (const r of rows.slice(0, 25)) {
    console.log('  ' + pad(r.when, 18) + pad(r.user, 14) + pad(r.tool, 10) + pad(r.what, 16) + pad(r.device, 13) + (r.ok ? 'OK' : 'FAILED'));
  }
  if (rows.length > 25) console.log(`  ... and ${rows.length - 25} older entries`);
}

console.log('');
console.log('Note: "WHO" is self-reported at sign-in (remembered per browser) — not');
console.log('verified identity. Entries logged before this feature show as "Unknown".');
console.log('');
