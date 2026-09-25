// Free fallbacks (no Nexlev needed): channel resolve via page scrape, latest videos via RSS,
// transcripts via YouTube caption tracks. Best-effort — Nexlev gives better data when connected.
const UA = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'CONSENT=YES+1',
};

async function fetchText(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  return r.text();
}

function unesc(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// YouTube moves these fields around, so try every known location, most reliable first.
const ID_PATTERNS = [
  /<link rel="canonical" href="[^"]*\/channel\/(UC[0-9A-Za-z_-]{22})/,
  /"externalId":"(UC[0-9A-Za-z_-]{22})"/,
  /"browseId":"(UC[0-9A-Za-z_-]{22})"/,
  /"channelId":"(UC[0-9A-Za-z_-]{22})"/,
  /og:url" content="[^"]*\/channel\/(UC[0-9A-Za-z_-]{22})/,
  /channel_id=(UC[0-9A-Za-z_-]{22})/,
];

function idFromHtml(html) {
  for (const re of ID_PATTERNS) {
    const m = html.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

// Ask YouTube's own InnerTube API to resolve a handle/custom URL → channel id.
async function resolveViaInnerTube(url) {
  try {
    const r = await fetch('https://www.youtube.com/youtubei/v1/navigation/resolve_url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en' } },
        url,
      }),
    });
    const j = await r.json();
    const ep = j && (j.endpoint || j);
    const id =
      (ep && ep.browseEndpoint && ep.browseEndpoint.browseId) ||
      (ep && ep.payload && ep.payload.browseEndpoint && ep.payload.browseEndpoint.browseId) ||
      (JSON.stringify(j).match(/"browseId":"(UC[0-9A-Za-z_-]{22})"/) || [])[1];
    return id && /^UC[0-9A-Za-z_-]{22}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

// Accepts: @handle · bare handle · plain channel name · /channel/UC… · /c/name · /user/name
// · a VIDEO link (watch?v=, youtu.be/, /shorts/, /live/) → resolves to that video's channel.
function normalizeChannelInput(raw) {
  let s = String(raw || '').trim().replace(/^["'<]|[">']$/g, '');
  if (!s) throw new Error('empty link');

  // A raw channel id on its own.
  if (/^UC[0-9A-Za-z_-]{22}$/.test(s)) return { url: 'https://www.youtube.com/channel/' + s, videoId: null };

  // A video id or video link → we will look up its channel.
  const vid =
    (s.match(/[?&]v=([0-9A-Za-z_-]{11})/) || [])[1] ||
    (s.match(/youtu\.be\/([0-9A-Za-z_-]{11})/) || [])[1] ||
    (s.match(/\/(?:shorts|live|embed)\/([0-9A-Za-z_-]{11})/) || [])[1] ||
    (/^[0-9A-Za-z_-]{11}$/.test(s) && !/^UC/.test(s) ? s : null);
  if (vid) return { url: null, videoId: vid };

  if (/^@/.test(s)) s = 'https://www.youtube.com/' + s;
  else if (!/^https?:/i.test(s) && !s.includes('/')) s = 'https://www.youtube.com/@' + s.replace(/\s+/g, '');
  else if (!/^https?:/i.test(s)) s = 'https://' + s;

  // Drop tracking junk (?si=…, &feature=…) which can break the fetch.
  try {
    const u = new URL(s);
    u.search = '';
    u.hash = '';
    s = u.toString().replace(/\/$/, '');
  } catch {}
  return { url: s, videoId: null };
}

// Look up which channel a video belongs to (works for video links).
async function channelOfVideo(videoId) {
  try {
    const r = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en' } },
        videoId,
      }),
    });
    const j = await r.json();
    const d = (j && j.videoDetails) || {};
    if (d.channelId) return { channelId: d.channelId, name: d.author || d.channelId };
  } catch {}
  return null;
}

async function resolveChannelFree(link) {
  const norm = normalizeChannelInput(link);

  // 0) A video link — resolve to the channel that published it.
  if (norm.videoId) {
    const c = await channelOfVideo(norm.videoId);
    if (c) return c;
    throw new Error('Could not find the channel for that video link (' + link + ')');
  }

  let url = norm.url;

  // 1) The id is already in the URL.
  const direct = url.match(/channel\/(UC[0-9A-Za-z_-]{22})/);
  if (direct) {
    let name = direct[1];
    try {
      const h = await fetchText(url);
      name = unesc((h.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || name);
    } catch {}
    return { channelId: direct[1], name };
  }

  // 2) Scrape the page (handles, /c/, /user/ …).
  let html = '';
  let id = null;
  let name = '';
  try {
    html = await fetchText(url);
    id = idFromHtml(html);
    name = unesc(
      (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] ||
        (html.match(/<title>([^<]*)<\/title>/) || [])[1] ||
        ''
    ).replace(/\s*-\s*YouTube\s*$/, '');
  } catch {}

  // 3) Ask InnerTube to resolve it.
  if (!id) id = await resolveViaInnerTube(url);

  if (!id) throw new Error('Could not find a channel id at ' + link + ' — check the link opens a real channel page');
  return { channelId: id, name: name || id };
}

async function rssVideos(channelId) {
  const xml = await fetchText('https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId);
  const out = [];
  const re = /<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]*)<\/title>/g;
  let m;
  while ((m = re.exec(xml))) out.push({ videoId: m[1], title: unesc(m[2]) });
  return out;
}

function parseCaptionPayload(raw) {
  // json3 or timedtext XML — handle both.
  try {
    const j = JSON.parse(raw);
    const words = [];
    for (const ev of j.events || []) for (const s of ev.segs || []) if (s.utf8) words.push(s.utf8);
    const text = words.join('').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length > 200 ? text : null;
  } catch {}
  if (raw.includes('<timedtext') || raw.includes('<transcript')) {
    const text = unesc(
      raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
    return text.length > 200 ? text : null;
  }
  return null;
}

async function fetchTranscriptFree(videoId) {
  // Strategy 1: InnerTube ANDROID client (caption URLs work server-side, no pot token needed).
  try {
    const r = await fetch('https://www.youtube.com/youtubei/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
      },
      body: JSON.stringify({
        context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 30, hl: 'en' } },
        videoId,
      }),
    });
    const j = await r.json();
    const tracks =
      j && j.captions && j.captions.playerCaptionsTracklistRenderer && j.captions.playerCaptionsTracklistRenderer.captionTracks;
    if (tracks && tracks.length) {
      const t = tracks.find((t) => (t.languageCode || '').startsWith('en')) || tracks[0];
      if (t.baseUrl) {
        const raw = await fetchText(t.baseUrl);
        const text = parseCaptionPayload(raw);
        if (text) return text;
        const raw3 = await fetchText(t.baseUrl + (t.baseUrl.includes('fmt=') ? '' : '&fmt=json3'));
        const text3 = parseCaptionPayload(raw3);
        if (text3) return text3;
      }
    }
  } catch {}
  // Strategy 2: watch-page scrape (older path; may be blocked by pot-token requirement).
  try {
    const html = await fetchText('https://www.youtube.com/watch?v=' + videoId + '&hl=en');
    const m = html.match(/"captionTracks":(\[[^\]]*\])/);
    if (!m) return null;
    const tracks = JSON.parse(m[1]);
    if (!tracks.length) return null;
    const t = tracks.find((t) => (t.languageCode || '').startsWith('en')) || tracks[0];
    if (!t.baseUrl) return null;
    const url = t.baseUrl.replace(/\\u0026/g, '&');
    return parseCaptionPayload(await fetchText(url + '&fmt=json3'));
  } catch {}
  return null;
}

module.exports = { resolveChannelFree, rssVideos, fetchTranscriptFree };


