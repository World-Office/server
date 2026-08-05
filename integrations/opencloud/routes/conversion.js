/**
 * Conversion Center — API routes and view for document format conversion.
 *
 * Converts uploaded files via the Document Server's /api/conversion/convert
 * endpoint. Tracks job state in an in-memory queue.
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const multer = require('multer');
const queue = require('../lib/conversion-queue.js');

// ── Upload config ─────────────────────────────────────────────────────

const UPLOAD_DIR = path.resolve(__dirname, '..', 'data', 'uploads');
const RESULT_DIR = path.resolve(__dirname, '..', 'data', 'conversions');
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ── Well-known format extensions ──────────────────────────────────────

const FORMAT_LABELS = {
  // Documents
  docx: 'Word (.docx)',
  doc: 'Word (.doc)',
  odt: 'OpenDocument (.odt)',
  rtf: 'Rich Text (.rtf)',
  txt: 'Plain Text (.txt)',
  html: 'HTML (.html)',
  epub: 'EPUB (.epub)',
  fb2: 'FictionBook (.fb2)',
  xps: 'XPS (.xps)',
  ofd: 'OFD (.ofd)',
  hwp: 'HWP (.hwp)',
  djvu: 'DjVu (.djvu)',

  // Spreadsheets
  xlsx: 'Excel (.xlsx)',
  ods: 'OpenDocument Spreadsheet (.ods)',
  csv: 'CSV (.csv)',

  // Presentations
  pptx: 'PowerPoint (.pptx)',
  odp: 'OpenDocument Presentation (.odp)',

  // Diagrams
  vsdx: 'Visio (.vsdx)',
  vsdm: 'Visio Macro (.vsdm)',

  // PDF
  pdf: 'PDF (.pdf)',

  // Internal (hidden from UI)
  'wo-presentation': 'World-Office Presentation',
  'wo-spreadsheet': 'World-Office Spreadsheet',
  'wo-diagram': 'World-Office Diagram',
  'wo-pdf-document': 'World-Office PDF',
};

/**
 * Map a file extension to the format key used by the converter.
 */
function extToFormat(ext) {
  const map = {
    docx: 'docx', doc: 'docx',
    odt: 'odt', rtf: 'rtf',
    txt: 'txt', html: 'html',
    epub: 'epub', fb2: 'fb2',
    xps: 'xps', ofd: 'ofd',
    hwp: 'hwp', djvu: 'djvu',
    xlsx: 'xlsx', ods: 'ods', csv: 'csv',
    pptx: 'pptx', odp: 'odp',
    vsdx: 'vsdx', vsdm: 'vsdm',
    pdf: 'pdf',
  };
  return map[ext] || ext;
}

/**
 * Get the format key for a given target (user selection).
 */
// eslint-disable-next-line no-unused-vars
function targetToFormat(target) {
  // "docx" → "docx", "pdf" → "pdf", etc.
  return target;
}

/**
 * Detect source format from file extension.
 */
function formatFromFilename(name) {
  const parts = name.split('.');
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
  return extToFormat(ext);
}

// ── Document Server proxy helper ───────────────────────────────────────

/**
 * Call the Document Server's /api/conversion/convert endpoint.
 */
async function callDocServer(sourceFormat, targetFormat, fileData, config) {
  const docServerDomain = config.DOCUMENT_SERVER_DOMAIN || process.env.DOCUMENT_SERVER_DOMAIN;
  if (!docServerDomain) {
    throw new Error('DOCUMENT_SERVER_DOMAIN not configured');
  }

  const base64 = fileData.toString('base64');
  const url = `https://${docServerDomain}/api/conversion/convert`;

  const resp = await axios.post(url, {
    source_format: sourceFormat,
    target_format: targetFormat,
    data: base64,
  }, {
    timeout: 120000, // 2 minutes for large files
    validateStatus: () => true,
  });

  if (resp.status >= 400) {
    throw new Error(`Document Server returned HTTP ${resp.status}: ${JSON.stringify(resp.data)}`);
  }

  return resp.data;
}

/**
 * Get supported formats from Document Server.
 */
async function fetchFormats(config) {
  const docServerDomain = config.DOCUMENT_SERVER_DOMAIN || process.env.DOCUMENT_SERVER_DOMAIN;
  if (!docServerDomain) return [];

  try {
    const url = `https://${docServerDomain}/api/conversion/formats`;
    const resp = await axios.get(url, { timeout: 5000 });
    if (resp.status === 200 && resp.data && resp.data.formats) {
      return resp.data.formats;
    }
  } catch {
    // Fallback to static list
  }
  return [];
}

// ── GET /conversion — conversion center view ─────────────────────────

router.get('/conversion', async (req, res) => {
  const config = req.app.locals.config || process.env;
  const docServerDomain = config.DOCUMENT_SERVER_DOMAIN || process.env.DOCUMENT_SERVER_DOMAIN;

  const recentJobs = queue.listJobs(20).map(queue.serializeJob);

  res.render('conversion', {
    title: 'Conversion Center — World-Office Cloud',
    recentJobs,
    docServerDomain,
    config,
    FORMAT_LABELS,
  });
});

// ── POST /api/conversion/submit — upload + convert ──────────────────

router.post('/api/conversion/submit', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const targetFormat = req.body.target_format || 'pdf';
    const sourceFormat = req.body.source_format || formatFromFilename(file.originalname);

    if (!sourceFormat) {
      return res.status(400).json({ error: 'Could not detect source format' });
    }

    // Read uploaded file
    const fileData = await fs.readFile(file.path);

    // Create job
    const job = await queue.createJob(sourceFormat, targetFormat, file.path, file.originalname);
    queue.markProcessing(job.id);

    // Call Document Server (async — we poll for result)
    // Actually the Document Server call is synchronous, so we do it here
    // and update the job when complete.
    setImmediate(async () => {
      try {
        const config = req.app.locals.config || process.env;
        const result = await callDocServer(sourceFormat, targetFormat, fileData, config);

        if (result.status === 'Success' && result.data) {
          // Write result to disk
          await fs.mkdir(RESULT_DIR, { recursive: true });
          const resultExt = targetFormat.replace(/^wo-/, '');
          const resultFilename = `${job.id}_${file.originalname.replace(/\.[^.]+$/, '')}.${resultExt}`;
          const resultPath = path.join(RESULT_DIR, resultFilename);
          const resultData = Buffer.from(result.data, 'base64');
          await fs.writeFile(resultPath, resultData);

          queue.markDone(job.id, resultPath, result.duration_ms || 0);
        } else {
          queue.markError(job.id, result.error || 'Unknown conversion error', result.duration_ms || 0);
        }
      } catch (err) {
        queue.markError(job.id, err.message, 0);
      }

      // Clean up uploaded file
      try { await fs.unlink(file.path); } catch { /* file may already be deleted */ }
    });

    // Return immediately with job info
    res.json(queue.serializeJob(job));
  } catch (err) {
    // Clean up on error
    if (req.file && req.file.path) {
      try { await fs.unlink(req.file.path); } catch { /* file may already be deleted */ }
    }
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/conversion/jobs — list recent jobs ──────────────────────

router.get('/api/conversion/jobs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const jobs = queue.listJobs(limit).map(queue.serializeJob);
  res.json(jobs);
});

// ── GET /api/conversion/jobs/:id — get job status ────────────────────

router.get('/api/conversion/jobs/:id', (req, res) => {
  const job = queue.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(queue.serializeJob(job));
});

// ── GET /api/conversion/result/:id — download result ─────────────────

router.get('/api/conversion/result/:id', async (req, res) => {
  const job = queue.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'done') return res.status(400).json({ error: 'Job not completed' });
  if (!job.resultPath) return res.status(404).json({ error: 'Result file not found' });

  try {
    await fs.access(job.resultPath);
    const resultExt = job.targetFormat.replace(/^wo-/, '');
    const downloadName = job.originalName.replace(/\.[^.]+$/, '') + '.' + resultExt;
    res.download(job.resultPath, downloadName);
  } catch {
    res.status(404).json({ error: 'Result file no longer available' });
  }
});

// ── GET /api/conversion/formats — supported format list ──────────────

router.get('/api/conversion/formats', async (req, res) => {
  const config = req.app.locals.config || process.env;
  const pairs = await fetchFormats(config);

  // Also return the label map for UI display
  res.json({
    pairs,
    labels: FORMAT_LABELS,
  });
});

// ── GET /api/conversion/formats/from/:format — supported targets ────

router.get('/api/conversion/formats/from/:format', async (req, res) => {
  const config = req.app.locals.config || process.env;
  const pairs = await fetchFormats(config);
  const source = req.params.format;

  const targets = pairs
    .filter(([s]) => s === source)
    .map(([, t]) => t);

  res.json({ source, targets });
});

module.exports = router;
