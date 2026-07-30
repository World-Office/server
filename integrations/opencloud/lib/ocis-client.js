/**
 * OCIS API Client — WebDAV + Graph API for the file browser.
 *
 * Communicates with OCIS over HTTP (via the Docker network or public URL).
 * Uses Basic Auth with admin credentials stored in .env.
 *
 * WebDAV endpoints (OCIS):
 *   Personal files:  GET /remote.php/dav/files/{username}/
 *   Spaces (shared): GET /dav/spaces/{space-id}/
 */
const axios = require('axios');
const { DOMParser } = require('@xmldom/xmldom');

// OCIS default admin user
const DEFAULT_ADMIN_USER = 'admin';

/**
 * Determine the editor type from a file extension.
 */
function editorTypeForExtension(ext) {
  const map = {
    docx: 'word', doc: 'word', odt: 'word', rtf: 'word', txt: 'word',
    xlsx: 'sheet', xls: 'sheet', ods: 'sheet', csv: 'sheet',
    pptx: 'slide', ppt: 'slide', odp: 'slide',
    pdf: 'pdf',
    vsdx: 'diagram', vsdm: 'diagram', vssx: 'diagram', vstx: 'diagram',
  };
  return map[ext] || null;
}

class OcisClient {
  /**
   * @param {object} options
   * @param {string} options.baseUrl     - OCIS internal URL (e.g. http://ocis:9200)
   * @param {string} options.publicUrl   - OCIS public URL (e.g. https://ocis.example.com)
   * @param {string} options.username    - Admin username (default: 'admin')
   * @param {string} options.password    - Admin password
   */
  constructor(options) {
    this.baseUrl = (options.baseUrl || 'http://ocis:9200').replace(/\/+$/, '');
    this.publicUrl = (options.publicUrl || 'https://ocis.example.com').replace(/\/+$/, '');
    this.username = options.username || DEFAULT_ADMIN_USER;
    this.password = options.password || '';

    // Axios instance with Basic Auth
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      auth: {
        username: this.username,
        password: this.password,
      },
      // Accept XML for WebDAV PROPFIND, JSON for Graph API
      headers: {
        'Accept': 'application/json, text/plain, */*',
      },
      validateStatus: () => true,
    });
  }

  // ── Authentication check ────────────────────────────────────────────

  /**
   * Verify that the configured credentials work by hitting the status endpoint.
   */
  async checkConnection() {
    try {
      const res = await this.http.get('/');
      return res.status < 500;
    } catch {
      return false;
    }
  }

  // ── Space listing ───────────────────────────────────────────────────

  /**
   * List available spaces (personal + project) for the admin user.
   * Uses OCIS Graph API: GET /graph/v1.0/me/drive
   *
   * Returns simplified space objects.
   */
  async listSpaces() {
    // Try Graph API for drives/spaces
    const res = await this.http.get('/graph/v1.0/me/drives');
    if (res.status === 200 && res.data && res.data.value) {
      return res.data.value.map(d => ({
        id: d.id,
        name: d.name || d.description || 'Unnamed',
        type: d.driveType || 'personal',
        webUrl: d.webUrl || null,
        description: d.description || '',
        quota: d.quota || null,
      }));
    }

    // Fallback: return a single "personal" space
    return [{
      id: 'personal',
      name: 'Personal',
      type: 'personal',
      webUrl: `${this.publicUrl}/files`,
      description: 'My personal files',
      quota: null,
    }];
  }

  // ── File listing (WebDAV PROPFIND) ──────────────────────────────────

  /**
   * List files at a given path in a space.
   *
   * @param {string} spacePath - Space path (e.g. 'personal' or full space ID)
   * @param {string} dirPath   - Directory path relative to space root
   * @returns {Array<object>} file entries
   */
  async listFiles(spacePath, dirPath = '/') {
    const davPath = this._davUrl(spacePath, dirPath);
    const res = await this.http.request({
      method: 'PROPFIND',
      url: davPath,
      headers: {
        Depth: '1',
        'Content-Type': 'application/xml',
      },
      data: `<?xml version="1.0" encoding="utf-8"?>
<propfind xmlns="DAV:">
  <prop>
    <displayname/>
    <getcontentlength/>
    <getcontenttype/>
    <getlastmodified/>
    <resourcetype/>
    <oc:fileid xmlns:oc="http://owncloud.org/ns"/>
  </prop>
</propfind>`,
    });

    if (res.status >= 400) {
      throw new Error(`WebDAV list failed (${res.status}): ${res.data || res.statusText}`);
    }

    return this._parsePropfind(res.data, dirPath);
  }

  /**
   * Convert a PROPFIND XML response into structured file entries.
   *
   * PROPFIND Depth:1 returns the requested path as the first entry,
   * followed by its children. We skip the parent directory entry.
   */
  _parsePropfind(xmlText, requestPath) {
    const entries = [];
    let doc;
    try {
      doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    } catch {
      return entries;
    }

    const responses = doc.getElementsByTagNameNS('DAV:', 'response');
    const normRequestPath = '/' + requestPath.replace(/^\/+|\/+$/g, '') + '/';

    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      const hrefEl = resp.getElementsByTagNameNS('DAV:', 'href')[0];
      if (!hrefEl) continue;
      const href = hrefEl.textContent || '';

      // Decode and normalize the href for comparison
      const decodedHref = decodeURIComponent(href);
      const normHref = '/' + decodedHref.replace(/^\/+|\/+$/g, '') + '/';

      // Skip the directory itself
      if (normHref === normRequestPath) {
        continue;
      }

      const propstat = resp.getElementsByTagNameNS('DAV:', 'propstat')[0];
      if (!propstat) continue;
      const prop = propstat.getElementsByTagNameNS('DAV:', 'prop')[0];
      if (!prop) continue;

      const nameEl = prop.getElementsByTagNameNS('DAV:', 'displayname')[0];
      const name = nameEl ? (nameEl.textContent || '') : '';

      // Skip entries with no name (root itself in some servers)
      if (!name) continue;

      const typeEl = prop.getElementsByTagNameNS('DAV:', 'resourcetype')[0];
      const isCollection = typeEl && typeEl.getElementsByTagNameNS('DAV:', 'collection').length > 0;

      const sizeEl = prop.getElementsByTagNameNS('DAV:', 'getcontentlength')[0];
      const size = sizeEl ? parseInt(sizeEl.textContent || '0', 10) : 0;

      const mimeEl = prop.getElementsByTagNameNS('DAV:', 'getcontenttype')[0];
      const mime = mimeEl ? (mimeEl.textContent || '') : '';

      const modEl = prop.getElementsByTagNameNS('DAV:', 'getlastmodified')[0];
      const modified = modEl ? (modEl.textContent || '') : '';

      const fileIdEl = prop.getElementsByTagNameNS('http://owncloud.org/ns', 'fileid')[0];
      const fileId = fileIdEl ? (fileIdEl.textContent || '') : '';

      const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
      const editorType = editorTypeForExtension(ext);

      entries.push({
        name,
        path: href,
        isDirectory: isCollection,
        size,
        mimeType: mime,
        modified,
        fileId,
        ext: isCollection ? '' : ext,
        editorType: isCollection ? null : editorType,
      });
    }

    return entries;
  }

  // ── File download ───────────────────────────────────────────────────

  /**
   * Download a file's raw bytes.
   *
   * @param {string} spacePath
   * @param {string} filePath
   * @returns {Buffer}
   */
  async downloadFile(spacePath, filePath) {
    const davUrl = this._davUrl(spacePath, filePath);
    const res = await this.http.get(davUrl, { responseType: 'arraybuffer' });
    if (res.status >= 400) {
      throw new Error(`Download failed (${res.status})`);
    }
    return Buffer.from(res.data);
  }

  // ── File upload ─────────────────────────────────────────────────────

  /**
   * Upload file bytes.
   *
   * @param {string} spacePath
   * @param {string} destPath  - destination path (including filename)
   * @param {Buffer|string} data
   * @param {string} [mimeType]
   * @returns {object} result
   */
  async uploadFile(spacePath, destPath, data, mimeType) {
    const davUrl = this._davUrl(spacePath, destPath);
    const headers = {};
    if (mimeType) headers['Content-Type'] = mimeType;

    const res = await this.http.put(davUrl, data, { headers });
    if (res.status >= 400) {
      throw new Error(`Upload failed (${res.status})`);
    }
    return { status: res.status, path: destPath };
  }

  // ── File delete ─────────────────────────────────────────────────────

  /**
   * Delete a file or directory.
   */
  async deleteFile(spacePath, filePath) {
    const davUrl = this._davUrl(spacePath, filePath);
    const res = await this.http.delete(davUrl);
    if (res.status >= 400) {
      throw new Error(`Delete failed (${res.status})`);
    }
    return true;
  }

  // ── File rename / move ──────────────────────────────────────────────

  /**
   * Rename or move a file.
   *
   * @param {string} spacePath
   * @param {string} sourcePath
   * @param {string} destPath    - new path (including filename)
   */
  async moveFile(spacePath, sourcePath, destPath) {
    const srcUrl = this._davUrl(spacePath, sourcePath);
    const dstUrl = this._davUrl(spacePath, destPath);

    const res = await this.http.request({
      method: 'MOVE',
      url: srcUrl,
      headers: {
        Destination: dstUrl,
      },
    });
    if (res.status >= 400) {
      throw new Error(`Move failed (${res.status})`);
    }
    return true;
  }

  // ── Create directory ────────────────────────────────────────────────

  /**
   * Create a directory (MKCOL).
   */
  async createDirectory(spacePath, dirPath) {
    const davUrl = this._davUrl(spacePath, dirPath);
    const res = await this.http.request({
      method: 'MKCOL',
      url: davUrl,
    });
    if (res.status >= 400) {
      throw new Error(`Create directory failed (${res.status})`);
    }
    return true;
  }

  // ── File info (for opening in editor) ───────────────────────────────

  /**
   * Get file metadata to determine editor compatibility.
   *
   * @param {string} spacePath
   * @param {string} filePath
   * @returns {object} file info + editor type
   */
  async getFileInfo(spacePath, filePath) {
    const entries = await this.listFiles(spacePath, filePath);
    // PROPFIND on a single file returns it as the only entry
    const file = entries.find(e => !e.isDirectory && e.name);
    return file || null;
  }

  // ── Internal helpers ────────────────────────────────────────────────

  /**
   * Build the WebDAV URL for a given space and path.
   *
   * For personal space: /remote.php/dav/files/{username}/{path}
   * For other spaces:   /dav/spaces/{spaceId}/{path}
   */
  _davUrl(spacePath, filePath) {
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;

    if (spacePath === 'personal' || spacePath === this.username) {
      return `${this.baseUrl}/remote.php/dav/files/${this.username}/${cleanPath}`;
    }
    return `${this.baseUrl}/dav/spaces/${spacePath}/${cleanPath}`;
  }
}

module.exports = { OcisClient, editorTypeForExtension, DEFAULT_ADMIN_USER };
