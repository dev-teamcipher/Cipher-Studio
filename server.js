require('dotenv').config();
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { exec, execFile, spawn } = require('child_process');
const capcutDraft = require('./lib/capcut-draft');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const { Readable } = require('stream');
const scriptWriter = require('./lib/script-writer');
const studioNative = require('./lib/studio-native');

let PORT = Number(process.env.AUTOCUT_PORT) || 5173;
const ROOT = __dirname;
// In the installer, source files are read from the packaged app while outputs
// belong in the current user's writable application-data folder.
const DATA_ROOT = process.env.AUTOCUT_DATA_DIR || ROOT;
const EXPORTS_DIR = path.join(DATA_ROOT, 'exports');
const TEMP_DIR    = path.join(DATA_ROOT, 'temp_render');
const TRANSCRIPTS_DIR = path.join(DATA_ROOT, 'transcripts');
const FFMPEG_BIN  = process.env.AUTOCUT_FFMPEG_PATH || 'ffmpeg';
const FFPROBE_BIN = process.env.AUTOCUT_FFPROBE_PATH || 'ffprobe';
const WHISPER_BIN = process.env.AUTOCUT_WHISPER_BIN || path.join(ROOT, 'bin', 'whisper', 'Release', 'whisper-cli.exe');
const WHISPER_MODEL = process.env.AUTOCUT_WHISPER_MODEL || path.join(ROOT, 'assets', 'whisper', 'models', 'ggml-small-q5_1.bin');
const FONTS_DIR = process.env.AUTOCUT_FONTS_DIR || path.join(ROOT, 'assets', 'fonts');
const LICENSE_FILE = path.join(DATA_ROOT, 'license.json');
const TRIAL_FILE = path.join(DATA_ROOT, 'trial-state.dat');
const LICENSE_PUBLIC_KEY_FILE = path.join(ROOT, 'assets', 'license-public-key.pem');
const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;
const TRIAL_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
const TRIAL_STATE_SECRET = 'Cipher Studio|offline-trial-state|v1|8FD24C95-7A5A-4CF4-A8EE-BC0E97619D42';

if (!fs.existsSync(EXPORTS_DIR)) fs.mkdirSync(EXPORTS_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR))    fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(TRANSCRIPTS_DIR)) fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.wav':  'audio/wav',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.m4a':  'audio/mp4',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm'
};

const activeJobs = {};
// Source files are uploaded separately from render settings.  Keeping the
// media stream out of multipart settings requests is important: a 30 minute
// video must never be accumulated in the Electron/Node heap.
const renderSources = {};
const nativeTimelineJobs = {};
let videoEncoderPromise = null;
let videoEncoderCache = null;
const FILTER_THREADS = Math.max(2, Math.min(16, os.cpus()?.length || 4));

// The bundled FFmpeg supports NVIDIA NVENC, AMD AMF and Intel Quick Sync.
// Probe the machine once, then select the fastest encoder it actually owns.
// Falling back to x264 is intentional on systems without a supported GPU.
function detectVideoEncoder() {
  const now=Date.now();
  // Hardware is retained, while CPU fallback is periodically retried because
  // driver startup, RDP and encoder-session exhaustion can be transient.
  if(videoEncoderCache&&(videoEncoderCache.encoder.codec!=='libx264'||now-videoEncoderCache.at<60000))return Promise.resolve(videoEncoderCache.encoder);
  if (videoEncoderPromise) return videoEncoderPromise;
  const probes = [
    { name: 'NVIDIA NVENC', codec: 'h264_nvenc', args: ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'hq', '-rc', 'vbr'] },
    { name: 'AMD AMF', codec: 'h264_amf', args: ['-c:v', 'h264_amf', '-quality', 'speed'] },
    { name: 'Intel Quick Sync', codec: 'h264_qsv', args: ['-c:v', 'h264_qsv', '-preset', 'veryfast'] }
  ];
  videoEncoderPromise = (async () => {
    const working=[];
    for (const candidate of probes) {
      try {
        const started=performance.now();
        // A short moving-frame encode validates the real driver path and lets
        // hybrid-GPU laptops select the fastest usable engine, not simply the
        // first codec name compiled into FFmpeg.
        await runProcess(FFMPEG_BIN, ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30','-frames:v','30',...candidate.args,'-f','null','-']);
        working.push({candidate,ms:performance.now()-started});
      } catch(error) { console.warn(`[Export] ${candidate.name} unavailable: ${String(error?.message||error).split('\n').slice(-1)[0]}`); }
    }
    if(working.length){working.sort((a,b)=>a.ms-b.ms);const best=working[0];console.log(`[Export] Using ${best.candidate.name} hardware encoder (${Math.round(best.ms)} ms preflight).`);videoEncoderCache={encoder:best.candidate,at:Date.now()};return best.candidate;}
    console.log('[Export] No supported hardware encoder detected; using all CPU cores with libx264.');
    const cpu={ name: 'CPU x264', codec: 'libx264', args: ['-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '0'] };videoEncoderCache={encoder:cpu,at:Date.now()};return cpu;
  })().finally(()=>{videoEncoderPromise=null;});
  return videoEncoderPromise;
}

function nativeVolumeExpression(track={}){
  const base=(Math.max(0,Math.min(300,Number(track.volume??100)))/100).toFixed(5),keys=Array.isArray(track.keyframes)?track.keyframes:[];
  if(!keys.length)return base;
  let expression=(Math.max(0,Math.min(300,Number(keys[keys.length-1].value??100)))/100).toFixed(5);
  for(let i=keys.length-2;i>=0;i--){const a=keys[i],b=keys[i+1],span=Math.max(.001,Number(b.time)-Number(a.time)),av=Math.max(0,Math.min(300,Number(a.value??100)))/100,diff=(Math.max(0,Math.min(300,Number(b.value??100)))-Math.max(0,Math.min(300,Number(a.value??100))))/100;const segment=`${av.toFixed(5)}+(${diff.toFixed(5)})*max(0\,min(1\,(t-${Number(a.time).toFixed(4)})/${span.toFixed(4)}))`;expression=`if(lt(t\,${Number(b.time).toFixed(4)})\,${segment}\,${expression})`;}
  return expression;
}

function videoEncodingArgs(encoder, quality) {
  const profile = quality === 'high'
    ? { crf: '20', rate: '8500k', buffer: '16000k' }
    : quality === 'compact'
      ? { crf: '26', rate: '2200k', buffer: '4500k' }
      : { crf: '23', rate: '4500k', buffer: '9000k' };
  if (encoder.codec === 'libx264') return [...encoder.args, '-crf', profile.crf, '-maxrate', profile.rate, '-bufsize', profile.buffer];
  return [...encoder.args, '-b:v', profile.rate, '-maxrate', profile.rate, '-bufsize', profile.buffer, '-pix_fmt', 'yuv420p'];
}

function base64url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function readWindowsMachineGuid() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve(`${process.platform}:${require('os').hostname()}`);
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { windowsHide: true }, (error, stdout) => {
      const match = String(stdout || '').match(/MachineGuid\s+REG_SZ\s+([^\s\r\n]+)/i);
      resolve(match ? match[1] : `fallback:${require('os').hostname()}:${process.arch}`);
    });
  });
}


function createLicenseManager() {
  let deviceId = '';
  let active = null;
  const SECRET_SALT = "CipherVoice_992";
  
  const ready = (async () => {
    const guid = await readWindowsMachineGuid();
    deviceId = crypto.createHash('sha256').update(guid + 'STUDIO').digest('hex').substring(0, 8).toUpperCase();
    await checkOnlineStatus();
  })();

  async function checkOnlineStatus() {
    return new Promise((resolve) => {
      const req = https.get(`https://keyvalue.immanuel.co/api/KeyVal/GetValue/sar8kxkx/${deviceId}`, { timeout: 5000 }, (res) => {
        let data = '';
        const serverTime = res.headers.date ? new Date(res.headers.date).getTime() : Date.now();
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let responseText = data.replace(/^"|"$/g, '').trim();
          let statusResult = "active";
          if (responseText.toLowerCase() === "suspended") {
            statusResult = "suspended";
          } else if (responseText.includes("|")) {
            const parts = responseText.split("|");
            if (parts[0].toLowerCase() === "active" && parts.length > 1) {
              const expiresAt = parseInt(parts[1], 10) * 1000;
              if (serverTime > expiresAt) {
                statusResult = "expired";
              }
            }
          }
          resolve(statusResult);
        });
      });
      req.on('error', () => resolve("active"));
      req.on('timeout', () => { req.destroy(); resolve("active"); });
    });
  }

  function generateExpectedKey(hwid) {
    const raw = hwid.toUpperCase() + SECRET_SALT;
    const hashVal = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
    return `CIPHER-${hashVal.substring(0,4)}-${hashVal.substring(4,8)}`;
  }

  return {
    async status() {
      await ready;
      let accessGranted = false;
      let errorReason = 'Not licensed';
      let state = 'not_licensed';
      let currentKey = '';

      if (fs.existsSync(LICENSE_FILE)) {
        try {
          const saved = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
          if (saved && saved.key) {
            currentKey = saved.key;
            if (currentKey.trim().toUpperCase() === generateExpectedKey(deviceId)) {
              const onlineStatus = await checkOnlineStatus();
              if (onlineStatus === "suspended") {
                state = "suspended";
                errorReason = "Account Suspended. To re-activate your account, please contact the admin: +923454582176";
              } else if (onlineStatus === "expired") {
                state = "expired";
                errorReason = "License Expired. To renew or extend your license, please contact the admin: +923454582176";
              } else {
                state = "licensed";
                accessGranted = true;
                errorReason = null;
              }
            } else {
              errorReason = "Invalid License Key on this device.";
            }
          }
        } catch (e) {}
      }

      return {
        activated: accessGranted,
        accessGranted,
        deviceId,
        state,
        errorReason,
        customer: '',
        plan: 'lifetime',
        trialActive: false,
        trialExpired: false,
        trialRemainingMs: 0,
        trialStartedAt: '',
        trialEndsAt: '',
        clockTampered: false
      };
    },
    async activate(key) {
      await ready;
      const expectedKey = generateExpectedKey(deviceId);
      if ((key || '').trim().toUpperCase() !== expectedKey) {
        return { ok: false, message: 'This license key is invalid or belongs to a different device.' };
      }
      const onlineStatus = await checkOnlineStatus();
      if (onlineStatus === "suspended") {
        return { ok: false, message: 'Account Suspended. Contact admin: +923454582176' };
      } else if (onlineStatus === "expired") {
        return { ok: false, message: 'License Expired. Contact admin: +923454582176' };
      }

      fs.mkdirSync(DATA_ROOT, { recursive: true });
      fs.writeFileSync(LICENSE_FILE, JSON.stringify({ key: String(key).trim().toUpperCase(), activatedAt: new Date().toISOString() }, null, 2), { encoding: 'utf8', mode: 0o600 });
      return { ok: true, message: 'License activated successfully!' };
    },
    async isAccessGranted() {
      await ready;
      const st = await this.status();
      return st.accessGranted;
    }
  };
}


const licenses = createLicenseManager();

function assColor(hex, alpha = '00') {
  const value = String(hex || '#FFFFFF').replace('#', '').trim();
  const rgb = /^[0-9a-fA-F]{6}$/.test(value) ? value : 'FFFFFF';
  return `&H${alpha}${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`;
}

// Caption presets may provide their plate colour as either #RRGGBB or the
// browser-friendly rgba(r,g,b,a) form.  libass needs AABBGGRR, where AA is
// transparency (the inverse of CSS opacity).
function assCssColor(value, fallback = '#000000') {
  const raw = String(value || '').trim();
  const rgba = raw.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (!rgba) return assColor(raw || fallback);
  const red = Math.max(0, Math.min(255, Number(rgba[1]))).toString(16).padStart(2, '0');
  const green = Math.max(0, Math.min(255, Number(rgba[2]))).toString(16).padStart(2, '0');
  const blue = Math.max(0, Math.min(255, Number(rgba[3]))).toString(16).padStart(2, '0');
  const opacity = rgba[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgba[4])));
  const alpha = Math.round((1 - opacity) * 255).toString(16).padStart(2, '0');
  return `&H${alpha}${blue}${green}${red}`.toUpperCase();
}

function assTimestamp(seconds) {
  const n = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = (n % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
}

function escapeAss(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
}

function isRtlCaption(text) {
  return /[\u0590-\u08FF]/.test(String(text || ''));
}

function captionTokens(cue, perLine) {
  const words = Array.isArray(cue.words) && cue.words.length
    ? cue.words.map(word => ({ text: String(word.text || word.word || '').trim(), start: Number(word.start), end: Number(word.end) })).filter(word => word.text)
    : String(cue.text || '').trim().split(/\s+/).filter(Boolean).map(text => ({ text, start: Number(cue.start), end: Number(cue.end) }));
  return words.map((word, index) => ({ ...word, breakAfter: Boolean(perLine && index && index % perLine === 0) }));
}

function assTextFromTokens(tokens, isRtl, visibleIndex = -1, highlightColor = '') {
  const content = tokens.map((word, index) => {
    const lineBreak = word.breakAfter ? '\\N' : (index ? ' ' : '');
    if (visibleIndex < 0) return `${lineBreak}${escapeAss(word.text)}`;
    const style = index === visibleIndex
      ? `{\\1c${assColor(highlightColor).replace('&H00', '&H')}\\alpha&H00&}`
      : `{\\alpha&HFF&}`;
    return `${lineBreak}${style}${escapeAss(word.text)}`;
  }).join('');
  // Unicode embedding makes libass treat the complete cue as an RTL run even
  // when the cue also contains numbers, punctuation, or English names.
  return isRtl ? `\u202B${content}\u202C` : content;
}

function captionAssFilter(assPath) {
  const escapePath = value => String(value || '').replace(/\\/g, '/').replace(':', '\\:').replace(/'/g, "\\'");
  const filename = escapePath(assPath);
  const fontsDir = fs.existsSync(FONTS_DIR) ? `:fontsdir='${escapePath(FONTS_DIR)}'` : '';
  return `ass=filename='${filename}'${fontsDir}`;
}

function buildCaptionAss(cues, settings, width, height) {
  // `fontSize` is measured from the visible browser preview and normalized to
  // the target video width by the renderer.  Retain a video-relative fallback
  // for legacy callers that do not provide the resolved snapshot.
  const fallbackFontSize = width * 0.08 * Math.max(0.5, Number(settings.scale) || 1);
  const fontSize = Math.max(28, Math.round(Number(settings.fontSize) || fallbackFontSize));
  const position = Math.max(2, Math.min(98, Number(settings.position) || 83));
  const marginV = Math.round(height * (1 - position / 100));
  const alignment = settings.align === 'left' ? 1 : settings.align === 'right' ? 3 : 2;
  const outline = Math.max(0, Number(settings.strokeWidth) || 0);
  const activeShadow = Math.max(0, Math.round((Number(settings.glowBlur) || 0) / 3));
  const font = String(settings.font || 'Arial').replace(/[,\\]/g, '').trim() || 'Arial';
  // A tag/plate is a style property, not a hard-coded list of preset names.
  // This keeps every current and future tag preset (including Urdu presets)
  // identical in native preview and exported video.
  const boxedPreset = Boolean(String(settings.tagColor || '').trim());
  const baseBackColour = boxedPreset ? assCssColor(settings.tagColor, '#000000') : '&H80000000';
  // libass uses OutlineColour (rather than BackColour) for an opaque-box
  // plate. Keep its padding large enough to read as a deliberate tag.
  const baseOutlineColour = boxedPreset ? baseBackColour : assColor(settings.strokeColor);
  const baseOutline = boxedPreset ? Math.max(8, outline) : outline;
  const activeBackColour = '&HFF000000';
  // Base text and the active-word overlay are intentionally at the exact same
  // point. Explicit positioning prevents libass collision avoidance from
  // treating them as two subtitles and moving/hiding the full base caption.
  const positionX = alignment === 1 ? 80 : alignment === 3 ? width - 80 : Math.round(width / 2);
  const positionY = Math.round(height - marginV);
  const placement = `{\\an${alignment}\\pos(${positionX},${positionY})}`;
  // The preview only glows the current word. Keep base and active ASS styles
  // separate so an export never adds an unintended glow/shadow to every word.
  const commonStyle = `${font},${fontSize}`;
  const spacing = Math.max(0, Number(settings.wordSpacing) || 0);
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: CipherBase,${commonStyle},${assColor(settings.baseColor)},${assColor(settings.highlightColor)},${baseOutlineColour},${baseBackColour},-1,0,0,0,100,100,${spacing},0,${boxedPreset ? 3 : 1},${baseOutline},0,${alignment},80,80,${marginV},1\nStyle: CipherActive,${commonStyle},${assColor(settings.highlightColor)},${assColor(settings.highlightColor)},${assColor(settings.strokeColor)},${activeBackColour},-1,0,0,0,100,100,${spacing},0,1,${outline},${activeShadow},${alignment},80,80,${marginV},1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n`;
  const lines = [];
  (Array.isArray(cues) ? cues : []).forEach(cue => {
    let text = String(cue.text || '');
    const isRtl = isRtlCaption(text);
    // Case transforms are Latin-only presentation controls; applying them to
    // Urdu can disturb punctuation and mixed-script shaping.
    if (!isRtl && settings.textCase === 'uppercase') text = text.toUpperCase();
    if (!isRtl && settings.textCase === 'lowercase') text = text.toLowerCase();
    const perLine = Math.max(0, Number(settings.wordsPerLine) || 0);
    const tokens = captionTokens({ ...cue, text }, perLine);
    const baseText = tokens.length ? assTextFromTokens(tokens, isRtl) : (isRtl ? `\u202B${escapeAss(text)}\u202C` : escapeAss(text));
    const fade = settings.lineAnim === 'instant' ? '' : '{\\fad(100,100)}';
    lines.push(`Dialogue: 0,${assTimestamp(cue.start)},${assTimestamp(cue.end)},CipherBase,,0,0,0,,${placement}${fade}${baseText}`);
    // Render just the currently spoken word on a transparent overlay. This
    // keeps the export's colour tracking aligned with the preview rather than
    // ASS karaoke's permanent left-to-right colour sweep.
    const hasTimedWords = Array.isArray(cue.words) && cue.words.some(word => Number.isFinite(Number(word?.start)) && Number.isFinite(Number(word?.end)));
    if (!hasTimedWords || settings.isStatic) return;
    tokens.forEach((word, index) => {
      const wordStart = Math.max(Number(cue.start) || 0, Number(word.start) || Number(cue.start) || 0);
      const wordEnd = Math.min(Number(cue.end) || wordStart + 0.01, Math.max(wordStart + 0.01, Number(word.end) || wordStart + 0.01));
      if (wordEnd <= wordStart) return;
      lines.push(`Dialogue: 1,${assTimestamp(wordStart)},${assTimestamp(wordEnd)},CipherActive,,0,0,0,,${placement}${assTextFromTokens(tokens, isRtl, index, settings.highlightColor)}`);
    });
  });
  return header + lines.join('\n') + '\n';
}

function nativeTransitionName(value) {
  const key = String(value || 'crossfade').toLowerCase();
  if (/slide.*left|wipe.*left/.test(key)) return 'wipeleft';
  if (/slide.*right|wipe.*right/.test(key)) return 'wiperight';
  if (/slide.*up|wipe.*up/.test(key)) return 'wipeup';
  if (/slide.*down|wipe.*down/.test(key)) return 'wipedown';
  if (/circle|iris/.test(key)) return 'circleopen';
  if (/pixel/.test(key)) return 'pixelize';
  return 'fade';
}

function nativeTimelineFilter(job) {
  const { scenes, width, height, fps, transitionDuration, motionEnabled, fadeIn, fadeOut, captions, captionSettings } = job.config;
  const parts = []; const sceneDurations = scenes.map(scene => Math.max(0.2, Number(scene.duration) || 0.2));
  scenes.forEach((scene, index) => {
    const extra = index < scenes.length - 1 ? transitionDuration : 0;
    const frames = Math.max(1, Math.ceil((sceneDurations[index] + extra) * fps));
    const zoom = motionEnabled ? "min(zoom+0.00065,1.12)" : '1';
    parts.push(`[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},zoompan=z='${zoom}':d=${frames}:s=${width}x${height}:fps=${fps},setsar=1[v${index}]`);
  });
  let current = 'v0'; let offset = sceneDurations[0] || 0;
  for (let index = 1; index < scenes.length; index++) {
    const output = `xf${index}`;
    if (transitionDuration > 0) {
      parts.push(`[${current}][v${index}]xfade=transition=${nativeTransitionName(scenes[index - 1].transition)}:duration=${transitionDuration.toFixed(3)}:offset=${Math.max(0, offset).toFixed(3)}[${output}]`);
    } else {
      parts.push(`[${current}][v${index}]concat=n=2:v=1:a=0[${output}]`);
    }
    current = output;
    offset += sceneDurations[index];
  }
  const totalDuration = sceneDurations.reduce((sum, duration) => sum + duration, 0);
  const finalParts = [];
  if (fadeIn > 0) finalParts.push(`fade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  if (fadeOut > 0) finalParts.push(`fade=t=out:st=${Math.max(0, totalDuration - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`);
  if (captions?.length && job.assPath) {
    finalParts.push(captionAssFilter(job.assPath));
  }
  finalParts.push('format=yuv420p');
  parts.push(`[${current}]${finalParts.join(',')}[outv]`);
  return { graph: parts.join(';'), totalDuration };
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args); let stderr = '';
    proc.stderr.on('data', chunk => stderr += chunk.toString());
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`${command} failed: ${stderr.slice(-600)}`)));
  });
}

function getMediaDuration(filePath) {
  return new Promise((resolve, reject) => {
  const proc = spawn(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]); let output = '';
    proc.stdout.on('data', chunk => output += chunk.toString());
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? resolve(Number(output.trim()) || 0) : reject(new Error('Could not read media duration.')));
  });
}

function timestampToSeconds(value) {
  if (typeof value === 'number') return value > 10000 ? value / 1000 : value;
  const match = String(value || '').match(/(\d+):(\d+):(\d+(?:[.,]\d+)?)/);
  if (!match) return Number(value) || 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3].replace(',', '.'));
}

function parseWhisperJson(json) {
  const result = json?.result || json || {};
  const entries = result.transcription || result.segments || json?.transcription || [];
  // whisper.cpp emits non-speech/internal timing markers such as [_TT_636]
  // and [_BEG_]. They are never spoken words and must never reach a transcript
  // or caption cue, even when a model puts one inside a segment text field.
  const isWhisperControlToken = value => /^\s*\[_[^\]]+\]\s*$/i.test(String(value || ''));
  const cleanWhisperText = value => String(value || '').replace(/\[_[^\]]+\]/gi, ' ').replace(/\s+/g, ' ').trim();
  const parsedEntries = entries.map((item, index) => {
    const stamps = item.timestamps || item.offsets || {};
    const start = timestampToSeconds(stamps.from ?? stamps.start ?? item.start ?? item.from);
    const end = Math.max(start + 0.01, timestampToSeconds(stamps.to ?? stamps.end ?? item.end ?? item.to));
    const text = cleanWhisperText(item.text);
    return { item, sourceIndex: index, segment: text ? { id: index, start, end, text } : null };
  });
  const segments = parsedEntries.map(record => record.segment).filter(Boolean);
  const words = parsedEntries.flatMap(record => {
    const item = record.item; const segment = record.segment;
    const tokens = (item.tokens || []).map(token => {
      const word = cleanWhisperText(token.text);
      const stamp = token.timestamps || token.offsets || {};
      return { word, start: timestampToSeconds(stamp.from ?? stamp.start), end: timestampToSeconds(stamp.to ?? stamp.end), confidence: Number(token.p) };
    }).filter(word => word.word && !isWhisperControlToken(word.word) && word.end >= word.start && (Number.isNaN(word.confidence) || word.confidence >= 0.02));
    if (tokens.length) {
      // Whisper sometimes gives punctuation or a word a zero-duration token.
      // Give it the following spoken token boundary so caption karaoke never
      // jumps to a random time or creates invisible zero-length captions.
      return tokens.map((word, index) => ({
        word: word.word,
        start: word.start,
        end: word.end > word.start ? word.end : Math.max(word.start + 0.06, Math.min(segment?.end || word.start + 0.18, tokens[index + 1]?.start || word.start + 0.18))
      }));
    }
    if (!segment) return [];
    const fallback = segment.text.split(/\s+/).filter(Boolean); const span = Math.max(0.01, segment.end - segment.start);
    return fallback.map((word, index) => ({ word, start: segment.start + span * index / fallback.length, end: segment.start + span * (index + 1) / fallback.length }));
  });
  const orderedWords = words.filter(word => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start).sort((a, b) => a.start - b.start);
  return { text: segments.map(segment => segment.text).join(' ').trim(), segments, words: orderedWords, detectedLanguage: result.language || json?.result?.language || '' };
}

const CAPTION_LANGUAGE_CODES = new Set(['auto', 'en', 'ur', 'ur-latn', 'hi', 'es', 'fr', 'de', 'ar', 'bn', 'zh', 'id', 'it', 'ja', 'ko', 'pa', 'pt', 'ru', 'tr']);

function resolveCaptionLanguage(value) {
  const requested = String(value || 'auto').trim().toLowerCase() || 'auto';
  if (!CAPTION_LANGUAGE_CODES.has(requested)) throw new Error('The selected caption language is not supported.');
  const romanUrdu = requested === 'ur-latn';
  return {
    requested,
    providerLanguage: romanUrdu ? 'ur' : requested,
    romanUrdu,
    prompt: romanUrdu
      ? 'Transcribe the spoken Urdu exactly as Roman Urdu using only Latin letters. Do not translate, summarize, add, or omit words.'
      : ''
  };
}

const ROMAN_URDU_WORDS = new Map(Object.entries({
  'میں':'main', 'ہوں':'hoon', 'ہے':'hai', 'ہیں':'hain', 'تھا':'tha', 'تھی':'thi', 'تھے':'thay',
  'اور':'aur', 'یہ':'yeh', 'وہ':'woh', 'آپ':'aap', 'ہم':'hum', 'تم':'tum', 'نہیں':'nahi',
  'سے':'se', 'کے':'ke', 'کی':'ki', 'کا':'ka', 'کو':'ko', 'پر':'par', 'ایک':'aik', 'کیا':'kya',
  'کیوں':'kyun', 'کیسے':'kaise', 'کرنا':'karna', 'کر':'kar', 'رہا':'raha', 'رہی':'rahi',
  'رہے':'rahe', 'لیکن':'lekin', 'بھی':'bhi', 'تو':'to', 'جو':'jo', 'مجھے':'mujhe',
  'میرے':'mere', 'میری':'meri', 'ہمارا':'hamara', 'اپنی':'apni', 'اپنے':'apne', 'اگر':'agar'
}));

const ROMAN_URDU_CHARS = {
  'ا':'a', 'آ':'aa', 'أ':'a', 'إ':'i', 'ب':'b', 'پ':'p', 'ت':'t', 'ٹ':'t', 'ث':'s',
  'ج':'j', 'چ':'ch', 'ح':'h', 'خ':'kh', 'د':'d', 'ڈ':'d', 'ذ':'z', 'ر':'r', 'ڑ':'r',
  'ز':'z', 'ژ':'zh', 'س':'s', 'ش':'sh', 'ص':'s', 'ض':'z', 'ط':'t', 'ظ':'z', 'ع':'',
  'غ':'gh', 'ف':'f', 'ق':'q', 'ک':'k', 'ك':'k', 'گ':'g', 'ل':'l', 'م':'m', 'ن':'n',
  'ں':'n', 'و':'o', 'ؤ':'o', 'ہ':'h', 'ھ':'h', 'ة':'h', 'ء':'', 'ئ':'y', 'ی':'i',
  'ي':'i', 'ے':'e', 'ۂ':'h', 'َ':'a', 'ِ':'i', 'ُ':'u', 'ّ':'', 'ْ':'', 'ٰ':'a'
};

function romanizeUrduText(value) {
  return String(value || '').replace(/[،؛؟۔]/g, punctuation => ({ '،':',', '؛':';', '؟':'?', '۔':'.' })[punctuation]).replace(/[\u0600-\u06FF]+/g, token => {
    const direct = ROMAN_URDU_WORDS.get(token);
    if (direct) return direct;
    return [...token].map(character => ROMAN_URDU_CHARS[character] ?? character).join('')
      .replace(/([a-z])\1\1+/gi, '$1$1');
  }).replace(/\s+/g, ' ').trim();
}

function applyCaptionLanguageOutput(transcription, selection) {
  if (!selection.romanUrdu) return transcription;
  const transform = value => romanizeUrduText(value);
  return {
    ...transcription,
    text: transform(transcription.text),
    words: (transcription.words || []).map(word => ({
      ...word,
      word: transform(word.word ?? word.text),
      ...(Object.prototype.hasOwnProperty.call(word, 'text') ? { text: transform(word.text) } : {})
    })).filter(word => String(word.word || word.text || '').trim()),
    segments: (transcription.segments || []).map(segment => ({ ...segment, text: transform(segment.text) })).filter(segment => segment.text),
    detectedLanguage: 'ur-Latn',
    engine: `${transcription.engine || 'Whisper'} • Roman Urdu`
  };
}

function runLocalWhisper(audioPath, jobDir, language, prompt, durationSeconds = 0, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(WHISPER_BIN) || !fs.existsSync(WHISPER_MODEL)) {
      reject(new Error('The bundled Local Whisper model is unavailable. Please reinstall Cipher Studio.'));
      return;
    }
    const outputBase = path.join(jobDir, 'local_whisper');
    const cpuThreads = Math.max(2, Math.min(12, require('os').cpus().length || 4));
    const normalizedLanguage = language && language !== 'auto' ? language : 'auto';
    const languageInstructions = {
      ur: 'Write only what is spoken in Urdu script. Do not translate, summarize, or invent words.',
      hi: 'Write only what is spoken in Hindi Devanagari. Do not translate, summarize, or invent words.',
      ar: 'Write only what is spoken in Arabic script. Do not translate, summarize, or invent words.',
      en: 'Transcribe exactly what is spoken in English. Do not summarize or invent words.'
    };
    const effectivePrompt = String(prompt || languageInstructions[normalizedLanguage] || '').trim();
    const args = ['-m', WHISPER_MODEL, '-f', audioPath, '-oj', '-ojf', '-of', outputBase, '-t', String(cpuThreads), '-l', normalizedLanguage, '-pp', '-sns', '-wt', '0.05'];
    if (effectivePrompt) args.push('--prompt', effectivePrompt.slice(0, 900));
    const proc = spawn(WHISPER_BIN, args, { cwd: path.dirname(WHISPER_BIN) });
    let stderr = ''; const startedAt = Date.now(); let lastPercent = 10;
    const heartbeat = setInterval(() => {
      const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      // Whisper only reports at model-window boundaries. Keep the UI alive
      // between those genuine checkpoints, clearly marking this as an estimate.
      const expectedSeconds = Math.max(20, Number(durationSeconds) * 1.8);
      const estimate = Math.min(92, Math.max(lastPercent, 10 + Math.round((elapsed / expectedSeconds) * 82)));
      onProgress({ percent: estimate, message: `Local Whisper is processing locally — ${elapsed}s elapsed (${estimate}% estimated)…` });
    }, 1500);
    proc.stderr.on('data', chunk => {
      const message = chunk.toString(); stderr += message;
      const percent = message.match(/(\d{1,3})%/);
      if (percent) {
        lastPercent = Math.min(95, Math.max(lastPercent, 10 + Math.round(Number(percent[1]) * 0.84)));
        onProgress({ percent: lastPercent, message: `Local Whisper checkpoint: ${Number(percent[1])}% of the current audio pass complete…` });
      }
    });
    proc.on('error', error => { clearInterval(heartbeat); reject(error); });
    proc.on('close', code => {
      clearInterval(heartbeat);
      const jsonPath = `${outputBase}.json`;
      if (code !== 0 || !fs.existsSync(jsonPath)) {
        reject(new Error(`Local Whisper failed: ${stderr.slice(-700) || `exit code ${code}`}`));
        return;
      }
      try { resolve(parseWhisperJson(JSON.parse(fs.readFileSync(jsonPath, 'utf8')))); }
      catch (error) { reject(new Error(`Local Whisper returned an unreadable transcript: ${error.message}`)); }
    });
  });
}

function groqTranscribeChunk(filePath, apiKey, language, customPrompt = '') {
  return new Promise((resolve, reject) => {
    const audio = fs.readFileSync(filePath); const boundary = `----Cipher${Date.now()}`;
    const field = (name, value) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    const languagePrompts = { ur:'Transcribe only in correct Urdu script. Preserve every spoken word and timestamps.', hi:'Transcribe only in Hindi Devanagari script. Preserve every spoken word and timestamps.', ar:'Transcribe only in accurate Arabic script. Preserve every spoken word and timestamps.', en:'Transcribe clearly in English with exact spelling. Preserve every spoken word and timestamps.', es:'Transcribe accurately in Spanish. Preserve every spoken word and timestamps.', fr:'Transcribe accurately in French. Preserve every spoken word and timestamps.', de:'Transcribe accurately in German. Preserve every spoken word and timestamps.' };
    const prompt = String(customPrompt || '').trim() || languagePrompts[language] || '';
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`), audio, Buffer.from('\r\n'), field('model', 'whisper-large-v3-turbo'), field('response_format', 'verbose_json'), field('timestamp_granularities[]', 'word'), field('timestamp_granularities[]', 'segment'), ...(language && language !== 'auto' ? [field('language', language)] : []), ...(prompt ? [field('prompt', prompt.slice(0, 1000))] : []), Buffer.from(`--${boundary}--\r\n`)]);
    const request = https.request('https://api.groq.com/openai/v1/audio/transcriptions', { method:'POST', headers:{ Authorization:`Bearer ${apiKey}`, 'Content-Type':`multipart/form-data; boundary=${boundary}`, 'Content-Length':body.length } }, response => {
      let text=''; response.on('data', c => text += c); response.on('end', () => response.statusCode === 200 ? resolve(JSON.parse(text)) : reject(new Error(`Groq ${response.statusCode}: ${text.slice(0,300)}`)));
    });
    request.setTimeout(120000, () => request.destroy(new Error('Groq transcription request timed out for this audio part.')));
    request.on('error', reject); request.end(body);
  });
}

// A 32 kbps mono stream keeps an hour of speech at roughly 14–15 MB.  Normal
// long recordings therefore fit in one Groq request (and retain untouched
// word timings); only genuinely oversized files take the chunking route.
const GROQ_SAFE_SINGLE_UPLOAD_BYTES = 23 * 1024 * 1024;

function transcriptCachePath(sourceHash, language, engine, prompt) {
  const identity = crypto.createHash('sha256')
    .update(`${sourceHash}|${String(language || 'auto').toLowerCase()}|${engine}|${String(prompt || '')}`)
    .digest('hex');
  return path.join(TRANSCRIPTS_DIR, `${identity}.json`);
}

function readTranscriptCache(cachePath) {
  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!cached || !Array.isArray(cached.words) || !cached.words.length || !String(cached.text || '').trim()) return null;
    return cached;
  } catch { return null; }
}

function writeTranscriptCache(cachePath, transcription) {
  try {
    fs.writeFileSync(cachePath, JSON.stringify({ ...transcription, cachedAt: new Date().toISOString() }), 'utf8');
  } catch (error) { console.warn('[Transcription] Could not persist transcript cache:', error.message); }
}

// Deepgram accepts the compact MP3 generated locally.  We always request word
// timings, because both the editor and the caption renderer depend on them.
// A manually selected language is sent to Nova-3 when it supports that code.
// Punjabi uses Deepgram Whisper Cloud. Auto Detect also uses Whisper Large so
// every language offered by this caption UI remains detectable.
function deepgramTranscribeChunk(filePath, apiKey, language) {
  return new Promise((resolve, reject) => {
    const selectedLanguage = String(language || '').toLowerCase();
    const isAuto = !selectedLanguage || selectedLanguage === 'auto';
    const useWhisper = isAuto || selectedLanguage === 'pa';
    const params = new URLSearchParams({
      model: useWhisper ? 'whisper-large' : 'nova-3',
      punctuate: 'true',
      smart_format: 'true',
      utterances: 'true'
    });
    if (!isAuto) params.set('language', selectedLanguage);
    else params.set('detect_language', 'true');
    const audio = fs.readFileSync(filePath);
    const request = https.request(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'audio/mpeg',
        'Content-Length': audio.length
      }
    }, response => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`Deepgram ${response.statusCode}: ${body.slice(0, 300)}`));
          return;
        }
        try {
          const payload = JSON.parse(body);
          const channel = payload?.results?.channels?.[0] || {};
          const alternative = channel.alternatives?.[0] || {};
          const words = (alternative.words || []).map(word => ({
            word: String(word.punctuated_word || word.word || '').trim(),
            start: Number(word.start || 0), end: Number(word.end || 0),
            confidence: Number(word.confidence || 0)
          })).filter(word => word.word && word.end >= word.start);
          const segments = (payload?.results?.utterances || []).map(utterance => ({
            text: String(utterance.transcript || '').trim(), start: Number(utterance.start || 0), end: Number(utterance.end || 0)
          })).filter(segment => segment.text);
          resolve({
            text: String(alternative.transcript || '').trim(), words, segments,
            engine: `Deepgram ${useWhisper ? `Whisper Large${isAuto ? ' (Auto Detect)' : ''}` : 'Nova-3'}`,
            detectedLanguage: String(channel.detected_language || payload?.results?.channels?.[0]?.detected_language || '')
          });
        } catch (error) { reject(new Error(`Deepgram returned unreadable transcription data: ${error.message}`)); }
      });
    });
    request.setTimeout(180000, () => request.destroy(new Error('Deepgram transcription request timed out for this audio part.')));
    request.on('error', reject); request.end(audio);
  });
}

function testDeepgramKey(apiKey) {
  return new Promise((resolve, reject) => {
    const request = https.request('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${apiKey}` } }, response => {
      let body = ''; response.on('data', chunk => { body += chunk; });
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 300
        ? resolve()
        : reject(new Error(`Deepgram ${response.statusCode}: ${body.slice(0, 200)}`)));
    });
    request.setTimeout(20000, () => request.destroy(new Error('Deepgram key test timed out.')));
    request.on('error', reject); request.end();
  });
}

function stockTargetDimensions(resolution='hd',orientation='landscape'){
  const long={hd:1280,fullhd:1920,'4k':3840}[resolution]||1280,short=Math.round(long*9/16);
  if(orientation==='portrait')return {width:short,height:long};
  if(orientation==='square')return {width:short,height:short};
  return {width:long,height:short};
}

function chooseStockVideoFile(files=[],target={width:1280,height:720}){
  const usable=files.filter(file=>file?.link&&Number(file.width)>0&&Number(file.height)>0).sort((a,b)=>(Number(a.width)*Number(a.height))-(Number(b.width)*Number(b.height)));
  return usable.find(file=>Number(file.width)>=target.width&&Number(file.height)>=target.height)||usable.at(-1)||null;
}

function isAllowedStockMediaUrl(raw){
  try{const host=new URL(raw).hostname.toLowerCase();return host==='pexels.com'||host.endsWith('.pexels.com')||host==='pixabay.com'||host.endsWith('.pixabay.com');}catch{return false;}
}

function localStockPreviewUrl(raw){return `/api/stock-media/preview?url=${encodeURIComponent(raw)}`;}

async function fetchStockProvider(provider,{type,query,orientation,resolution,page,perPage,pexelsKey,pixabayKey}){
  const target=stockTargetDimensions(resolution,orientation),results=[];
  if(provider==='pexels'){
    if(!pexelsKey)throw new Error('Pexels API key is not configured.');
    const endpoint=type==='videos'?'https://api.pexels.com/v1/videos/search':'https://api.pexels.com/v1/search',url=new URL(endpoint);
    url.searchParams.set('query',query);url.searchParams.set('page',String(page));url.searchParams.set('per_page',String(perPage));if(['landscape','portrait','square'].includes(orientation))url.searchParams.set('orientation',orientation);url.searchParams.set('size','large');
    const response=await fetch(url,{headers:{Authorization:pexelsKey}});if(!response.ok)throw new Error(`Pexels search failed (${response.status}). Check the API key or limit.`);const data=await response.json();
    for(const item of (type==='videos'?data.videos:data.photos)||[]){
      if(type==='videos'){
        const file=chooseStockVideoFile(item.video_files,target);if(!file)continue;results.push({id:`pexels-video-${item.id}`,provider:'pexels',type:'video',title:`Pexels Video ${item.id}`,creator:item.user?.name||'Pexels creator',creatorUrl:item.user?.url||'',pageUrl:item.url||'',thumbnailUrl:item.image||'',previewUrl:file.link,downloadUrl:file.link,width:Number(file.width)||Number(item.width)||0,height:Number(file.height)||Number(item.height)||0,duration:Number(item.duration)||0,fps:Number(file.fps)||0,attribution:`Video by ${item.user?.name||'creator'} on Pexels`});
      }else{
        if(Number(item.width)<target.width||Number(item.height)<target.height)continue;const url=item.src?.original||item.src?.large2x||item.src?.large;if(!url)continue;results.push({id:`pexels-photo-${item.id}`,provider:'pexels',type:'image',title:item.alt||`Pexels Photo ${item.id}`,creator:item.photographer||'Pexels photographer',creatorUrl:item.photographer_url||'',pageUrl:item.url||'',thumbnailUrl:item.src?.medium||item.src?.small||url,previewUrl:item.src?.large||url,downloadUrl:url,width:Number(item.width)||0,height:Number(item.height)||0,duration:0,fps:0,attribution:`Photo by ${item.photographer||'photographer'} on Pexels`});
      }
    }
    return {results,total:Number(data.total_results)||results.length};
  }
  if(!pixabayKey)throw new Error('Pixabay API key is not configured.');
  const endpoint=type==='videos'?'https://pixabay.com/api/videos/':'https://pixabay.com/api/',url=new URL(endpoint);url.searchParams.set('key',pixabayKey);url.searchParams.set('q',query);url.searchParams.set('page',String(page));url.searchParams.set('per_page',String(Math.max(3,perPage)));url.searchParams.set('safesearch','true');url.searchParams.set('orientation',orientation==='square'?'all':orientation==='landscape'?'horizontal':orientation==='portrait'?'vertical':'all');url.searchParams.set('min_width',String(target.width));url.searchParams.set('min_height',String(target.height));if(type==='videos')url.searchParams.set('video_type','film');else url.searchParams.set('image_type','photo');
  const response=await fetch(url);if(!response.ok)throw new Error(`Pixabay search failed (${response.status}). Check the API key or limit.`);const data=await response.json();
  for(const item of data.hits||[]){
    const iw=Number(item.imageWidth||item.videos?.large?.width||item.videos?.medium?.width)||0,ih=Number(item.imageHeight||item.videos?.large?.height||item.videos?.medium?.height)||0,ratio=iw/Math.max(1,ih);if(orientation==='square'&&(ratio<.8||ratio>1.25))continue;
    if(type==='videos'){const variants=Object.values(item.videos||{}).filter(Boolean).map(file=>({link:file.url,width:file.width,height:file.height,size:file.size,thumbnail:file.thumbnail})),file=chooseStockVideoFile(variants,target);if(!file)continue;results.push({id:`pixabay-video-${item.id}`,provider:'pixabay',type:'video',title:`Pixabay Video ${item.id}`,creator:item.user||'Pixabay creator',creatorUrl:item.user_id?`https://pixabay.com/users/${encodeURIComponent(item.user||'user')}-${item.user_id}/`:'',pageUrl:item.pageURL||'',thumbnailUrl:file.thumbnail||'',previewUrl:file.link,downloadUrl:file.link,width:Number(file.width)||0,height:Number(file.height)||0,duration:Number(item.duration)||0,fps:0,attribution:`Video by ${item.user||'creator'} on Pixabay`});}
    else{const mediaUrl=item.imageURL||item.fullHDURL||item.largeImageURL||item.webformatURL;if(!mediaUrl)continue;results.push({id:`pixabay-photo-${item.id}`,provider:'pixabay',type:'image',title:item.tags||`Pixabay Photo ${item.id}`,creator:item.user||'Pixabay contributor',creatorUrl:item.user_id?`https://pixabay.com/users/${encodeURIComponent(item.user||'user')}-${item.user_id}/`:'',pageUrl:item.pageURL||'',thumbnailUrl:item.webformatURL||item.previewURL||mediaUrl,previewUrl:item.largeImageURL||mediaUrl,downloadUrl:mediaUrl,width:iw,height:ih,duration:0,fps:0,attribution:`Photo by ${item.user||'contributor'} on Pixabay`});}
  }
  return {results,total:Number(data.totalHits)||results.length};
}

function createServer(port, { launchBrowser = true, captionRenderer = null } = {}) {
  const server = http.createServer(async (req, res) => {
    let reqPath = decodeURI(req.url.split('?')[0]);

    // Enable CORS and Cross-Origin Isolation headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Job-Id, X-Ext, X-Groq-Key, X-Deepgram-Key, X-Pexels-Key, X-Pixabay-Key, X-Caption-Language, X-Transcription-Prompt');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Offline, signed, one-device lifetime licensing. The public key is
    // bundled with the app; the signing key never ships in the installer.
    
    // Settings API
    const settingsPath = path.join(ROOT, 'user_settings.json');
    if (req.method === 'GET' && reqPath === '/api/settings') {
      try {
        if (fs.existsSync(settingsPath)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(fs.readFileSync(settingsPath, 'utf8'));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
        }
      } catch (e) {
        res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }
    
    if (req.method === 'POST' && reqPath === '/api/settings') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 50000) req.destroy(); });
      req.on('end', () => {
        try {
          const newSettings = JSON.parse(body);
          let current = {};
          if (fs.existsSync(settingsPath)) {
            current = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
          }
          const merged = { ...current, ...newSettings };
          fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (e) {
          res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'GET' && reqPath === '/api/license/status') {
      const status = await licenses.status();
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(status));
      return;
    }
    if (req.method === 'POST' && reqPath === '/api/license/activate') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 30000) req.destroy(); });
      req.on('end', async () => {
        try {
          const result = await licenses.activate(JSON.parse(body || '{}').key);
          res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(result));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, message: 'Enter a valid license key.' }));
        }
      });
      return;
    }

    // The UI lock is for clarity; this server-side check is the enforcement
    // layer. APIs work during the genuine 24-hour trial or with a valid signed
    // lifetime key, and lock even if somebody manipulates the browser UI.


    if (req.method === 'GET' && reqPath === '/api/deepgram-test') {
      try {
        const apiKey = String(req.headers['x-deepgram-key'] || '').trim();
        if (!apiKey) throw new Error('Please enter a Deepgram API key.');
        await testDeepgramKey(apiKey);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        res.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ message: error.message || 'Deepgram key test failed.' }));
      }
      return;
    }

    if(req.method==='GET'&&reqPath==='/api/stock-media/search'){
      try{
        const params=new URL(req.url,`http://localhost:${port}`).searchParams,source=['pexels','pixabay','both'].includes(params.get('source'))?params.get('source'):'both',type=params.get('type')==='videos'?'videos':'photos',query=String(params.get('query')||'').trim().slice(0,100),orientation=['landscape','portrait','square'].includes(params.get('orientation'))?params.get('orientation'):'landscape',resolution=['hd','fullhd','4k'].includes(params.get('resolution'))?params.get('resolution'):'hd',page=Math.max(1,Math.min(100,Number(params.get('page'))||1)),perPage=Math.max(3,Math.min(40,Number(params.get('per_page'))||24));
        if(!query)throw new Error('Enter a stock media search term.');
        const providers=source==='both'?['pexels','pixabay']:[source],settled=await Promise.allSettled(providers.map(provider=>fetchStockProvider(provider,{type,query,orientation,resolution,page,perPage:source==='both'?Math.max(3,Math.ceil(perPage/2)):perPage,pexelsKey:String(req.headers['x-pexels-key']||'').trim(),pixabayKey:String(req.headers['x-pixabay-key']||'').trim()}))),results=[],errors=[];let total=0;
        settled.forEach((item,index)=>{if(item.status==='fulfilled'){results.push(...item.value.results);total+=item.value.total;}else errors.push(`${providers[index]}: ${item.reason?.message||item.reason}`);});
        if(!results.length&&errors.length&&settled.every(item=>item.status==='rejected'))throw new Error(errors.join(' '));
        const clientResults=results.slice(0,perPage).map(item=>({...item,thumbnailUrl:localStockPreviewUrl(item.thumbnailUrl),previewUrl:localStockPreviewUrl(item.previewUrl)}));res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'private, max-age=86400','Vary':'X-Pexels-Key, X-Pixabay-Key'});res.end(JSON.stringify({success:true,results:clientResults,page,total,warnings:errors}));
      }catch(error){res.writeHead(400,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({success:false,error:error.message||'Stock media search failed.'}));}
      return;
    }

    if(req.method==='GET'&&reqPath==='/api/stock-media/preview'){
      try{const mediaUrl=new URL(req.url,`http://localhost:${port}`).searchParams.get('url')||'';if(!isAllowedStockMediaUrl(mediaUrl))throw new Error('Unsupported stock preview host.');const headers={};if(req.headers.range)headers.Range=req.headers.range;const upstream=await fetch(mediaUrl,{headers,redirect:'follow'});if(!upstream.ok||!upstream.body)throw new Error(`Stock preview failed (${upstream.status}).`);if(upstream.url&&!isAllowedStockMediaUrl(upstream.url))throw new Error('Stock preview redirected to an unsupported host.');const responseHeaders={'Content-Type':upstream.headers.get('content-type')||'application/octet-stream','Cache-Control':'private, max-age=86400','Accept-Ranges':upstream.headers.get('accept-ranges')||'bytes'};for(const name of ['content-length','content-range']){const value=upstream.headers.get(name);if(value)responseHeaders[name.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join('-')]=value;}res.writeHead(upstream.status===206?206:200,responseHeaders);Readable.fromWeb(upstream.body).on('error',()=>res.destroy()).pipe(res);}catch(error){if(!res.headersSent){res.writeHead(400,{'Content-Type':'text/plain'});res.end(error.message||'Could not load stock preview.');}else res.destroy();}return;
    }

    if(req.method==='POST'&&reqPath==='/api/stock-media/download'){
      let body='';req.on('data',chunk=>{body+=chunk;if(body.length>32768)req.destroy();});req.on('end',async()=>{try{const input=JSON.parse(body||'{}'),mediaUrl=String(input.url||'');if(!isAllowedStockMediaUrl(mediaUrl))throw new Error('Unsupported stock media download host.');const upstream=await fetch(mediaUrl,{redirect:'follow'});if(!upstream.ok||!upstream.body)throw new Error(`Stock media download failed (${upstream.status}).`);if(upstream.url&&!isAllowedStockMediaUrl(upstream.url))throw new Error('Stock media redirected to an unsupported host.');const size=Number(upstream.headers.get('content-length'))||0;if(size>500*1024*1024)throw new Error('Selected stock video is larger than 500 MB.');res.writeHead(200,{'Content-Type':upstream.headers.get('content-type')||'application/octet-stream',...(size?{'Content-Length':size}:{}),'Cache-Control':'private, max-age=86400'});Readable.fromWeb(upstream.body).on('error',()=>res.destroy()).pipe(res);}catch(error){if(!res.headersSent){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,error:error.message||'Could not download stock media.'}));}else res.destroy();}});return;
    }

    // Viral Script Writer API. It shares this licensed local server and its
    // data lives in Electron's per-user application-data directory.
    if (reqPath.startsWith('/api/script-writer/')) {
      scriptWriter.setPort(server.address()?.port || port);
      const suffix = req.url.slice('/api/script-writer'.length);
      req.url = suffix.startsWith('/oauth/') ? suffix : '/api' + suffix;
      scriptWriter.app(req, res);
      return;
    }

    // Native timeline export: browser canvas is preview-only. Images are
    // rendered once by FFmpeg filters and encoded by the detected GPU engine.
    
    
function probeMediaInfo(filePath) {
  return new Promise((resolve) => {
    const proc = spawn(FFPROBE_BIN, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', filePath]); let output = '';
    proc.stdout.on('data', chunk => output += chunk.toString());
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      try {
        const info = JSON.parse(output);
        const video = (info.streams || []).find(s => s.codec_type === 'video');
        resolve({
          width: Number(video?.width) || 0, height: Number(video?.height) || 0,
          duration: Number(info.format?.duration) || 0,
          hasAudio: (info.streams || []).some(s => s.codec_type === 'audio')
        });
      } catch { resolve(null); }
    });
  });
}

    if (req.method === 'GET' && reqPath === '/api/capcut-status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(capcutDraft.capcutStatus()));
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/capcut-project') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 20 * 1024 * 1024) req.destroy(); });
      req.on('end', async () => {
        const moved = [];
        let folder = '';
        try {
          const input = JSON.parse(body || '{}');
          const status = capcutDraft.capcutStatus();
          if (!status.installed) throw new Error('CapCut is not installed on this computer.');
          const root = status.draftsRoot;
          fs.mkdirSync(root, { recursive: true });
          const draftName = capcutDraft.uniqueFolder(root, input.name || 'AutoCut Project');
          folder = path.join(root, draftName);
          const mediaDir = path.join(folder, 'AutoCut Media');
          fs.mkdirSync(mediaDir, { recursive: true });

          const mediaById = new Map();
          const sources = Array.isArray(input.media) ? input.media : [];
          if (sources.length > 5000) throw new Error('Too many media files.');
          for (const [index, item] of sources.entries()) {
            const source = renderSources[item.sourceId];
            if (!source || !fs.existsSync(source.sourcePath)) throw new Error('A media file was not uploaded. Please try again.');
            const ext = path.extname(source.sourcePath);
            const base = String(item.name || `media_${index + 1}`).replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[<>:"/\|?* -]+/g, ' ').trim().slice(0, 60) || `media_${index + 1}`;
            const target = path.join(mediaDir, `${String(index + 1).padStart(4, '0')} ${base}${ext}`);
            await fs.promises.rename(source.sourcePath, target).catch(async () => {
              await fs.promises.copyFile(source.sourcePath, target);
              await fs.promises.rm(source.sourcePath, { force: true });
            });
            delete renderSources[item.sourceId];
            moved.push(target);
            const kind = item.kind === 'audio' ? 'audio' : item.kind === 'video' ? 'video' : 'photo';
            let width = Number(item.width) || 0, height = Number(item.height) || 0, duration = Number(item.duration) || 0, hasAudio = kind === 'video';
            if (kind !== 'photo' || !width || !height) {
              const info = await probeMediaInfo(target);
              if (info) { width = info.width || width; height = info.height || height; duration = info.duration || duration; hasAudio = info.hasAudio; }
            }
            mediaById.set(item.sourceId, { path: target, kind, width, height, duration, hasAudio });
          }

          const resolveItems = (items) => (Array.isArray(items) ? items : []).map(item => {
            const media = mediaById.get(item.sourceId);
            if (!media) throw new Error('Timeline item refers to missing media.');
            const duration = Math.max(0.04, Number(item.duration) || 0);
            return { ...item, media, duration, start: Math.max(0, Number(item.start) || 0), sourceOffset: Math.max(0, Number(item.sourceOffset) || 0) };
          });
          const plan = {
            width: Math.max(16, Math.round(Number(input.width) || 1920)),
            height: Math.max(16, Math.round(Number(input.height) || 1080)),
            fps: Number(input.fps) || 30,
            visualTracks: (input.visualTracks || []).map(t => ({ name: String(t.name || ''), main: !!t.main, items: resolveItems(t.items) })),
            audioTracks: (input.audioTracks || []).map(t => ({ name: String(t.name || ''), items: resolveItems(t.items) })),
            captions: input.captions?.items?.length ? {
              items: input.captions.items.map(c => ({ start: Number(c.start) || 0, end: Number(c.end) || 0, text: String(c.text || '').slice(0, 2000) })),
              style: input.captions.style || {}
            } : null
          };
          for (const t of plan.audioTracks) for (const item of t.items) {
            if (item.media.duration > 0) item.duration = Math.max(0.04, Math.min(item.duration, item.media.duration - item.sourceOffset));
          }
          const summary = capcutDraft.writeDraft(folder, draftName, plan, root);
          const firstVisual = plan.visualTracks[0]?.items[0]?.media;
          if (firstVisual) await new Promise(resolve => {
            const proc = spawn(FFMPEG_BIN, ['-y', '-v', 'error', '-i', firstVisual.path, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', path.join(folder, 'draft_cover.jpg')], { windowsHide: true });
            proc.on('error', resolve); proc.on('close', resolve);
          });
          const running = await capcutDraft.isCapcutRunning();
          const launched = !running && input.launch !== false ? capcutDraft.launchCapcut() : false;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, name: draftName, folder, launched }));
        } catch (error) {
          console.error('[CapCut Export]', error);
          if (folder) fs.rm(folder, { recursive: true, force: true }, () => {});
          else for (const p of moved) fs.rm(p, { force: true }, () => {});
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message || 'Could not create the CapCut project.' }));
        }
      });
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/native-timeline-init') {
      let body = '';
      req.on('data', chunk => { body += chunk; if (body.length > 2 * 1024 * 1024) req.destroy(); });
      req.on('end', () => {
        try {
          const config = JSON.parse(body || '{}');
          if (!Array.isArray(config.scenes) || !config.scenes.length) throw new Error('Add at least one image scene before exporting.');
          const unsupported = studioNative.reason({...config, hasCaptions: config.captions?.length > 0});
          if (unsupported) throw new Error(`Use the exact renderer for: ${unsupported}`);
          const width = Math.max(240, Math.min(3840, Number(config.width) || 1920));
          const height = Math.max(240, Math.min(3840, Number(config.height) || 1080));
          const fps = Math.max(12, Math.min(60, Number(config.fps) || 30));
          const jobId = `native_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const jobDir = path.join(TEMP_DIR, jobId); fs.mkdirSync(jobDir, { recursive: true });
          nativeTimelineJobs[jobId] = { jobDir, assets: {}, createdAt: Date.now(), config: {
            scenes: config.scenes.map(scene => ({ duration: Math.max(0.2, Number(scene.duration) || 0.2), transition: scene.transition || 'crossfade', scale: Math.max(1, Math.min(10, Number(scene.scale) || 1)) })),
            width, height, fps, quality: config.quality || 'balanced', motionEnabled: config.motionEnabled !== false,
            motionPreset: config.motionPreset || 'static', motionIntensity: Math.max(0,Math.min(2,Number(config.motionIntensity ?? .35))), letterbox: !!config.letterbox,
            transitionDuration: Math.max(0, Math.min(2, Number(config.transitionDuration) || 0)),
            fadeIn: Math.max(0, Math.min(5, Number(config.fadeIn) || 0)), fadeOut: Math.max(0, Math.min(5, Number(config.fadeOut) || 0)),
            captions: Array.isArray(config.captions) ? config.captions : [], captionSettings: config.captionSettings || {}, audioSourceId: config.audioSourceId || '', volume: Number(config.volume ?? 100),
            mainAudioKeyframes:Array.isArray(config.mainAudioKeyframes)?config.mainAudioKeyframes.slice(0,100):[],
            audioTracks:Array.isArray(config.audioTracks)?config.audioTracks.slice(0,24).map(track=>({sourceId:String(track.sourceId||''),start:Math.max(0,Number(track.start)||0),duration:Math.max(.1,Number(track.duration)||.1),sourceOffset:Math.max(0,Number(track.sourceOffset)||0),volume:Math.max(0,Math.min(300,Number(track.volume??100))),keyframes:Array.isArray(track.keyframes)?track.keyframes.slice(0,100):[]})):[]
          }};
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, jobId }));
        } catch (error) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: error.message })); }
      });
      return;
    }
    if (req.method === 'POST' && reqPath === '/api/native-timeline-asset') {
      const query = new URL(req.url, `http://localhost:${port}`).searchParams;
      const job = nativeTimelineJobs[query.get('jobId')]; const index = Number(query.get('index'));
      if (!job || !Number.isInteger(index) || index < 0 || index >= job.config.scenes.length) { res.writeHead(400); res.end('Invalid native timeline asset.'); return; }
      const ext = String(req.headers['x-file-ext'] || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
      const target = path.join(job.jobDir, `scene_${index}.${ext}`); const output = fs.createWriteStream(target);
      const fail = error => { fs.rm(target, { force:true }, () => {}); if (!res.writableEnded) { res.writeHead(500); res.end(error.message); } };
      req.on('error', fail); output.on('error', fail); output.on('finish', () => { job.assets[index] = target; res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ success:true })); }); req.pipe(output);
      return;
    }
    if (req.method === 'GET' && reqPath === '/api/native-timeline-progress') {
      const id=new URL(req.url,`http://localhost:${port}`).searchParams.get('jobId');
      const job=nativeTimelineJobs[id];res.writeHead(job?200:404,{'Content-Type':'application/json'});
      res.end(JSON.stringify(job?{seconds:job.encodedSeconds||0,speed:job.speed||'',encoder:job.encoder||''}:{error:'Export finished'}));return;
    }
    if (req.method === 'POST' && reqPath === '/api/native-timeline-finish') {
      let body = ''; req.on('data', chunk => body += chunk); req.on('end', async () => {
        let job;
        try {
          job = nativeTimelineJobs[JSON.parse(body || '{}').jobId];
          if (!job || Object.keys(job.assets).length !== job.config.scenes.length) throw new Error('One or more timeline images were not received.');
          const source = renderSources[job.config.audioSourceId];
          if (!source || !fs.existsSync(source.sourcePath)) throw new Error('The timeline audio is unavailable. Please export again.');
          const extraSources=job.config.audioTracks.map((track,index)=>{const item=renderSources[track.sourceId];if(!item||!fs.existsSync(item.sourcePath))throw new Error(`Audio track ${index+2} is unavailable.`);return item;});
          const outputFileName = `Cipher_native_${Date.now()}.mp4`; const outputPath = path.join(EXPORTS_DIR, outputFileName);
          if (job.config.captions.length) {
            job.assPath = path.join(job.jobDir, 'captions.ass');
            const settings = { ...job.config.captionSettings, position: Number(job.config.captionSettings.position) || 83 };
            fs.writeFileSync(job.assPath, buildCaptionAss(job.config.captions, settings, job.config.width, job.config.height), 'utf8');
          }
          const nativePlan=studioNative.filter(job.config);let graph=nativePlan.graph;const totalDuration=nativePlan.totalDuration;
          // The shared graph deliberately knows nothing about server paths.
          // Attach libass here so enabling the native path can never omit the
          // caption layer (the old unused helper did exactly that).
          if(job.assPath)graph=graph.replace(/\[outv\]\s*$/,`[nativebase];[nativebase]${captionAssFilter(job.assPath)}[outv]`);
          const encoder = await detectVideoEncoder();
          if (job.cancelled) throw new Error('Export cancelled.');
          job.encoder=encoder.name;
          const args = ['-y', '-hide_banner', '-loglevel', 'error', '-progress','pipe:1','-filter_complex_threads', String(FILTER_THREADS)];
          for (let i = 0; i < job.config.scenes.length; i++) args.push('-loop','1','-framerate','1','-t','1','-i',job.assets[i]);
          args.push('-i', source.sourcePath);for(const item of extraSources)args.push('-i',item.sourcePath);
          const audioFilters=[],audioLabels=[];let inputIndex=job.config.scenes.length;
          audioFilters.push(`[${inputIndex}:a]apad,volume='${nativeVolumeExpression({volume:job.config.volume,keyframes:job.config.mainAudioKeyframes})}':eval=frame[nmix0]`);audioLabels.push('[nmix0]');inputIndex++;
          job.config.audioTracks.forEach((track,index)=>{const label=`nmix${index+1}`,delay=Math.round(track.start*1000);audioFilters.push(`[${inputIndex}:a]atrim=start=${track.sourceOffset.toFixed(4)}:duration=${track.duration.toFixed(4)},asetpts=PTS-STARTPTS,volume='${nativeVolumeExpression(track)}':eval=frame,adelay=${delay}:all=1[${label}]`);audioLabels.push(`[${label}]`);inputIndex++;});
          if(audioLabels.length===1)audioFilters.push(`${audioLabels[0]}anull[aout]`);else audioFilters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0:dropout_transition=0[aout]`);
          args.push('-filter_complex', `${graph};${audioFilters.join(';')}`, '-map','[outv]','-map','[aout]', ...videoEncodingArgs(encoder, job.config.quality));
          args.push('-c:a','aac','-b:a','192k','-t',String(totalDuration),'-shortest','-movflags','+faststart',outputPath);
          await new Promise((resolve,reject)=>{
            const proc=job.proc=spawn(FFMPEG_BIN,args,{windowsHide:true}); let errors='';
            let progress='';
            proc.stdout.on('data',b=>{
              progress+=b.toString();const lines=progress.split('\n');progress=lines.pop();
              for(const line of lines){const [key,value]=line.trim().split('=');if(key==='out_time_us')job.encodedSeconds=Number(value)/1e6;if(key==='speed')job.speed=value;}
            });
            proc.stderr.on('data',b=>{errors=(errors+b).slice(-6000);});
            proc.once('error',reject);proc.once('close',code=>code===0&&!job.cancelled?resolve():reject(new Error(job.cancelled?'Export cancelled.':errors||`Encoder exited ${code}`)));
          }).catch(error=>{fs.rm(outputPath,{force:true},()=>{});throw error;});
          res.writeHead(200, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ success:true, encoder:encoder.name, downloadUrl:`/api/download?file=${encodeURIComponent(outputFileName)}`, fileName:outputFileName }));
        } catch (error) { console.error('[Native Timeline Export]', error); res.writeHead(500, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error:error.message || 'Native export failed.' })); }
        finally { if (job) { const sourceIds=[job.config.audioSourceId,...(job.config.audioTracks||[]).map(track=>track.sourceId)].filter(Boolean);for(const sourceId of sourceIds){const source=renderSources[sourceId];if(source){delete renderSources[sourceId];fs.rm(source.sourcePath,{force:true},()=>{});}} const id = Object.entries(nativeTimelineJobs).find(([, value]) => value === job)?.[0]; if (id) delete nativeTimelineJobs[id]; fs.rm(job.jobDir,{recursive:true,force:true},()=>{}); } }
      });
      return;
    }

    // Long-form transcription pipeline: Groq is primary when configured,
    // Deepgram is its cloud fallback, then bundled Local Whisper. The source
    // is streamed to disk, never held in the Node/Electron heap.
    if (req.method === 'POST' && reqPath === '/api/caption-transcribe') {
      const groqKey = String(req.headers['x-groq-key'] || '');
      const deepgramKey = String(req.headers['x-deepgram-key'] || '');
      const requiredProvider = String(req.headers['x-required-transcription-provider'] || '').trim().toLowerCase();
      const requestedLanguage = String(req.headers['x-caption-language'] || 'auto');
      const customPrompt = String(req.headers['x-transcription-prompt'] || '');
      const jobDir = path.join(TEMP_DIR, `caption_${Date.now()}`); fs.mkdirSync(jobDir, { recursive:true });
      const sourcePath = path.join(jobDir, 'source.media'); const output = fs.createWriteStream(sourcePath);
      const sourceHasher = crypto.createHash('sha256');
      req.on('data', chunk => sourceHasher.update(chunk));
      req.pipe(output);
      output.on('error', error => { res.writeHead(500); res.end(error.message); });
      output.on('finish', async () => {
        const send = payload => res.write(`${JSON.stringify(payload)}\n`);
        res.writeHead(200, { 'Content-Type':'application/x-ndjson; charset=utf-8', 'Cache-Control':'no-cache' });
        try {
          if (requiredProvider === 'groq' && !groqKey) throw new Error('A Groq API key is required for Studio caption generation.');
          const languageSelection = resolveCaptionLanguage(requestedLanguage);
          const language = languageSelection.providerLanguage;
          const effectivePrompt = String(customPrompt || languageSelection.prompt || '');
          const sourceHash = sourceHasher.digest('hex');
          const preferredEngine = requiredProvider === 'groq' ? 'groq-strict' : (groqKey ? 'groq-turbo' : (deepgramKey ? 'deepgram' : 'local-whisper'));
          const cachePath = transcriptCachePath(sourceHash, languageSelection.requested, preferredEngine, effectivePrompt);
          const cached = readTranscriptCache(cachePath);
          if (cached) {
            send({ type:'progress', stage:'cached', message:'Using saved transcript for this exact media and language…', percent:98 });
            send({ type:'complete', ...cached, cached:true }); res.end();
            return;
          }
          send({ type:'progress', stage:'extracting', message:'Extracting compact 32 kbps audio locally…', percent:5 });
          const audioPath = path.join(jobDir, 'audio.mp3');
          await runProcess(FFMPEG_BIN, ['-y','-i',sourcePath,'-vn','-ac','1','-ar','16000','-b:a','32k',audioPath]);
          const duration = await getMediaDuration(audioPath);
          const runGroq = async () => {
            const audioBytes = fs.statSync(audioPath).size;
            if (audioBytes <= GROQ_SAFE_SINGLE_UPLOAD_BYTES) {
              send({ type:'progress', stage:'transcribing', message:'Transcribing with Groq in one timed request…', percent:20 });
              let result;
              for (let attempt=0; attempt<3; attempt++) {
                try { result = await groqTranscribeChunk(audioPath, groqKey, language, effectivePrompt); break; }
                catch (error) {
                  if (attempt === 2) throw error;
                  send({ type:'progress', stage:'retrying', message:'Retrying Groq transcription…', percent:20 });
                  await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                }
              }
              return { text:String(result.text || '').trim(), words:result.words || [], segments:result.segments || [], engine:'Groq Whisper Large V3 Turbo', detectedLanguage:String(result.language || '') };
            }
            const chunks = Math.max(1, Math.ceil(duration / 600)); const words=[]; const segments=[]; let text=''; let detectedLanguage=''; let chunkLanguage=language;
            for (let index=0; index<chunks; index++) {
              const start=index*600; const chunkPath=path.join(jobDir,`chunk_${index}.mp3`);
              await runProcess(FFMPEG_BIN,['-y','-ss',String(start),'-t',String(Math.min(602, Math.max(1,duration-start))),' -i'.trim(),audioPath,'-c','copy',chunkPath]);
              send({ type:'progress', stage:'transcribing', message:`Transcribing with Groq — part ${index+1} of ${chunks}…`, percent:Math.round(12+(index/chunks)*82) });
              let result; for (let attempt=0; attempt<3; attempt++) { try { result=await groqTranscribeChunk(chunkPath,groqKey,chunkLanguage,effectivePrompt); break; } catch (error) { if (attempt===2) throw error; send({ type:'progress', stage:'retrying', message:`Retrying Groq part ${index+1}…`, percent:Math.round(12+(index/chunks)*82) }); await new Promise(r=>setTimeout(r,1000*(attempt+1))); } }
              detectedLanguage = String(result.language || detectedLanguage || '');
              if (language === 'auto' && detectedLanguage) chunkLanguage = detectedLanguage;
              for (const word of result.words || []) { const adjusted={...word,start:Number(word.start||0)+start,end:Number(word.end||0)+start}; const last=words[words.length-1]; if (!String(adjusted.word||'').trim() || adjusted.end < adjusted.start || adjusted.start > duration + 1) continue; if (!last || !(last.word||'').toLowerCase()===(adjusted.word||'').toLowerCase() || adjusted.start-last.start>2.5) words.push(adjusted); }
              for (const segment of result.segments || []) segments.push({...segment,start:Number(segment.start||0)+start,end:Number(segment.end||0)+start});
              text += `${text?' ':''}${result.text||''}`.trim();
            }
            return { text, words, segments, engine: 'Groq Whisper Large V3 Turbo (chunked)', detectedLanguage };
          };
          const runDeepgram = async () => {
            // Whisper Cloud accepts long recordings but has a 20-minute
            // processing ceiling. Ten-minute chunks stay safely inside that
            // limit, and word times are offset back to one timeline below.
            const chunks = Math.max(1, Math.ceil(duration / 600)); const words=[]; const segments=[]; let text=''; let engine='Deepgram Nova-3'; let detectedLanguage=''; let chunkLanguage=language;
            for (let index=0; index<chunks; index++) {
              const start=index*600; const chunkPath=path.join(jobDir,`deepgram_chunk_${index}.mp3`);
              await runProcess(FFMPEG_BIN,['-y','-ss',String(start),'-t',String(Math.min(602, Math.max(1,duration-start))),' -i'.trim(),audioPath,'-c','copy',chunkPath]);
              send({ type:'progress', stage:'transcribing', message:`Transcribing with Deepgram — part ${index+1} of ${chunks}…`, percent:Math.round(12+(index/chunks)*82) });
              let result; for (let attempt=0; attempt<3; attempt++) { try { result=await deepgramTranscribeChunk(chunkPath,deepgramKey,chunkLanguage); break; } catch (error) { if (attempt===2) throw error; send({ type:'progress', stage:'retrying', message:`Retrying Deepgram part ${index+1}…`, percent:Math.round(12+(index/chunks)*82) }); await new Promise(r=>setTimeout(r,1000*(attempt+1))); } }
              engine = result.engine || engine; detectedLanguage = result.detectedLanguage || detectedLanguage;
              if (language === 'auto' && detectedLanguage) chunkLanguage = detectedLanguage;
              for (const word of result.words || []) { const adjusted={...word,start:Number(word.start||0)+start,end:Number(word.end||0)+start}; const last=words[words.length-1]; if (!String(adjusted.word||'').trim() || adjusted.end < adjusted.start || adjusted.start > duration + 1) continue; if (!last || !(last.word||'').toLowerCase()===(adjusted.word||'').toLowerCase() || adjusted.start-last.start>2.5) words.push(adjusted); }
              for (const segment of result.segments || []) segments.push({...segment,start:Number(segment.start||0)+start,end:Number(segment.end||0)+start});
              text += `${text?' ':''}${result.text||''}`.trim();
            }
            return { text, words, segments, engine, detectedLanguage };
          };
          let transcription;
          if (requiredProvider === 'groq') {
            transcription = await runGroq();
          } else if (groqKey) {
            try { transcription = await runGroq(); }
            catch (groqError) {
              if (deepgramKey) {
                send({ type:'progress', stage:'fallback', message:'Groq is unavailable; switching to Deepgram…', percent:12 });
                try { transcription = await runDeepgram(); }
                catch (deepgramError) {
                  send({ type:'progress', stage:'fallback', message:'Deepgram is unavailable; switching to Local Whisper…', percent:12 });
                  transcription = await runLocalWhisper(audioPath, jobDir, language, effectivePrompt, duration, progress => send({ type:'progress', stage:'transcribing', message: progress.message || 'Transcribing with Local Whisper…', percent: progress.percent }));
                }
              } else {
                send({ type:'progress', stage:'fallback', message:'Groq is unavailable; switching to Local Whisper…', percent:12 });
                transcription = await runLocalWhisper(audioPath, jobDir, language, effectivePrompt, duration, progress => send({ type:'progress', stage:'transcribing', message: progress.message || 'Transcribing with Local Whisper…', percent: progress.percent }));
              }
            }
          } else if (deepgramKey) {
            try { transcription = await runDeepgram(); }
            catch (deepgramError) {
              send({ type:'progress', stage:'fallback', message:'Deepgram is unavailable; switching to Local Whisper…', percent:12 });
              transcription = await runLocalWhisper(audioPath, jobDir, language, effectivePrompt, duration, progress => send({ type:'progress', stage:'transcribing', message: progress.message || 'Transcribing with Local Whisper…', percent: progress.percent }));
            }
          } else {
            send({ type:'progress', stage:'transcribing', message:'Transcribing with bundled Local Whisper…', percent:10 });
            transcription = await runLocalWhisper(audioPath, jobDir, language, effectivePrompt, duration, progress => send({ type:'progress', stage:'transcribing', message: progress.message || 'Transcribing with Local Whisper…', percent: progress.percent }));
          }
          transcription = applyCaptionLanguageOutput(transcription, languageSelection);
          const { text, words, segments, engine = 'Local Whisper', detectedLanguage = '' } = transcription;
          if (!words?.length || !String(text || '').trim()) throw new Error('The transcription engine returned no timed words. No unreliable caption data was applied.');
          writeTranscriptCache(cachePath, { text, words, segments, duration, engine, detectedLanguage });
          send({ type:'complete', text, words, segments, duration, engine, detectedLanguage }); res.end();
        } catch (error) { send({ type:'error', message:error.message || 'Caption transcription failed.' }); res.end(); }
        finally { setTimeout(() => fs.rm(jobDir,{recursive:true,force:true},()=>{}), 60*1000); }
      });
      return;
    }

    // Upload the original media directly to disk.  This endpoint deliberately
    // accepts a raw request body so long videos do not pass through Buffer.concat
    // (the old multipart render setup was the reason large exports failed).
    if (req.method === 'POST' && reqPath === '/api/stream-render-source') {
      const ext = String(req.headers['x-file-ext'] || 'mp4').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'mp4';
      const sourceId = `source_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const sourcePath = path.join(TEMP_DIR, `${sourceId}.${ext}`);
      const output = fs.createWriteStream(sourcePath);
      let finished = false;
      const fail = error => {
        if (finished) return;
        finished = true;
        fs.rm(sourcePath, { force: true }, () => {});
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message || 'Could not save the source media.' }));
      };
      req.on('aborted', () => fail(new Error('Source upload was cancelled.')));
      req.on('error', fail);
      output.on('error', fail);
      output.on('finish', () => {
        if (finished) return;
        finished = true;
        renderSources[sourceId] = { sourcePath, createdAt: Date.now() };
        setTimeout(() => {
          const source = renderSources[sourceId];
          if (source && Date.now() - source.createdAt >= 30 * 60 * 1000) {
            delete renderSources[sourceId]; fs.rm(source.sourcePath, { force: true }, () => {});
          }
        }, 31 * 60 * 1000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sourceId }));
      });
      req.pipe(output);
      return;
    }

    if (req.method === 'POST' && reqPath === '/api/caption-exact-export') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        let source, outputPath;
        const controller = new AbortController();
        res.once('close', () => { if (!res.writableEnded) controller.abort(); });
        try {
          if (!captionRenderer) throw new Error('Use the installed desktop app for local caption export.');
          const payload = JSON.parse(body);
          source = renderSources[payload.sourceId];
          if (!source || !fs.existsSync(source.sourcePath)) throw new Error('Source video is unavailable. Upload it again.');
          const width = Number(payload.width), height = Number(payload.height);
          if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 320 || width > 1920 || height > 1920) throw new Error('Invalid export resolution.');
          if (!Array.isArray(payload.cues) || !payload.cues.length || !payload.settings) throw new Error('Caption settings are missing.');
          const snapshot = { width, height, cues: payload.cues, settings: payload.settings,
            volume: Math.max(0, Math.min(100, Number(payload.volume ?? 100))) };
          const fps = [24, 25, 30, 60].includes(Number(payload.fps)) ? Number(payload.fps) : 30;
          const duration = await getMediaDuration(source.sourcePath);
          if (!(duration > 0)) throw new Error('Could not read video duration.');
          const outputFileName = `Cipher_captioned_${crypto.randomUUID()}.mp4`;
          outputPath = path.join(EXPORTS_DIR, outputFileName);
          const encoder = await detectVideoEncoder();
          await captionRenderer({ sourcePath: source.sourcePath, outputPath, snapshot, duration, fps,
            ffmpeg: FFMPEG_BIN, encodingArgs: videoEncodingArgs(encoder, payload.quality), signal: controller.signal });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, fileName: outputFileName,
            downloadUrl: `/api/download?file=${encodeURIComponent(outputFileName)}`, savedPath: outputPath }));
        } catch (error) {
          if (outputPath) fs.rm(outputPath, { force: true }, () => {});
          if (!res.destroyed) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          }
        } finally {
          if (source) {
            for (const [key, value] of Object.entries(renderSources)) if (value === source) delete renderSources[key];
            fs.rm(source.sourcePath, { force: true }, () => {});
          }
        }
      });
      return;
    }

    // Native caption preview: render a transparent PNG with the same local
    // FFmpeg/libass engine used by final MP4 export. The browser keeps playing
    // the source video smoothly; only this lightweight caption overlay updates
    // when a cue, active word, or style changes.
    if (req.method === 'POST' && reqPath === '/api/caption-native-preview') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) req.destroy();
      });
      req.on('end', async () => {
        let payload;
        try { payload = JSON.parse(body || '{}'); } catch { payload = {}; }
        const requestedWidth = Math.round(Number(payload.width) || 1280);
        const requestedHeight = Math.round(Number(payload.height) || 720);
        const width = Math.max(320, Math.min(1920, requestedWidth));
        const height = Math.max(180, Math.min(1920, requestedHeight));
        const cue = payload.cue && typeof payload.cue === 'object' ? payload.cue : null;
        if (!cue || !String(cue.text || '').trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'A caption cue is required for native preview.' }));
          return;
        }
        // Render frame zero. Cue times are shifted around it below and the
        // preview intentionally skips the short entry fade so a stable native
        // caption is immediately visible while video playback remains smooth.
        const previewNow = 0;
        const requestedTime = Number(payload.time);
        const sourceTime = Number.isFinite(requestedTime) ? requestedTime : Number(cue.start) || 0;
        const shift = previewNow - sourceTime;
        const shiftedCue = {
          ...cue,
          start: Math.max(0, Number(cue.start || 0) + shift),
          end: Math.max(0.05, Number(cue.end || cue.start || 0) + shift),
          words: Array.isArray(cue.words) ? cue.words.map(word => ({
            ...word,
            start: Number(word.start || 0) + shift,
            end: Number(word.end || word.start || 0) + shift
          })) : []
        };
        const jobDir = path.join(TEMP_DIR, `caption_preview_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
        const assPath = path.join(jobDir, 'preview.ass');
        const pngPath = path.join(jobDir, 'caption-pair.png');
        try {
          fs.mkdirSync(jobDir, { recursive: true });
          fs.writeFileSync(assPath, buildCaptionAss([shiftedCue], { ...(payload.settings || {}), lineAnim: 'instant' }, width, height), 'utf8');
          // libass flattens alpha on a transparent source. Render the exact
          // caption once over black and once over white in the same local
          // FFmpeg graph. The client derives a transparent overlay from this
          // pair without ever drawing caption text in Chromium.
          const blackSource = `color=c=black:s=${width}x${height}:r=1:d=1`;
          const whiteSource = `color=c=white:s=${width}x${height}:r=1:d=1`;
          const assFilter = captionAssFilter(assPath);
          const graph = `[0:v]${assFilter}[captionBlack];[1:v]${assFilter}[captionWhite];[captionBlack][captionWhite]hstack=inputs=2,format=rgba[captionPair]`;
          await runProcess(FFMPEG_BIN, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', blackSource, '-f', 'lavfi', '-i', whiteSource, '-filter_complex', graph, '-map', '[captionPair]', '-frames:v', '1', pngPath]);
          const png = fs.readFileSync(pngPath).toString('base64');
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ image: `data:image/png;base64,${png}`, width, height }));
        } catch (error) {
          console.error('[Native Caption Preview]', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message || 'Native caption preview could not be rendered.' }));
        } finally {
          fs.rm(jobDir, { recursive: true, force: true }, () => {});
        }
      });
      return;
    }

    // Fast native caption export: FFmpeg decodes the uploaded source once and
    // renders an ASS subtitle track.  This replaces per-frame browser seeking,
    // which made a 30 minute video attempt tens of thousands of seeks.
    if (req.method === 'POST' && reqPath === '/api/caption-fast-export') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        let payload;
        try { payload = JSON.parse(body || '{}'); } catch { payload = {}; }
        const source = renderSources[payload.sourceId];
        if (!source || !fs.existsSync(source.sourcePath)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'The uploaded source video is no longer available. Please export again.' }));
          return;
        }
        const jobDir = path.join(TEMP_DIR, `caption_render_${Date.now()}`);
        const outputFileName = `Cipher_captioned_${Date.now()}.mp4`;
        const outputPath = path.join(EXPORTS_DIR, outputFileName);
        try {
          fs.mkdirSync(jobDir, { recursive: true });
          const assPath = path.join(jobDir, 'captions.ass');
          fs.writeFileSync(assPath, buildCaptionAss(payload.cues, payload.settings || {}, payload.width || 1920, payload.height || 1080), 'utf8');
          const quality = payload.quality === 'high' ? 'high' : payload.quality === 'compact' ? 'compact' : 'balanced';
          const encoder = await detectVideoEncoder();
          const args = ['-y', '-i', source.sourcePath, '-vf', captionAssFilter(assPath), '-map', '0:v:0', '-map', '0:a?', ...videoEncodingArgs(encoder, quality), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
          const vol = Math.max(0, Math.min(3, Number(payload.volume || 100) / 100));
          if (vol !== 1) args.push('-filter:a', `volume=${vol.toFixed(2)}`);
          args.push(outputPath);
          await runProcess(FFMPEG_BIN, args);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, encoder: encoder.name, downloadUrl: `/api/download?file=${encodeURIComponent(outputFileName)}`, fileName: outputFileName, savedPath: outputPath }));
        } catch (error) {
          console.error('[Fast Caption Export]', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message || 'FFmpeg could not render this video.' }));
        } finally {
          delete renderSources[payload.sourceId];
          fs.rm(source.sourcePath, { force: true }, () => {});
          fs.rm(jobDir, { recursive: true, force: true }, () => {});
        }
      });
      return;
    }

    // ── 1. API: Initialize Stream Render Job ──────────────────
    if (req.method === 'POST' && reqPath === '/api/stream-render-init') {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', async () => {
        try {
          const bodyBuffer = Buffer.concat(chunks);
          const boundaryMatch = (req.headers['content-type'] || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i);

          let fps = 30, audioExt = 'mp3', audioBuf = null, quality = 'balanced', volume = 100, sourceId = '', audioTracks = [], mainAudioKeyframes = [];

          if (boundaryMatch) {
            const boundary = boundaryMatch[1] || boundaryMatch[2];
            const parts = parseMultipart(bodyBuffer, boundary);
            if (parts.fps) fps = parseInt(parts.fps.toString(), 10) || 30;
            if (parts.audioExt) audioExt = parts.audioExt.toString();
            if (parts.quality)  quality  = parts.quality.toString().trim();
            if (parts.volume) { const parsedVolume=parseFloat(parts.volume.toString()); volume=Number.isFinite(parsedVolume)?parsedVolume:100; }
            if (parts.sourceId) sourceId = parts.sourceId.toString().trim();
            if (parts.mainAudioKeyframes) {
              try { mainAudioKeyframes = JSON.parse(parts.mainAudioKeyframes.toString()); }
              catch { throw new Error('Main audio keyframe data is invalid.'); }
              if (!Array.isArray(mainAudioKeyframes)) throw new Error('Main audio keyframes must be a list.');
              mainAudioKeyframes=mainAudioKeyframes.slice(0,100).map(k=>({time:Math.max(0,Number(k.time)||0),value:Math.max(0,Math.min(300,Number(k.value??100)))})).sort((a,b)=>a.time-b.time);
            }
            if (parts.audioTracks) {
              try { audioTracks = JSON.parse(parts.audioTracks.toString()); }
              catch { throw new Error('Additional audio track data is invalid.'); }
              if (!Array.isArray(audioTracks) || audioTracks.length > 24) throw new Error('Additional audio track limit exceeded.');
            }
            audioBuf = parts.audio;
          }

          const uploadedSource = sourceId ? renderSources[sourceId] : null;
          if (sourceId && (!uploadedSource || !fs.existsSync(uploadedSource.sourcePath))) {
            throw new Error('The uploaded source media is no longer available. Please start export again.');
          }
          const resolvedAudioTracks = audioTracks.map((track, index) => {
            const source = renderSources[String(track.sourceId || '')];
            if (!source || !fs.existsSync(source.sourcePath)) throw new Error(`Audio track ${index + 2} is no longer available. Please start export again.`);
            return {
              sourceId:String(track.sourceId), sourcePath:source.sourcePath,
              start:Math.max(0,Number(track.start)||0), duration:Math.max(.1,Number(track.duration)||.1),
              sourceOffset:Math.max(0,Number(track.sourceOffset)||0), volume:Math.max(0,Math.min(300,Number(track.volume ?? 100))),
              keyframes:Array.isArray(track.keyframes)?track.keyframes.slice(0,100).map(k=>({time:Math.max(0,Number(k.time)||0),value:Math.max(0,Math.min(300,Number(k.value??100)))})).sort((a,b)=>a.time-b.time):[]
            };
          });

          const jobId = 'render_' + Date.now();
          const jobDir = path.join(TEMP_DIR, jobId);
          fs.mkdirSync(jobDir, { recursive: true });

          const outputFileName = `Cipher_${Date.now()}.mp4`;
          const finalOutputPath = path.join(EXPORTS_DIR, outputFileName);
          const tempOutput = path.join(jobDir, 'output.mp4');
          let audioPath = path.join(jobDir, `audio.${audioExt}`);

          const hasAudio = Boolean((audioBuf && audioBuf.length > 0) || uploadedSource);
          if (hasAudio) {
            if (uploadedSource) audioPath = uploadedSource.sourcePath;
            else fs.writeFileSync(audioPath, audioBuf);
          }

          const ffmpegArgs = [
            '-y',
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-framerate', String(fps),
            '-i', 'pipe:0'
          ];

          if (hasAudio) {
            ffmpegArgs.push('-i', audioPath);
          }
          for (const track of resolvedAudioTracks) ffmpegArgs.push('-i', track.sourcePath);

          // Never let FFmpeg choose the video stream from the uploaded source by
          // accident. Stream 0 is always the caption-burned MJPEG frame stream;
          // the uploaded media contributes audio only (when it has one).
          ffmpegArgs.push('-map', '0:v:0');

          const audioLabels = [];
          const filters = [];
          let inputIndex = 1;
          const volumeExpression = track => {
            const base=(track.volume/100).toFixed(5), keys=track.keyframes;
            if(!keys.length)return base;
            let expression=(keys[keys.length-1].value/100).toFixed(5);
            for(let i=keys.length-2;i>=0;i--){
              const a=keys[i],b=keys[i+1],span=Math.max(.001,b.time-a.time);
              const av=a.value/100,diff=(b.value-a.value)/100;
              const segment=`${av.toFixed(5)}+(${diff.toFixed(5)})*max(0\\,min(1\\,(t-${a.time.toFixed(4)})/${span.toFixed(4)}))`;
              expression=`if(lt(t\\,${b.time.toFixed(4)})\\,${segment}\\,${expression})`;
            }
            return expression;
          };
          if (hasAudio) {
            const rawVol = parseFloat(volume);
            const normalizedVolume = isNaN(rawVol) ? 100 : Math.max(0, Math.min(300, rawVol));
            filters.push(`[${inputIndex}:a]apad,volume='${volumeExpression({volume:normalizedVolume,keyframes:mainAudioKeyframes})}':eval=frame[mix0]`);
            audioLabels.push('[mix0]'); inputIndex++;
          }
          resolvedAudioTracks.forEach((track,index)=>{
            const label=`mix${audioLabels.length}`, delay=Math.round(track.start*1000);
            filters.push(`[${inputIndex}:a]atrim=start=${track.sourceOffset.toFixed(4)}:duration=${track.duration.toFixed(4)},asetpts=PTS-STARTPTS,volume='${volumeExpression(track)}':eval=frame,adelay=${delay}:all=1[${label}]`);
            audioLabels.push(`[${label}]`);inputIndex++;
          });
          if(audioLabels.length){
            if(audioLabels.length===1)filters.push(`${audioLabels[0]}anull[aout]`);
            else filters.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:normalize=0:dropout_transition=0[aout]`);
            ffmpegArgs.push('-filter_complex',filters.join(';'),'-map','[aout]');
          }

          // The browser has already painted the visual layers. Use an actual
          // hardware H.264 encoder when this PC provides one, instead of the
          // former always-CPU libx264 path.
          const encoder = await detectVideoEncoder();
          ffmpegArgs.push(...videoEncodingArgs(encoder, quality));

          if (audioLabels.length) {
            ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
          }

          ffmpegArgs.push('-movflags', '+faststart', tempOutput);

          console.log(`[FFmpeg Stream] Spawning render pipeline for ${jobId} (${fps} fps)...`);

          const ffProc = spawn(FFMPEG_BIN, ffmpegArgs);

          activeJobs[jobId] = {
            proc: ffProc,
            jobDir,
            tempOutput,
            finalOutputPath,
            outputFileName,
            encoderName: encoder.name,
            sourceId,
            sourceIds: [sourceId, ...resolvedAudioTracks.map(track=>track.sourceId)].filter(Boolean),
            isClosed: false,
            exitCode: null,
            lastLog: '',
            streamError: '',
            onFinishCallback: null
          };

          const job = activeJobs[jobId];
          const notifyFinish = (code) => {
            if (!job.onFinishCallback) return;
            const callback = job.onFinishCallback;
            job.onFinishCallback = null;
            callback(code);
          };

          // Actively drain stdout and stderr to prevent OS pipe buffer freeze
          ffProc.stdout.on('data', () => {});
          ffProc.stderr.on('data', (data) => {
            const str = data.toString();
            if (activeJobs[jobId]) {
              // Retain the useful tail instead of replacing it with only the
              // final stderr chunk. This preserves the real encoder failure.
              activeJobs[jobId].lastLog = (activeJobs[jobId].lastLog + str).slice(-12000);
            }
          });

          // A child process can close its pipe between the pre-write check and
          // the actual OS write. Writable streams report that asynchronously;
          // without this listener EPIPE/EOV becomes an uncaught main-process
          // exception and Electron shows a fatal JavaScript error dialog.
          ffProc.stdin.on('error', (err) => {
            if (!activeJobs[jobId]) return;
            job.streamError = err?.message || String(err);
            console.error(`[FFmpeg Stdin Error] ${jobId}:`, err);
            notifyFinish(job.exitCode ?? -1);
          });

          ffProc.on('error', (err) => {
            console.error(`[FFmpeg Spawn Error]`, err);
            if (activeJobs[jobId]) {
              activeJobs[jobId].error = err.message;
              activeJobs[jobId].isClosed = true;
              activeJobs[jobId].exitCode = -1;
              notifyFinish(-1);
            }
          });

          ffProc.on('close', (code) => {
            console.log(`[FFmpeg Stream] FFmpeg exited with code ${code} for ${jobId}`);
            if (activeJobs[jobId]) {
              activeJobs[jobId].isClosed = true;
              activeJobs[jobId].exitCode = code;
              notifyFinish(code);
            }
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, jobId, encoder: encoder.name }));

        } catch (err) {
          console.error('[Stream Init Error]', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // ── 2. API: Pipe Batch of Frames into FFmpeg Stdin ────────
    if (req.method === 'POST' && reqPath === '/api/stream-render-chunk') {
      const urlParams = new URL(req.url, `http://localhost:${port}`);
      const jobId = urlParams.searchParams.get('jobId');

      if (!jobId || !activeJobs[jobId] || !activeJobs[jobId].proc) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing active jobId' }));
        return;
      }

      const job = activeJobs[jobId];
      const ffProc = job.proc;

      const frameChunks = [];
      let requestBytes = 0;
      let requestTooLarge = false;
      req.on('data', chunk => {
        requestBytes += chunk.length;
        if (requestBytes > 16 * 1024 * 1024) {
          requestTooLarge = true;
          frameChunks.length = 0;
          return;
        }
        frameChunks.push(chunk);
      });

      req.on('end', () => {
        if (requestTooLarge) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Render frame batch exceeded the safe local size limit.' }));
          return;
        }
        if (!requestBytes) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Empty render frame batch.' }));
          return;
        }
        if (ffProc.stdin.destroyed || ffProc.stdin.writableEnded || !activeJobs[jobId] || job.isClosed || job.streamError) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: job.streamError || job.error || 'Render process is no longer accepting frames.' }));
          return;
        }

        let settled = false;
        const respond = (status, payload) => {
          if (settled) return;
          settled = true;
          if (res.writableEnded || res.destroyed) return;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        };
        const fail = (error) => {
          const message = error?.message || job.streamError || job.error || 'FFmpeg stopped before this frame batch could be written.';
          respond(409, { error: message });
        };

        // The callback fires only after this batch is flushed or rejected. It
        // both honours back-pressure and closes the race where write() looked
        // successful but emitted EPIPE/EOV on the following event-loop turn.
        try {
          ffProc.stdin.write(Buffer.concat(frameChunks), (error) => {
            if (error || job.streamError || job.isClosed) fail(error);
            else respond(200, { success: true });
          });
        } catch (error) {
          fail(error);
        }
      });

      req.on('error', (err) => {
        if (res.writableEnded || res.destroyed) return;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
      return;
    }

    // ── 3. API: Cancel Stream Render Job ─────────────────────
    if (req.method === 'POST' && reqPath === '/api/stream-render-cancel') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { jobId } = JSON.parse(body || '{}');
          const nativeJob = nativeTimelineJobs[jobId];
          if (nativeJob) {
            nativeJob.cancelled = true;
            if (nativeJob.proc) nativeJob.proc.kill();
            else {
              const sourceIds=[nativeJob.config.audioSourceId,...(nativeJob.config.audioTracks||[]).map(track=>track.sourceId)].filter(Boolean);for(const sourceId of sourceIds){const source=renderSources[sourceId];if(source){delete renderSources[sourceId];fs.rm(source.sourcePath,{force:true},()=>{});}}
              fs.rm(nativeJob.jobDir,{recursive:true,force:true},()=>{});
              delete nativeTimelineJobs[jobId];
            }
            res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({success:true}));return;
          }
          const job = activeJobs[jobId];
          if (!job) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, alreadyFinished: true }));
            return;
          }
          job.onFinishCallback = null;
          if (job.proc && !job.isClosed) job.proc.kill('SIGKILL');
          fs.rm(job.jobDir, { recursive: true, force: true }, () => {});
          for (const sourceId of job.sourceIds || [job.sourceId]) if (sourceId && renderSources[sourceId]) {
            const source = renderSources[sourceId]; delete renderSources[sourceId]; fs.rm(source.sourcePath, { force: true }, () => {});
          }
          delete activeJobs[jobId];
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // ── 4. API: Finish Stream & Finalize Video ────────────────
    if (req.method === 'POST' && reqPath === '/api/stream-render-finish') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { jobId } = JSON.parse(body || '{}');
          const job = activeJobs[jobId];

          if (!job || !job.proc) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Job not found' }));
            return;
          }

          console.log(`[FFmpeg Stream] Closing stdin for ${jobId}...`);

          let finalized = false;
          const finalizeResponse = (code) => {
            if (finalized || res.writableEnded || res.destroyed) return;
            finalized = true;
            const outputExists = fs.existsSync(job.tempOutput);
            const outputSize = outputExists ? fs.statSync(job.tempOutput).size : 0;
            const succeeded = code === 0 && !job.streamError && !job.error && outputSize > 0;
            if (succeeded) {
              try {
                fs.copyFileSync(job.tempOutput, job.finalOutputPath);
                fs.rm(job.jobDir, { recursive: true, force: true }, () => {});
                for (const sourceId of job.sourceIds || [job.sourceId]) if (sourceId && renderSources[sourceId]) {
                  const source = renderSources[sourceId]; delete renderSources[sourceId]; fs.rm(source.sourcePath, { force: true }, () => {});
                }
              } catch (e) {
                console.error('File copy/cleanup error:', e);
              }
              delete activeJobs[jobId];

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                downloadUrl: `/api/download?file=${encodeURIComponent(job.outputFileName)}`,
                fileName: job.outputFileName,
                savedPath: job.finalOutputPath
              }));
            } else {
              fs.rm(job.tempOutput, { force: true }, () => {});
              fs.rm(job.jobDir, { recursive: true, force: true }, () => {});
              for (const sourceId of job.sourceIds || [job.sourceId]) if (sourceId && renderSources[sourceId]) {
                const source = renderSources[sourceId]; delete renderSources[sourceId]; fs.rm(source.sourcePath, { force: true }, () => {});
              }
              delete activeJobs[jobId];
              res.writeHead(500, { 'Content-Type': 'application/json' });
              const reason = job.streamError || job.error || job.lastLog || 'Unknown encoder error';
              res.end(JSON.stringify({ error: `FFmpeg failed (exit code ${code}): ${reason}` }));
            }
          };

          if (job.isClosed) {
            finalizeResponse(job.exitCode);
          } else {
            job.onFinishCallback = finalizeResponse;
            // End the pipe so FFmpeg finalizes the file
            try {
              job.proc.stdin.end();
            } catch (e) {
              console.warn('stdin end warning:', e);
              finalizeResponse(-1);
            }
          }

        } catch (err) {
          console.error('[Stream Finish Error]', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // ── API: Download Exported Video ─────────────────────────
    if (req.method === 'GET' && reqPath === '/api/download') {
      const urlParams = new URL(req.url, `http://localhost:${port}`);
      const fileName = urlParams.searchParams.get('file');
      if (!fileName) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing file param');
        return;
      }

      const filePath = path.join(EXPORTS_DIR, fileName);
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File not found');
        return;
      }

      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${fileName}"`
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // ── Static Files Serving ────────────────────────────────
    
    // ==== API: Gemini Text Proxy ====
    if (req.method === 'POST' && reqPath === '/api/gemini-text') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const apiKey = process.env.GEMINI_API_KEY;
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
          });
          const data = await response.json();
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: err.message } }));
        }
      });
      return;
    }

    // ==== API: Generate Image (Proxy to Nano Banana Lite) ====
    if (req.method === 'POST' && reqPath === '/api/generate-image') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const apiKey = process.env.GEMINI_API_KEY;
          // User requested "nano bnana lite" which is models/gemini-3.1-flash-lite-image
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key=${apiKey}`;
          
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
          });
          
          const data = await response.json();
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(data));
        } catch (err) {
          console.error('[Image Gen Error]', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: err.message } }));
        }
      });
      return;
    }

    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
    const filePath = path.join(ROOT, reqPath);
    const ext = path.extname(filePath).toLowerCase();

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // Keep the same server object so Electron's awaiting startup code still
      // receives its listening event if the preferred persistent port is busy.
      console.log(`Port ${port} in use, selecting an available local port...`);
      server.listen(0);
    } else {
      console.error(err);
    }
  });

  server.listen(port, () => {
    const activePort = server.address().port;
    const url = `http://localhost:${activePort}`;
    console.log(`====================================================`);
    console.log(`  🎬 Cipher Studio High-Speed Pipeline Active!`);
    console.log(`  URL: ${url}`);
    console.log(`  Engine: Direct FFmpeg image2pipe Demuxer`);
    console.log(`  Exports: ${EXPORTS_DIR}`);
    console.log(`====================================================`);

    // Browser auto-launch disabled by Cipher Studio
  });
  return server;
}

function parseMultipart(buffer, boundary) {
  const result = {};
  const boundaryBuffer = Buffer.from('--' + boundary);
  let start = buffer.indexOf(boundaryBuffer);

  while (start !== -1) {
    const nextStart = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    const part = buffer.slice(start + boundaryBuffer.length, nextStart === -1 ? buffer.length : nextStart);

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headerStr = part.slice(0, headerEnd).toString('latin1');
      const body = part.slice(headerEnd + 4, part.lastIndexOf('\r\n'));

      const nameMatch = headerStr.match(/name="([^"]+)"/i);
      if (nameMatch) {
        result[nameMatch[1]] = body;
      }
    }
    start = nextStart;
  }
  return result;
}

if (require.main === module) createServer(PORT);

module.exports = { createServer, parseWhisperJson, buildCaptionAss, resolveCaptionLanguage, romanizeUrduText, applyCaptionLanguageOutput };
