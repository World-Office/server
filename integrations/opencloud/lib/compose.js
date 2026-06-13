const config = require('./config.js');
const fs = require('fs').promises;

async function generateDockerCompose() {
  const compose = {
    version: '3.8',
    services: {}
  };

  // Traefik proxy
  compose.services.traefik = {
    image: config.TRAEFIK_IMAGE,
    container_name: 'worldoffice-traefik',
    ports: [
      `${config.TRAEFIK_HTTP_PORT}:80`,
      `${config.TRAEFIK_HTTPS_PORT}:443`
    ],
    volumes: [
      `${config.TRAEFIK_DATA_DIR}/letsencrypt:/letsencrypt`,
      `${config.TRAEFIK_DATA_DIR}/logs:/var/log/traefik`,
      '/var/run/docker.sock:/var/run/docker.sock:ro'
    ],
    command: [
      '--api.insecure=true',
      '--providers.docker=true',
      '--providers.docker.exposedbydefault=false',
      '--entrypoints.web.address=:80',
      '--entrypoints.websecure.address=:443'
    ],
    labels: {
      'traefik.enable': 'true'
    },
    networks: ['worldoffice-network']
  };

  // OCIS service
  compose.services.ocis = {
    image: config.OCIS_IMAGE,
    container_name: 'worldoffice-ocis',
    environment: [
      `OCIS_DOMAIN=${config.OCIS_DOMAIN}`,
      `OCIS_JWT_SECRET=${config.OCIS_JWT_SECRET}`,
      `OCIS_URL=${config.OCIS_WOPI_SRC}`,
      `OCIS_INSECURE=false`,
      `OCIS_LOG_LEVEL=info`,
      `OCIS_LOG_PRETTY=true`,
      `PROXY_TLS=true`,
      `STORAGE_OCIS_DATA_DIR=/var/lib/ocis`,
      `STORAGE_HOME_DRIVER=owncloudxc`,
      `STORAGE_USERS_DRIVER=owncloudxc`,
      `OCIS_REVA_GATEWAY=${config.OCIS_INTERNAL_URL}`,
      `OCIS_FRONTEND_OCS=${config.OCIS_INTERNAL_URL}`,
      `OCIS_EVENTS_GRPC_ADDR=${config.OCIS_INTERNAL_URL}:9143`,
      `OCIS_GRPC_ADDR=${config.OCIS_INTERNAL_URL}:9143`,
      `OCIS_HTTP_ADDR=:${config.OCIS_INTERNAL_PORT}`,
      `GATEWAY_GRPC_ADDR=${config.OCIS_INTERNAL_URL}:9143`,
      `AUTHENTICATION_HANDLERS=basic`,
      `OCIS_EXCLUDE_RUN_SERVICES=idm,storage-gateway,storage-users,storage-home,ocdav`,
      `IDM_CREATE_DEMO_USERS=false`,
      `WEB_UI_CONFIG_FILE=/etc/ocis/web-ui.json`
    ],
    volumes: [
      `${config.OCIS_DATA_DIR}/data:/var/lib/ocis`,
      `${config.OCIS_DATA_DIR}/config:/etc/ocis`,
      `${config.OCIS_DATA_DIR}/logs:/var/log/ocis`
    ],
    expose: [config.OCIS_INTERNAL_PORT],
    labels: {
      'traefik.enable': 'true',
      'traefik.http.routers.ocis.rule': `Host(\`${config.OCIS_DOMAIN}\`)`,
      'traefik.http.routers.ocis.entrypoints': config.ENABLE_SSL ? 'websecure' : 'web',
      'traefik.http.routers.ocis.tls': config.ENABLE_SSL ? 'true' : 'false',
      'traefik.http.services.ocis.loadbalancer.server.port': config.OCIS_INTERNAL_PORT
    },
    depends_on: ['traefik'],
    networks: ['worldoffice-network']
  };

  // OCIS Collaboration Service (WOPI)
  compose.services['ocis-collaboration'] = {
    image: config.OCIS_IMAGE,
    container_name: 'worldoffice-ocis-collaboration',
    command: [
      'ocis',
      'collaboration',
      '--log-level=info',
      '--log-pretty=true'
    ],
    environment: [
      `OCIS_DOMAIN=${config.OCIS_DOMAIN}`,
      `OCIS_JWT_SECRET=${config.OCIS_JWT_SECRET}`,
      `COLLABORATION_WOPI_SRC=${config.OCIS_WOPI_SRC}`,
      `COLLABORATION_APP_ADDR=${config.COLLABORATION_APP_ADDR}`,
      `COLLABORATION_APP_NAME=${config.COLLABORATION_APP_NAME}`,
      `OCIS_REVA_GATEWAY=${config.OCIS_INTERNAL_URL}:9143`,
      `GATEWAY_GRPC_ADDR=${config.OCIS_INTERNAL_URL}:9143`,
      `COLLABORATION_EDITORS_ALBUM=`,
      `COLLABORATION_WOPI_SESSION_ALBUM=`
    ],
    volumes: [
      `${config.OCIS_DATA_DIR}/data:/var/lib/ocis`,
      `${config.OCIS_DATA_DIR}/logs:/var/log/ocis`
    ],
    expose: ['9230'],
    labels: {
      'traefik.enable': 'true',
      'traefik.http.routers.collaboration.rule': `Host(\`${config.OCIS_DOMAIN}\`) && PathPrefix(\`/wopi\`)`,
      'traefik.http.routers.collaboration.entrypoints': config.ENABLE_SSL ? 'websecure' : 'web',
      'traefik.http.routers.collaboration.tls': config.ENABLE_SSL ? 'true' : 'false',
      'traefik.http.services.collaboration.loadbalancer.server.port': '9230'
    },
    depends_on: ['ocis'],
    networks: ['worldoffice-network']
  };

  // Document Server
  compose.services.documentserver = {
    image: config.DOCUMENT_SERVER_IMAGE,
    container_name: 'worldoffice-documentserver',
    environment: [
      `JWT_SECRET=${config.DOCUMENT_SERVER_JWT_SECRET}`,
      `JWT_HEADER=Authorization`,
      `JWT_IN_BODY=true`
    ],
    volumes: [
      `${config.DOCUMENT_SERVER_DATA_DIR}/data:/var/www/worldoffice/Data`,
      `${config.DOCUMENT_SERVER_DATA_DIR}/logs:/var/log/worldoffice`,
      `${config.DOCUMENT_SERVER_DATA_DIR}/lib:/var/lib/worldoffice`,
      `${config.DOCUMENT_SERVER_DATA_DIR}/db:/var/lib/postgresql`
    ],
    expose: [config.DOCUMENT_SERVER_INTERNAL_PORT],
    labels: {
      'traefik.enable': 'true',
      'traefik.http.routers.documentserver.rule': `Host(\`${config.DOCUMENT_SERVER_DOMAIN}\`)`,
      'traefik.http.routers.documentserver.entrypoints': config.ENABLE_SSL ? 'websecure' : 'web',
      'traefik.http.routers.documentserver.tls': config.ENABLE_SSL ? 'true' : 'false',
      'traefik.http.services.documentserver.loadbalancer.server.port': config.DOCUMENT_SERVER_INTERNAL_PORT
    },
    depends_on: ['ocis'],
    networks: ['worldoffice-network']
  };

  // Networks
  compose.networks = {
    'worldoffice-network': {
      driver: 'bridge'
    }
  };

  return compose;
}

async function writeDockerCompose(outputPath) {
  const compose = await generateDockerCompose();
  const yaml = require('js-yaml');
  const yamlString = yaml.dump(compose, {
    lineWidth: 120,
    noRefs: true
  });

  await fs.writeFile(outputPath, yamlString, 'utf-8');
  return yamlString;
}

module.exports = {
  generateDockerCompose,
  writeDockerCompose
};
