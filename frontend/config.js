// Intac worker URL: direct HTTPS to the Advin VPS (Caddy, systemd report-intac), since 2026-11-24.
// Tailscale Funnel (https://alison-relay-vps.tailea90ac.ts.net) is bandwidth-limited, so the 3 MB weekly report never arrived through it.
// If this host stops answering, the Funnel URL above still reaches the same worker (slow for big reports).
window.__WORKER_URL__ = 'https://23-137-105-53.sslip.io';
