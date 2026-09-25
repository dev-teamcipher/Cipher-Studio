/*
  "Open in CapCut": sends the current timeline to CapCut desktop as a new
  project. Images, videos and audio keep their exact timeline positions,
  image motion (zoom/pan presets and clip keyframes) becomes CapCut
  keyframes, and captions arrive as CapCut main captions. AutoCut-only looks
  (FX, transitions, animated caption styles) are not transferred because
  CapCut has its own versions of those.
*/
window.CapCutExport = (() => {
  const RESOLUTIONS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:3': [1440, 1080] };
  const UPLOAD_CONCURRENCY = 4;
  let busy = false;

  const value = (id, fallback) => document.getElementById(id)?.value ?? fallback;
  const extFor = (blob, name) => {
    const fromName = String(name || '').match(/\.([a-z0-9]{2,5})$/i)?.[1];
    if (fromName) return fromName.toLowerCase();
    const type = String(blob?.type || '');
    return type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : type.includes('jpeg') ? 'jpg'
      : type.includes('wav') ? 'wav' : type.includes('mpeg') ? 'mp3' : type.includes('mp4') ? 'mp4' : type.includes('webm') ? 'webm' : 'bin';
  };

  async function sceneBlob(scene) {
    if (scene.blob instanceof Blob) return scene.blob;
    if (scene.file instanceof Blob) return scene.file;
    const img = scene.img || scene.image;
    const src = img?.currentSrc || img?.src || scene.url;
    if (!src) return null;
    return (await fetch(src)).blob();
  }

  // Covers the whole frame exactly like the AutoCut preview (CapCut's scale 1 = fit inside).
  function coverScale(iw, ih, w, h) {
    if (!iw || !ih) return 1;
    return Math.max(w / iw, h / ih) / Math.min(w / iw, h / ih);
  }

  // Samples an image's on-screen transform over its duration using the same
  // motion preset maths as the AutoCut preview/export (Preview.getMotionPresets
  // + ProTimeline.resolveLegacyScene), converted to CapCut units:
  // scale relative to "fit", position in half-canvas units (+y is up).
  function sceneMotion(scene, index, duration, cover, w, h) {
    const motionOn = document.getElementById('chk-motion')?.checked !== false;
    const presetKey = value('sel-motion-preset', 'auto');
    const presets = window.Preview?.getMotionPresets?.() || {};
    const preset = motionOn ? (presets[presetKey] || presets.auto) : null;
    const intensity = Number(value('sl-motion', 0.3));
    const at = (t) => {
      const r = window.ProTimeline?.resolveLegacyScene?.(scene, scene.startSec + t * duration) || scene;
      const m = preset ? preset.calc(t, index, intensity, w, h) : { scale: 1, dx: 0, dy: 0, rotate: 0 };
      const clipScale = Number.isFinite(Number(r.scale)) ? Number(r.scale) : 1;
      return {
        scale: cover * m.scale * clipScale,
        x: (m.dx + (Number(r.posX) || 0) / 100 * w) / (w / 2),
        y: -(m.dy + (Number(r.posY) || 0) / 100 * h) / (h / 2),
        rotation: (m.rotate || 0) * 180 / Math.PI + (Number(r.rotation) || 0),
        alpha: Math.max(0, Math.min(1, Number(r.opacity ?? 100) / 100))
      };
    };
    // Eased presets are smooth (8 segments keep the error under 0.1%);
    // shake and pulse move faster, so they get denser samples.
    const samples = !preset ? 8 : presetKey === 'handheld' ? Math.min(120, Math.max(16, Math.ceil(duration * 12)))
      : presetKey === 'pulse' ? 32 : 8;
    return sampled(at, samples, duration);
  }

  function clipKeyframes(clip, base, w, h) {
    const hasKeys = Object.values(clip.keyframes || {}).some((list) => Array.isArray(list) && list.length);
    if (!hasKeys || !window.ProTimeline?.resolvedTransform) return null;
    const at = (t) => {
      const p = window.ProTimeline.resolvedTransform(clip, t * clip.duration);
      return {
        scale: base * (Number(p.scale) || 1), x: (Number(p.x) || 0) / 50, y: -(Number(p.y) || 0) / 50,
        rotation: Number(p.rotation) || 0, alpha: Math.max(0, Math.min(1, Number(p.opacity ?? 100) / 100))
      };
    };
    return sampled(at, Math.min(120, Math.max(8, Math.ceil(clip.duration * 4))), clip.duration).keyframes;
  }

  // Returns the start values plus keyframes for every property that changes.
  function sampled(at, samples, duration) {
    const points = Array.from({ length: samples + 1 }, (_, i) => [i / samples, at(i / samples)]);
    const first = points[0][1];
    const keyframes = {};
    for (const prop of ['scale', 'x', 'y', 'rotation', 'alpha']) {
      const values = points.map(([t, v]) => [t * duration, Math.round(v[prop] * 1e6) / 1e6]);
      if (values.some(([, v]) => Math.abs(v - values[0][1]) > 1e-6)) keyframes[prop] = values;
    }
    return { ...first, keyframes: Object.keys(keyframes).length ? keyframes : null };
  }

  async function collect(width, height) {
    const media = [];            // { key, blob, name, kind, width, height, duration }
    const byKey = new Map();
    const addMedia = (key, blob, name, kind, extra = {}) => {
      if (byKey.has(key)) return byKey.get(key);
      const entry = { key, blob, name, kind, ...extra };
      byKey.set(key, entry); media.push(entry);
      return entry;
    };

    const allScenes = window.App?.getScenes?.() || [];
    const scenes = allScenes.filter((s) => s && !s.deleted && !s.placeholder);
    const tracks = window.ProTimeline?.getTracks?.() || [];
    const transformAt = (clip) => window.ProTimeline?.resolvedTransform?.(clip, 0) || clip.transform || {};

    // V1: the main image track, with any V1 video replacements slotted in.
    const mainItems = [];
    for (const scene of scenes) {
      const blob = await sceneBlob(scene);
      if (!blob) continue;
      const img = scene.img || scene.image;
      const iw = img?.naturalWidth || 0, ih = img?.naturalHeight || 0;
      const entry = addMedia(blob, blob, scene.name || `image_${scene.index + 1}`, 'photo', { width: iw, height: ih });
      const cover = coverScale(iw, ih, width, height);
      const duration = scene.endSec - scene.startSec;
      const motion = sceneMotion(scene, allScenes.indexOf(scene), duration, cover, width, height);
      mainItems.push({ entry, start: scene.startSec, duration, ...motion });
    }

    const overlayTracks = [];
    const audioTracks = [];
    for (const track of tracks) {
      if (track.muted) continue;
      const items = [];
      for (const clip of track.clips) {
        if (!(clip.blob instanceof Blob) || !['image', 'video', 'audio'].includes(clip.type)) continue;
        const p = transformAt(clip);
        if (clip.type === 'audio') {
          const entry = addMedia(clip.blob, clip.blob, clip.name, 'audio');
          items.push({ entry, start: clip.start, duration: clip.duration, sourceOffset: clip.sourceOffset, volume: (Number(p.volume ?? 100) / 100) });
          continue;
        }
        const el = clip.element;
        const iw = el?.videoWidth || el?.naturalWidth || 0, ih = el?.videoHeight || el?.naturalHeight || 0;
        const entry = addMedia(clip.blob, clip.blob, clip.name, clip.type === 'video' ? 'video' : 'photo', { width: iw, height: ih });
        // Mirrors ProTimeline.renderVisualLayers: video tracks cover the frame,
        // image tracks are drawn at 55% of fit size, both then scaled by the clip.
        const base = track.type === 'video' ? coverScale(iw, ih, width, height) : 0.55;
        items.push({
          entry, start: clip.start, duration: clip.duration, sourceOffset: clip.type === 'video' ? clip.sourceOffset : 0,
          scale: base * (Number(p.scale) || 1), x: (Number(p.x) || 0) / 50, y: -(Number(p.y) || 0) / 50,
          rotation: Number(p.rotation) || 0, alpha: Math.max(0, Math.min(1, Number(p.opacity ?? 100) / 100)),
          volume: clip.type === 'video' ? Number(p.volume ?? 100) / 100 : 0,
          keyframes: clipKeyframes(clip, base, width, height)
        });
      }
      if (!items.length) continue;
      if (track.type === 'audio') audioTracks.push({ name: track.name, items });
      else if (track.v1ReplacementTrack) mainItems.push(...items);
      else overlayTracks.push({ name: track.name, items });
    }
    mainItems.sort((a, b) => a.start - b.start);

    // Main voiceover on its own track, first.
    const audio = window.Uploader?.getAudio?.();
    if (audio) {
      const blob = audio.blob instanceof Blob ? audio.blob : audio.file instanceof Blob ? audio.file : audio.url ? await (await fetch(audio.url)).blob() : null;
      if (blob) {
        const entry = addMedia(blob, blob, audio.name || audio.file?.name || 'voiceover', 'audio');
        const volume = Number(value('sl-audio-volume', 100)) / 100;
        const total = Math.max(1, ...scenes.map((s) => s.endSec || 0), Number(window.App?.getDuration?.() || 0));
        audioTracks.unshift({ name: 'Voiceover', items: [{ entry, start: 0, duration: total + 3600, sourceOffset: 0, volume }] });
      }
    }

    let captions = null;
    const captionsOn = document.getElementById('chk-captions')?.checked !== false;
    const cues = captionsOn ? (window.App?.getCaptions?.() || []) : [];
    if (cues.length) {
      const textCase = value('sel-caption-case', 'uppercase');
      const format = (text) => textCase === 'uppercase' ? text.toUpperCase() : textCase === 'lowercase' ? text.toLowerCase() : text;
      const posY = Number(value('sl-caption-y', 83)) / 100;
      const align = value('sel-caption-align', 'center');
      captions = {
        items: cues.map((c) => ({ start: c.start, end: c.end, text: format(String(c.text || '').trim()) })).filter((c) => c.text && c.end > c.start),
        style: {
          size: Math.round(7 * (Number(value('sl-caption-size', 1)) || 1) * 10) / 10,
          color: value('col-caption-text', '#FFFFFF'),
          strokeColor: value('col-caption-stroke', '#000000'),
          strokeWidth: Number(value('sl-caption-stroke', 4)) > 0 ? 0.08 : 0,
          alignment: align === 'left' ? 0 : align === 'right' ? 2 : 1,
          y: -(posY * 2 - 1)
        }
      };
    }

    return { media, mainItems, overlayTracks, audioTracks, captions };
  }

  async function uploadAll(media, onProgress) {
    let done = 0, next = 0;
    const worker = async () => {
      while (next < media.length) {
        const entry = media[next++];
        const res = await fetch('/api/stream-render-source', { method: 'POST', headers: { 'X-File-Ext': extFor(entry.blob, entry.name) }, body: entry.blob });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.sourceId) throw new Error(data.error || 'Could not copy a media file.');
        entry.sourceId = data.sourceId;
        onProgress(++done, media.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, media.length) }, worker));
  }

  function projectName() {
    const audio = window.Uploader?.getAudio?.();
    const audioName = audio?.name || audio?.file?.name || '';
    const base = audioName.replace(/\.[a-z0-9]{2,5}$/i, '').trim() || 'AutoCut Project';
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
    return `${base} ${stamp}`;
  }

  async function open(button) {
    if (busy) return;
    const status = await fetch('/api/capcut-status').then((r) => r.json()).catch(() => ({}));
    if (!status.installed) { alert('CapCut desktop is not installed on this computer. Install CapCut from capcut.com, then try again.'); return; }
    if (!(window.App?.getScenes?.() || []).length) { alert('Add your images and voiceover first.'); return; }

    busy = true;
    const label = button?.querySelector('span') || button;
    const original = label?.textContent;
    const setLabel = (text) => { if (label) label.textContent = text; };
    if (button) button.disabled = true;
    try {
      const [width, height] = RESOLUTIONS[value('sel-aspect', '16:9')] || RESOLUTIONS['16:9'];
      setLabel('Preparing CapCut project…');
      const plan = await collect(width, height);
      await uploadAll(plan.media, (done, total) => setLabel(`Copying media ${done}/${total}…`));
      setLabel('Creating CapCut project…');
      const ref = (item) => {
        const { entry, ...rest } = item;
        return { ...rest, sourceId: entry.sourceId };
      };
      const body = {
        name: projectName(), width, height, fps: Number(value('sel-fps', 30)) || 30,
        media: plan.media.map((m) => ({ sourceId: m.sourceId, name: m.name, kind: m.kind, width: m.width, height: m.height })),
        visualTracks: [{ name: 'Images', main: true, items: plan.mainItems.map(ref) }, ...plan.overlayTracks.map((t) => ({ name: t.name, items: t.items.map(ref) }))],
        audioTracks: plan.audioTracks.map((t) => ({ name: t.name, items: t.items.map(ref) })),
        captions: plan.captions
      };
      const res = await fetch('/api/capcut-project', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not create the CapCut project.');
      const where = data.running
        ? 'CapCut is already open: go to the CapCut Home screen (or close and reopen CapCut) and the project will be at the top of your Projects list.'
        : 'CapCut is opening now. The project will be at the top of your Projects list.';
      alert(`✅ CapCut project created: "${data.name}"\n\n${where}\n\nImages, motion, voiceover, extra tracks and captions are placed exactly on the timeline. AutoCut FX and transitions are not copied — add CapCut's own effects there.`);
    } catch (error) {
      alert('Open in CapCut failed: ' + (error.message || error));
    } finally {
      busy = false;
      if (button) button.disabled = false;
      setLabel(original);
    }
  }

  function init() {
    const button = document.getElementById('btn-open-capcut');
    if (button) button.addEventListener('click', () => open(button));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { open, collect };
})();
