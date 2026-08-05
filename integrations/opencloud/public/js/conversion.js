/**
 * Conversion Center — Frontend
 *
 * Handles file upload, format selection, job polling, and result download.
 */
(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────

  var selectedFile = null;
  // // var pollTimer = null; // reserved for future polling // reserved for future polling interval
  var activeJobIds = {};

  // ─── DOM refs ───────────────────────────────────────────────────────

  var els = {};

  // ─── Utility ────────────────────────────────────────────────────────

  function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDuration(ms) {
    if (!ms) return '';
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(1) + 's';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // eslint-disable-next-line no-unused-vars
  function fileNameFromPath(path) {
    var p = path.replace(/\/+$/, '').split('/');
    return p[p.length - 1] || 'Unknown';
  }

  // ─── Init ───────────────────────────────────────────────────────────

  function init() {
    els.dropzone = document.getElementById('convDropzone');
    els.fileInput = document.getElementById('convFileInput');
    els.fileInfo = document.getElementById('convFileInfo');
    els.fileName = document.getElementById('convFileName');
    els.fileSize = document.getElementById('convFileSize');
    els.sourceFormat = document.getElementById('convSourceFormat');
    els.targetSelect = document.getElementById('convTargetFormat');
    els.submitBtn = document.getElementById('convSubmitBtn');
    els.jobList = document.getElementById('convJobList');

    if (!els.dropzone) return;

    // Drag and drop
    els.dropzone.addEventListener('click', function () {
      els.fileInput.click();
    });

    els.dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      els.dropzone.classList.add('dragover');
    });

    els.dropzone.addEventListener('dragleave', function () {
      els.dropzone.classList.remove('dragover');
    });

    els.dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      els.dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    els.fileInput.addEventListener('change', function () {
      if (els.fileInput.files.length > 0) {
        handleFile(els.fileInput.files[0]);
      }
    });

    // Submit
    els.submitBtn.addEventListener('click', submitConversion);

    // Load existing jobs
    loadJobs();
  }

  // ─── File handling ──────────────────────────────────────────────────

  function handleFile(file) {
    selectedFile = file;

    var ext = file.name.split('.').pop().toLowerCase();
    els.fileName.textContent = file.name;
    els.fileSize.textContent = formatSize(file.size);
    els.sourceFormat.textContent = ext.toUpperCase();
    els.fileInfo.classList.add('visible');

    // Auto-select target format based on source
    var suggested = suggestTarget(ext);
    if (suggested) {
      els.targetSelect.value = suggested;
    }

    els.submitBtn.disabled = false;
  }

  function suggestTarget(ext) {
    var map = {
      docx: 'pdf', doc: 'pdf',
      odt: 'pdf', rtf: 'pdf',
      txt: 'html',
      html: 'pdf',
      epub: 'pdf', fb2: 'pdf',
      xps: 'pdf', ofd: 'pdf',
      hwp: 'pdf', djvu: 'pdf',
      xlsx: 'pdf', ods: 'pdf',
      pptx: 'pdf', odp: 'pdf',
      vsdx: 'pdf', vsdm: 'pdf',
      pdf: 'docx',
    };
    return map[ext] || 'pdf';
  }

  // ─── Submit conversion ──────────────────────────────────────────────

  function submitConversion() {
    if (!selectedFile) return;

    var formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('target_format', els.targetSelect.value);

    els.submitBtn.disabled = true;
    els.submitBtn.textContent = 'Converting...';

    fetch('/api/conversion/submit', {
      method: 'POST',
      body: formData,
    })
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (job) {
        // Start polling this job
        activeJobIds[job.id] = true;
        pollJob(job.id);
        // Reset UI
        selectedFile = null;
        els.fileInfo.classList.remove('visible');
        els.fileInput.value = '';
        els.submitBtn.disabled = true;
        els.submitBtn.textContent = 'Convert';
        // Refresh job list
        loadJobs();
      })
      .catch(function (err) {
        alert('Conversion failed: ' + err.message);
        els.submitBtn.disabled = false;
        els.submitBtn.textContent = 'Convert';
      });
  }

  // ─── Job polling ────────────────────────────────────────────────────

  function pollJob(jobId) {
    if (!activeJobIds[jobId]) return;

    fetch('/api/conversion/jobs/' + jobId)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (job) {
        if (!job) {
          delete activeJobIds[jobId];
          return;
        }

        // Update the job card in the list
        updateJobCard(job);

        if (job.status === 'queued' || job.status === 'processing') {
          // Poll again in 1 second
          setTimeout(function () { pollJob(jobId); }, 1000);
        } else {
          delete activeJobIds[jobId];
        }
      })
      .catch(function () {
        // Retry on error
        if (activeJobIds[jobId]) {
          setTimeout(function () { pollJob(jobId); }, 2000);
        }
      });
  }

  // ─── Job list ───────────────────────────────────────────────────────

  function loadJobs() {
    fetch('/api/conversion/jobs?limit=30')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (jobs) {
        renderJobs(jobs);
        // Start polling any active jobs
        jobs.forEach(function (job) {
          if ((job.status === 'queued' || job.status === 'processing') && !activeJobIds[job.id]) {
            activeJobIds[job.id] = true;
            pollJob(job.id);
          }
        });
      })
      .catch(function () {});
  }

  function renderJobs(jobs) {
    if (!els.jobList) return;

    if (jobs.length === 0) {
      els.jobList.innerHTML = '<div class="conv-jobs-empty">No conversions yet. Upload a file to begin.</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < jobs.length; i++) {
      html += renderJobCard(jobs[i]);
    }
    els.jobList.innerHTML = html;

    // Bind download buttons
    els.jobList.querySelectorAll('.conv-btn-download').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-job-id');
        window.open('/api/conversion/result/' + id, '_blank');
      });
    });
  }

  function renderJobCard(job) {
    var badgeClass = job.status;
    var badgeText = job.status.charAt(0).toUpperCase() + job.status.slice(1);
    var name = escapeHtml(job.originalName || 'Unknown');
    var formats = escapeHtml(job.sourceFormat) + ' → ' + escapeHtml(job.targetFormat);
    var duration = formatDuration(job.durationMs);
    var downloadBtn = '';

    if (job.status === 'done' && job.hasResult) {
      downloadBtn = '<button class="btn-icon-sm conv-btn-download" data-job-id="' + escapeHtml(job.id) + '" title="Download result">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        '</button>';
    }

    return '<div class="conv-job" data-job-id="' + escapeHtml(job.id) + '">' +
      '<div class="conv-job-info">' +
        '<div class="conv-job-name">' + name + '</div>' +
        '<div class="conv-job-formats">' + formats + '</div>' +
      '</div>' +
      '<span class="conv-job-badge ' + badgeClass + '">' + badgeText + '</span>' +
      '<span class="conv-job-duration">' + duration + '</span>' +
      '<div class="conv-job-actions">' + downloadBtn + '</div>' +
    '</div>';
  }

  function updateJobCard(job) {
    // Find existing card and update it, or prepend new one
    var existing = els.jobList.querySelector('.conv-job[data-job-id="' + job.id + '"]');
    if (existing) {
      existing.outerHTML = renderJobCard(job);
    } else {
      // Prepend
      var html = renderJobCard(job);
      var empty = els.jobList.querySelector('.conv-jobs-empty');
      if (empty) {
        els.jobList.innerHTML = html;
      } else {
        els.jobList.insertAdjacentHTML('afterbegin', html);
      }
    }

    // Re-bind download button
    var newCard = els.jobList.querySelector('.conv-job[data-job-id="' + job.id + '"]');
    if (newCard) {
      var btn = newCard.querySelector('.conv-btn-download');
      if (btn) {
        btn.addEventListener('click', function () {
          window.open('/api/conversion/result/' + job.id, '_blank');
        });
      }
    }
  }

  // ─── Auto-refresh job list periodically ────────────────────────────

  setInterval(function () {
    loadJobs();
  }, 10000);

  // ─── Initialize ────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', init);

})();
