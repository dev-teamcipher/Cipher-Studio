// Cipher AI Writer core pipeline: discover → harvest → learn (Style DNA) → suggest → write.
const fs = require('fs');
const path = require('path');
const { chatLLM } = require('./llm');
const { resolveChannelFree, rssVideos, fetchTranscriptFree } = require('./transcripts');

const WPM = 155; // narration words per minute — used to convert minutes ⇄ words

const LENGTHS = {
  short: { label: 'Short (5–8 min)', words: '900–1,300', min: 900 },
  standard: { label: 'Standard (12–18 min)', words: '1,900–2,800', min: 1900 },
  long: { label: 'Long (20–30 min)', words: '3,000–4,200', min: 3000 },
  custom: { label: 'Custom…', words: 'your own target', min: 900, custom: true },
};

// Resolve the word target for a niche, honouring a custom words/minutes setting.
function lengthFor(niche) {
  if (niche.lengthKey === 'custom') {
    const w = Math.max(150, Math.min(20000, +niche.customWords || Math.round((+niche.customMinutes || 12) * WPM)));
    const mins = Math.max(1, Math.round(w / WPM));
    const hi = Math.round(w * 1.15);
    return {
      label: `Custom (~${mins} min)`,
      words: `${w.toLocaleString()}–${hi.toLocaleString()}`,
      min: w,
    };
  }
  return LENGTHS[niche.lengthKey] || LENGTHS.standard;
}

function readJSON(p, d) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; }
}
function writeJSON(p, o) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(o, null, 2));
}
function slugify(s) {
  return (
    String(s || '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled'
  );
}

// ---- normalizers (tolerant to Nexlev response shapes) ----
function normVideos(r) {
  const arr = Array.isArray(r) ? r : (r && (r.videos || r.items || r.results || r.data)) || [];
  return arr
    .map((v) => ({
      videoId: v.videoId || v.video_id || v.id,
      title: v.title || v.video_title || '',
      views: v.views || v.viewCount || v.video_view_count || 0,
    }))
    .filter((v) => v.videoId);
}
function normOutliers(r) {
  const arr = Array.isArray(r) ? r : (r && (r.outliers || r.videos || r.items || r.results || r.data)) || [];
  return arr
    .map((v) => ({
      title: v.title || v.video_title || '',
      videoId: v.videoId || v.video_id || v.id || '',
      views: v.views || v.video_view_count || v.viewCount || 0,
      outlier: v.outlier || v.outlierScore || v.outlier_score || v.multiplier || '',
    }))
    .filter((v) => v.title);
}
function normTranscripts(r) {
  const map = {};
  const arr = Array.isArray(r) ? r : (r && (r.transcripts || r.results || r.items || r.data)) || null;
  if (Array.isArray(arr)) {
    for (const it of arr) {
      const id = it.videoId || it.video_id || it.id;
      let tx = it.transcript || it.text || it.captions || '';
      if (!tx && Array.isArray(it.segments)) tx = it.segments.map((s) => s.text || '').join(' ');
      if (id && typeof tx === 'string' && tx.trim().length > 200) map[id] = tx;
    }
  } else if (r && typeof r === 'object') {
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === 'string' && v.length > 200 && /^[\w-]{6,}$/.test(k)) map[k] = v;
      else if (v && typeof v === 'object' && typeof v.transcript === 'string') map[k] = v.transcript;
    }
  }
  return map;
}

// Resolve any YouTube link/handle/id to a channel. Tries the free path first (fast, no quota),
// then falls back to Nexlev's resolver so both routes cover each other.
async function resolveChannel(link, mcp) {
  let firstErr = null;
  try {
    const r = await resolveChannelFree(link);
    if (r && r.channelId) return { ...r, url: link };
  } catch (e) { firstErr = e; }

  if (mcp) {
    for (const args of [{ url: link }, { channel_url: link }, { query: link }, { handle: String(link).replace(/^.*@/, '@') }]) {
      try {
        const r = await mcp.call('channel_resolver', args);
        const id =
          r.channelId || r.channel_id || r.ytChannelId || r.id ||
          (r.channel && (r.channel.id || r.channel.channelId || r.channel.ytChannelId));
        const name = r.title || r.name || (r.channel && r.channel.title) || link;
        if (id) return { channelId: id, name, url: link };
      } catch {}
    }
  }
  throw new Error((firstErr && firstErr.message) || 'Could not resolve ' + link);
}

// ---- DISCOVER: auto-find similar channels (scouts) to widen topic mining ----
async function discover(ctx) {
  const { niche, log, mcp } = ctx;
  if (!mcp) {
    log('ℹ️ Discover skipped — connect Nexlev (Settings) to auto-find similar channels weekly');
    return;
  }
  const query = (niche.name + ' ' + (niche.description || '')).replace(/\s+/g, ' ').slice(0, 220);
  let found = [];
  try {
    const r = await mcp.call('search_niche_finder_channels', { query, isFaceless: true, limit: 12, minSubscribers: 100000 });
    const arr = (r && (r.channels || r.results || r.items || r.data)) || [];
    found = arr
      .map((c) => ({ channelId: c.ytChannelId || c.channelId || c.id, name: c.title || c.name || '' }))
      .filter((c) => c.channelId);
  } catch (e) {
    log('⚠️ Discover failed: ' + e.message);
    return;
  }
  niche.scouts = niche.scouts || [];
  const known = new Set([...niche.teachers, ...niche.scouts].map((c) => c.channelId));
  const fresh = found.filter((c) => !known.has(c.channelId)).slice(0, 3);
  niche.scouts.push(...fresh);
  niche.scouts = niche.scouts.slice(-12); // keep the newest 12 scouts
  niche.lastDiscover = new Date().toISOString().slice(0, 10);
  ctx.saveNiche();
  if (fresh.length) log('🧭 Discovered ' + fresh.length + ' similar channel(s): ' + fresh.map((c) => c.name).join(', '));
  else log('🧭 Discover: no new similar channels found this time');
}

// ---- HARVEST: teacher transcripts → corpus, teacher+scout outliers → topics pool ----
async function harvest(ctx) {
  const { dir, niche, log, mcp } = ctx;
  const corpusDir = path.join(dir, 'corpus');
  fs.mkdirSync(corpusDir, { recursive: true });
  niche.harvested = niche.harvested || [];

  // Weekly: widen the net with similar channels (scouts feed topic mining below).
  if (!niche.lastDiscover || Date.now() - new Date(niche.lastDiscover).getTime() > 6 * 86400e3) {
    await discover(ctx);
  }

  const wanted = [];
  for (const ch of niche.teachers) {
    let vids = [];
    if (mcp) {
      try {
        vids = normVideos(await mcp.call('youtube_channel_videos', { channel_id: ch.channelId, sort_by: 'popular' })).slice(0, 8);
        log(`📡 ${ch.name}: ${vids.length} top videos (Nexlev)`);
      } catch (e) {
        log('⚠️ Nexlev video list failed for ' + ch.name + ': ' + e.message);
      }
    }
    if (!vids.length) {
      try {
        vids = await rssVideos(ch.channelId);
        log(`📡 ${ch.name}: ${vids.length} recent videos (free RSS)`);
      } catch (e) {
        log('⚠️ RSS failed for ' + ch.name + ': ' + e.message);
      }
    }
    const fresh = vids.filter((v) => !niche.harvested.includes(v.videoId)).slice(0, 4);
    for (const v of fresh) wanted.push({ ...v, channel: ch.name });
  }

  const batch = wanted.slice(0, 12);
  log(`🎯 ${batch.length} new videos to study`);
  let map = {};
  if (mcp && batch.length) {
    for (let i = 0; i < batch.length; i += 10) {
      const ids = batch.slice(i, i + 10).map((v) => v.videoId);
      try {
        Object.assign(map, normTranscripts(await mcp.call('get_bulk_video_transcripts', { videoIds: ids })));
      } catch (e) {
        log('⚠️ Nexlev transcript batch failed: ' + e.message);
      }
    }
  }
  let saved = 0;
  for (const v of batch) {
    let text = map[v.videoId];
    if (!text) {
      try {
        text = await fetchTranscriptFree(v.videoId);
        if (text) log('🕸️ studied: ' + (v.title || v.videoId));
      } catch {}
    }
    niche.harvested.push(v.videoId);
    if (text && text.length > 500) {
      fs.writeFileSync(path.join(corpusDir, v.videoId + '.txt'), `# ${v.channel} | ${v.title}\n\n` + text);
      saved++;
    } else {
      log('⏭️ no transcript available: ' + (v.title || v.videoId));
    }
  }

  // Topic fuel: outliers (Nexlev) or recent titles (free fallback) — teachers AND discovered scouts
  const topicsP = path.join(dir, 'topics.json');
  const topics = readJSON(topicsP, { raw: [] });
  const mineList = [...niche.teachers, ...(niche.scouts || [])];
  for (const ch of mineList) {
    let entries = [];
    if (mcp) {
      try {
        entries = normOutliers(
          await mcp.call('youtube_channel_outliers', { channel_id: ch.channelId, max_videos: 100, min_outlier_threshold: 1.5 })
        ).map((o) => ({ ...o, channel: ch.name, source: 'outlier' }));
        log(`🔥 ${ch.name}: ${entries.length} viral outliers`);
      } catch (e) {
        log('⚠️ outliers failed for ' + ch.name + ': ' + e.message);
      }
    }
    if (!entries.length) {
      try {
        entries = (await rssVideos(ch.channelId)).map((v) => ({ title: v.title, videoId: v.videoId, channel: ch.name, source: 'recent' }));
      } catch {}
    }
    for (const e of entries) {
      if (!topics.raw.find((t) => (e.videoId && t.videoId === e.videoId) || t.title === e.title)) topics.raw.push(e);
    }
  }
  topics.raw = topics.raw.slice(-80);
  topics.updatedAt = new Date().toISOString().slice(0, 10);
  writeJSON(topicsP, topics);

  ctx.saveNiche();
  const total = fs.readdirSync(corpusDir).filter((f) => f.endsWith('.txt')).length;
  log(`✅ Studied +${saved} videos (total ${total}) · topic pool ${topics.raw.length}`);
  return { saved };
}

// ---- LEARN: corpus → Style DNA ----
async function learn(ctx) {
  const { dir, niche, log, settings } = ctx;
  const corpusDir = path.join(dir, 'corpus');
  const files = fs.existsSync(corpusDir) ? fs.readdirSync(corpusDir).filter((f) => f.endsWith('.txt')) : [];
  if (!files.length) throw new Error('No videos studied yet — press Update Brain first.');

  // Mix the NEWEST transcripts with a rotating sample of older ones. Learning only from the
  // newest batch every time makes the DNA drift and forget what it already knew.
  const ranked = files
    .map((f) => ({ f, t: fs.statSync(path.join(corpusDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const newest = ranked.slice(0, 7);
  const older = ranked.slice(7);
  const rotate = (niche.learnCount || 0) * 3; // shift the window each run so all older files get seen over time
  const sampled = older.length ? Array.from({ length: Math.min(3, older.length) }, (_, i) => older[(rotate + i) % older.length]) : [];
  const picked = [...newest, ...sampled];

  const chunks = picked.map(({ f }) => fs.readFileSync(path.join(corpusDir, f), 'utf8').slice(0, 26000));
  const dnaP = path.join(dir, 'style-dna.md');
  const existing = fs.existsSync(dnaP) ? fs.readFileSync(dnaP, 'utf8') : '';

  log(`🧠 Learning from ${picked.length} transcripts (${newest.length} newest + ${sampled.length} revisited) via ${settings.analysis.provider} / ${settings.analysis.model}…`);
  const system =
    'You are a world-class YouTube script-style analyst. You extract concrete, reusable writing patterns from transcripts. You NEVER copy sentences — only patterns. You write tight, specific style guides a ghost-writer can follow exactly.';
  const user = `NICHE: ${niche.name}
CREATOR'S OWN NOTES ABOUT THIS NICHE: ${niche.description || '(none)'}

${existing ? 'EXISTING STYLE DNA (merge & refine — keep what is right, sharpen with new evidence, stay under ~350 lines):\n' + existing + '\n\n' : ''}NEW TRANSCRIPTS FROM ESTABLISHED CHANNELS IN THIS NICHE:

${chunks.map((c, i) => `=== TRANSCRIPT ${i + 1} ===\n${c}`).join('\n\n')}

Write the complete updated STYLE DNA as markdown with EXACTLY these sections:
# ${niche.name} — Style DNA
(one line: Learned: <date> | corpus=<n> transcripts)
## 1. Hook / cold-open  (concrete templates in OUR OWN words)
## 2. Story structure  (beat map with % of runtime)
## 3. Voice & sentence rhythm  (tense, person, sentence length)
## 4. Retention devices  (open loops, pattern interrupts, foreshadowing)
## 5. Transitions  (the actual connective phrases)
## 6. Vocabulary & tone  (recurring diction + what to AVOID)
## 7. Outro / CTA
## 8. Title & thumbnail angles
## WRITER CHECKLIST
(8–12 imperative bullets a writer must satisfy)

If the channels split into genuinely distinct styles, define selectable MODES and keep them separate.

${existing ? 'AFTER the markdown, add a final line starting with "CHANGELOG:" summarising in one sentence what you sharpened or added compared to the existing DNA (or "CHANGELOG: no meaningful change" if the new transcripts taught nothing new).' : ''}
Output ONLY the markdown${existing ? ' plus that single CHANGELOG line' : ''}.`;
  const out = await chatLLM(settings.analysis, { system, user, maxTokens: 8192, temperature: 0.4 });

  // Split off the changelog line so the DNA file itself stays clean.
  let body = out.trim();
  let changelog = '';
  const cm = body.match(/\n\s*CHANGELOG:\s*(.+)\s*$/i);
  if (cm) {
    changelog = cm[1].trim();
    body = body.slice(0, cm.index).trim();
  }

  // Keep the previous version so nothing is ever silently lost and the creator can compare.
  if (existing) {
    const histDir = path.join(dir, 'dna-history');
    fs.mkdirSync(histDir, { recursive: true });
    const stamp = (niche.learnedAt || new Date().toISOString()).replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(histDir, stamp + '.md'), existing);
    const old = fs.readdirSync(histDir).filter((f) => f.endsWith('.md')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - 10))) fs.rmSync(path.join(histDir, f), { force: true });
  }

  fs.writeFileSync(dnaP, body + '\n');
  niche.learnedAt = new Date().toISOString();
  niche.learnCount = (niche.learnCount || 0) + 1;
  niche.corpusAtLearn = files.length;
  niche.lastChangelog = changelog;
  ctx.saveNiche();

  // A running log of how the brain evolved.
  const logLine = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} · v${niche.learnCount} · ${files.length} videos studied · ${changelog || 'refreshed'}\n`;
  fs.appendFileSync(path.join(dir, 'dna-changelog.txt'), logLine);

  log(`✅ Style DNA updated → v${niche.learnCount}${changelog ? ' — ' + changelog : ''}`);
}

// ---- PICK: distill fresh, non-repeating topic angles from the viral pool ----
async function pickAngles(ctx, count) {
  const { dir, niche, log, settings } = ctx;
  const topics = readJSON(path.join(dir, 'topics.json'), { raw: [] });
  const ledger = readJSON(path.join(dir, 'ledger.json'), { topics: [] });
  log(`🎯 Picking ${count} fresh angle(s) (${settings.writer.provider} / ${settings.writer.model})…`);
  const pickUser = `NICHE: ${niche.name}
CREATOR NOTES: ${niche.description || ''}

PROVEN VIRAL VIDEOS in this niche (competitor outliers / recent hits):
${topics.raw.slice(-60).map((t) => `- ${t.title}${t.outlier ? ` (${t.outlier}x)` : ''}`).join('\n') || '(pool empty — derive strong angles from the niche itself)'}

ALREADY WRITTEN (never repeat these subjects or near-duplicates):
${ledger.topics.map((t) => '- ' + t.title).join('\n') || '(none yet)'}

Pick ${count} NEW topic angle(s). Steal the proven PATTERN (what made those titles viral), aim it at a FRESH subject — never copy a competitor title, never reuse a written subject. Each must be a real, factually-documentable subject with a clear narrative spine and payoff.
IMPORTANT — PATTERN VARIETY: look at the title formulas in the ALREADY WRITTEN list. Do NOT reuse a title formula that already appears there (e.g. if several end in "...Will Haunt You", pick a DIFFERENT proven formula this time). If picking multiple angles now, each must use a different formula.
Reply with ONLY a JSON array: [{"title":"...","angle":"pattern + why this subject","inspiredBy":"which proven title/pattern"}]`;
  const pickOut = await chatLLM(settings.writer, {
    system: 'You are a viral YouTube strategist. You reply with pure JSON only — no prose, no markdown fences.',
    user: pickUser,
    maxTokens: 2500,
    temperature: 0.9,
  });
  const mm = pickOut.match(/\[[\s\S]*\]/);
  if (!mm) throw new Error('Could not parse topic JSON from the model. Raw: ' + pickOut.slice(0, 200));
  let angles;
  try { angles = JSON.parse(mm[0]); } catch (e) { throw new Error('Topic JSON invalid: ' + e.message); }
  // Safety net: drop any suggestion that copies a competitor title or an already-written one.
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const taken = new Set([...topics.raw.map((t) => norm(t.title)), ...ledger.topics.map((t) => norm(t.title))]);
  angles = angles.filter((a) => a && a.title && !taken.has(norm(a.title)));
  return angles.slice(0, count);
}

// ---- SUGGEST: topic ideas the creator can pick from (no writing yet) ----
async function suggestTopics(ctx, count = 8) {
  const { dir, log } = ctx;
  const angles = await pickAngles(ctx, count);
  writeJSON(path.join(dir, 'suggestions.json'), { updatedAt: new Date().toISOString().slice(0, 10), topics: angles });
  log('💡 ' + angles.length + ' topic ideas ready — pick one and hit Write');
  return angles;
}

// Openings of the last few scripts — fed to the writer so it never repeats itself.
function recentOpeners(dir, n = 3) {
  const sd = path.join(dir, 'scripts');
  try {
    return fs
      .readdirSync(sd)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, n)
      .map((f) => extractNarration(fs.readFileSync(path.join(sd, f), 'utf8')).slice(0, 220).replace(/\s+/g, ' '));
  } catch {
    return [];
  }
}

// ---- WRITE: topics + DNA + ledger → N fresh scripts (or one chosen topic) ----
async function writeScripts(ctx, count, chosen) {
  const { dir, niche, log, settings } = ctx;
  const dnaP = path.join(dir, 'style-dna.md');
  if (!fs.existsSync(dnaP)) throw new Error('No Style DNA yet — run Update Brain first (built-in niches include one).');
  const dna = fs.readFileSync(dnaP, 'utf8');
  const ledger = readJSON(path.join(dir, 'ledger.json'), { topics: [] });
  const L = lengthFor(niche);
  const angles = chosen && chosen.title ? [chosen] : await pickAngles(ctx, count);
  const openers = recentOpeners(dir);

  const scriptsDir = path.join(dir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const made = [];
  for (const a of angles) {
    log('✍️ Writing: ' + a.title);
    const sys =
      'You are an elite YouTube documentary voice-over writer. You write ONLY the words the narrator speaks — never chapter headings, never timestamps, never scene directions. You follow a provided Style DNA exactly. Facts must be real and checkable; when uncertain, hedge honestly ("reportedly", "records suggest") instead of inventing specifics. Never copy sentences from other channels.';
    const usr = `STYLE DNA to follow exactly (if it defines MODES, silently pick the best-fitting one — do NOT mention the mode in your output):

${dna}

---
Write the COMPLETE voice-over narration now.
WORKING TITLE: ${a.title}
ANGLE: ${a.angle}
TARGET LENGTH: ${L.label} — ${L.words} words of narration. HARD requirement: at least ${L.min} words. If a draft lands short, deepen the middle with more concrete detail (dates, people, scenes) — substance, never fluff.

OUTPUT FORMAT — follow EXACTLY:
TITLE: <final title>
ALT1: <alternate title>
ALT2: <alternate title>
THUMBNAIL: <one-line thumbnail concept>
---
Then ONLY the narration itself: the exact words the narrator will speak, start to finish, in plain paragraphs.

STRICT RULES for the narration (it goes straight into a voice-over tool):
- NO chapter headings, NO section names, NO timestamps, NO outlines
- NO scene/stage/camera directions, NO [music]/[pause] cues
- NO markdown symbols (#, *, >, -), NO labels of any kind
- Just clean spoken prose with paragraph breaks where the narrator breathes.
${openers.length ? `
ANTI-REPETITION — these are the openings of your OWN recent scripts. Your new opening must use a structurally DIFFERENT hook (different first-sentence shape, different rhythm, different device):
${openers.map((o, i) => `${i + 1}. "${o}…"`).join('\n')}` : ''}`;
    const out = await chatLLM(settings.writer, { system: sys, user: usr, maxTokens: 16000, temperature: 0.85 });

    const meta = { title: a.title, alt1: '', alt2: '', thumb: '' };
    let narration = parseDraft(out, meta);
    let words = countWords(narration);

    // ---- Enforce the word minimum: expand-and-retry instead of shipping a short script ----
    const floor = Math.round(L.min * 0.97); // tiny tolerance so 1897 doesn't trigger a whole rewrite
    for (let attempt = 1; attempt <= 2 && words < floor; attempt++) {
      const need = L.min - words;
      log(`📏 ${words} words — under the ${L.min} target, expanding (attempt ${attempt})…`);
      const expandUsr = `${dna}

---
This draft narration is TOO SHORT. It is ${words} words; it must be at least ${L.min} words (${L.words}). Add roughly ${need}+ more words.

HOW TO EXPAND — substance only, never padding:
- Deepen the middle: more concrete dates, named people, places, numbers, and small scenes.
- Add the context and consequences the draft skips over; slow down the turning points.
- Do NOT add filler, do NOT repeat points already made, do NOT restate the ending.
- Keep the SAME voice, tense, structure and opening. Keep every existing fact intact.
- Facts must stay real; hedge honestly ("reportedly", "records suggest") rather than inventing specifics.

Return the FULL expanded narration in the same format:
TITLE: ${meta.title}
ALT1: ${meta.alt1}
ALT2: ${meta.alt2}
THUMBNAIL: ${meta.thumb}
---
Then ONLY the narration — spoken words only, no headings, no timestamps, no stage directions, no markdown.

CURRENT DRAFT:
${narration}`;
      try {
        const out2 = await chatLLM(settings.writer, { system: sys, user: expandUsr, maxTokens: 16000, temperature: 0.8 });
        const meta2 = { ...meta };
        const n2 = parseDraft(out2, meta2);
        const w2 = countWords(n2);
        if (w2 > words) { narration = n2; words = w2; Object.assign(meta, meta2); }
        else break; // expansion did not help — keep the better draft rather than looping
      } catch (e) {
        log('⚠️ expand pass failed: ' + e.message);
        break;
      }
    }
    if (words < floor) log(`⚠️ Landed at ${words} words (target ${L.min}) — the model would not go longer.`);

    const slug = slugify(meta.title);
    const base = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + slug;
    const md = `# ${meta.title}\nAlt titles: ${meta.alt1 || '—'} | ${meta.alt2 || '—'}\nThumbnail: ${meta.thumb || '—'}\nAngle: ${a.angle}\n\n---\n\n${narration}\n`;
    fs.writeFileSync(path.join(scriptsDir, base + '.md'), md);
    fs.writeFileSync(path.join(scriptsDir, base + '.txt'), narration + '\n'); // VO-tool ready
    ledger.topics.push({
      slug,
      title: meta.title,
      angle: a.angle,
      date: new Date().toISOString().slice(0, 10),
      inspiredBy: a.inspiredBy || '',
    });
    writeJSON(path.join(dir, 'ledger.json'), ledger);
    made.push(base + '.md');
    log('✅ ' + meta.title + ' — ' + words + ' words, voice-over ready');

    // If this topic came from the suggestions list, tick it off.
    const sugP = path.join(dir, 'suggestions.json');
    const sug = readJSON(sugP, null);
    if (sug && Array.isArray(sug.topics)) {
      const before = sug.topics.length;
      sug.topics = sug.topics.filter((t) => t.title !== a.title);
      if (sug.topics.length !== before) writeJSON(sugP, sug);
    }
  }
  return made;
}

function countWords(s) {
  return String(s || '').split(/\s+/).filter(Boolean).length;
}

// Split a model reply into its meta header (mutates `meta`) and clean narration.
function parseDraft(out, meta) {
  const lines = String(out || '').trim().split('\n');
  const sep = lines.findIndex((l) => l.trim() === '---');
  let narration = String(out || '').trim();
  if (sep !== -1) {
    for (const l of lines.slice(0, sep)) {
      const m = l.match(/^(TITLE|ALT1|ALT2|THUMBNAIL):\s*(.+)$/i);
      if (m) {
        const k = m[1].toUpperCase();
        const v = m[2].trim();
        if (k === 'TITLE') meta.title = v;
        else if (k === 'ALT1') meta.alt1 = v;
        else if (k === 'ALT2') meta.alt2 = v;
        else meta.thumb = v;
      }
    }
    narration = lines.slice(sep + 1).join('\n').trim();
  }
  return cleanNarration(narration);
}

// Strip any headings/timestamps/markdown that slipped into narration; also used to
// normalize older scripts for copy-to-voice-over.
function cleanNarration(text) {
  return String(text || '')
    .split('\n')
    .filter((l) => !/^\s*(#{1,6}\s|\[?\d{1,2}:\d{2}|\*\*.*\*\*\s*$|>\s|Chapter\s+\d|TITLE:|ALT\d:|THUMBNAIL:|Alt titles:|Thumbnail:|Angle:)/i.test(l))
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\s*---+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractNarration(md) {
  let body = String(md || '');
  const ix = body.indexOf('\n---');
  if (ix !== -1) body = body.slice(ix + 4);
  return cleanNarration(body);
}

module.exports = { LENGTHS, WPM, lengthFor, readJSON, writeJSON, slugify, resolveChannel, harvest, learn, writeScripts, suggestTopics, discover, extractNarration };

