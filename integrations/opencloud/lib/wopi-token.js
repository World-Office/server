/**
 * WOPI JWT token generation for in-dashboard editor embedding.
 *
 * The Document Server expects JWT tokens signed with the shared
 * DOCUMENT_SERVER_JWT_SECRET. OCIS validates tokens with its own
 * OCIS_JWT_SECRET. For the inline editor to work, both secrets
 * must match (or the Document Server must run in passthrough mode).
 *
 * This module generates tokens compatible with both when the secrets
 * are configured identically.
 */
const crypto = require('crypto');

/**
 * Base64URL-encode a Buffer (no padding).
 */
function base64url(buf) {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Sign a JWT with HMAC-SHA256.
 *
 * @param {object} payload  - JWT claims
 * @param {string} secret   - HMAC secret (UTF-8)
 * @returns {string} encoded JWT string
 */
function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(Buffer.from(JSON.stringify(header), 'utf-8'));
  const payloadB64 = base64url(Buffer.from(JSON.stringify(payload), 'utf-8'));
  const message = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', secret).update(message, 'utf-8').digest();
  return `${message}.${base64url(sig)}`;
}

/**
 * Generate a WOPI access token for a given file.
 *
 * The token is a JWT with:
 *   - iat: issued-at (now)
 *   - exp: expiry (default 1 hour)
 *   - fileId: the target file identifier (optional, for context)
 *
 * @param {string} fileId  - OCIS file identifier or WOPI file ID
 * @param {string} secret  - JWT secret (must match OCIS_JWT_SECRET or DOCUMENT_SERVER_JWT_SECRET)
 * @param {object} [opts]
 * @param {number} [opts.ttlSeconds=3600]
 * @returns {string} encoded JWT token
 */
function generateAccessToken(fileId, secret, opts = {}) {
  const ttl = opts.ttlSeconds || 3600;
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iat: now,
    exp: now + ttl,
  };

  if (fileId) {
    payload.fileId = fileId;
  }

  return signJwt(payload, secret);
}

/**
 * Build a WOPI editor URL that the Document Server understands.
 *
 * URL format:
 *   {editorBaseUrl}/hosting/wopi/{editorType}/edit?access_token={token}&file_id={fileId}
 *
 * @param {object} options
 * @param {string} options.editorBaseUrl - Document Server public URL (e.g. https://docs.example.com)
 * @param {string} options.fileId        - OCIS file ID
 * @param {string} options.accessToken   - JWT access token
 * @param {string} options.editorType    - 'word' | 'sheet' | 'slide' | 'diagram' | 'pdf'
 * @returns {string} full editor URL
 */
function buildEditorUrl({ editorBaseUrl, fileId, accessToken, editorType }) {
  const base = editorBaseUrl.replace(/\/+$/, '');
  return `${base}/hosting/wopi/${editorType}/edit?access_token=${encodeURIComponent(accessToken)}&file_id=${encodeURIComponent(fileId)}`;
}

module.exports = {
  generateAccessToken,
  buildEditorUrl,
  signJwt,
  base64url,
};
