const config = require('./config.js');
const fs = require('fs').promises;
const path = require('path');

/**
 * Generate OCIS web-ui.json configuration
 */
function generateWebUIConfig() {
  return {
    server: `${config.OCIS_WOPI_SRC}`,
    theme: 'default',
    openIdConnect: {
      metadataUrl: `${config.OCIS_WOPI_SRC}/.well-known/openid-configuration`
    },
    apps: {
      files: {
        enabled: true,
        path: '/files'
      },
      settings: {
        enabled: true,
        path: '/settings'
      }
    },
    editor: {
      mimeTypeHandlers: [
        {
          extension: [
            'odt', 'fodt', 'ott', 'rtf',
            'ods', 'fods', 'ots',
            'odp', 'fodp', 'otp',
            'docx', 'xlsx', 'pptx',
            'vsdx', 'vssx', 'vstx', 'vsdm', 'vssm', 'vstm'
          ],
          handler: {
            url: `${config.OCIS_WOPI_SRC}/wopi`,
            openNewTab: true,
            hasMenuEntry: true
          }
        }
      ]
    },
    options: {
      hideSearchBar: false,
      disablePreviews: false,
      general: {
        displayName: 'World Office Cloud',
        slogan: 'Your documents, anywhere',
        hideVersion: false
      }
    }
  };
}

/**
 * Generate OCIS identity provider configuration
 */
function generateIdpConfig() {
  return {
    idp: {
      manager: {
        oidc: {
          issuer: `${config.OCIS_WOPI_SRC}`,
          clientID: 'ocis',
          clientSecret: config.OCIS_JWT_SECRET
        }
      },
      ldap: {},
      basic: {
        enabled: true
      }
    }
  };
}

/**
 * Write all OCIS configuration files
 */
async function writeOcisConfig(outputDir) {
  await fs.mkdir(outputDir, { recursive: true });

  // Write web-ui.json
  const webUIConfig = generateWebUIConfig();
  const webUIPath = path.join(outputDir, 'web-ui.json');
  await fs.writeFile(webUIPath, JSON.stringify(webUIConfig, null, 2), 'utf-8');

  // Write idp.json
  const idpConfig = generateIdpConfig();
  const idpPath = path.join(outputDir, 'idp.json');
  await fs.writeFile(idpPath, JSON.stringify(idpConfig, null, 2), 'utf-8');

  return {
    webUI: webUIPath,
    idp: idpPath
  };
}

/**
 * Generate OCIS environment variable mappings
 */
function getOcisEnvVars() {
  return {
    // Domain and URLs
    OCIS_DOMAIN: config.OCIS_DOMAIN,
    OCIS_URL: config.OCIS_WOPI_SRC,
    OCIS_INSECURE: 'false',

    // JWT
    OCIS_JWT_SECRET: config.OCIS_JWT_SECRET,

    // Services
    OCIS_EXCLUDE_RUN_SERVICES: 'idm,storage-gateway,storage-users,storage-home,ocdav',

    // Storage
    STORAGE_OCIS_DATA_DIR: '/var/lib/ocis',
    STORAGE_HOME_DRIVER: 'owncloudxc',
    STORAGE_USERS_DRIVER: 'owncloudxc',

    // Gateway
    OCIS_REVA_GATEWAY: config.OCIS_INTERNAL_URL,
    OCIS_FRONTEND_OCS: config.OCIS_INTERNAL_URL,
    GATEWAY_GRPC_ADDR: `${config.OCIS_INTERNAL_URL}:9143`,

    // Events
    OCIS_EVENTS_GRPC_ADDR: `${config.OCIS_INTERNAL_URL}:9143`,

    // HTTP
    OCIS_HTTP_ADDR: `:${config.OCIS_INTERNAL_PORT}`,

    // Web UI
    WEB_UI_CONFIG_FILE: '/etc/ocis/web-ui.json',

    // Proxy
    PROXY_TLS: config.ENABLE_SSL ? 'true' : 'false',

    // Auth
    AUTHENTICATION_HANDLERS: 'basic',
    IDM_CREATE_DEMO_USERS: 'false',

    // Logging
    OCIS_LOG_LEVEL: 'info',
    OCIS_LOG_PRETTY: 'true',

    // Collaboration (WOPI)
    COLLABORATION_WOPI_SRC: config.OCIS_WOPI_SRC,
    COLLABORATION_APP_ADDR: config.COLLABORATION_APP_ADDR,
    COLLABORATION_APP_NAME: config.COLLABORATION_APP_NAME
  };
}

module.exports = {
  generateWebUIConfig,
  generateIdpConfig,
  writeOcisConfig,
  getOcisEnvVars
};
