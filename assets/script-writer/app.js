/* Cipher Studio — Viral AI Script Writer frontend */
const $ = (s, el = document) => el.querySelector(s);
const API_ROOT = '/api/script-writer';
const apiUrl = (u) => u.startsWith('/api/') ? API_ROOT + u.slice(4) : u;
let STATE = null;
let CURRENT = null;
let POLL = null;
let SUGG = [];

const jget = (u) => fetch(apiUrl(u)).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return j; });
const jpost = (u, b, method = 'POST') =>
  fetch(apiUrl(u), { method, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  });

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = err ? 'err' : '';
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => (t.hidden = true), 3800);
}
function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function mdToHtml(md) {
  const lines = esc(md).split('\n');
  let out = '';
  for (const l of lines) {
    if (/^# /.test(l)) out += '<h1>' + l.slice(2) + '</h1>';
    else if (/^## /.test(l)) out += '<h2>' + l.slice(3) + '</h2>';
    else if (/^### /.test(l)) out += '<h2>' + l.slice(4) + '</h2>';
    else if (/^> /.test(l)) out += '<blockquote>' + l.slice(2) + '</blockquote>';
    else if (/^---+$/.test(l.trim())) out += '<hr/>';
    else if (l.trim() === '') out += '';
    else out += '<p>' + l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>') + '</p>';
  }
  return out;
}

/* ---------- modal ---------- */
function openModal(html, wide = false) {
  $('#modalBox').className = 'modal' + (wide ? ' wide' : '');
  $('#modalBox').innerHTML = html;
  $('#modalBack').hidden = false;
}
function closeModal() { $('#modalBack').hidden = true; }
$('#modalBack')?.addEventListener('click', (e) => { if (e.target.id === 'modalBack') closeModal(); });

/* ---------- load & sidebar ---------- */
async function load() {
  STATE = await jget('/api/state');
  renderSidebar();
  renderBadges();
  if (CURRENT && STATE.niches.find((n) => n.id === CURRENT)) renderNiche(CURRENT);
  else if (!CURRENT) renderWelcome();
}
function renderBadges() {
  const s = STATE.settings;
  const nxOn = !!(s.nexlev.hasKey || (s.nexlev.oauth && s.nexlev.oauth.connected));
  $('#connBadges').innerHTML =
    `<span class="badge ${nxOn ? 'ok' : ''}">Nexlev ${nxOn ? '●' : '○'}</span>` +
    `<span class="badge ${s.analysis.hasApiKey ? 'ok' : ''}">Analysis ${s.analysis.hasApiKey ? '●' : '○'}</span>` +
    `<span class="badge ${s.writer.hasApiKey ? 'ok' : ''}">Writer ${s.writer.hasApiKey ? '●' : '○'}</span>`;
}
function renderSidebar() {
  $('#nicheList').innerHTML = STATE.niches
    .map(
      (n) => `
    <div class="niche-item ${n.id === CURRENT ? 'active' : ''}" onclick="renderNiche('${n.id}')">
      <div class="nname"><span class="dot ${n.busy ? 'on' : ''}"></span>${esc(n.name)}</div>
      <div class="nmeta">${n.scriptCount} scripts · ${n.corpusCount} studied · ${n.topicsCount} topics</div>
    </div>`
    )
    .join('') || '<p style="color:var(--dim);font-size:12.5px;padding:8px">No niches yet — create your first one.</p>';
}

/* ---------- welcome ---------- */
function renderWelcome() {
  CURRENT = null;
  renderSidebar();
  $('#main').innerHTML = `
  <div class="hero">
    <h2>Your channel's own<br/><em>script-writing brain.</em></h2>
    <p>Cipher AI Writer learns storytelling from established channels in your niche, mines their most viral topics, and writes ready-to-record scripts — daily, on autopilot.</p>
    <div class="steps">
      <div class="step"><span class="num">STEP 1</span><b>Pick a niche</b><p>Choose History, True Crime or Documentaries below — or add your own channels. Ready in 30 seconds.</p></div>
      <div class="step"><span class="num">STEP 2</span><b>Press Write Scripts</b><p>The AI picks a proven viral topic and writes a complete voice-over — clean text, ready to record.</p></div>
      <div class="step"><span class="num">STEP 3</span><b>Copy &amp; record</b><p>Hit 📋 Copy and paste straight into your voice-over tool. Autopilot writes fresh ones daily.</p></div>
    </div>
    <div class="preset-row">
      ${STATE.presets.map((p) => `<button class="btn" onclick="wizard('${p.id}')">${p.icon || '📁'} Start: ${esc(p.name)}</button>`).join('')}
      <button class="btn primary" onclick="wizard()">＋ Custom niche</button>
    </div>
  </div>`;
}

/* ---------- niche view ---------- */
async function renderNiche(id) {
  CURRENT = id;
  renderSidebar();
  let n, scripts, topics, sugg;
  try {
    [n, scripts, topics, sugg] = await Promise.all([
      jget('/api/niches/' + id),
      jget('/api/niches/' + id + '/scripts'),
      jget('/api/niches/' + id + '/topics'),
      jget('/api/niches/' + id + '/suggestions'),
    ]);
  } catch (e) { return toast(e.message, true); }
  SUGG = sugg.topics || [];
  const L = STATE.lengths;
  $('#main').innerHTML = `
  <div class="niche-page">
  <section class="workspace-head">
    <div class="workspace-intro">
      <div class="eyebrow"><span></span> Script workspace</div>
      <h2>${esc(n.name)}</h2>
      <div class="sub">${esc(n.description || 'Your AI-powered workspace for researching topics and writing viral scripts.')}</div>
      <div class="teacher-list workspace-teachers">
        ${n.teachers.map((t) => `<span class="teacher">🎓 ${esc(t.name)}</span>`).join('')}
        ${(n.scouts || []).map((t) => `<span class="teacher" title="Auto-discovered similar channel (topic mining)">🧭 ${esc(t.name)}</span>`).join('')}
      </div>
    </div>
    <div class="workspace-actions">
      <button class="btn brain-btn" onclick="run('update')" ${n.busy ? 'disabled' : ''} title="Study new videos and refresh your topic intelligence">
        <span class="button-icon">↻</span><span><b>Update Brain</b><small>Refresh research</small></span>
      </button>
      <button class="btn ghost danger sm delete-niche" onclick="delNiche('${id}')" title="Delete this niche">Delete</button>
    </div>
  </section>
  <div class="chips">
    <div class="chip c-em"><i>📼</i><div><b>${n.corpusCount}</b><span>Videos studied</span></div></div>
    <div class="chip c-gold"><i>🔥</i><div><b>${n.topicsCount}</b><span>Viral topics found</span></div></div>
    <div class="chip c-blue"><i>📜</i><div><b>${n.scriptCount}</b><span>Scripts ready</span></div></div>
    <div class="chip ${n.hasDna ? 'c-em' : ''}" ${n.hasDna ? `onclick="viewDna('${id}')" style="cursor:pointer" title="Click to read the learned style + its history"` : ''}><i>🧬</i><div><b>${n.hasDna ? (n.learnCount ? 'v' + n.learnCount : 'Ready') : 'Not yet'}</b><span>Style${n.hasDna ? ' · ' + ago(n.learnedAt) : ''}</span></div></div>
  </div>
  <section class="creation-studio">
    <div class="studio-head">
      <div>
        <div class="eyebrow"><span></span> Create</div>
        <h3>Write your next viral script</h3>
        <p>Choose the output settings, then let your trained Style DNA do the writing.</p>
      </div>
      <div class="studio-status ${n.busy ? 'is-busy' : ''}"><i></i>${n.busy ? 'AI is working' : 'Ready to write'}</div>
    </div>
    <div class="studio-controls">
      <div class="control-group count-control">
        <label for="wCount">Number of scripts</label>
        <div class="field-note">Generate up to 6 scripts at once</div>
        <input type="number" class="tiny" id="wCount" min="1" max="6" value="${n.dailyCount}" title="How many scripts"/>
      </div>
      <div class="control-group length-control">
        <label for="lenSel">Script length</label>
        <div class="field-note">Set the target duration or word count</div>
        <div class="length-fields">
        <select id="lenSel" onchange="onLenChange()">
          ${Object.entries(L).map(([k, v]) => `<option value="${k}" ${n.lengthKey === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
        <div class="custlen" id="custLen" style="display:${n.lengthKey === 'custom' ? '' : 'none'}">
          <input type="number" id="custMin" min="1" max="130" value="${n.customMinutes || Math.round((n.customWords || 1900) / (STATE.wpm || 155))}" oninput="syncLen('min')"/><span>min</span>
          <span class="eq">=</span>
          <input type="number" id="custWords" min="150" max="20000" step="50" value="${n.customWords || 1900}" oninput="syncLen('words')"/><span>words</span>
        </div></div>
      </div>
      <div class="control-group autopilot-control">
        <label>Automation</label>
        <div class="field-note">Optionally write new scripts every day</div>
        <div class="sched">
          <label class="toggle ${n.schedule?.enabled ? 'on' : ''}" title="Turn daily auto-writing on or off">
            <input type="checkbox" id="schedOn" ${n.schedule?.enabled ? 'checked' : ''} onchange="saveCfg({schedChanged:true})"/>
            <span class="tdot"></span>⏰ Autopilot ${n.schedule?.enabled ? 'ON' : 'OFF'}
          </label>
          <input type="time" id="schedTime" value="${n.schedule?.time || '06:00'}" onchange="saveCfg()" style="display:${n.schedule?.enabled ? '' : 'none'}"/>
        </div>
      </div>
      <div class="write-control">
        <button class="btn big primary write-btn" onclick="run('write')" ${n.busy ? 'disabled' : ''}><span>✍️</span> Write Scripts</button>
        <p>Picks a proven topic and never repeats it.</p>
      </div>
    </div>
    <div class="studio-foot">
      <span class="info-icon">i</span><p>Script length — pick a preset or <b>Custom…</b> for your own minutes/words.
      ${n.schedule?.enabled
        ? `Autopilot is <b style="color:var(--em)">ON</b> — writes daily at ${esc(n.schedule.time)}. Click the toggle to turn it off.`
        : `Autopilot is <b>OFF</b> — nothing runs on its own.`}</p>
    </div>
  </section>
  <div class="cols">
    <div class="col-main">
      <div class="panel">
        <h3>📜 Your Scripts <span style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--dim)">— click a script to read it, or 📋 to copy the voice-over</span></h3>
        <div class="script-list">
          ${scripts.files.map((s) => `
            <div class="script-row">
              <div class="sr-main" onclick="viewScript('${id}','${s.file}')">
                <div class="sr-title">${esc(s.title || prettyName(s.file))}</div>
                <div class="sr-meta">${s.file.slice(0, 4)}-${s.file.slice(4, 6)}-${s.file.slice(6, 8)} · ${s.words || '?'} words · ~${Math.max(1, Math.round((s.words || 0) / 155))} min voice-over</div>
              </div>
              <button class="btn sm copy" onclick="copyScript('${id}','${s.file}')" title="Copy voice-over text">📋 Copy</button>
            </div>`).join('') || '<p class="empty">No scripts yet — press <b>✍️ Write Scripts</b> above. Your first script takes ~2 minutes.</p>'}
        </div>
      </div>
    </div>
    <div class="col-side">
      <div class="panel">
        <h3>💡 Topic Ideas for You</h3>
        <div class="topic-list">
          ${SUGG.map((t, i) => `
            <div class="sug-row">
              <div class="sug-main">
                <div class="sug-title">${esc(t.title)}</div>
                <div class="sug-angle">${esc(t.angle || '')}</div>
              </div>
              <button class="btn sm copy" onclick="writeTopic(${i})" ${n.busy ? 'disabled' : ''}>✍️ Write</button>
            </div>`).join('') || '<p class="empty">No ideas yet.</p>'}
        </div>
        <button class="btn sm block" style="margin-top:10px" onclick="run('suggest')" ${n.busy ? 'disabled' : ''}>💡 Get fresh topic ideas</button>
        <p class="act-help" style="margin-top:8px">AI-suggested topics from your niche's viral data — pick one and hit Write, or just use ✍️ Write Scripts and it picks for you.</p>
      </div>
      <div class="panel">
        <h3>🔥 Viral Topics <span class="count">${topics.total}</span></h3>
        <div class="topic-list">
          ${topics.topics.slice(0, 10).map((t) => `
            <div class="topic-row">
              <span class="t-title">${esc(t.title)}</span>
              ${t.outlier ? `<span class="t-x">${esc(String(t.outlier)).replace(/x$/, '')}x</span>` : `<span class="t-x dim">new</span>`}
            </div>`).join('') || '<p class="empty">Press 🔄 Update Brain to find viral topics.</p>'}
        </div>
        <p class="act-help" style="margin-top:10px">Proven winners from your niche — the AI turns these patterns into fresh topics.</p>
      </div>
      <div class="panel">
        <h3>🟢 Live Status</h3>
        <div id="logBox">${logHtml(n.log)}</div>
      </div>
    </div>
  </div>
  </div>`;
  const lb = $('#logBox');
  if (lb) lb.scrollTop = lb.scrollHeight;
  if (n.busy) startPoll(id);
  else stopPoll();
}
function prettyName(f) {
  return f.replace(/^\d{8}-/, '').replace(/\.md$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function logHtml(log) {
  return (log || []).map((l) => `<div>${esc(l.msg)}</div>`).join('') || '<div style="color:#3d4a5f">idle — activity appears here</div>';
}
function startPoll(id) {
  stopPoll();
  POLL = setInterval(async () => {
    try {
      const n = await jget('/api/niches/' + id);
      const lb = $('#logBox');
      if (lb) { lb.innerHTML = logHtml(n.log); lb.scrollTop = lb.scrollHeight; }
      if (!n.busy) { stopPoll(); renderNiche(id); load(); }
    } catch { stopPoll(); }
  }, 2000);
}
function stopPoll() { if (POLL) { clearInterval(POLL); POLL = null; } }

async function run(action) {
  const count = +($('#wCount')?.value || 1);
  const msgs = { write: 'Writing scripts…', update: 'Updating the brain…', suggest: 'Finding topic ideas…', full: 'Full pipeline started' };
  try {
    await jpost(`/api/niches/${CURRENT}/run`, { action, count });
    toast(msgs[action] || action + ' started');
    renderNiche(CURRENT);
  } catch (e) { toast(e.message, true); }
}
async function writeTopic(i) {
  const t = SUGG[i];
  if (!t) return;
  try {
    await jpost(`/api/niches/${CURRENT}/run`, { action: 'write', count: 1, topic: t });
    toast('Writing: ' + t.title);
    renderNiche(CURRENT);
  } catch (e) { toast(e.message, true); }
}
function onLenChange() {
  const custom = $('#lenSel').value === 'custom';
  $('#custLen').style.display = custom ? '' : 'none';
  saveCfg();
}
// Keep minutes and words in sync (155 spoken words ≈ 1 minute).
let _lenT = null;
function syncLen(from) {
  const wpm = STATE.wpm || 155;
  const mi = $('#custMin'), wo = $('#custWords');
  if (from === 'min') {
    const m = +mi.value;
    if (m > 0) wo.value = Math.round(m * wpm);
  } else {
    const w = +wo.value;
    if (w > 0) mi.value = Math.max(1, Math.round(w / wpm));
  }
  clearTimeout(_lenT);
  _lenT = setTimeout(saveCfg, 700); // debounce while typing
}
async function saveCfg(opts = {}) {
  try {
    const body = {
      lengthKey: $('#lenSel').value,
      dailyCount: +$('#wCount').value,
      schedule: { enabled: $('#schedOn').checked, time: $('#schedTime').value },
    };
    if (body.lengthKey === 'custom') {
      body.customWords = +$('#custWords').value || 1900;
      body.customMinutes = +$('#custMin').value || null;
    }
    await jpost(`/api/niches/${CURRENT}/update`, body);
    if (opts.schedChanged) {
      toast(body.schedule.enabled ? `⏰ Autopilot ON — writes daily at ${body.schedule.time}` : '⏰ Autopilot OFF — nothing runs automatically');
      renderNiche(CURRENT); // refresh the toggle label + helper text
    } else {
      toast(body.lengthKey === 'custom' ? `Saved — ${body.customWords} words (~${$('#custMin').value} min)` : 'Saved');
    }
  } catch (e) { toast(e.message, true); }
}
async function delNiche(id) {
  if (!confirm('Delete this niche and all its scripts?')) return;
  await jpost('/api/niches/' + id, null, 'DELETE');
  CURRENT = null;
  await load();
  renderWelcome();
}
async function viewScript(id, file) {
  const r = await jget(`/api/niches/${id}/scripts/${file}`);
  const head = r.content.split('\n---')[0];
  const title = (head.match(/^#\s+(.+)$/m) || [])[1] || prettyName(file);
  const alts = (head.match(/^Alt titles:\s*(.+)$/m) || [])[1] || '';
  const thumb = (head.match(/^Thumbnail:\s*(.+)$/m) || [])[1] || '';
  const words = r.narration.split(/\s+/).filter(Boolean).length;
  openModal(`<h2>${esc(title)}</h2>
    <p class="msub">${words} words · ~${Math.max(1, Math.round(words / 155))} min voice-over${alts ? ' &nbsp;·&nbsp; Alt titles: ' + esc(alts) : ''}${thumb ? ' &nbsp;·&nbsp; Thumb: ' + esc(thumb) : ''}</p>
    <div class="voview">${esc(r.narration)}</div>
    <div class="mfoot">
      <button class="btn primary" onclick="navigator.clipboard.writeText(document._raw).then(()=>toast('✓ Voice-over copied — paste it in your VO tool'))">📋 Copy voice-over</button>
      <button class="btn" onclick="closeModal()">Close</button>
    </div>`, true);
  document._raw = r.narration;
}
async function copyScript(id, file) {
  try {
    const r = await jget(`/api/niches/${id}/scripts/${file}`);
    await navigator.clipboard.writeText(r.narration);
    toast('✓ Voice-over copied — paste it in your VO tool');
  } catch (e) { toast(e.message, true); }
}
function ago(iso) {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 5400) return Math.round(s / 60) + ' min ago';
  if (s < 172800) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' days ago';
}
async function viewDna(id, file) {
  const r = await jget(`/api/niches/${id}/dna`);
  const body = file ? (await jget(`/api/niches/${id}/dna/${file}`)).content : r.content;
  openModal(`<h2>🧬 Style DNA ${file ? '<span style="color:var(--dim);font-size:14px">(older version)</span>' : `<span style="color:var(--dim);font-size:14px">v${r.version}</span>`}</h2>
    <p class="msub">${file ? 'Saved snapshot — this is what the AI knew back then.' : `Last updated <b>${ago(r.learnedAt)}</b> from ${r.corpusAtLearn} studied videos. It rewrites itself every time you press 🔄 Update Brain (and daily when autopilot is on).`}</p>
    ${!file && r.lastChangelog ? `<div class="connbox ok" style="margin-bottom:12px"><div><b>Latest change</b><span>${esc(r.lastChangelog)}</span></div></div>` : ''}
    <div class="mdview">${mdToHtml(body)}</div>
    ${r.history.length ? `<div class="msection"><h4>📜 How the brain evolved</h4>
      <p class="hint">Every update is saved, so nothing is lost. Click a date to read that older version.</p>
      <div class="topic-list" style="margin-top:8px">
        ${r.changelog ? `<pre style="font-size:11.5px;color:var(--dim);white-space:pre-wrap;line-height:1.6;margin-bottom:8px">${esc(r.changelog)}</pre>` : ''}
        ${r.history.map((h) => `<div class="topic-row"><span class="t-title">${esc(h.date)}</span><button class="btn sm" onclick="viewDna('${id}','${h.file}')">View</button></div>`).join('')}
      </div></div>` : ''}
    <div class="mfoot">
      ${file ? `<button class="btn" onclick="viewDna('${id}')">← Back to current</button>` : ''}
      <button class="btn primary" onclick="closeModal()">Close</button>
    </div>`, true);
}

/* ---------- wizard ---------- */
let W = {};
function wizard(presetId) {
  const p = presetId ? STATE.presets.find((x) => x.id === presetId) : null;
  W = { step: 1, presetId: presetId || null, name: p ? p.name : '', desc: p ? p.description : '', channels: '', lengthKey: p ? p.lengthKey : 'standard', daily: p ? p.dailyCount : 1, time: '06:00', enabled: false };
  wStep();
}
function wStep() {
  if (W.step === 1) {
    openModal(`
      <h2>New Niche · Step 1 of 3</h2><p class="msub">Start from a built-in niche (writing style included) or build a custom one.</p>
      <div class="preset-grid">
        ${STATE.presets.map((p) => `<div class="preset-card ${W.presetId === p.id ? 'sel' : ''}" onclick="wPreset('${p.id}')"><span class="ico">${p.icon || '📁'}</span><b>${esc(p.name)}</b><p>${esc(p.tagline || '')}</p></div>`).join('')}
        <div class="preset-card ${W.presetId === null && W._customSel ? 'sel' : ''}" onclick="wPreset(null)"><span class="ico">✨</span><b>Custom niche</b><p>Paste your own 4–6 channels and teach the AI from scratch.</p></div>
      </div>
      <div class="mfoot"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="W.step=2;wStep()">Next →</button></div>`);
  } else if (W.step === 2) {
    const p = W.presetId ? STATE.presets.find((x) => x.id === W.presetId) : null;
    openModal(`
      <h2>New Niche · Step 2 of 3</h2><p class="msub">${p ? 'This niche ships with expert teacher channels — add more if you like.' : 'Paste 4–6 links of established channels whose storytelling you want the AI to learn.'}</p>
      <label>Niche name</label><input id="wName" value="${esc(W.name)}" placeholder="e.g. Ancient Mysteries"/>
      <label>Explain your niche (what it covers, tone, audience)</label>
      <textarea id="wDesc" rows="3" placeholder="e.g. Dark unsolved historical mysteries for a US audience, serious tone, 15-20 min videos">${esc(W.desc)}</textarea>
      ${p ? `<label>Built-in teacher channels</label><div class="teacher-list">${p.teachers.map((t) => `<span class="teacher">🎓 ${esc(t.name)}</span>`).join('')}</div>` : ''}
      <label>${p ? 'Extra channel links (optional, one per line)' : 'Channel links — one per line (4–6 recommended)'}</label>
      <textarea id="wCh" rows="5" placeholder="https://www.youtube.com/@channel1&#10;https://www.youtube.com/@channel2">${esc(W.channels)}</textarea>
      <div class="mfoot"><button class="btn ghost" onclick="W.step=1;wStep()">← Back</button><button class="btn primary" onclick="wSave2()">Next →</button></div>`);
  } else {
    openModal(`
      <h2>New Niche · Step 3 of 3</h2><p class="msub">Output settings — you can change these anytime.</p>
      <label>Script length</label>
      <select id="wLen" onchange="document.getElementById('wCustWrap').style.display=this.value==='custom'?'':'none'">${Object.entries(STATE.lengths).map(([k, v]) => `<option value="${k}" ${W.lengthKey === k ? 'selected' : ''}>${v.label}${v.custom ? '' : ' · ' + v.words + ' words'}</option>`).join('')}</select>
      <div id="wCustWrap" style="display:${W.lengthKey === 'custom' ? '' : 'none'}">
        <label>Your own target</label>
        <div class="custlen" style="width:fit-content">
          <input type="number" id="wCustMin" min="1" max="130" value="12" oninput="document.getElementById('wCustWords').value=Math.round(this.value*(STATE.wpm||155))"/><span>min</span>
          <span class="eq">=</span>
          <input type="number" id="wCustWords" min="150" max="20000" step="50" value="1900" oninput="document.getElementById('wCustMin').value=Math.max(1,Math.round(this.value/(STATE.wpm||155)))"/><span>words</span>
        </div>
      </div>
      <div class="row">
        <div><label>Scripts per day</label><input id="wDaily" type="number" min="1" max="6" value="${W.daily}"/></div>
        <div><label>Auto-run time</label><input id="wTime" type="time" value="${W.time}"/></div>
        <div><label>Daily autopilot</label><select id="wOn"><option value="0" ${!W.enabled ? 'selected' : ''}>Off (run manually)</option><option value="1" ${W.enabled ? 'selected' : ''}>On</option></select></div>
      </div>
      <div class="mfoot"><button class="btn ghost" onclick="W.step=2;wStep()">← Back</button><button class="btn primary" id="wCreate" onclick="wCreate()">🚀 Create niche</button></div>`);
  }
}
function wPreset(id) {
  W.presetId = id;
  W._customSel = id === null;
  const p = id ? STATE.presets.find((x) => x.id === id) : null;
  if (p) { W.name = p.name; W.desc = p.description; W.lengthKey = p.lengthKey; W.daily = p.dailyCount; }
  else if (!W._namedCustom) { W.name = ''; W.desc = ''; }
  wStep();
}
function wSave2() {
  W.name = $('#wName').value.trim();
  W.desc = $('#wDesc').value.trim();
  W.channels = $('#wCh').value;
  if (!W.name) return toast('Give your niche a name', true);
  if (!W.presetId && !W.channels.trim()) return toast('Paste at least one channel link', true);
  W._namedCustom = true;
  W.step = 3;
  wStep();
}
async function wCreate() {
  W.lengthKey = $('#wLen').value;
  W.daily = +$('#wDaily').value;
  W.time = $('#wTime').value;
  W.enabled = $('#wOn').value === '1';
  const btn = $('#wCreate');
  btn.disabled = true;
  btn.textContent = 'Resolving channels…';
  try {
    const r = await jpost('/api/niches', {
      presetId: W.presetId,
      name: W.name,
      description: W.desc,
      channels: W.channels.split('\n').map((s) => s.trim()).filter(Boolean),
      lengthKey: W.lengthKey,
      customWords: W.lengthKey === 'custom' ? +$('#wCustWords').value || 1900 : null,
      customMinutes: W.lengthKey === 'custom' ? +$('#wCustMin').value || null : null,
      dailyCount: W.daily,
      schedule: { enabled: W.enabled, time: W.time },
    });
    closeModal();
    if (r.warnings && r.warnings.length) toast('Created with warnings: ' + r.warnings.join(' | '), true);
    else toast('Niche created 🎉');
    await load();
    renderNiche(r.id);
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
    btn.textContent = '🚀 Create niche';
  }
}

/* ---------- settings ---------- */
function providerRow(which, cfg) {
  const role = which === 'an' ? 'analysis' : 'writer';
  return `
  <label>Provider</label>
  <select id="${which}Prov" onchange="onProviderChange('${which}')">
    <option value="gemini" ${cfg.provider === 'gemini' ? 'selected' : ''}>Google Gemini (official)</option>
    <option value="openrouter" ${cfg.provider === 'openrouter' ? 'selected' : ''}>OpenRouter (every model, one key)</option>
    <option value="custom" ${cfg.provider === 'custom' ? 'selected' : ''}>Custom / other (OpenAI-compatible)</option>
  </select>
  <div id="${which}BaseWrap" style="display:${cfg.provider === 'custom' ? '' : 'none'}"><label>Base URL</label><input id="${which}Base" value="${esc(cfg.baseUrl || '')}" placeholder="https://your-provider.com/v1"/></div>
  <label>API key</label><input id="${which}Key" type="password" value="" placeholder="${cfg.hasApiKey ? 'Saved securely — enter only to replace' : 'paste your key'}"/>
  <label>Model <span style="color:var(--dim);font-weight:400">— pick one, or browse every model</span></label>
  <div id="${which}ModelBox" data-role="${role}" data-current="${esc(cfg.model || '')}"></div>
  <div class="testline"><button class="btn sm" onclick="testLLM('${which}')">✓ Test this model</button><span class="res" id="${which}Res"></span></div>`;
}

// Renders the model picker: curated cards + "browse all" searchable list.
async function renderModelPicker(which, opts = {}) {
  const box = $('#' + which + 'ModelBox');
  if (!box) return;
  const role = box.dataset.role;
  const current = opts.keepCurrent === false ? '' : box.dataset.current || '';
  const provider = $('#' + which + 'Prov').value;
  const baseUrl = $('#' + which + 'Base') ? $('#' + which + 'Base').value : '';
  box.innerHTML = '<p class="hint">Loading models…</p>';
  let data = { curated: [], models: [] };
  try {
    await jpost('/api/settings', collectSettings());
    const q = `/api/models?which=${role}&provider=${encodeURIComponent(provider)}&baseUrl=${encodeURIComponent(baseUrl)}${opts.fetchAll ? '&fetch=1' : ''}`;
    data = await jget(q);
  } catch (e) { /* fall back to curated-less state */ }
  const cur = current || (data.curated.find((m) => m.best === role) || data.curated[0] || {}).id || '';
  box.dataset.current = cur;
  const cards = data.curated
    .map(
      (m) => `<div class="model-card ${m.id === cur ? 'sel' : ''}" onclick="pickModel('${which}','${esc(m.id)}')">
        <div class="mc-top"><b>${esc(m.label)}</b>${m.best === role ? '<span class="mc-tag">recommended</span>' : ''}</div>
        <p>${esc(m.note || '')}</p><code>${esc(m.id)}</code>
      </div>`
    )
    .join('');
  const all = data.models || [];
  box.innerHTML = `
    <div class="model-grid">${cards || '<p class="hint">No presets for this provider — use the box below.</p>'}</div>
    <div class="row" style="margin-top:10px">
      <input id="${which}Model" list="${which}List" value="${esc(cur)}" placeholder="or type any model id"/>
      <button class="btn sm" style="flex:none" onclick="renderModelPicker('${which}',{fetchAll:true})">
        ${all.length ? '↻ Refresh list' : '🔍 Browse all models'}
      </button>
    </div>
    <datalist id="${which}List">${all.map((m) => `<option value="${esc(m)}">`).join('')}</datalist>
    ${all.length ? `<p class="hint" style="margin-top:6px">${all.length} models available — start typing in the box to search them.</p>` : ''}`;
  $('#' + which + 'Model').addEventListener('input', (e) => {
    box.dataset.current = e.target.value;
    box.querySelectorAll('.model-card').forEach((c) => c.classList.remove('sel'));
  });
}
function pickModel(which, id) {
  const box = $('#' + which + 'ModelBox');
  box.dataset.current = id;
  $('#' + which + 'Model').value = id;
  box.querySelectorAll('.model-card').forEach((c) => c.classList.toggle('sel', c.querySelector('code').textContent === id));
  const r = $('#' + which + 'Res');
  if (r) { r.className = 'res'; r.textContent = ''; }
}
function onProviderChange(which) {
  const p = $('#' + which + 'Prov').value;
  $('#' + which + 'BaseWrap').style.display = p === 'custom' ? '' : 'none';
  renderModelPicker(which, { keepCurrent: false });
}

function settingsModal() {
  const s = STATE.settings;
  openModal(`
    <h2>Settings</h2>
    <div class="msection">
      <h4>🔎 Nexlev <span style="color:var(--dim);font-weight:400;text-transform:none">(one-time sign-in)</span></h4>
      <p class="hint">Powers real transcripts, viral-outlier data and weekly similar-channel discovery. Just sign in with your account — no API key needed. Without it the tool still works on free public data.</p>
      ${s.nexlev.oauth && s.nexlev.oauth.connected
        ? `<div class="connbox ok">
             <div><b>✅ Signed in to Nexlev</b><span>Connected ${esc((s.nexlev.oauth.connectedAt || '').slice(0, 10))} · token refreshes itself</span></div>
             <div style="display:flex;gap:8px">
               <button class="btn sm" onclick="testNexlev()">Test</button>
               <button class="btn sm ghost danger" onclick="disconnectNexlev()">Sign out</button>
             </div>
           </div>`
        : `<div class="connbox">
             <div><b>Not connected</b><span>Sign in once — a Nexlev tab opens, you approve, done forever.</span></div>
             <button class="btn primary" onclick="connectNexlev()">🔗 Connect with Nexlev</button>
           </div>`}
      <div class="testline"><span class="res" id="nxRes"></span></div>
      <details style="margin-top:10px">
        <summary style="cursor:pointer;color:var(--dim);font-size:12px">Advanced — server URL / API key</summary>
        <label>MCP URL</label><input id="nxUrl" value="${esc(s.nexlev.url)}" placeholder="https://…/mcp"/>
        <label>API key <span style="color:var(--dim);font-weight:400">(only if your account has one — sign-in is the normal way)</span></label>
        <input id="nxKey" type="password" value="" placeholder="${s.nexlev.hasKey ? 'Saved securely — enter only to replace' : 'leave empty when signed in'}"/>
        <div class="testline"><button class="btn sm" onclick="testNexlev()">Test connection</button></div>
      </details>
    </div>
    <div class="msection"><h4>🧠 Analysis AI (learns the writing style)</h4>
      <p class="hint">Reads long transcripts — a cheap, big-context model is ideal.</p>
      ${providerRow('an', s.analysis)}
    </div>
    <div class="msection"><h4>✍️ Writer AI (writes your scripts)</h4>
      <p class="hint">Your best model goes here — this decides script quality.</p>
      ${providerRow('wr', s.writer)}
    </div>
    <div class="mfoot"><button class="btn ghost" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveSettings()">💾 Save settings</button></div>`);
  renderModelPicker('an');
  renderModelPicker('wr');
}
function modelOf(which) {
  const inp = $('#' + which + 'Model');
  if (inp && inp.value.trim()) return inp.value.trim();
  const box = $('#' + which + 'ModelBox');
  return (box && box.dataset.current) || '';
}
function collectSettings() {
  const val = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
  return {
    nexlev: { url: val('nxUrl'), key: val('nxKey') },
    analysis: { provider: $('#anProv').value, baseUrl: val('anBase'), apiKey: val('anKey'), model: modelOf('an') },
    writer: { provider: $('#wrProv').value, baseUrl: val('wrBase'), apiKey: val('wrKey'), model: modelOf('wr') },
  };
}
async function saveSettings() {
  try {
    await jpost('/api/settings', collectSettings());
    toast('Settings saved');
    closeModal();
    load();
  } catch (e) { toast(e.message, true); }
}
async function testNexlev() {
  const r = $('#nxRes');
  r.className = 'res'; r.textContent = 'connecting…';
  try {
    await jpost('/api/settings', collectSettings());
    const j = await jpost('/api/test/nexlev', {});
    r.className = 'res ok';
    r.textContent = `✓ Connected — ${j.tools} research tools available`;
  } catch (e) { r.className = 'res err'; r.textContent = '✗ ' + e.message; }
}
async function connectNexlev() {
  try { await jpost('/api/settings', collectSettings()); } catch {}
  window.open('/api/script-writer/oauth/start', '_blank');
  toast('A Nexlev sign-in tab opened — approve it, then come back');
  // Poll until the server reports a connected session, then refresh the modal.
  let tries = 0;
  const iv = setInterval(async () => {
    tries++;
    try {
      const st = await jget('/api/state');
      if (st.settings.nexlev.oauth && st.settings.nexlev.oauth.connected) {
        clearInterval(iv);
        STATE = st;
        renderBadges();
        settingsModal();
        toast('✅ Nexlev connected!');
      }
    } catch {}
    if (tries > 150) clearInterval(iv);
  }, 2000);
}
async function disconnectNexlev() {
  await jpost('/api/oauth/disconnect', {});
  STATE = await jget('/api/state');
  renderBadges();
  settingsModal();
  toast('Signed out of Nexlev');
}
async function testLLM(which) {
  const key = which === 'an' ? 'analysis' : 'writer';
  const r = $('#' + which + 'Res');
  r.className = 'res'; r.textContent = 'testing…';
  try {
    await jpost('/api/settings', collectSettings());
    await jpost('/api/test/llm', { which: key });
    r.className = 'res ok';
    r.textContent = '✓ Working — ' + modelOf(which);
  } catch (e) { r.className = 'res err'; r.textContent = '✗ ' + e.message; }
}

/* ---------- boot ---------- */
$('#btnBack').addEventListener('click', () => window.parent.postMessage({ type: 'cipher:back-to-hub' }, window.location.origin));
$('#btnNew').addEventListener('click', () => wizard());
$('#btnSettings').addEventListener('click', settingsModal);
window.renderNiche = renderNiche;
window.wizard = wizard;
window.wPreset = wPreset;
window.wSave2 = wSave2;
window.wCreate = wCreate;
window.run = run;
window.writeTopic = writeTopic;
window.saveCfg = saveCfg;
window.onLenChange = onLenChange;
window.syncLen = syncLen;
window.delNiche = delNiche;
window.viewScript = viewScript;
window.copyScript = copyScript;
window.viewDna = viewDna;
window.testNexlev = testNexlev;
window.connectNexlev = connectNexlev;
window.disconnectNexlev = disconnectNexlev;
window.testLLM = testLLM;
window.renderModelPicker = renderModelPicker;
window.pickModel = pickModel;
window.onProviderChange = onProviderChange;
window.saveSettings = saveSettings;
window.settingsModal = settingsModal;
window.closeModal = closeModal;
window.toast = toast;
window.$ = $;
load().catch((e) => toast('Failed to load: ' + e.message, true));
