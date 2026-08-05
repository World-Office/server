/**
 * File Browser API — REST endpoints for browsing OCIS files.
 *
 * All endpoints require OCIS admin credentials to be configured.
 */
const express = require('express');
const router = express.Router();
const { OcisClient } = require('../lib/ocis-client.js');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

/**
 * Get an OCIS client instance from the app locals config.
 */
function getClient(req) {
  const config = req.app.locals.config || {};
  const ocisDomain = config.OCIS_DOMAIN || process.env.OCIS_DOMAIN || '';
  const adminUser = config.OCIS_ADMIN_USER || process.env.OCIS_ADMIN_USER || 'admin';
  const adminPass = config.OCIS_ADMIN_PASSWORD || process.env.OCIS_ADMIN_PASSWORD || '';

  // Use OCIS_INTERNAL_URL if set (for Docker networking);
  // otherwise default to the published host port so the dashboard
  // (which typically runs on the host, not in Docker) can reach OCIS.
  const internalUrl =
    process.env.OCIS_INTERNAL_URL ||
    `http://127.0.0.1:${config.OCIS_INTERNAL_PORT || process.env.OCIS_INTERNAL_PORT || '9200'}`;

  return new OcisClient({
    baseUrl: internalUrl,
    publicUrl: `https://${ocisDomain}`,
    username: adminUser,
    password: adminPass,
  });
}

/**
 * Check if OCIS credentials are configured.
 */
function isConfigured(req) {
  const config = req.app.locals.config || {};
  return !!(config.OCIS_ADMIN_PASSWORD || process.env.OCIS_ADMIN_PASSWORD);
}

// ── Middleware: ensure OCIS is configured ──────────────────────────────

router.use('/api/files', (req, res, next) => {
  if (!isConfigured(req)) {
    return res.status(412).json({
      error: 'OCIS_ADMIN_PASSWORD not configured',
      hint: 'Go to /setup and fill in OCIS admin credentials'
    });
  }
  next();
});

// ── GET /api/files/status — check connection ─────────────────────────

router.get('/api/files/status', async (req, res) => {
  try {
    const client = getClient(req);
    const ok = await client.checkConnection();
    res.json({ connected: ok, configured: true });
  } catch (e) {
    res.json({ connected: false, configured: true, error: e.message });
  }
});

// ── GET /api/files/spaces — list available spaces ─────────────────────

router.get('/api/files/spaces', async (req, res) => {
  try {
    const client = getClient(req);
    const spaces = await client.listSpaces();
    res.json(spaces);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/files/list — list files in a space ───────────────────────

router.get('/api/files/list', async (req, res) => {
  try {
    const space = req.query.space || 'personal';
    const path = req.query.path || '/';
    const client = getClient(req);
    const entries = await client.listFiles(space, path);
    res.json(entries);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/files/download — download a file ─────────────────────────

router.get('/api/files/download', async (req, res) => {
  try {
    const space = req.query.space || 'personal';
    const path = req.query.path || '';
    if (!path) return res.status(400).json({ error: 'path required' });

    const client = getClient(req);
    const data = await client.downloadFile(space, path);

    const filename = path.split('/').pop() || 'download';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/files/upload — upload a file ────────────────────────────

router.post('/api/files/upload', upload.single('file'), async (req, res) => {
  try {
    const space = req.query.space || 'personal';
    const destDir = req.query.path || '/';
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const destPath = `${destDir.replace(/\/$/, '')}/${file.originalname}`;
    const client = getClient(req);
    const result = await client.uploadFile(space, destPath, file.buffer, file.mimetype);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/files/delete — delete a file ──────────────────────────

router.delete('/api/files/delete', async (req, res) => {
  try {
    const space = req.query.space || 'personal';
    const path = req.query.path || '';
    if (!path) return res.status(400).json({ error: 'path required' });

    const client = getClient(req);
    await client.deleteFile(space, path);
    res.json({ deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/files/rename — rename a file ──────────────────────────

router.post('/api/files/rename', async (req, res) => {
  try {
    const space = req.query.space || 'personal';
    const { path: sourcePath, newName } = req.body;
    if (!sourcePath || !newName) {
      return res.status(400).json({ error: 'path and newName required' });
    }

    const parent = sourcePath.substring(0, sourcePath.lastIndexOf('/') + 1) || '/';
    const destPath = parent + newName;

    const client = getClient(req);
    await client.moveFile(space, sourcePath, destPath);
    res.json({ renamed: true, from: sourcePath, to: destPath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/files/mkdir — create directory ──────────────────────────

router.post('/api/files/mkdir', async (req, res) => {
  try {
    const space = req.query.space || 'personal';
    const { path: dirPath } = req.body;
    if (!dirPath) return res.status(400).json({ error: 'path required' });

    const client = getClient(req);
    await client.createDirectory(space, dirPath);
    res.json({ created: true, path: dirPath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/files/open/:space/:path(*) — open file in editor ─────────

router.get('/api/files/open', async (req, res) => {
  try {
    // space param reserved for multi-space support
    const filePath = req.query.path || '';
    if (!filePath) return res.status(400).json({ error: 'path required' });

    const config = req.app.locals.config || {};
    const ocisDomain = config.OCIS_DOMAIN || process.env.OCIS_DOMAIN || '';
    if (!ocisDomain) {
      return res.status(412).json({ error: 'OCIS_DOMAIN not configured' });
    }

    // Return the OCIS file open URL. OCIS handles WOPI token generation
    // and redirects to the document server automatically.
    const editorUrl = `https://${ocisDomain}/f/${encodeURIComponent(filePath)}`;

    res.json({
      editorUrl,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
