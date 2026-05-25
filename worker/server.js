import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { generateReport } from './crm.js';
import { buildHtmlEmail, buildEml } from './email.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cors({ origin: config.allowedOrigins, credentials: false }));

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
  try {
    const report = await generateReport(scope);
    const html = buildHtmlEmail({ scope, report });
    const eml = buildEml({ scope, report, html });
    res.json({
      scope,
      generatedAt: report.generatedAt,
      html,
      eml,
      images: report.images,
    });
  } catch (err) {
    console.error(`[generate/${scope}] failed:`, err);
    res.status(500).json({ error: err.message || 'generation failed' });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`worker listening on :${port}`);
});
