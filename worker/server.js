import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { gzipSync } from 'node:zlib';
import { transactionLog, REPORT_TZ } from './request-log.js';
import { config } from './config.js';
import { generateReport } from './crm.js';
import { buildHtmlEmail, buildEml, buildSubject } from './email.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: config.allowedOrigins, credentials: false }));
// One log line per request (see request-log.js): UTC + Philippine time, user, timings, size, errors.
app.use(transactionLog('intac'));

function requireTeamPassword(req, res, next) {
  const token = req.headers['x-team-password'];
  if (!token || token !== config.teamPassword) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/generate/:scope', requireTeamPassword, async (req, res) => {
  const scope = req.params.scope;
  if (scope !== 'non-ga' && scope !== 'ga') {
    return res.status(400).json({ error: 'scope must be non-ga or ga' });
  }
  // Tue-Fri "Daily" mode: Non-GA data, no 30/60/90 sections, plain subject.
  const mode = req.body?.mode === 'daily' ? 'daily' : 'weekly';
  if (mode === 'daily' && scope !== 'non-ga') {
    return res.status(400).json({ error: 'daily mode uses non-ga' });
  }
  req.ctx.extra = { scope, mode };
  const start = Date.now();
  try {
    // Dates the client sees (CRM "today", subject date) are US Central; see request-log.js.
    const report = await generateReport(scope, mode, REPORT_TZ);
    req.ctx.buildMs = Date.now() - start;
    const subject = buildSubject({ scope, report });
    const html = buildHtmlEmail({ scope, report });
    const eml = buildEml({ scope, report, html });
    // The reply carries the screenshots twice (html + eml), several MB: gzip it when the client accepts gzip.
    const payload = Buffer.from(JSON.stringify({ scope, mode, generatedAt: report.generatedAt, requestId: req.ctx.id, subject, html, eml }));
    res.set('Content-Type', 'application/json; charset=utf-8');
    if (/gzip/.test(req.headers['accept-encoding'] || '')) {
      res.set('Content-Encoding', 'gzip');
      res.send(gzipSync(payload));
    } else {
      res.send(payload);
    }
  } catch (err) {
    console.error(`[generate/${scope}] ${req.ctx.id} failed:`, err);
    req.ctx.buildMs = Date.now() - start;
    req.ctx.error = err.message || 'generation failed';
    res.status(500).json({ error: req.ctx.error, requestId: req.ctx.id });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`worker listening on :${port}`);
});
