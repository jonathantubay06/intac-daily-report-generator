// Frontend logic — talks to the Render worker.

function getWorkerUrl() {
  return (
    localStorage.getItem('workerUrl') ||
    window.__WORKER_URL__ ||
    'http://localhost:3001'
  );
}

const $ = (sel) => document.querySelector(sel);
const els = {
  loginView: $('#login-view'),
  dashView: $('#dash-view'),
  teamPw: $('#team-pw'),
  workerUrl: $('#worker-url'),
  loginBtn: $('#login-btn'),
  loginErr: $('#login-err'),
  status: $('#status'),
  preview: $('#preview'),
  previewFrame: $('#preview-frame'),
  copyHtml: $('#copy-html'),
  downloadEml: $('#download-eml'),
  copyStatus: $('#copy-status'),
};

// Pre-fill with the saved override, falling back to the default from config.js.
els.workerUrl.value = localStorage.getItem('workerUrl') || window.__WORKER_URL__ || '';

let teamPassword = sessionStorage.getItem('teamPw') || '';
let lastResult = null;

if (teamPassword) showDash();

els.loginBtn.addEventListener('click', async () => {
  const pw = els.teamPw.value.trim();
  if (!pw) return;

  const customUrl = els.workerUrl.value.trim();
  if (customUrl) {
    localStorage.setItem('workerUrl', customUrl.replace(/\/+$/, ''));
  } else {
    localStorage.removeItem('workerUrl');
  }
  const workerUrl = getWorkerUrl();

  els.loginErr.textContent = '';
  els.loginBtn.disabled = true;
  try {
    const r = await fetch(`${workerUrl}/health`);
    if (!r.ok) throw new Error('worker unreachable');
    teamPassword = pw;
    sessionStorage.setItem('teamPw', pw);
    showDash();
  } catch (err) {
    els.loginErr.textContent = `Cannot reach worker at ${workerUrl}`;
  } finally {
    els.loginBtn.disabled = false;
  }
});

document.querySelectorAll('[data-scope]').forEach(btn => {
  btn.addEventListener('click', () => generate(btn.dataset.scope));
});

els.copyHtml.addEventListener('click', async () => {
  if (!lastResult) return;
  // Copy as both HTML and plain text so Outlook accepts the rich version
  const blob = new Blob([lastResult.html], { type: 'text/html' });
  const textBlob = new Blob([htmlToText(lastResult.html)], { type: 'text/plain' });
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'text/html': blob, 'text/plain': textBlob }),
    ]);
    els.copyStatus.textContent = 'Copied — paste into a new Outlook message';
  } catch (err) {
    // Fallback: text only
    await navigator.clipboard.writeText(lastResult.html);
    els.copyStatus.textContent = 'Copied (as HTML source — paste into Outlook)';
  }
  setTimeout(() => (els.copyStatus.textContent = ''), 4000);
});

els.downloadEml.addEventListener('click', () => {
  if (!lastResult?.eml) return;
  const { filename, content } = lastResult.eml;
  const bytes = Uint8Array.from(atob(content), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'message/rfc822' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
});

async function generate(scope) {
  els.preview.classList.add('hidden');
  els.status.textContent = `Generating ${scope.toUpperCase()} report… (first run can take ~30s while worker wakes)`;
  try {
    const r = await fetch(`${getWorkerUrl()}/generate/${scope}`, {
      method: 'POST',
      headers: { 'X-Team-Password': teamPassword, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (r.status === 401) {
      sessionStorage.removeItem('teamPw');
      teamPassword = '';
      showLogin();
      els.loginErr.textContent = 'Bad team password';
      return;
    }
    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || r.statusText);
    }
    lastResult = await r.json();
    els.previewFrame.srcdoc = lastResult.html;
    els.preview.classList.remove('hidden');
    els.status.textContent = `Generated ${scope.toUpperCase()} at ${new Date(lastResult.generatedAt).toLocaleString()}`;
  } catch (err) {
    els.status.textContent = `Failed: ${err.message}`;
  }
}

function showLogin() {
  els.dashView.classList.add('hidden');
  els.loginView.classList.remove('hidden');
}
function showDash() {
  els.loginView.classList.add('hidden');
  els.dashView.classList.remove('hidden');
}

function htmlToText(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.innerText;
}
