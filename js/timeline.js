/* ============================================================
   TIMELINE.JS — Timeline ruler, video clips, waveform + zoom & scrub
   ============================================================ */

window.Timeline = (function () {

  // ── State ──────────────────────────────────────────────────
  let scenes     = [];
  let duration   = 0;
  let PX_PER_SEC = 80;   // pixels per second (zoom level)
  let baseFitZoom = 80;  // fit-to-screen baseline
  let selectedCut = -1;  // index of selected cut diamond
  let isScrubbing = false;
  let highlightedClip = -1; // persistent user selection
  let playbackClip = -1;    // current preview position, independent of selection
  let suppressClipClick = false;
  const LABEL_WIDTH = 124; // readable professional V1/A1 + added-track headers

  // ── DOM ────────────────────────────────────────────────────
  let wrap, ruler, videoTrack, waveCanvas, playhead;
  let zoomSlider, zoomValLabel, btnZoomIn, btnZoomOut, btnZoomFit;
  let tlClipBadge, tlTimeBadge;

  function init() {
    wrap         = document.getElementById('timeline-wrap');
    ruler        = document.getElementById('tl-ruler');
    videoTrack   = document.getElementById('video-track');
    waveCanvas   = document.getElementById('waveform-canvas');
    playhead     = document.getElementById('tl-playhead');
    zoomSlider   = document.getElementById('tl-zoom-slider');
    zoomValLabel = document.getElementById('lbl-zoom-val');
    btnZoomIn    = document.getElementById('btn-zoom-in');
    btnZoomOut   = document.getElementById('btn-zoom-out');
    btnZoomFit   = document.getElementById('btn-zoom-fit');
    tlClipBadge  = document.getElementById('tl-clip-badge');
    tlTimeBadge  = document.getElementById('tl-time-badge');

    // ── Scrubbing on Ruler & Tracks ──
    const handleScrub = (e) => {
      if (!duration || duration <= 0) return;
      const rect = wrap.getBoundingClientRect();
      const clickX = e.clientX - rect.left + wrap.scrollLeft - LABEL_WIDTH;
      const t = Math.max(0, Math.min(duration, clickX / PX_PER_SEC));
      window.Preview.seek(t);
    };

    const onPointerDown = (e) => {
      // Don't trigger scrub if clicking a cut diamond
      if (e.target.classList.contains('tl-cut')) return;
      isScrubbing = true;
      if (e.currentTarget === waveCanvas) window.ProTimeline?.selectLegacyAudio?.();
      else window.ProTimeline?.clearSelection?.();
      handleScrub(e);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    const onPointerMove = (e) => {
      if (!isScrubbing) return;
      handleScrub(e);
    };

    const onPointerUp = () => {
      isScrubbing = false;
      playhead?.classList.remove('dragging');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    ruler?.addEventListener('pointerdown', onPointerDown);
    videoTrack?.addEventListener('pointerdown', onPointerDown);
    waveCanvas?.addEventListener('pointerdown', onPointerDown);
    playhead?.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();playhead.classList.add('dragging');try{playhead.setPointerCapture?.(e.pointerId);}catch{}onPointerDown(e);});
    playhead?.addEventListener('pointermove',onPointerMove);
    playhead?.addEventListener('pointerup',onPointerUp);
    playhead?.addEventListener('pointercancel',onPointerUp);
    window.addEventListener('pointerup',()=>playhead?.classList.remove('dragging'));
    window.addEventListener('pointercancel',onPointerUp);
    wrap?.addEventListener('pointerdown',e=>{
      if (e.target === wrap || e.target?.id === 'pro-video-tracks' || e.target?.id === 'pro-audio-tracks') {
        window.ProTimeline?.clearSelection?.();
      }
    });
    waveCanvas?.addEventListener('click',()=>window.ProTimeline?.selectLegacyAudio?.());
    document.querySelector('.main-audio-row .main-track-label')?.addEventListener('click',()=>window.ProTimeline?.selectLegacyAudio?.());
    document.querySelector('.main-video-row .main-track-label')?.addEventListener('click',()=>{const index=window.Preview?.getCurrentSceneIndex?.()||0;highlightClip(index);window.App?.selectClip?.(index);window.ProTimeline?.selectLegacyClip?.(index);});

    // ── Zoom Buttons & Slider ──
    zoomSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      setZoom(val, window.Preview?.getCurrentTime() || 0);
    });

    btnZoomIn?.addEventListener('click', () => {
      zoomIn();
    });

    btnZoomOut?.addEventListener('click', () => {
      zoomOut();
    });

    btnZoomFit?.addEventListener('click', () => {
      zoomFit();
    });

    // ── Wheel Zoom with Ctrl or Alt / Pinch ──
    wrap?.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.15 : 0.87;
        const rect = wrap.getBoundingClientRect();
        const mouseX = e.clientX - rect.left + wrap.scrollLeft - LABEL_WIDTH;
        const mouseTime = Math.max(0, mouseX / PX_PER_SEC);
        setZoom(PX_PER_SEC * delta, mouseTime);
      }
    }, { passive: false });
  }

  // ── Build timeline from scenes ─────────────────────────────
  function build(sceneList, totalDuration, options = {}) {
    const preserveView = options.preserveView === true;
    const previousScrollLeft = wrap?.scrollLeft || 0;
    scenes   = sceneList;
    duration = totalDuration;

    if (tlClipBadge) {
      tlClipBadge.textContent = `${scenes.length} Clip${scenes.length === 1 ? '' : 's'}`;
    }

    if (!preserveView) {
      // Calculate baseline fit zoom only while opening/reloading a timeline.
      const trackWidth = (wrap?.clientWidth || 800) - LABEL_WIDTH - 40;
      baseFitZoom = Math.max(20, Math.min(120, trackWidth / Math.max(1, duration)));
      PX_PER_SEC = Math.max(baseFitZoom, 70);

      if (zoomSlider) {
        zoomSlider.value = Math.round(PX_PER_SEC);
      }
    }

    updateZoomLabel();
    buildRuler();
    buildVideoTrack();
    buildWaveform();
    window.ProTimeline?.refresh?.();
    if (preserveView && wrap) wrap.scrollLeft = previousScrollLeft;
  }

  // ── Set Zoom Level ─────────────────────────────────────────
  function setZoom(pxPerSec, centerTime = 0) {
    const minZoom = 15;
    const maxZoom = 300;
    const newZoom = Math.max(minZoom, Math.min(maxZoom, pxPerSec));
    
    if (Math.abs(newZoom - PX_PER_SEC) < 0.5 && !isFinite(newZoom)) return;
    PX_PER_SEC = newZoom;

    if (zoomSlider) {
      zoomSlider.value = Math.round(PX_PER_SEC);
    }

    updateZoomLabel();
    buildRuler();
    buildVideoTrack();
    buildWaveform();
    window.ProTimeline?.refresh?.();

    // Keep centerTime visible around current scroll position
    if (wrap && centerTime >= 0) {
      const targetX = LABEL_WIDTH + centerTime * PX_PER_SEC;
      const wrapW   = wrap.clientWidth;
      wrap.scrollLeft = Math.max(0, targetX - wrapW / 2);
    }

    // Refresh playhead position
    const curTime = window.Preview?.getCurrentTime() || 0;
    updatePlayhead(curTime, false);
  }

  function zoomIn() {
    const curTime = window.Preview?.getCurrentTime() || 0;
    setZoom(PX_PER_SEC * 1.25, curTime);
  }

  function zoomOut() {
    const curTime = window.Preview?.getCurrentTime() || 0;
    setZoom(PX_PER_SEC / 1.25, curTime);
  }

  function zoomFit() {
    if (!wrap || !duration) return;
    const trackWidth = wrap.clientWidth - LABEL_WIDTH - 40;
    const fitZoom = Math.max(15, trackWidth / Math.max(1, duration));
    setZoom(fitZoom, 0);
    if (wrap) wrap.scrollLeft = 0;
  }

  function updateZoomLabel() {
    if (!zoomValLabel) return;
    const pct = Math.round((PX_PER_SEC / 80) * 100);
    zoomValLabel.textContent = `${pct}%`;
  }

  // ── Ruler ─────────────────────────────────────────────────
  function buildRuler() {
    if (!ruler) return;
    ruler.innerHTML = '';
    const totalW = duration * PX_PER_SEC;
    ruler.style.width = (totalW + LABEL_WIDTH + 60) + 'px';

    // Adaptive step based on zoom level (pixels per second)
    let step = 5;
    if (PX_PER_SEC >= 140) step = 0.5;
    else if (PX_PER_SEC >= 80) step = 1;
    else if (PX_PER_SEC >= 40) step = 2;
    else if (PX_PER_SEC >= 20) step = 5;
    else if (PX_PER_SEC >= 10) step = 10;
    else step = 30;

    for (let t = 0; t <= duration + step * 0.5; t += step) {
      const tick = document.createElement('span');
      tick.className = 'ruler-tick';
      tick.style.left = (LABEL_WIDTH + t * PX_PER_SEC) + 'px';
      tick.textContent = formatTime(t);
      ruler.appendChild(tick);
    }
  }

  // ── Video track ───────────────────────────────────────────
  function buildVideoTrack() {
    if (!videoTrack) return;
    if (highlightedClip >= scenes.length) highlightedClip = -1;
    if (playbackClip >= scenes.length) playbackClip = -1;
    videoTrack.innerHTML = '';
    const totalW = duration * PX_PER_SEC;
    videoTrack.style.width = totalW + 'px';
    videoTrack.style.position = 'relative';

    scenes.forEach((scene, i) => {
      const clipW = Math.max(2, scene.duration * PX_PER_SEC - 2);
      const clipL = scene.startSec * PX_PER_SEC;

      // Clip div
      const clip = document.createElement('div');
      const replacement = window.ProTimeline?.getLegacyReplacement?.(i) || null;
      clip.className = `tl-clip${scene.deleted && !replacement ? ' tl-empty-slot' : ''}${replacement ? ' tl-video-slot' : ''}${i === highlightedClip ? ' active' : ''}${i === playbackClip ? ' playback-active' : ''}`;
      clip.tabIndex = 0;
      clip.setAttribute('role', 'button');
      clip.setAttribute('aria-label', `Select V1 clip ${i + 1}`);
      clip.setAttribute('aria-selected', String(i === highlightedClip));
      clip.style.left  = clipL + 'px';
      clip.style.width = clipW + 'px';
      clip.dataset.idx  = i;
      clip.title = replacement
        ? `${replacement.name} — video fitted inside V1 slot #${i + 1} (${scene.duration.toFixed(1)}s)`
        : scene.deleted
        ? `Empty V1 slot #${i + 1} (${scene.duration.toFixed(1)}s) — drop an image or video to restore`
        : `Clip #${i + 1} (${scene.duration.toFixed(1)}s)`;

      // Thumbnail
      if (replacement) {
        const videoLabel = document.createElement('div');
        videoLabel.className = 'tl-video-slot-label';
        videoLabel.innerHTML = `<span>▶</span><strong>${String(replacement.name || 'Video').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}</strong>`;
        clip.appendChild(videoLabel);
      } else if (!scene.deleted) {
        const img = document.createElement('img');
        img.src = (scene.img && scene.img.src) ? scene.img.src : (scene.url || '');
        img.loading = 'lazy';
        clip.appendChild(img);
      } else {
        const empty = document.createElement('div');
        empty.className = 'tl-empty-slot-label';
        empty.textContent = '＋ Drop Media';
        clip.appendChild(empty);
      }

      // Duration label
      const dur = document.createElement('div');
      dur.className = 'tl-clip-dur';
      dur.textContent = scene.duration >= 0.8 ? `${scene.duration.toFixed(1)}s` : `${Math.round(scene.duration * 1000)}ms`;
      clip.appendChild(dur);

      const leftHandle=document.createElement('i'),rightHandle=document.createElement('i');leftHandle.className='v1-trim-handle left';rightHandle.className='v1-trim-handle right';leftHandle.title='Trim V1 clip start';rightHandle.title='Trim or stretch V1 clip duration';clip.append(leftHandle,rightHandle);
      const startResize=(event,edge)=>{event.preventDefault();event.stopPropagation();suppressClipClick=false;highlightClip(i);window.App?.selectClip?.(i);window.ProTimeline?.selectLegacyClip?.(i);window.ProTimeline?.beginLegacyResize?.(`Resize V1 clip #${i+1}`);const startX=event.clientX,original=scene.duration,move=e=>{if(Math.abs(e.clientX-startX)>2)suppressClipClick=true;const delta=(e.clientX-startX)/PX_PER_SEC,wanted=edge==='left'?original-delta:original+delta;window.ProTimeline?.resizeLegacyClip?.(i,wanted,edge,document.getElementById('sel-v1-edit-mode')?.value||'gap');},finish=()=>{window.removeEventListener('pointermove',move);window.ProTimeline?.endLegacyResize?.();setTimeout(()=>suppressClipClick=false,0);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});};
      leftHandle.addEventListener('pointerdown',event=>startResize(event,'left'));rightHandle.addEventListener('pointerdown',event=>startResize(event,'right'));

      const keyTimes = new Set();
      Object.values(scene.keyframes || {}).flat().forEach(key => {
        const time = Number(key?.time);
        if (Number.isFinite(time) && time >= 0 && time <= scene.duration) keyTimes.add(time.toFixed(3));
      });
      keyTimes.forEach(time => {
        const marker = document.createElement('b');
        marker.className = 'tl-keyframe-marker';
        marker.style.left = `${Math.max(0, Math.min(100, Number(time) / Math.max(.001, scene.duration) * 100))}%`;
        marker.title = `Keyframe at ${Number(time).toFixed(2)}s`;
        clip.appendChild(marker);
      });

      const selectThisClip = () => {
        if (suppressClipClick) return;
        highlightClip(i);
        window.App?.selectClip?.(i);
        window.ProTimeline?.selectLegacyClip?.(i);
      };
      clip.addEventListener('pointerdown', e => {
        if (e.button !== 0 || e.isPrimary === false) return;
        // The V1 track owns pointerdown for CTI scrubbing. A direct clip press
        // is selection, so do not let the parent reinterpret it as a scrub.
        e.stopPropagation();
        selectThisClip();
      });
      clip.addEventListener('click', e => {
        // Preserve keyboard and programmatic click support. Physical clicks may
        // select twice (pointerdown + click); selection is intentionally idempotent.
        e.stopPropagation();
        selectThisClip();
      });
      clip.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        selectThisClip();
      });

      clip.addEventListener('dragover',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('application/x-cipher-media')||Array.from(e.dataTransfer?.types||[]).includes('application/x-cipher-stock')||e.dataTransfer?.files?.length){e.preventDefault();e.dataTransfer.dropEffect='copy';clip.classList.add('media-drag-over');}});
      clip.addEventListener('dragleave',()=>clip.classList.remove('media-drag-over'));
      clip.addEventListener('drop',async e=>{e.preventDefault();e.stopPropagation();clip.classList.remove('media-drag-over');let assetId=e.dataTransfer.getData('application/x-cipher-media')||e.dataTransfer.getData('text/plain');const stockId=e.dataTransfer.getData('application/x-cipher-stock');if(stockId){const asset=await window.StockMedia?.ensureImported?.(stockId);assetId=asset?.id||'';}if(assetId)window.ProTimeline?.replaceLegacyScene?.(i,assetId);else if(e.dataTransfer.files?.length)window.ProTimeline?.replaceLegacyFiles?.(i,Array.from(e.dataTransfer.files));});

      videoTrack.appendChild(clip);

      // Cut diamond (at start of each scene except first)
      if (i > 0) {
        const cut = document.createElement('div');
        cut.className = 'tl-cut';
        cut.style.left = clipL + 'px';
        cut.dataset.cutIdx = i;
        cut.title = `Cut at ${formatTime(scene.startSec)} (${scene.transition || 'crossfade'})`;

        if (selectedCut === i) {
          cut.style.background = '#818cf8';
        }

        cut.addEventListener('click', e => {
          e.stopPropagation();
          selectCut(i);
        });

        videoTrack.appendChild(cut);
      }
    });
  }

  // ── Highlight active clip ─────────────────────────────────
  function highlightClip(idx) {
    if (!videoTrack) return;
    highlightedClip = idx;
    videoTrack.querySelectorAll('.tl-clip').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      el.setAttribute('aria-selected', String(i === idx));
    });
  }

  function highlightPlaybackClip(idx) {
    if (!videoTrack || idx === playbackClip) return;
    playbackClip = idx;
    videoTrack.querySelectorAll('.tl-clip').forEach((el, i) => el.classList.toggle('playback-active', i === idx));
  }

  function clearSelection() {
    highlightClip(-1);
    selectCut(-1);
  }

  // ── Select cut ────────────────────────────────────────────
  function selectCut(idx) {
    selectedCut = idx;
    videoTrack?.querySelectorAll('.tl-cut').forEach(el => {
      el.style.background = parseInt(el.dataset.cutIdx) === idx ? '#818cf8' : 'var(--bg)';
    });
  }

  // ── Waveform ─────────────────────────────────────────────
  function buildWaveform() {
    if (!waveCanvas) return;
    const totalW = Math.max(duration * PX_PER_SEC, wrap?.clientWidth || 800);
    waveCanvas.style.width = totalW + 'px';
    window.WaveformDrawer.draw(totalW, duration);
  }

  // ── Update playhead position ──────────────────────────────
  function updatePlayhead(currentTime, autoScroll = true) {
    const playhead = document.getElementById('tl-playhead');
    if (!playhead) return;
    const x = LABEL_WIDTH + currentTime * PX_PER_SEC;
    playhead.style.transform = `translateX(${x}px)`;
    playhead.style.height = `${Math.max(wrap?.clientHeight || 0, wrap?.scrollHeight || 0)}px`;

    // Auto-scroll to keep playhead visible while playing
    if (autoScroll && !isScrubbing && wrap) {
      const wrapW  = wrap.clientWidth;
      const scroll = wrap.scrollLeft;
      if (x < scroll + 40 || x > scroll + wrapW - 40) {
        wrap.scrollLeft = Math.max(0, x - wrapW / 2);
      }
    }

    // Highlight active clip
    const idx = window.Preview?.getCurrentSceneIndex ? window.Preview.getCurrentSceneIndex() : 0;
    highlightPlaybackClip(idx);

    // Update bottom toolbar time badge
    if (tlTimeBadge) {
      tlTimeBadge.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    }
  }

  // ── Update cut transitions ────────────────────────────────
  function updateCutTransition(cutIdx, trType) {
    if (cutIdx > 0 && cutIdx <= scenes.length - 1) {
      scenes[cutIdx].transition = trType;
    }
  }

  function applyTransitionToAll(trType) {
    scenes.forEach((s, i) => { if (i > 0) s.transition = trType; });
  }

  // ── Format seconds → mm:ss.s ──────────────────────────────
  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
  }

  function getSelectedCut() { return selectedCut; }
  function getPxPerSec() { return PX_PER_SEC; }

  return {
    init,
    build,
    setZoom,
    zoomIn,
    zoomOut,
    zoomFit,
    getPxPerSec,
    updatePlayhead,
    updateCutTransition,
    applyTransitionToAll,
    getSelectedCut
    ,selectClip: highlightClip
    ,clearSelection
  };
})();
