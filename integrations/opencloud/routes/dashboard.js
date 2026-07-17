const express = require('express');
const router = express.Router();
const { getHealthStatus } = require('../lib/health.js');

const BANNER_URL = 'https://codeberg.org/World-Office/artwork/raw/branch/main/assets/banner.png';

// Service metadata (static — doesn't depend on config.js)
const SERVICES = [
  {
    key: 'ocis',
    name: 'OCIS',
    description: 'ownCloud Infinite Scale — file sharing platform',
    containerName: 'worldoffice-ocis'
  },
  {
    key: 'ocis_collaboration',
    name: 'OCIS Collaboration',
    description: 'WOPI protocol service for document collaboration',
    containerName: 'worldoffice-ocis-collaboration'
  },
  {
    key: 'documentserver',
    name: 'Document Server',
    description: 'World Office document editing server',
    containerName: 'worldoffice-documentserver'
  },
  {
    key: 'traefik',
    name: 'Traefik',
    description: 'Reverse proxy with automatic SSL',
    containerName: 'worldoffice-traefik'
  }
];

// ── GET / — redirect to /dashboard ────────────────────────────────────

router.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// ── GET /dashboard ────────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  try {
    const health = await getHealthStatus();
    const config = req.app.locals.config || {};

    res.render('dashboard', {
      title: 'Dashboard — World Office Cloud',
      bannerUrl: BANNER_URL,
      services: SERVICES,
      health,
      config: {
        OCIS_DOMAIN: config.OCIS_DOMAIN || process.env.OCIS_DOMAIN || health.config.OCIS_DOMAIN,
        DOCUMENT_SERVER_DOMAIN: config.DOCUMENT_SERVER_DOMAIN || process.env.DOCUMENT_SERVER_DOMAIN || health.config.DOCUMENT_SERVER_DOMAIN,
        ENABLE_SSL: config.ENABLE_SSL !== undefined ? config.ENABLE_SSL : true
      },
      version: health.version
    });
  } catch (error) {
    res.status(500).render('error', { title: 'Error', message: error.message });
  }
});

module.exports = router;
