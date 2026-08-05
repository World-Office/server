const { exec } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const dotenv = require('dotenv');

const execAsync = promisify(exec);

// Load env vars (idempotent — won't overwrite existing)
dotenv.config();

const VERSION = '1.0.0';

// Container names we care about
const CONTAINER_MAP = {
  ocis: 'worldoffice-ocis',
  ocis_collaboration: 'worldoffice-ocis-collaboration',
  documentserver: 'worldoffice-documentserver',
  traefik: 'worldoffice-traefik'
};

/**
 * Run a docker command and return stdout. Returns null on any failure.
 */
async function runDocker(cmd) {
  try {
    const { stdout } = await execAsync(`docker ${cmd}`, {
      timeout: 10000,
      windowsHide: true
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get status of all worldoffice containers using docker ps.
 * Uses shell commands for maximum compatibility.
 */
async function getContainerStatuses() {
  const result = {};
  for (const [key, containerName] of Object.entries(CONTAINER_MAP)) {
    result[key] = {
      running: false,
      container: containerName,
      health: 'unknown'
    };
  }

  // Try docker ps to get running containers
  const output = await runDocker(
    `ps --filter "name=${Object.values(CONTAINER_MAP).join('" --filter "name=')}" --format "{{.Names}}|{{.State}}"`
  );

  if (!output) {
    // Docker not available — all remain unknown
    return result;
  }

  for (const line of output.split('\n')) {
    if (!line) continue;
    const [name, state] = line.split('|');
    if (!name) continue;

    // Find which service key this container belongs to
    for (const [key, containerName] of Object.entries(CONTAINER_MAP)) {
      if (name === containerName) {
        const running = state === 'running';
        result[key] = {
          running,
          container: containerName,
          health: running ? 'healthy' : 'stopped'
        };
        break;
      }
    }
  }

  return result;
}

/**
 * Build the full health response object.
 */
async function getHealthStatus() {
  const services = await getContainerStatuses();

  const runningCount = Object.values(services).filter(s => s.running).length;
  const totalCount = Object.keys(CONTAINER_MAP).length;

  let status = 'unknown';
  if (runningCount === totalCount && totalCount > 0) {
    status = 'ok';
  } else if (runningCount > 0) {
    status = 'degraded';
  } else {
    status = 'down';
  }

  return {
    status,
    services,
    config: {
      OCIS_DOMAIN: process.env.OCIS_DOMAIN || '',
      DOCUMENT_SERVER_DOMAIN: process.env.DOCUMENT_SERVER_DOMAIN || ''
    },
    version: VERSION,
    timestamp: new Date().toISOString()
  };
}

async function checkWopiConnectivity() {
  const docServerDomain = process.env.DOCUMENT_SERVER_DOMAIN;
  if (!docServerDomain) {
    return {
      accessible: false,
      error: 'DOCUMENT_SERVER_DOMAIN not configured',
      discoveryUrl: null
    };
  }

  const useSsl = process.env.ENABLE_SSL !== 'false';
  const scheme = useSsl ? 'https' : 'http';
  // The WOPI discovery endpoint is served by the docserver at /hosting/discovery
  const discoveryUrl = scheme + '://' + docServerDomain + '/hosting/discovery';

  try {
    const response = await axios.get(discoveryUrl, {
      timeout: 5000,
      validateStatus: function () { return true; }
    });

    return {
      accessible: response.status < 500,
      statusCode: response.status,
      discoveryUrl: discoveryUrl
    };
  } catch (error) {
    return {
      accessible: false,
      error: error.message,
      discoveryUrl: discoveryUrl
    };
  }
}

async function getSystemMetrics() {
  const containerNames = Object.values(CONTAINER_MAP);

  const psOutput = await runDocker('ps -a --filter "name=worldoffice" --format "{{.Names}}|{{.State}}"');
  let totalContainers = 0;
  let runningContainers = 0;
  if (psOutput) {
    for (const line of psOutput.split('\n')) {
      if (!line) continue;
      const [name] = line.split('|');
      if (name && containerNames.includes(name)) {
        totalContainers++;
        if (line.includes('running')) runningContainers++;
      }
    }
  }

  // Get memory usage via docker stats (non-streaming, one-shot)
  let memoryUsage = 0;
  const statsOutput = await runDocker(
    'stats --no-stream --format "{{.Name}}|{{.MemUsage}}" --filter "name=worldoffice" 2>/dev/null'
  );
  if (statsOutput) {
    for (const line of statsOutput.split('\n')) {
      // Parse memory usage like "125.4MiB / 1.952GiB"
      const memMatch = line.match(/([\d.]+)\s*(KiB|MiB|GiB)/);
      if (memMatch) {
        const value = parseFloat(memMatch[1]);
        const unit = memMatch[2];
        if (unit === 'KiB') memoryUsage += value / 1024;
        else if (unit === 'GiB') memoryUsage += value * 1024;
        else memoryUsage += value;
      }
    }
  }

  memoryUsage = Math.round(memoryUsage);

  return {
    containers: totalContainers,
    runningContainers: runningContainers,
    memoryUsage: memoryUsage,
    timestamp: new Date().toISOString()
  };
}

async function getFullHealthStatus() {
  const services = await getContainerStatuses();

  const runningCount = Object.values(services).filter(function (s) { return s.running; }).length;
  const totalCount = Object.keys(CONTAINER_MAP).length;

  let overall = 'unknown';
  if (runningCount === totalCount && totalCount > 0) {
    overall = 'healthy';
  } else if (runningCount > 0) {
    overall = 'degraded';
  } else {
    overall = 'down';
  }

  const wopi = await checkWopiConnectivity();
  const metrics = await getSystemMetrics();

  return {
    overall: overall,
    services: services,
    wopi: wopi,
    metrics: metrics,
    running: runningCount,
    healthy: runningCount,
    total: totalCount,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  getHealthStatus,
  getContainerStatuses,
  checkWopiConnectivity,
  getSystemMetrics,
  getFullHealthStatus,
  VERSION
};
