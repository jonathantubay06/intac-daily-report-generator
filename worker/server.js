import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { gzipSync } from 'node:zlib';
import { config } from './config.js';
import { generateReport } from './crm.js';
import { buildHtmlEmail, buildEml, buildSubject } from './email.js';
import {
  transactionLog, teamPasswordGuard, REPORT_TZ,
  stashEml, emlRoute, wantsEmlOnDemand, checkImages, runExclusive,
} from './ops.js';

const TOOL = 'intac';
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: config.allowedOrigins, credentials: false }));
// One log line per request, alerts on failures (see ops.js).
app.use(transactionLog(TOOL));
const requireTeamPassword = teamPasswordGuard(TOOL, config.teamPassword);

// Large replies (screenshots): gzip when the client accepts it.
function sendJson(req, res, obj) {
  const payload = Buffer.from(JSON.stringify(obj));
  res.set('Content-Type', 'application/json; charset=utf-8');
  if (/gzip/.test(req.headers['accept-encoding'] || '')) {
    res.set('Content-Encoding', 'gzip');
    return res.send(gzipSync(payload));
  }
  return res.send(payload);
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/eml/:id', requireTeamPassword, emlRoute);

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
    // Dates the client sees (CRM "today", subject date) are US Central; see ops.js.
    // One report at a time per worker (shared CRM session); a second request waits for the first.
    const report = await runExclusive(() => generateReport(scope, mode, REPORT_TZ));
    req.ctx.buildMs = Date.now() - start;
    req.ctx.warnings.push(...checkImages(report.images));
    const subject = buildSubject({ scope, report });
    const html = buildHtmlEmail({ scope, report });
    const eml = buildEml({ scope, report, html });
    const reply = { scope, mode, generatedAt: report.generatedAt, requestId: req.ctx.id, warnings: req.ctx.warnings, subject, html };
    if (wantsEmlOnDemand(req)) {
      stashEml(req.ctx.id, eml);
      reply.emlId = req.ctx.id;
    } else {
      reply.eml = eml;
    }
    sendJson(req, res, reply);
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
