/**
 * File Browser — Dashboard-integrated file manager for OCIS.
 *
 * Provides:
 *   - File listing with icon grid / list view
 *   - Breadcrumb navigation
 *   - Upload (drag-and-drop + button)
 *   - Rename / Delete via context menu
 *   - Open in inline editor
 *
 * Relies on the /api/files/* endpoints.
 */
(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────

  var state = {
    connected: false,
    spaces: [],
    currentSpace: 'personal',
    currentPath: '/',
    files: [],
    selectedFile: null,
    viewMode: 'list', // 'list' | 'grid'
  };

  // ─── DOM refs (set on init) ─────────────────────────────────────────

  var els = {};

  // ─── Icon map ───────────────────────────────────────────────────────

  var FILE_ICONS = {
    folder: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    docx: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    xlsx: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    pptx: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    pdf: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6"/><path d="M12 12v6"/></svg>',
    generic: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  };

  function iconForFile(file) {
    if (file.isDirectory) return FILE_ICONS.folder;
    return FILE_ICONS[file.ext] || FILE_ICONS.generic;
  }

  // ─── Utility ────────────────────────────────────────────────────────

  function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatTime(isoString) {
    if (!isoString) return '—';
    try {
      var d = new Date(isoString);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  }

  function fileNameFromPath(path) {
    var parts = path.replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || 'Untitled';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ─── API calls ──────────────────────────────────────────────────────

  async function apiGet(url) {
    var resp = await fetch(url);
    if (!resp.ok) {
      var data = await resp.json().catch(function () { return {}; });
      throw new Error(data.error || 'HTTP ' + resp.status);
    }
    return resp.json();
  }

  async function apiPost(url, body) {
    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      var data = await resp.json().catch(function () { return {}; });
      throw new Error(data.error || 'HTTP ' + resp.status);
    }
    return resp.json();
  }

  async function apiDelete(url) {
    var resp = await fetch(url, { method: 'DELETE' });
    if (!resp.ok) {
      var data = await resp.json().catch(function () { return {}; });
      throw new Error(data.error || 'HTTP ' + resp.status);
    }
    return resp.json();
  }

  // ─── Navigation ─────────────────────────────────────────────────────

  function getNavPath() {
    return '/api/files/list?space=' + encodeURIComponent(state.currentSpace) + '&path=' + encodeURIComponent(state.currentPath);
  }

  // ─── Rendering ──────────────────────────────────────────────────────

  function renderBreadcrumbs() {
    if (!els.breadcrumbs) return;

    var parts = state.currentPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
    var html = '<a href="#" data-path="/" class="bc-root">📁 Root</a>';

    var cumulative = '';
    for (var i = 0; i < parts.length; i++) {
      cumulative += '/' + parts[i];
      html += ' <span class="bc-sep">/</span> ';
      html += '<a href="#" data-path="' + escapeHtml(cumulative) + '" class="bc-part">' + escapeHtml(parts[i]) + '</a>';
    }

    els.breadcrumbs.innerHTML = html;

    // Click handlers
    els.breadcrumbs.querySelectorAll('[data-path]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        navigateTo(el.getAttribute('data-path'));
      });
    });
  }

  function renderFiles() {
    if (!els.fileList) return;

    if (state.files.length === 0) {
      els.fileList.innerHTML = '<div class="fb-empty">This folder is empty</div>';
      updateStats();
      return;
    }

    var html = '';
    for (var i = 0; i < state.files.length; i++) {
      var f = state.files[i];
      var icon = iconForFile(f);
      var size = formatSize(f.size);
      var mod = formatTime(f.modified);
      var extClass = f.isDirectory ? 'fb-row--dir' : 'fb-row--file fb-row--' + (f.ext || 'generic');
      var openable = f.editorType && !f.isDirectory;

      html += '<div class="fb-row ' + extClass + '" data-path="' + escapeHtml(f.path) + '" data-name="' + escapeHtml(f.name) + '" data-isdir="' + f.isDirectory + '" data-editor="' + (f.editorType || '') + '">';
      html += '<span class="fb-icon">' + icon + '</span>';
      html += '<span class="fb-name">' + escapeHtml(f.name) + '</span>';
      html += '<span class="fb-size">' + size + '</span>';
      html += '<span class="fb-modified">' + mod + '</span>';
      html += '<span class="fb-actions">';

      if (openable) {
        html += '<button class="fb-btn-open" title="Open in editor" data-path="' + escapeHtml(f.path) + '" data-editor="' + f.editorType + '" data-name="' + escapeHtml(f.name) + '">';
        html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
        html += ' Open</button>';
      }

      html += '<button class="fb-btn-download" title="Download" data-path="' + escapeHtml(f.path) + '" data-name="' + escapeHtml(f.name) + '">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
      html += '</button>';

      html += '<button class="fb-btn-rename" title="Rename" data-path="' + escapeHtml(f.path) + '" data-name="' + escapeHtml(f.name) + '">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>';
      html += '</button>';

      html += '<button class="fb-btn-delete" title="Delete" data-path="' + escapeHtml(f.path) + '" data-name="' + escapeHtml(f.name) + '">';
      html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
      html += '</button>';

      html += '</span>';
      html += '</div>';
    }

    els.fileList.innerHTML = html;
    bindFileActions();
    updateStats();
  }

  function renderSpaceSelector() {
    if (!els.spaceSelect) return;
    var html = '';
    for (var i = 0; i < state.spaces.length; i++) {
      var s = state.spaces[i];
      var selected = s.id === state.currentSpace ? ' selected' : '';
      html += '<option value="' + escapeHtml(s.id) + '"' + selected + '>' + escapeHtml(s.name) + '</option>';
    }
    els.spaceSelect.innerHTML = html;
  }

  function updateStats() {
    if (!els.stats) return;
    var files = state.files.filter(function (f) { return !f.isDirectory; }).length;
    var dirs = state.files.filter(function (f) { return f.isDirectory; }).length;
    var total = state.files.length;
    els.stats.textContent = total + ' items (' + dirs + ' folders, ' + files + ' files)';
  }

  // ─── File action bindings ───────────────────────────────────────────

  function bindFileActions() {
    // Open in editor
    document.querySelectorAll('.fb-btn-open').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var path = btn.getAttribute('data-path');
        var editorType = btn.getAttribute('data-editor');
        var name = btn.getAttribute('data-name');
        openEditor(path, editorType, name);
      });
    });

    // Download
    document.querySelectorAll('.fb-btn-download').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var path = btn.getAttribute('data-path');
        var name = btn.getAttribute('data-name');
        var url = '/api/files/download?space=' + encodeURIComponent(state.currentSpace) + '&path=' + encodeURIComponent(path);
        window.open(url, '_blank');
      });
    });

    // Rename
    document.querySelectorAll('.fb-btn-rename').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var path = btn.getAttribute('data-path');
        var name = btn.getAttribute('data-name');
        renameFile(path, name);
      });
    });

    // Delete
    document.querySelectorAll('.fb-btn-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var path = btn.getAttribute('data-path');
        var name = btn.getAttribute('data-name');
        deleteFile(path, name);
      });
    });

    // Row click = navigate into directory
    document.querySelectorAll('.fb-row--dir').forEach(function (row) {
      row.addEventListener('dblclick', function () {
        var path = row.getAttribute('data-path');
        navigateTo(path);
      });
    });
  }

  // ─── Actions ────────────────────────────────────────────────────────

  async function navigateTo(path) {
    state.currentPath = path;
    renderBreadcrumbs();
    await loadFiles();
  }

  async function loadFiles() {
    if (!els.fileList) return;
    els.fileList.innerHTML = '<div class="fb-loading"><div class="fb-loading-spinner"></div><span>Loading files...</span></div>';

    try {
      state.files = await apiGet(getNavPath());
      renderFiles();
    } catch (err) {
      els.fileList.innerHTML = '<div class="fb-error">Failed to load files: ' + escapeHtml(err.message) + '</div>';
    }
  }

  async function loadSpaces() {
    try {
      state.spaces = await apiGet('/api/files/spaces');
      renderSpaceSelector();
    } catch (err) {
      console.warn('Failed to load spaces:', err.message);
    }
  }

  function openEditor(path, editorType, name) {
    var openUrl = '/editor?fileId=' + encodeURIComponent(path) + '&editorType=' + encodeURIComponent(editorType) + '&fileName=' + encodeURIComponent(name) + '&space=' + encodeURIComponent(state.currentSpace);
    window.location.href = openUrl;
  }

  async function renameFile(path, oldName) {
    var newName = prompt('Rename "' + oldName + '" to:', oldName);
    if (!newName || newName === oldName) return;

    try {
      await apiPost('/api/files/rename?space=' + encodeURIComponent(state.currentSpace), {
        path: path,
        newName: newName,
      });
      await loadFiles();
    } catch (err) {
      alert('Rename failed: ' + err.message);
    }
  }

  async function deleteFile(path, name) {
    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;

    try {
      await apiDelete('/api/files/delete?space=' + encodeURIComponent(state.currentSpace) + '&path=' + encodeURIComponent(path));
      await loadFiles();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  }

  // ─── Upload handling ────────────────────────────────────────────────

  function setupUpload() {
    if (!els.uploadZone) return;

    // Click to upload
    els.uploadBtn.addEventListener('click', function () {
      els.uploadInput.click();
    });

    els.uploadInput.addEventListener('change', function () {
      if (els.uploadInput.files.length > 0) {
        uploadFiles(els.uploadInput.files);
      }
    });

    // Drag-and-drop
    els.uploadZone.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.stopPropagation();
      els.uploadZone.classList.add('fb-upload--dragover');
    });

    els.uploadZone.addEventListener('dragleave', function (e) {
      e.preventDefault();
      e.stopPropagation();
      els.uploadZone.classList.remove('fb-upload--dragover');
    });

    els.uploadZone.addEventListener('drop', function (e) {
      e.preventDefault();
      e.stopPropagation();
      els.uploadZone.classList.remove('fb-upload--dragover');
      if (e.dataTransfer.files.length > 0) {
        uploadFiles(e.dataTransfer.files);
      }
    });
  }

  async function uploadFiles(fileList) {
    var files = Array.from(fileList);
    var total = files.length;
    var completed = 0;

    showUploadProgress('Uploading 0 / ' + total + '...');

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var formData = new FormData();
      formData.append('file', file);

      try {
        var resp = await fetch('/api/files/upload?space=' + encodeURIComponent(state.currentSpace) + '&path=' + encodeURIComponent(state.currentPath), {
          method: 'POST',
          body: formData,
        });
        if (!resp.ok) {
          console.warn('Upload failed:', file.name, resp.statusText);
        }
      } catch (err) {
        console.warn('Upload error:', file.name, err.message);
      }

      completed++;
      showUploadProgress('Uploading ' + completed + ' / ' + total + '...');
    }

    hideUploadProgress();
    await loadFiles();
  }

  function showUploadProgress(msg) {
    if (!els.uploadProgress) return;
    els.uploadProgress.textContent = msg;
    els.uploadProgress.style.display = 'flex';
  }

  function hideUploadProgress() {
    if (!els.uploadProgress) return;
    els.uploadProgress.style.display = 'none';
  }

  // ─── New folder ─────────────────────────────────────────────────────

  function setupNewFolder() {
    if (!els.newFolderBtn) return;
    els.newFolderBtn.addEventListener('click', function () {
      var name = prompt('New folder name:');
      if (!name) return;
      var dirPath = (state.currentPath.replace(/\/$/, '') + '/' + name).replace(/^\/+/, '/');
      apiPost('/api/files/mkdir?space=' + encodeURIComponent(state.currentSpace), { path: dirPath })
        .then(function () { return loadFiles(); })
        .catch(function (err) { alert('Failed to create folder: ' + err.message); });
    });
  }

  // ─── Space switching ────────────────────────────────────────────────

  function setupSpaceSelector() {
    if (!els.spaceSelect) return;
    els.spaceSelect.addEventListener('change', function () {
      state.currentSpace = els.spaceSelect.value;
      state.currentPath = '/';
      renderBreadcrumbs();
      loadFiles();
    });
  }

  // ─── Initialization ─────────────────────────────────────────────────

  function initFileBrowser() {
    // Cache DOM elements
    els.breadcrumbs = document.getElementById('fb-breadcrumbs');
    els.fileList = document.getElementById('fb-file-list');
    els.spaceSelect = document.getElementById('fb-space-select');
    els.uploadZone = document.getElementById('fb-upload-zone');
    els.uploadBtn = document.getElementById('fb-upload-btn');
    els.uploadInput = document.getElementById('fb-upload-input');
    els.uploadProgress = document.getElementById('fb-upload-progress');
    els.newFolderBtn = document.getElementById('fb-new-folder-btn');
    els.stats = document.getElementById('fb-stats');
    els.fileBrowser = document.getElementById('file-browser-panel');

    if (!els.fileList) return; // File browser not in DOM

    // Check connection status
    apiGet('/api/files/status')
      .then(function (status) {
        state.connected = status.connected;
        if (!status.connected) {
          els.fileList.innerHTML = '<div class="fb-error">Cannot connect to OCIS. Check admin credentials in /setup.</div>';
          return;
        }
        // Load spaces and files
        loadSpaces().then(function () { return loadFiles(); });
      })
      .catch(function (err) {
        els.fileList.innerHTML = '<div class="fb-error">' + escapeHtml(err.message) + '</div>';
      });

    setupUpload();
    setupNewFolder();
    setupSpaceSelector();
  }

  // Export for dashboard init
  window.initFileBrowser = initFileBrowser;

})();
