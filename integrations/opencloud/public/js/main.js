/**
 * World Office Cloud — Main Client-side JavaScript
 * Handles: dashboard health polling, setup wizard interactions, copy-to-clipboard
 */
(function () {
  'use strict';

  // ─── Utility: Generate random base64 secret (32 bytes) ──────────────

  function generateSecret() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array));
  }

  // ─── Utility: Format relative time ─────────────────────────────────

  function formatRelativeTime(isoString) {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 5) return 'just now';
    if (diffSec < 60) return diffSec + 's ago';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return diffMin + 'm ago';
    return new Date(isoString).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // ─── Utility: Format timestamp ─────────────────────────────────────

  function formatTimestamp(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return '—';
    }
  }

  // ─── Dashboard: Full Health Polling ─────────────────────────────────

  function initDashboardHealthPolling() {
    const banner = document.getElementById('status-banner');
    const grid = document.getElementById('services-grid');
    const insightRow = document.getElementById('insight-row');
    if (!banner || !grid) return;

    let countdown = 10;
    const countdownEl = document.getElementById('refresh-countdown');

    function updateCountdown() {
      countdown--;
      if (countdown <= 0) countdown = 10;
      if (countdownEl) {
        countdownEl.textContent = countdown;
        if (countdown <= 3) countdownEl.classList.add('active');
        else countdownEl.classList.remove('active');
      }
    }

    // Update countdown every second
    setInterval(updateCountdown, 1000);

    async function pollHealth() {
      try {
        // Fetch full health + wopi + metrics in parallel
        const [healthRes, wopiRes, metricsRes] = await Promise.all([
          fetch('/api/health').then(function (r) { return r.ok ? r.json() : null; }),
          fetch('/api/health/wopi').then(function (r) { return r.ok ? r.json() : null; }),
          fetch('/api/metrics').then(function (r) { return r.ok ? r.json() : null; }),
        ]);

        if (healthRes) {
          updateStatusBanner(banner, healthRes);
          updateServiceCards(grid, healthRes);
          updateTimestamp(healthRes);
        }

        if (wopiRes && insightRow) {
          updateWopiCard(wopiRes);
        }

        if (metricsRes && insightRow) {
          updateMetricsCard(metricsRes);
        }

        if (healthRes && insightRow) {
          updateHealthScoreCard(healthRes);
        }
      } catch (err) {
        console.warn('Health poll failed:', err.message);
      }
    }

    // Initial poll
    pollHealth();
    // Poll every 10 seconds
    setInterval(pollHealth, 10000);
  }

  function updateStatusBanner(banner, health) {
    const status = health.status || 'unknown';
    banner.className = 'status-banner status-' + status;

    const label = banner.querySelector('.status-label');
    const sub = banner.querySelector('.status-sub');
    const badge = banner.querySelector('.status-badge');

    const labels = { ok: 'All Systems Operational', degraded: 'System Degraded', down: 'System Down', unknown: 'Status Unknown' };
    if (label) label.textContent = labels[status] || 'Status Unknown';

    const serviceKeys = Object.keys(health.services || {});
    const runningCount = serviceKeys.filter(function (k) { return health.services[k] && health.services[k].running; }).length;
    if (sub) sub.textContent = runningCount + '/' + serviceKeys.length + ' services running';

    if (badge) {
      badge.className = 'status-badge status-' + status;
      badge.textContent = (status || 'unknown').toUpperCase();
    }
  }

  function updateServiceCards(grid, health) {
    const cards = grid.querySelectorAll('.service-card');
    cards.forEach(function (card) {
      const key = card.getAttribute('data-service');
      const svc = health.services ? health.services[key] : null;
      if (!svc) return;

      const isRunning = svc.running;
      const healthClass = isRunning ? 'running' : (svc.health === 'unknown' ? 'unknown' : 'stopped');

      const dot = card.querySelector('.status-dot');
      const statusBadge = card.querySelector('.status-badge');

      if (dot) {
        dot.className = 'status-dot status-' + healthClass;
      }

      if (statusBadge) {
        statusBadge.className = 'status-badge status-' + healthClass;
        statusBadge.textContent = isRunning ? 'Running' : (svc.health === 'unknown' ? 'Unknown' : 'Stopped');
      }

      // Show uptime row if available
      const uptimeRow = card.querySelector('.service-detail-row--uptime');
      if (uptimeRow && svc.uptime) {
        uptimeRow.style.display = 'flex';
        uptimeRow.querySelector('.service-uptime').textContent = svc.uptime;
      }
    });
  }

  function updateTimestamp(health) {
    const el = document.getElementById('last-check-time');
    if (el && health.timestamp) {
      const abs = formatTimestamp(health.timestamp);
      const rel = formatRelativeTime(health.timestamp);
      el.textContent = rel + ' (' + abs + ')';
    }
  }

  function updateWopiCard(wopi) {
    const card = document.getElementById('wopi-card');
    if (!card) return;

    const statusEl = document.getElementById('wopi-status');
    const discoveryEl = document.getElementById('wopi-discovery');

    if (wopi.accessible) {
      statusEl.innerHTML = '<span class="status-dot status-running"></span><span>Accessible</span>';
      card.style.borderColor = 'var(--success)';
      if (discoveryEl) {
        discoveryEl.innerHTML = '<a href="' + wopi.discoveryUrl + '" target="_blank">Discovery endpoint</a> · HTTP ' + wopi.statusCode;
      }
    } else {
      statusEl.innerHTML = '<span class="status-dot status-stopped"></span><span>Unreachable</span>';
      card.style.borderColor = 'var(--error)';
      if (discoveryEl) {
        discoveryEl.textContent = wopi.error || 'Connection failed';
      }
    }
  }

  function updateMetricsCard(metrics) {
    const statusEl = document.getElementById('metrics-status');
    const memoryEl = document.getElementById('metrics-memory');
    if (!statusEl) return;

    const running = metrics.runningContainers || 0;
    const total = metrics.containers || 0;
    statusEl.innerHTML = '<span class="insight-value">' + running + '</span><span class="insight-label"> / ' + total + ' containers</span>';

    if (memoryEl) {
      const mem = metrics.memoryUsage || 0;
      memoryEl.textContent = 'Memory: ' + mem + ' MiB';
    }
  }

  function updateHealthScoreCard(health) {
    const scoreEl = document.getElementById('health-score-value');
    const detailEl = document.getElementById('health-detail');
    if (!scoreEl) return;

    const serviceKeys = Object.keys(health.services || {});
    const runningCount = serviceKeys.filter(function (k) { return health.services[k] && health.services[k].running; }).length;
    const total = serviceKeys.length;

    scoreEl.textContent = runningCount;
    if (detailEl) {
      detailEl.textContent = runningCount + ' of ' + total + ' services healthy';
    }

    // Color based on percentage
    const pct = total > 0 ? runningCount / total : 0;
    if (pct >= 1) scoreEl.style.color = 'var(--success)';
    else if (pct >= 0.5) scoreEl.style.color = 'var(--warning)';
    else scoreEl.style.color = 'var(--error)';
  }

  // ─── Setup Wizard: Password visibility toggle ────────────────────────

  function initPasswordToggles() {
    document.querySelectorAll('[data-toggle="password"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        // Update icon
        btn.title = isPassword ? 'Hide' : 'Show';
        btn.style.color = isPassword ? 'var(--primary)' : '';
      });
    });
  }

  // ─── Setup Wizard: Generate secrets button ───────────────────────────

  function initGenerateSecrets() {
    const btn = document.getElementById('btn-generate-secrets');
    const autoInput = document.getElementById('_autoSecrets');
    const ocisInput = document.getElementById('OCIS_JWT_SECRET');
    const dsInput = document.getElementById('DOCUMENT_SERVER_JWT_SECRET');
    if (!btn) return;

    btn.addEventListener('click', function () {
      const ocisSecret = generateSecret();
      const dsSecret = generateSecret();

      if (ocisInput) ocisInput.value = ocisSecret;
      if (dsInput) dsInput.value = dsSecret;
      if (autoInput) autoInput.value = 'true';

      // Visual feedback
      btn.style.background = 'var(--success)';
      btn.style.borderColor = 'var(--success)';
      btn.style.color = 'var(--bg-void)';
      btn.textContent = 'Secrets Generated!';
      setTimeout(function () {
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;vertical-align:middle;"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg> Auto-generate Secure Secrets';
      }, 2000);
    });
  }

  // ─── Setup Wizard: Form validation ───────────────────────────────────

  function initFormValidation() {
    const form = document.getElementById('setup-form');
    if (!form) return;

    form.addEventListener('submit', function (e) {
      // Clear previous errors
      form.querySelectorAll('.form-error').forEach(function (el) { el.remove(); });
      form.querySelectorAll('.form-group').forEach(function (el) { el.classList.remove('has-error'); });

      let valid = true;

      // Validate OCIS_DOMAIN
      const ocisDomain = form.querySelector('#OCIS_DOMAIN');
      if (ocisDomain && !ocisDomain.value.trim()) {
        showFieldError(ocisDomain, 'OCIS domain is required');
        valid = false;
      }

      // Validate DOCUMENT_SERVER_DOMAIN
      const dsDomain = form.querySelector('#DOCUMENT_SERVER_DOMAIN');
      if (dsDomain && !dsDomain.value.trim()) {
        showFieldError(dsDomain, 'Document Server domain is required');
        valid = false;
      }

      if (!valid) {
        e.preventDefault();
        // Scroll to first error
        const firstError = form.querySelector('.form-error');
        if (firstError) firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  function showFieldError(input, message) {
    const group = input.closest('.form-group');
    if (!group) return;
    group.classList.add('has-error');

    const errorDiv = document.createElement('div');
    errorDiv.className = 'form-error';
    errorDiv.textContent = message;
    group.appendChild(errorDiv);
  }

  // ─── Auto-dismiss success alerts ─────────────────────────────────────

  function initAlertAutoDismiss() {
    document.querySelectorAll('.alert-success').forEach(function (alert) {
      setTimeout(function () {
        alert.style.transition = 'opacity 0.5s ease, max-height 0.5s ease';
        alert.style.opacity = '0';
        alert.style.maxHeight = '0';
        alert.style.overflow = 'hidden';
        alert.style.padding = '0';
        alert.style.marginBottom = '0';
        setTimeout(function () { alert.remove(); }, 500);
      }, 10000);
    });
  }

  // ─── Initialize ──────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', function () {
    initDashboardHealthPolling();
    initPasswordToggles();
    initGenerateSecrets();
    initFormValidation();
    initAlertAutoDismiss();
  });

})();
