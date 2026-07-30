/**
 * Inline Editor — redirect to OCIS WOPI flow for file editing.
 *
 * The OCIS collaboration service generates proper WOPI tokens
 * (with WopiContext) that the docserver can pass through to OCIS.
 * This route builds the OCIS Web UI file open URL and redirects.
 *
 * Routes:
 *   GET /editor — redirect to OCIS file open URL
 */
const express = require('express');
const router = express.Router();

// ── GET /editor — redirect to OCIS for WOPI editing ────────────────────

router.get('/editor', (req, res) => {
  const config = req.app.locals.config || process.env;
  const ocisDomain = config.OCIS_DOMAIN || '';
  const fileId = req.query.fileId || '';
  const fileName = req.query.fileName || 'Document';

  if (!ocisDomain) {
    return res.render('error', {
      title: 'Configuration Error',
      message: 'OCIS_DOMAIN is not configured. Go to /setup to configure it.'
    });
  }

  if (!fileId) {
    return res.render('error', {
      title: 'Missing Parameter',
      message: 'No file specified. fileId is required.'
    });
  }

  // Redirect to OCIS Web UI's file open endpoint.
  // OCIS will redirect to the WOPI app (docserver) with a proper WopiContext JWT.
  const ocisFileUrl = `https://${ocisDomain}/f/${fileId}`;
  res.redirect(ocisFileUrl);
});

module.exports = router;
