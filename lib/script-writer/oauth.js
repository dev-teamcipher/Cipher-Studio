// OAuth 2.0 (PKCE + dynamic client registration) for MCP servers that use login instead of API keys.
// Discovery is done from the server's own metadata, so this works for any compliant MCP server.
const crypto = require('crypto');

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function makePkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function jsonFetch(url, opts) {
  const r = await fetch(url, opts);
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch {}
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url + ' — ' + text.slice(0, 200));
  return j;
}

// Find the authorization server for a given MCP resource URL.
async function discover(mcpUrl) {
  const u = new URL(mcpUrl);
  const origin = u.origin;
  let authServer = origin;
  let resource = mcpUrl;

  // Step 1: ask the resource what protects it (RFC 9728). The 401 challenge points at it.
  try {
    const probe = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'probe', version: '1' } } }),
    });
    const wa = probe.headers.get('www-authenticate') || '';
    const m = wa.match(/resource_metadata="([^"]+)"/);
    const metaUrl = m ? m[1] : origin + '/.well-known/oauth-protected-resource';
    const meta = await jsonFetch(metaUrl);
    if (meta && Array.isArray(meta.authorization_servers) && meta.authorization_servers[0]) authServer = meta.authorization_servers[0];
    if (meta && meta.resource) resource = meta.resource;
  } catch {}

  // Step 2: authorization server metadata.
  let as = null;
  for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']) {
    try {
      as = await jsonFetch(authServer.replace(/\/+$/, '') + path);
      if (as && as.authorization_endpoint && as.token_endpoint) break;
    } catch {}
  }
  if (!as || !as.authorization_endpoint || !as.token_endpoint) {
    throw new Error('This server does not publish OAuth metadata — an API key is required instead.');
  }
  return {
    resource,
    authorizeUrl: as.authorization_endpoint,
    tokenUrl: as.token_endpoint,
    registerUrl: as.registration_endpoint || null,
    scope: (as.scopes_supported || ['openid', 'profile', 'email']).join(' '),
  };
}

// Register this app with the auth server (or reuse a previously issued client_id).
async function register(disc, redirectUri, existingClientId) {
  if (existingClientId) return { client_id: existingClientId };
  if (!disc.registerUrl) throw new Error('Server has no dynamic registration endpoint — an API key is required instead.');
  const j = await jsonFetch(disc.registerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Cipher AI Writer',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: disc.scope,
    }),
  });
  if (!j || !j.client_id) throw new Error('Registration did not return a client_id');
  return j;
}

function authorizeUrl(disc, clientId, redirectUri, state, challenge) {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: disc.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: disc.resource,
  });
  return disc.authorizeUrl + (disc.authorizeUrl.includes('?') ? '&' : '?') + p.toString();
}

async function exchangeCode(disc, clientId, clientSecret, redirectUri, code, verifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
    resource: disc.resource,
  });
  if (clientSecret) body.set('client_secret', clientSecret);
  const j = await jsonFetch(disc.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!j || !j.access_token) throw new Error('Token exchange returned no access_token');
  return j;
}

async function refresh(disc, clientId, clientSecret, refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    resource: disc.resource,
  });
  if (clientSecret) body.set('client_secret', clientSecret);
  const j = await jsonFetch(disc.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!j || !j.access_token) throw new Error('Refresh returned no access_token');
  return j;
}

module.exports = { discover, register, authorizeUrl, exchangeCode, refresh, makePkce };

