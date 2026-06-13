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

  // ─── Dashboard: Health Polling ───────────────────────────────────────

  function initDashboardHealthPolling() {
    const banner = document.getElementById('status-banner');
    const grid = document.getElementById('services-grid');
    if (!banner || !grid) return;

    async function pollHealth() {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) return;
        const data = await response.json();

        // Update status banner
        banner.className = 'status-banner status-' + data.status;
        const label = banner.querySelector('.status-label');
        const sub = banner.querySelector('.status-sub');
        const badge = banner.querySelector('.status-badge');

        if (label) {
          const labels = { ok: 'All Systems Operational', degraded: 'System Degraded', down: 'System Down', unknown: 'Status Unknown' };
          label.textContent = labels[data.status] || 'Status Unknown';
        }

        const runningCount = Object.values(data.services).filter(function (s) { return s.running; }).length;
        if (sub) {
          sub.textContent = runningCount + '/' + Object.keys(data.services).length + ' services running';
        }

        if (badge) {
          badge.className = 'status-badge status-' + data.status;
          badge.textContent = (data.status || 'unknown').toUpperCase();
        }

        // Update service cards
        const cards = grid.querySelectorAll('.service-card');
        cards.forEach(function (card) {
          const key = card.getAttribute('data-service');
          const svc = data.services[key];
          if (!svc) return;

          const dot = card.querySelector('.status-dot');
          const statusBadge = card.querySelector('.status-badge');

          if (dot) {
            dot.className = 'status-dot status-' + (svc.running ? 'running' : (svc.health === 'unknown' ? 'unknown' : 'stopped'));
          }

          if (statusBadge) {
            const cls = svc.running ? 'running' : (svc.health === 'unknown' ? 'unknown' : 'stopped');
            statusBadge.className = 'status-badge status-' + cls;
            statusBadge.textContent = svc.running ? 'Running' : (svc.health === 'unknown' ? 'Unknown' : 'Stopped');
          }
        });
      } catch (err) {
        // Silently fail — health polling shouldn't break the page
        console.warn('Health poll failed:', err.message);
      }
    }

    // Poll every 10 seconds
    pollHealth();
    setInterval(pollHealth, 10000);
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
