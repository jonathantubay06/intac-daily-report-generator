import { config } from './config.js';

function fmtDate(iso) {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function table(html) {
  return `<table cellspacing="0" cellpadding="6" border="0" style="border-collapse:collapse;font:13px Arial,sans-serif;width:100%;">${html}</table>`;
}

function renderTable({ headers, rows }) {
  if (!headers?.length) return '<p style="color:#888;">(no data)</p>';
  const head = `<thead><tr>${headers.map(h => `<th align="left" style="background:#f5f0ee;color:#5a1414;border-bottom:1px solid #d8c8c4;padding:6px 8px;">${escapeHtml(h)}</th>`).join('')}</tr></thead>`;
  const body = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td style="border-bottom:1px solid #eee;padding:6px 8px;">${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return table(head + body);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

export function buildHtmlEmail({ scope, report }) {
  const label = scope === 'ga' ? 'GA' : 'Non-GA';
  const summaryCardImg = report.images.summaryCards
    ? `<img src="${report.images.summaryCards}" alt="Renewals summary" style="max-width:100%;border:1px solid #eee;"/>`
    : '';

  return `<!doctype html>
<html><body style="font:14px Arial,sans-serif;color:#222;">
  <p>Hi Team,</p>
  <p>Sharing Report for ${label}</p>

  <h3 style="color:#5a1414;border-bottom:1px solid #5a1414;padding-bottom:4px;">30 DAYS RENEWAL</h3>
  ${summaryCardImg}
  <div style="margin-top:12px;">${renderTable(report.tables.renewals)}</div>

  <h3 style="color:#5a1414;border-bottom:1px solid #5a1414;padding-bottom:4px;margin-top:24px;">NEW POLICIES BOUND — PAST 14 DAYS</h3>
  ${renderTable(report.tables.newPolicies)}

  <h3 style="color:#5a1414;border-bottom:1px solid #5a1414;padding-bottom:4px;margin-top:24px;">PRODUCER ACTIVITY — PAST 14 DAYS</h3>
  ${renderTable(report.tables.producerActivity)}

  <p style="color:#888;font-size:12px;margin-top:24px;">Generated ${new Date(report.generatedAt).toLocaleString()}</p>
</body></html>`;
}

// ------------ .eml builder (RFC 5322 / 2045 multipart) ------------

function b64(buf) {
  return Buffer.from(buf).toString('base64').match(/.{1,76}/g).join('\r\n');
}

function dataUriToBuffer(uri) {
  const m = /^data:(.+?);base64,(.+)$/.exec(uri);
  if (!m) return null;
  return { mime: m[1], buf: Buffer.from(m[2], 'base64') };
}

export function buildEml({ scope, report, html }) {
  const recip = config.recipients[scope];
  const date = fmtDate(report.generatedAt);
  const subject = recip.subject(date);
  const boundary = `----=_Part_${Date.now()}`;
  const altBoundary = `----=_Alt_${Date.now()}`;

  // Replace data: URIs in html with cid: refs and collect attachments
  const attachments = [];
  const cidHtml = html.replace(/src="(data:image\/[^"]+)"/g, (_, uri) => {
    const parsed = dataUriToBuffer(uri);
    if (!parsed) return `src=""`;
    const cid = `img${attachments.length}@intac.report`;
    attachments.push({ cid, mime: parsed.mime, buf: parsed.buf, filename: `image${attachments.length}.png` });
    return `src="cid:${cid}"`;
  });

  const headers = [
    `From: ${config.from}`,
    `To: ${recip.to.join(', ')}`,
    recip.cc.length ? `Cc: ${recip.cc.join(', ')}` : null,
    `Subject: ${subject}`,
    `Date: ${new Date(report.generatedAt).toUTCString()}`,
    `MIME-Version: 1.0`,
    attachments.length
      ? `Content-Type: multipart/related; boundary="${boundary}"; type="multipart/alternative"`
      : `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
  ].filter(Boolean).join('\r\n');

  const altPart =
`--${altBoundary}\r
Content-Type: text/plain; charset="utf-8"\r
Content-Transfer-Encoding: 7bit\r
\r
See HTML version.\r
\r
--${altBoundary}\r
Content-Type: text/html; charset="utf-8"\r
Content-Transfer-Encoding: 8bit\r
\r
${cidHtml}\r
\r
--${altBoundary}--\r
`;

  let body;
  if (attachments.length) {
    const imgParts = attachments.map(a =>
`--${boundary}\r
Content-Type: ${a.mime}; name="${a.filename}"\r
Content-Transfer-Encoding: base64\r
Content-ID: <${a.cid}>\r
Content-Disposition: inline; filename="${a.filename}"\r
\r
${b64(a.buf)}\r
`).join('');

    body =
`--${boundary}\r
Content-Type: multipart/alternative; boundary="${altBoundary}"\r
\r
${altPart}\r
${imgParts}--${boundary}--\r
`;
  } else {
    body = altPart;
  }

  const eml = `${headers}\r\n\r\n${body}`;
  return {
    filename: `intac-daily-${scope}-${date.replace(/\//g, '-')}.eml`,
    content: Buffer.from(eml).toString('base64'),
    mime: 'message/rfc822',
  };
}
