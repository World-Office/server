const express = require('express');
const router = express.Router();
const { getHealthStatus, checkWopiConnectivity, getSystemMetrics } = require('../lib/health.js');

router.get('/health', async (req, res) => {
  try {
    const health = await getHealthStatus();
    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      services: {},
      config: {},
      version: '1.0.0'
    });
  }
});

router.get('/health/wopi', async (req, res) => {
  try {
    const wopiStatus = await checkWopiConnectivity();
    res.status(wopiStatus.accessible ? 200 : 503).json(wopiStatus);
  } catch (error) {
    res.status(500).json({ accessible: false, error: error.message });
  }
});

router.get('/metrics', async (req, res) => {
  try {
    const metrics = await getSystemMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/config', function (req, res) {
  res.json({
    OCIS_DOMAIN: process.env.OCIS_DOMAIN || '',
    DOCUMENT_SERVER_DOMAIN: process.env.DOCUMENT_SERVER_DOMAIN || '',
    PORT: process.env.PORT || '3000',
    ENABLE_SSL: process.env.ENABLE_SSL !== 'false',
    ENABLE_METRICS: process.env.ENABLE_METRICS !== 'false',
    ENABLE_LOGS: process.env.ENABLE_LOGS !== 'false'
  });
});

module.exports = router;
