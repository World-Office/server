const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Required fields with defaults
const defaults = {
  PORT: '3000',
  NODE_ENV: 'development',
  OCIS_IMAGE: 'owncloud/ocis:latest',
  OCIS_ADMIN_USER: 'admin',
  OCIS_ADMIN_PASSWORD: '',
  DOCUMENT_SERVER_IMAGE: 'worldoffice/documentserver:latest',
  TRAEFIK_IMAGE: 'traefik:v2.10',
  TRAEFIK_HTTP_PORT: '80',
  TRAEFIK_HTTPS_PORT: '443',
  OCIS_INTERNAL_PORT: '9200',
  DOCUMENT_SERVER_INTERNAL_PORT: '80',
  OCIS_DATA_DIR: './data/ocis',
  DOCUMENT_SERVER_DATA_DIR: './data/documentserver',
  TRAEFIK_DATA_DIR: './data/traefik',
  ENABLE_SSL: 'true',
  ENABLE_METRICS: 'true',
  ENABLE_LOGS: 'true'
};

// Required fields (no defaults)
const required = [
  'OCIS_DOMAIN',
  'DOCUMENT_SERVER_DOMAIN',
  'OCIS_JWT_SECRET',
  'DOCUMENT_SERVER_JWT_SECRET'
];

// Semi-optional: admin password required for file browser
// eslint-disable-next-line no-unused-vars
const semiOptional = [
  'OCIS_ADMIN_PASSWORD'
];

function loadConfig() {
  // Merge defaults with environment variables
  const config = { ...defaults };

  // Load all environment variables
  Object.keys(process.env).forEach(key => {
    config[key] = process.env[key];
  });

  // Validate required fields
  const missing = required.filter(field => !config[field]);
  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }

  // Validate JWT secrets (minimum 32 characters)
  if (config.OCIS_JWT_SECRET.length < 32) {
    throw new Error('OCIS_JWT_SECRET must be at least 32 characters');
  }
  if (config.DOCUMENT_SERVER_JWT_SECRET.length < 32) {
    throw new Error('DOCUMENT_SERVER_JWT_SECRET must be at least 32 characters');
  }

  // Validate ports are numbers
  const ports = [
    'PORT', 'TRAEFIK_HTTP_PORT', 'TRAEFIK_HTTPS_PORT',
    'OCIS_INTERNAL_PORT', 'DOCUMENT_SERVER_INTERNAL_PORT'
  ];
  ports.forEach(port => {
    if (isNaN(parseInt(config[port]))) {
      throw new Error(`${port} must be a valid number`);
    }
  });

  // Convert boolean strings to booleans
  config.ENABLE_SSL = config.ENABLE_SSL === 'true';
  config.ENABLE_METRICS = config.ENABLE_METRICS === 'true';
  config.ENABLE_LOGS = config.ENABLE_LOGS === 'true';

  return config;
}

// Export configuration object
const config = loadConfig();

// Export derived values for convenience
config.OCIS_WOPI_SRC = `https://${config.OCIS_DOMAIN}`;
config.DOCUMENT_SERVER_PUBLIC_URL = `https://${config.DOCUMENT_SERVER_DOMAIN}`;
config.DOCUMENT_SERVER_INTERNAL_URL = `http://documentserver:${config.DOCUMENT_SERVER_INTERNAL_PORT}`;
config.OCIS_INTERNAL_URL = `http://ocis:${config.OCIS_INTERNAL_PORT}`;
config.COLLABORATION_APP_ADDR = config.DOCUMENT_SERVER_INTERNAL_URL;
config.COLLABORATION_APP_NAME = 'World Office Document Server';

// Path helpers
config.resolvePath = (relativePath) => path.resolve(__dirname, '..', relativePath);

module.exports = config;
