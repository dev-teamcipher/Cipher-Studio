// Cipher Studio — Viral AI Script Writer (local server)
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { McpClient } = require('./mcp');
const { chatLLM, listLLMModels, curatedFor } = require('./llm');
const oauth = require('./oauth');
const pipe = require('./pipeline');

const ROOT = __dirname;
const DATA = path.join(process.env.AUTOCUT_DATA_DIR || ROOT, 'script-writer');
const NICHES_DIR = path.join(DATA, 'niches');
const PRESETS_DIR = path.join(ROOT, 'presets');
fs.mkdirSync(NICHES_DIR, { recursive: true });

// ---- settings ----
const SETTINGS_P = path.join(DATA, 'settings.json');
const defaults = {
  nexlev: { url: 'https://prod.dashboard.nexlev.io/api/claude-mcp', key: '', oauth: null },
  analysis: { provider: 'gemini', apiKey: '', baseUrl: '', model: 'gemini-2.5-flash' },
  writer: { provider: 'openrouter', apiKey: '', baseUrl: '', model: 'anthropic/claude-sonnet-4.5' },
};
let settings = Object.assign({}, defaults, pipe.readJSON(SETTINGS_P, {}));
for (const k of Object.keys(defaults)) settings[k] = Object.assign({}, defaults[k], settings[k] || {});
function saveSettings() { pipe.writeJSON(SETTINGS_P, settings); }

// ---- Nexlev MCP (lazy, cached; API key OR OAuth login) ----
let mcpCache = { sig: null, client: null };

// Returns the bearer token to use: an API key if provided, else the OAuth access token
// (refreshed automatically when it is close to expiry).
async function nexlevToken() {
  const nx = settings.nexlev || {};
  if (nx.key) return nx.key;
  const o = nx.oauth;
  if (!o || !o.accessToken) return '';
  if (o.expiresAt && Date.now() > o.expiresAt - 60000 && o.refreshToken) {
    try {
      const disc = await oauth.discover(nx.url);
      const t = await oauth.refresh(disc, o.clientId, o.clientSecret, o.refreshToken);
      o.accessToken = t.access_token;
      if (t.refresh_token) o.refreshToken = t.refresh_token;
      o.expiresAt = t.expires_in ? Date.now() + t.expires_in * 1000 : null;
      saveSettings();
      mcpCache = { sig: null, client: null };
    } catch (e) {
      console.log('OAuth refresh failed:', e.message);
    }
  }
  return o.accessToken;
}

async function getMcp() {
  const { url } = settings.nexlev || {};
  if (!url) return null;
  const token = await nexlevToken();
  if (!token) return null;
  const sig = url + '|' + token;
  if (mcpCache.sig === sig && mcpCache.client && mcpCache.client.connected) return mcpCache.client;
  const c = new McpClient(url, token);
  await c.connect();
  mcpCache = { sig, client: c };
  return c;
}
async function tryMcp() { try { return await getMcp(); } catch { return null; } }

// ---- jobs / logs ----
const jobs = {};
function job(id) { return jobs[id] || (jobs[id] = { busy: false, log: [] }); }
function jlog(id, msg) {
  const j = job(id);
  j.log.push({ t: Date.now(), msg });
  if (j.log.length > 500) j.log.splice(0, 100);
  console.log(`[${id}] ${msg}`);
}

// ---- niche helpers ----
function nicheDir(id) { return path.join(NICHES_DIR, id); }
function loadNiche(id) { return pipe.readJSON(path.join(nicheDir(id), 'niche.json'), null); }
function saveNiche(n) { pipe.writeJSON(path.join(nicheDir(n.id), 'niche.json'), n); }
function countFiles(p, ext) { try { return fs.readdirSync(p).filter((f) => f.endsWith(ext)).length; } catch { return 0; } }
function nicheSummary(id) {
  const n = loadNiche(id);
  if (!n) return null;
  const d = nicheDir(id);
  return {
    ...n,
    corpusCount: countFiles(path.join(d, 'corpus'), '.txt'),
    scriptCount: countFiles(path.join(d, 'scripts'), '.md'),
    topicsCount: (pipe.readJSON(path.join(d, 'topics.json'), { raw: [] }).raw || []).length,
    ledgerCount: (pipe.readJSON(path.join(d, 'ledger.json'), { topics: [] }).topics || []).length,
    hasDna: fs.existsSync(path.join(d, 'style-dna.md')),
    busy: job(id).busy,
  };
}
function listNiches() {
  try {
    return fs
      .readdirSync(NICHES_DIR)
      .filter((f) => fs.existsSync(path.join(NICHES_DIR, f, 'niche.json')))
      .map(nicheSummary)
      .filter(Boolean);
  } catch { return []; }
}
function listPresets() {
  try {
    return fs
      .readdirSync(PRESETS_DIR)
      .map((f) => pipe.readJSON(path.join(PRESETS_DIR, f, 'preset.json'), null))
      .filter(Boolean);
  } catch { return []; }
}

// ---- app ----
const app = express();
app.use(express.json({ limit: '4mb' }));
app.disable('x-powered-by');

app.param('id', (req, res, next, id) => {
  if (!/^[a-z0-9-]{1,60}$/.test(String(id || ''))) return res.status(400).json({ error: 'Invalid niche id.' });
  next();
});

app.get('/api/state', (req, res) => {
  // Never ship raw tokens to the browser — just whether we are connected.
  const safe = JSON.parse(JSON.stringify(settings));
  const o = settings.nexlev.oauth;
  safe.nexlev.hasKey = !!settings.nexlev.key;
  safe.nexlev.key = '';
  safe.nexlev.oauth = o && o.accessToken ? { connected: true, connectedAt: o.connectedAt } : null;
  safe.analysis.hasApiKey = !!settings.analysis.apiKey;
  safe.analysis.apiKey = '';
  safe.writer.hasApiKey = !!settings.writer.apiKey;
  safe.writer.apiKey = '';
  res.json({ settings: safe, niches: listNiches(), presets: listPresets(), lengths: pipe.LENGTHS, wpm: pipe.WPM });
});

app.post('/api/settings', (req, res) => {
  const b = req.body || {};
  for (const k of ['nexlev', 'analysis', 'writer']) {
    if (!b[k] || typeof b[k] !== 'object') continue;
    const next = Object.assign({}, b[k]);
    const secretField = k === 'nexlev' ? 'key' : 'apiKey';
    if (!String(next[secretField] || '').trim()) delete next[secretField];
    settings[k] = Object.assign({}, settings[k], next);
  }
  saveSettings();
  mcpCache = { sig: null, client: null };
  res.json({ ok: true });
});

// ---- OAuth login flow (for MCP servers with no API keys, e.g. Nexlev) ----
const pending = {};

app.get('/oauth/start', async (req, res) => {
  try {
    const url = settings.nexlev.url;
    if (!url) return res.status(400).send('Set the MCP URL in Settings first.');
    const redirectUri = `http://127.0.0.1:${PORT}/api/script-writer/oauth/callback`;
    const disc = await oauth.discover(url);
    const prev = settings.nexlev.oauth || {};
    const client = await oauth.register(disc, redirectUri, prev.clientId);
    const { verifier, challenge } = oauth.makePkce();
    const state = crypto.randomBytes(24).toString('base64url');
    pending[state] = { disc, verifier, redirectUri, clientId: client.client_id, clientSecret: client.client_secret || '', createdAt: Date.now() };
    res.redirect(oauth.authorizeUrl(disc, client.client_id, redirectUri, state, challenge));
  } catch (e) {
    res.status(500).send(page('Could not start login', e.message, false));
  }
});

app.get('/oauth/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const p = pending[state];
  if (error) return res.send(page('Login was cancelled', String(error_description || error), false));
  if (!p || Date.now() - p.createdAt > 10 * 60 * 1000) {
    if (p) delete pending[state];
    return res.send(page('Session expired', 'Please press Connect again in Settings.', false));
  }
  delete pending[state];
  try {
    const t = await oauth.exchangeCode(p.disc, p.clientId, p.clientSecret, p.redirectUri, code, p.verifier);
    settings.nexlev.oauth = {
      clientId: p.clientId,
      clientSecret: p.clientSecret,
      accessToken: t.access_token,
      refreshToken: t.refresh_token || '',
      expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : null,
      connectedAt: new Date().toISOString(),
    };
    saveSettings();
    mcpCache = { sig: null, client: null };
    let msg = 'You can close this tab and go back to Cipher AI Writer.';
    try {
      const c = await getMcp();
      msg = `Connected — ${c.tools.length} research tools are now available.`;
    } catch (e) { msg = 'Signed in, but the first call failed: ' + e.message; }
    res.send(page('Nexlev connected ✓', msg, true));
  } catch (e) {
    res.send(page('Login failed', e.message, false));
  }
});

app.post('/api/oauth/disconnect', (req, res) => {
  settings.nexlev.oauth = null;
  saveSettings();
  mcpCache = { sig: null, client: null };
  res.json({ ok: true });
});

function page(title, msg, ok) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>
  <body style="background:#0a0e15;color:#e8edf5;font-family:-apple-system,Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center;max-width:460px;padding:36px;background:#121926;border:1px solid rgba(255,255,255,.08);border-radius:18px">
    <div style="font-size:44px;margin-bottom:10px">${ok ? '✅' : '⚠️'}</div>
    <h2 style="margin:0 0 10px;font-size:21px">${title}</h2>
    <p style="color:#8b96a8;font-size:14px;line-height:1.6;margin:0 0 22px">${String(msg).replace(/</g, '&lt;')}</p>
    <a href="http://127.0.0.1:${PORT}/assets/script-writer/index.html" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6,#06b6d4);color:#fff;font-weight:800;padding:12px 24px;border-radius:11px;text-decoration:none">Back to Cipher AI Writer</a>
  </div></body>`;
}

app.post('/api/test/nexlev', async (req, res) => {
  try {
    if (!settings.nexlev.url) return res.status(400).json({ error: 'Set the Nexlev MCP URL first.' });
    const c = await getMcp();
    if (!c) return res.status(400).json({ error: 'Not signed in — press “Connect with Nexlev”.' });
    res.json({ ok: true, tools: c.tools.length, names: c.tools.slice(0, 60).map((t) => t.name) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/test/llm', async (req, res) => {
  try {
    const which = req.body.which === 'writer' ? 'writer' : 'analysis';
    const out = await chatLLM(settings[which], { system: 'Reply with exactly: OK', user: 'ping', maxTokens: 20, temperature: 0 });
    res.json({ ok: true, reply: out.trim().slice(0, 60) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/models', async (req, res) => {
  try {
    const which = req.query.which === 'writer' ? 'writer' : 'analysis';
    const cfg = Object.assign({}, settings[which]);
    if (req.query.provider) cfg.provider = req.query.provider;
    if (req.query.baseUrl) cfg.baseUrl = req.query.baseUrl;
    const curated = curatedFor(cfg.provider);
    let models = [];
    if (req.query.fetch === '1') models = await listLLMModels(cfg);
    res.json({ curated, models, provider: cfg.provider });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/niches', async (req, res) => {
  try {
    const b = req.body || {};
    const preset = b.presetId ? listPresets().find((p) => p.id === b.presetId) : null;
    const name = (b.name || (preset && preset.name) || '').trim();
    if (!name) return res.status(400).json({ error: 'Niche name required' });
    let id = pipe.slugify(name);
    let i = 2;
    while (fs.existsSync(nicheDir(id))) id = pipe.slugify(name) + '-' + i++;

    const links = (b.channels || []).map((s) => String(s).trim()).filter(Boolean);
    const mcp = await tryMcp();
    const teachers = [];
    if (preset && preset.teachers) {
      for (const t of preset.teachers) teachers.push({ channelId: t.channelId || t.id, name: t.name, url: t.url || '' });
    }
    const warnings = [];
    for (const l of links) {
      try {
        const c = await pipe.resolveChannel(l, mcp);
        if (!teachers.find((t) => t.channelId === c.channelId)) teachers.push(c);
      } catch (e) { warnings.push('Could not resolve ' + l + ': ' + e.message); }
    }
    if (!teachers.length) return res.status(400).json({ error: 'No channels resolved. ' + warnings.join(' | ') });

    const n = {
      id,
      name,
      description: b.description || (preset && preset.description) || '',
      teachers,
      scouts: [],
      lengthKey: b.lengthKey || (preset && preset.lengthKey) || 'standard',
      customWords: +b.customWords || null,
      customMinutes: +b.customMinutes || null,
      dailyCount: Math.max(1, Math.min(6, +b.dailyCount || (preset && preset.dailyCount) || 1)),
      schedule: { enabled: !!(b.schedule && b.schedule.enabled), time: (b.schedule && b.schedule.time) || '06:00' },
      harvested: [],
      preset: b.presetId || null,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    fs.mkdirSync(path.join(nicheDir(id), 'corpus'), { recursive: true });
    fs.mkdirSync(path.join(nicheDir(id), 'scripts'), { recursive: true });
    saveNiche(n);
    if (preset) {
      const dnaP = path.join(PRESETS_DIR, preset.id, 'style-dna.md');
      if (fs.existsSync(dnaP)) fs.copyFileSync(dnaP, path.join(nicheDir(id), 'style-dna.md'));
    }
    res.json({ ok: true, id, warnings });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/niches/:id/run', (req, res) => {
  const id = req.params.id;
  const n = loadNiche(id);
  if (!n) return res.status(404).json({ error: 'niche not found' });
  const j = job(id);
  if (j.busy) return res.status(409).json({ error: 'Already running — wait for the current job.' });
  const action = String(req.body.action || 'full');
  const count = Math.max(1, Math.min(6, +req.body.count || n.dailyCount || 1));
  const topic = req.body.topic && req.body.topic.title ? req.body.topic : null;
  j.busy = true;
  j.log = [];
  res.json({ started: true });
  (async () => {
    const ctx = {
      dir: nicheDir(id),
      niche: n,
      settings,
      log: (m) => jlog(id, m),
      saveNiche: () => saveNiche(n),
      mcp: null,
    };
    try {
      if (action === 'harvest' || action === 'update' || action === 'full') {
        ctx.mcp = await tryMcp();
        if (!ctx.mcp) jlog(id, 'ℹ️ Nexlev not connected — using free fallback (add your Nexlev key in Settings for better data)');
        await pipe.harvest(ctx);
      }
      if (action === 'learn' || action === 'update' || action === 'full') await pipe.learn(ctx);
      if (action === 'suggest') {
        if (!ctx.mcp) ctx.mcp = await tryMcp();
        await pipe.suggestTopics(ctx, Math.max(count, 8));
      }
      if (action === 'write' || action === 'full') {
        const made = await pipe.writeScripts(ctx, count, topic);
        jlog(id, '🏁 Generated ' + made.length + ' script(s)');
      }
    } catch (e) {
      jlog(id, '❌ ' + e.message);
    }
    j.busy = false;
  })();
});

app.get('/api/niches/:id', (req, res) => {
  const s = nicheSummary(req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json({ ...s, log: job(req.params.id).log });
});

app.post('/api/niches/:id/update', (req, res) => {
  const n = loadNiche(req.params.id);
  if (!n) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  if (b.lengthKey) n.lengthKey = b.lengthKey;
  if (b.customWords != null) n.customWords = Math.max(150, Math.min(20000, +b.customWords || 0)) || null;
  if (b.customMinutes != null) n.customMinutes = Math.max(1, Math.min(130, +b.customMinutes || 0)) || null;
  if (b.dailyCount) n.dailyCount = Math.max(1, Math.min(6, +b.dailyCount));
  if (b.schedule) n.schedule = Object.assign({}, n.schedule, b.schedule);
  if (typeof b.description === 'string') n.description = b.description;
  saveNiche(n);
  res.json({ ok: true });
});

app.get('/api/niches/:id/scripts', (req, res) => {
  const d = path.join(nicheDir(req.params.id), 'scripts');
  let files = [];
  try {
    files = fs
      .readdirSync(d)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse()
      .map((f) => {
        let title = '', words = 0;
        try {
          const c = fs.readFileSync(path.join(d, f), 'utf8');
          const m = c.match(/^#\s+(.+)$/m);
          title = m ? m[1].trim() : '';
          words = pipe.extractNarration(c).split(/\s+/).filter(Boolean).length;
        } catch {}
        return { file: f, title, words };
      });
  } catch {}
  res.json({ files });
});

app.get('/api/niches/:id/suggestions', (req, res) => {
  res.json(pipe.readJSON(path.join(nicheDir(req.params.id), 'suggestions.json'), { updatedAt: null, topics: [] }));
});

app.get('/api/niches/:id/topics', (req, res) => {
  const t = pipe.readJSON(path.join(nicheDir(req.params.id), 'topics.json'), { raw: [] });
  const raw = (t.raw || []).slice().reverse();
  raw.sort((a, b) => (parseFloat(b.outlier) || 0) - (parseFloat(a.outlier) || 0));
  res.json({ topics: raw.slice(0, 20), total: (t.raw || []).length });
});

app.get('/api/niches/:id/scripts/:file', (req, res) => {
  const f = path.join(nicheDir(req.params.id), 'scripts', path.basename(req.params.file));
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'not found' });
  const content = fs.readFileSync(f, 'utf8');
  res.json({ content, narration: pipe.extractNarration(content) });
});

app.get('/api/niches/:id/dna', (req, res) => {
  const d = nicheDir(req.params.id);
  const f = path.join(d, 'style-dna.md');
  const n = loadNiche(req.params.id) || {};
  let history = [];
  try {
    history = fs
      .readdirSync(path.join(d, 'dna-history'))
      .filter((x) => x.endsWith('.md'))
      .sort()
      .reverse()
      .map((x) => ({ file: x, date: x.replace(/\.md$/, '').replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2').replace('T', ' ').slice(0, 16) }));
  } catch {}
  let changelog = '';
  try { changelog = fs.readFileSync(path.join(d, 'dna-changelog.txt'), 'utf8').trim().split('\n').reverse().slice(0, 12).join('\n'); } catch {}
  res.json({
    content: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '',
    learnedAt: n.learnedAt || null,
    version: n.learnCount || 0,
    corpusAtLearn: n.corpusAtLearn || 0,
    lastChangelog: n.lastChangelog || '',
    history,
    changelog,
  });
});

app.get('/api/niches/:id/dna/:file', (req, res) => {
  const f = path.join(nicheDir(req.params.id), 'dna-history', path.basename(req.params.file));
  if (!fs.existsSync(f)) return res.status(404).json({ error: 'not found' });
  res.json({ content: fs.readFileSync(f, 'utf8') });
});

app.delete('/api/niches/:id', (req, res) => {
  const d = nicheDir(req.params.id);
  if (fs.existsSync(path.join(d, 'niche.json'))) fs.rmSync(d, { recursive: true, force: true });
  res.json({ ok: true });
});

// ---- daily scheduler (in-process; runs while the tool is open) ----
const schedulerTimer = setInterval(() => {
  const now = new Date();
  const hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const today = now.toISOString().slice(0, 10);
  for (const s of listNiches()) {
    const n = loadNiche(s.id);
    if (!n || !n.schedule || !n.schedule.enabled) continue;
    if (n.schedule.time === hm && n.lastAutoRun !== today && !job(n.id).busy) {
      n.lastAutoRun = today;
      saveNiche(n);
      jlog(n.id, '⏰ Daily auto-run started (' + hm + ')');
      fetch('http://127.0.0.1:' + PORT + '/api/script-writer/niches/' + n.id + '/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'full', count: n.dailyCount }),
      }).catch(() => {});
    }
  }
}, 60000);
schedulerTimer.unref?.();

let PORT = Number(process.env.AUTOCUT_PORT || 51973);
function setPort(port) { PORT = Number(port) || PORT; }

module.exports = { app, setPort };
