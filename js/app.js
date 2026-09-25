/* ============================================================
   APP.JS — Studio Controller & State Management
   ============================================================ */

window.App = (function () {

  // ── Global State ──────────────────────────────────────────
  let scenes    = [];
  let captions  = [];
  let duration  = 0;

  document.addEventListener('DOMContentLoaded', async () => {
    // Init theme
    initTheme();

    // Init modules
    Uploader.init();
    WaveformDrawer.init();
    Timeline.init();
    Preview.init();
    window.ProTimeline?.init();
    window.History?.init();
    initTransitionGrid();
    initFxGrid();
    initCaptionPresetsGrid();

    // Wire settings & hotkeys
    wireSettings();
    wireShortcuts();
    wireNavigation();
    wireCollapsibleSections();
    wireCaptionPosControls();
    initCapCutTabs();
    window.ToolsHub?.init();

    // Init Projects DB & Auto-Restore Active Session
    if (window.Projects) {
      await window.Projects.init();
      await window.Projects.autoRestoreActive();
    }
  });

  // ── Build timeline from uploaded assets ───────────────────
  async function buildTimeline() {
    const audioData = Uploader.getAudio();
    const slots     = Uploader.getImages();

    if (!slots.length) return;

    // Sync homepage config selections to editor panel
    const homeAspect = document.getElementById('home-sel-aspect')?.value;
    const homeTrans  = document.getElementById('home-sel-transition')?.value;
    const homeMotion = document.getElementById('home-sel-motion')?.value;
    const homeFx     = document.getElementById('home-sel-fx')?.value;

    if (homeAspect) document.getElementById('sel-aspect').value = homeAspect;
    if (homeMotion) document.getElementById('sel-motion-preset').value = homeMotion;
    if (homeFx) {
      const selFx = document.getElementById('sel-fx-preset');
      if (selFx) selFx.value = homeFx;
      document.querySelectorAll('.fx-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.fx === homeFx);
      });
    }
    if (homeTrans) {
      document.querySelectorAll('.tr-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tr === homeTrans);
      });
      const activeBtn = document.querySelector(`.tr-btn[data-tr="${homeTrans}"]`);
      if (activeBtn) {
        const name = activeBtn.querySelector('.tr-card-title')?.textContent || window.Transitions?.LABELS?.[homeTrans] || homeTrans;
        document.getElementById('btn-apply-all').textContent = `Apply "${name}" to all cuts`;
      }
    }

    // Switch screen to editor
    showScreen('screen-editor');

    // Wait for layout calculation
    await new Promise(r => requestAnimationFrame(r));

    // Determine total duration
    if (audioData) {
      showStatus('Decoding audio waveform…');
      await WaveformDrawer.decode(audioData);
      duration = WaveformDrawer.getDuration();
      Preview.setAudio(audioData.url);
    } else {
      const last = slots[slots.length - 1];
      duration = last.seconds + 4;
    }

    const globalTr = getSelectedTransition();

    // Load scenes & await all images in memory
    scenes = await Preview.loadScenes(slots, duration, globalTr);

    // Build timeline UI
    Timeline.build(scenes, duration);
    window.ProTimeline?.attachLegacy(scenes, duration, { reset: true });

    // Apply global transition to all cuts initially if set
    if (homeTrans) {
      Timeline.applyTransitionToAll(homeTrans);
    }

    // Update metadata & UI badges
    updateMeta();
    const clipBadge = document.getElementById('top-clip-count');
    if (clipBadge) clipBadge.textContent = `${scenes.length} Clips Synchronized`;

    // Playback sync callback
    Preview.setOnTimeUpdate((t, playing) => {
      updateTimeDisplay(t);
      Timeline.updatePlayhead(t);
      window.ProTimeline?.syncMedia(t, playing);
    });

    // Render frame 0
    Preview.seek(0);
    showStatus('');
    selectClip(0);

    localStorage.setItem('cipher_active_screen', 'screen-editor');
    window.Projects?.scheduleAutoSave();
  }

  // ── Restore State from Saved Project ───────────────────────
  function restoreState(loadedScenes, loadedDuration) {
    scenes = loadedScenes || [];
    duration = loadedDuration || 0;
    updateMeta();
    const clipBadge = document.getElementById('top-clip-count');
    if (clipBadge) clipBadge.textContent = `${scenes.length} Clips Synchronized`;

    Preview.setOnTimeUpdate((t, playing) => {
      updateTimeDisplay(t);
      Timeline.updatePlayhead(t);
      window.ProTimeline?.syncMedia(t, playing);
    });

    Preview.seek(0);
    showStatus('');
    selectClip(0);
  }

  // ── Wire Settings Panel ───────────────────────────────────
  let selectedClipIndex = 0;
  let lastAudioVol = 100;

  function selectClip(index) {
    if (index < 0 || !scenes.length) return;
    selectedClipIndex = Math.max(0, Math.min(scenes.length - 1, index));
    const scene = scenes[selectedClipIndex];
    if (!scene) return;
    const badge = document.getElementById('badge-selected-clip');
    if (badge) badge.textContent = `Clip #${selectedClipIndex + 1}`;

    const hint = document.getElementById('lbl-clip-transform-hint');
    if (hint && scene.name) hint.textContent = `Adjust zoom & X/Y for Clip #${selectedClipIndex + 1} (${scene.name})`;

    const slScale = document.getElementById('sl-clip-scale');
    const lblScale = document.getElementById('lbl-clip-scale');
    const curScale = (scene.scale !== undefined && !isNaN(scene.scale)) ? scene.scale : 1.0;
    if (slScale) slScale.value = curScale;
    if (lblScale) lblScale.textContent = Math.round(curScale * 100) + '%';

    const slX = document.getElementById('sl-clip-x');
    const lblX = document.getElementById('lbl-clip-x');
    const curX = (scene.posX !== undefined && !isNaN(scene.posX)) ? scene.posX : 0;
    if (slX) slX.value = curX;
    if (lblX) lblX.textContent = (curX > 0 ? `+${curX}` : curX) + '%';

    const slY = document.getElementById('sl-clip-y');
    const lblY = document.getElementById('lbl-clip-y');
    const curY = (scene.posY !== undefined && !isNaN(scene.posY)) ? scene.posY : 0;
    if (slY) slY.value = curY;
    if (lblY) lblY.textContent = (curY > 0 ? `+${curY}` : curY) + '%';

    const slRot = document.getElementById('sl-clip-rot');
    const lblRot = document.getElementById('lbl-clip-rot');
    const curRot = (scene.rotation !== undefined && !isNaN(scene.rotation)) ? scene.rotation : 0;
    if (slRot) slRot.value = curRot;
    if (lblRot) lblRot.textContent = (curRot > 0 ? `+${curRot}` : curRot) + '°';
  }

  function wireSettings() {
    // Play / Pause
    const btnPlay = document.getElementById('btn-play');
    btnPlay.addEventListener('click', togglePlay);

    // Loop toggle
    const btnLoop = document.getElementById('btn-loop');
    btnLoop.addEventListener('click', () => {
      const on = btnLoop.classList.toggle('active');
      Preview.setLooping(on);
    });

    // Reset / Rewind
    document.getElementById('btn-reset').addEventListener('click', () => {
      Preview.reset();
      btnPlay.textContent = '▶';
      btnPlay.classList.remove('playing');
    });

    // Audio Volume Control & Mute
    const slVol   = document.getElementById('sl-audio-volume');
    const lblVol  = document.getElementById('lbl-audio-volume');
    const btnMute = document.getElementById('btn-audio-mute');

    slVol?.addEventListener('input', () => {
      const v = parseFloat(slVol.value);
      if (lblVol) lblVol.textContent = v + '%';
      if (btnMute) btnMute.textContent = v === 0 ? '🔇' : (v > 100 ? '🔊' : '🔉');
      Preview.setVolume(v / 100);
    });

    slVol?.addEventListener('change', () => {
      window.History?.push('Audio Volume Changed');
    });

    btnMute?.addEventListener('click', () => {
      if (!slVol) return;
      const currentVal = parseFloat(slVol.value);
      if (currentVal > 0) {
        lastAudioVol = currentVal;
        slVol.value = 0;
        if (lblVol) lblVol.textContent = '0%';
        btnMute.textContent = '🔇';
        Preview.setVolume(0);
      } else {
        const restoreVal = lastAudioVol || 100;
        slVol.value = restoreVal;
        if (lblVol) lblVol.textContent = restoreVal + '%';
        btnMute.textContent = (restoreVal > 100) ? '🔊' : '🔉';
        Preview.setVolume(restoreVal / 100);
      }
      window.History?.push('Audio Mute Toggled');
    });

    // ── Per-Clip Transform Sliders & Buttons ───────────────────
    const slClipScale  = document.getElementById('sl-clip-scale');
    const lblClipScale = document.getElementById('lbl-clip-scale');
    slClipScale?.addEventListener('input', () => {
      const v = parseFloat(slClipScale.value);
      if (window.ProTimeline?.setSelectedVisualProperty?.('scale', v, 'input')) { if (lblClipScale) lblClipScale.textContent = Math.round(v * 100) + '%'; return; }
      if (!scenes[selectedClipIndex]) return;
      scenes[selectedClipIndex].scale = v;
      if (lblClipScale) lblClipScale.textContent = Math.round(v * 100) + '%';
      Preview.renderFrame();
    });
    slClipScale?.addEventListener('change', () => {
      if (window.ProTimeline?.setSelectedVisualProperty?.('scale', parseFloat(slClipScale.value), 'change')) return;
      window.History?.push(`Clip #${selectedClipIndex + 1} Zoom Changed`);
    });

    const slClipX  = document.getElementById('sl-clip-x');
    const lblClipX = document.getElementById('lbl-clip-x');
    slClipX?.addEventListener('input', () => {
      const v = parseFloat(slClipX.value);
      if (window.ProTimeline?.setSelectedVisualProperty?.('x', v, 'input')) { if (lblClipX) lblClipX.textContent = (v > 0 ? `+${v}` : v) + '%'; return; }
      if (!scenes[selectedClipIndex]) return;
      scenes[selectedClipIndex].posX = v;
      if (lblClipX) lblClipX.textContent = (v > 0 ? `+${v}` : v) + '%';
      Preview.renderFrame();
    });
    slClipX?.addEventListener('change', () => {
      if (window.ProTimeline?.setSelectedVisualProperty?.('x', parseFloat(slClipX.value), 'change')) return;
      window.History?.push(`Clip #${selectedClipIndex + 1} Position X Changed`);
    });

    const slClipY  = document.getElementById('sl-clip-y');
    const lblClipY = document.getElementById('lbl-clip-y');
    slClipY?.addEventListener('input', () => {
      const v = parseFloat(slClipY.value);
      if (window.ProTimeline?.setSelectedVisualProperty?.('y', v, 'input')) { if (lblClipY) lblClipY.textContent = (v > 0 ? `+${v}` : v) + '%'; return; }
      if (!scenes[selectedClipIndex]) return;
      scenes[selectedClipIndex].posY = v;
      if (lblClipY) lblClipY.textContent = (v > 0 ? `+${v}` : v) + '%';
      Preview.renderFrame();
    });
    slClipY?.addEventListener('change', () => {
      if (window.ProTimeline?.setSelectedVisualProperty?.('y', parseFloat(slClipY.value), 'change')) return;
      window.History?.push(`Clip #${selectedClipIndex + 1} Position Y Changed`);
    });

    const slClipRot  = document.getElementById('sl-clip-rot');
    const lblClipRot = document.getElementById('lbl-clip-rot');
    slClipRot?.addEventListener('input', () => {
      const v = parseFloat(slClipRot.value);
      if (window.ProTimeline?.setSelectedVisualProperty?.('rotation', v, 'input')) { if (lblClipRot) lblClipRot.textContent = (v > 0 ? `+${v}` : v) + '°'; return; }
      if (!scenes[selectedClipIndex]) return;
      scenes[selectedClipIndex].rotation = v;
      if (lblClipRot) lblClipRot.textContent = (v > 0 ? `+${v}` : v) + '°';
      Preview.renderFrame();
    });
    slClipRot?.addEventListener('change', () => {
      if (window.ProTimeline?.setSelectedVisualProperty?.('rotation', parseFloat(slClipRot.value), 'change')) return;
      window.History?.push(`Clip #${selectedClipIndex + 1} Rotation Changed`);
    });

    // Reset button for selected clip
    document.getElementById('btn-reset-clip-transform')?.addEventListener('click', () => {
      if (window.ProTimeline?.resetSelectedVisualTransform?.()) return;
      if (!scenes[selectedClipIndex]) return;
      scenes[selectedClipIndex].scale    = 1.0;
      scenes[selectedClipIndex].posX     = 0;
      scenes[selectedClipIndex].posY     = 0;
      scenes[selectedClipIndex].rotation = 0;
      selectClip(selectedClipIndex);
      Preview.renderFrame();
      window.History?.push(`Reset Transform for Clip #${selectedClipIndex + 1}`);
    });

    // Apply to All Images button
    document.getElementById('btn-apply-transform-all')?.addEventListener('click', () => {
      if (!scenes.length || !scenes[selectedClipIndex]) return;
      const curScale = scenes[selectedClipIndex].scale !== undefined ? scenes[selectedClipIndex].scale : 1.0;
      const curPosX  = scenes[selectedClipIndex].posX !== undefined ? scenes[selectedClipIndex].posX : 0;
      const curPosY  = scenes[selectedClipIndex].posY !== undefined ? scenes[selectedClipIndex].posY : 0;
      const curRot   = scenes[selectedClipIndex].rotation !== undefined ? scenes[selectedClipIndex].rotation : 0;

      scenes.forEach(s => {
        s.scale    = curScale;
        s.posX     = curPosX;
        s.posY     = curPosY;
        s.rotation = curRot;
      });

      Preview.renderFrame();
      window.History?.push('Applied Transform to All Images');
    });

    // Aspect Ratio
    document.getElementById('sel-aspect').addEventListener('change', e => {
      updateMeta();
      Preview.resize();
      Preview.renderFrame();
      window.History?.push('Aspect Ratio Changed');
    });

    // FPS & Quality Change
    document.getElementById('sel-fps')?.addEventListener('change', () => {
      window.History?.push('FPS Changed');
    });
    document.getElementById('sel-quality')?.addEventListener('change', () => {
      window.History?.push('Quality Changed');
    });

    // Motion Preset dropdown
    document.getElementById('sel-motion-preset').addEventListener('change', e => {
      Preview.setMotionPreset(e.target.value);
      Preview.renderFrame();
      window.History?.push('Motion Preset Changed');
    });

    // Motion toggle
    document.getElementById('chk-motion').addEventListener('change', () => {
      Preview.renderFrame();
    });

    // Visual Atmosphere FX Presets
    document.getElementById('sel-fx-preset')?.addEventListener('change', () => {
      Preview.renderFrame();
      window.History?.push('FX Atmosphere Changed');
    });

    document.getElementById('chk-letterbox')?.addEventListener('change', () => {
      Preview.renderFrame();
      window.History?.push('Letterbox Toggle Changed');
    });

    document.getElementById('chk-particles')?.addEventListener('change', () => {
      Preview.renderFrame();
      window.History?.push('Particles Toggle Changed');
    });

    sliderWithLabel('sl-fx-intensity', 'lbl-fx-intensity', v => Math.round(parseFloat(v) * 100) + '%');

    // Fade and Motion sliders
    sliderWithLabel('sl-fadein',  'lbl-fadein',  v => parseFloat(v).toFixed(1) + 's');
    sliderWithLabel('sl-fadeout', 'lbl-fadeout', v => parseFloat(v).toFixed(1) + 's');
    sliderWithLabel('sl-trdur',   'lbl-trdur',   v => parseFloat(v).toFixed(2) + 's');
    sliderWithLabel('sl-motion',  'lbl-motion',  v => parseFloat(v).toFixed(2));

    // Transitions Grid buttons
    document.getElementById('transition-grid').addEventListener('click', e => {
      const btn = e.target.closest('.tr-btn');
      if (!btn) return;

      document.querySelectorAll('.tr-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const trType = btn.dataset.tr;
      const name = btn.querySelector('.tr-card-title')?.textContent || window.Transitions?.LABELS?.[trType] || trType;
      document.getElementById('btn-apply-all').textContent = `Apply "${name}" to all cuts`;

      const cut = Timeline.getSelectedCut();
      if (cut >= 0) {
        Timeline.updateCutTransition(cut, trType);
      }
      Preview.renderFrame();
      window.History?.push(`Transition "${name}" Selected`);
    });

    // Apply transition to all cuts
    document.getElementById('btn-apply-all').addEventListener('click', () => {
      const trType = getSelectedTransition();
      Timeline.applyTransitionToAll(trType);
      scenes.forEach((s, i) => { if (i > 0) s.transition = trType; });
      Preview.renderFrame();
      window.History?.push(`Applied Transition to All Cuts`);
    });

    // Captions Toggle & Presets
    document.getElementById('chk-captions')?.addEventListener('change', () => {
      Preview.renderFrame();
      window.History?.push('Captions Toggle Changed');
    });

    const selPreset   = document.getElementById('sel-caption-preset');
    const selFont     = document.getElementById('sel-caption-font');
    const colText     = document.getElementById('col-caption-text');
    const lblColor    = document.getElementById('lbl-caption-color');
    const colHl       = document.getElementById('col-caption-highlight');
    const lblHlColor  = document.getElementById('lbl-caption-hlcolor');
    const colStroke   = document.getElementById('col-caption-stroke');
    const lblStColor  = document.getElementById('lbl-caption-stcolor');
    const colGlow     = document.getElementById('col-caption-glow');
    const lblGlColor  = document.getElementById('lbl-caption-glcolor');
    const selLineAnim = document.getElementById('sel-caption-line-anim');
    const selAnim     = document.getElementById('sel-caption-anim');
    const selCase     = document.getElementById('sel-caption-case');

    selPreset?.addEventListener('change', (e) => {
      const key = e.target.value;
      const p = window.CaptionStyles?.PRESETS?.[key];
      if (p) {
        if (selFont && p.font) selFont.value = p.font;
        if (colText && p.baseCol) { colText.value = p.baseCol; if (lblColor) lblColor.textContent = p.baseCol; }
        if (colHl && p.highlightCol) { colHl.value = p.highlightCol; if (lblHlColor) lblHlColor.textContent = p.highlightCol; }
        if (colStroke && p.strokeCol) { colStroke.value = p.strokeCol; if (lblStColor) lblStColor.textContent = p.strokeCol; }
        if (colGlow && p.glowCol) { colGlow.value = p.glowCol; if (lblGlColor) lblGlColor.textContent = p.glowCol; }
        if (selAnim && p.anim) selAnim.value = p.anim;
        const slStroke = document.getElementById('sl-caption-stroke');
        if (slStroke && p.strokeWidth !== undefined) {
          slStroke.value = p.strokeWidth;
          const lbl = document.getElementById('lbl-caption-stroke');
          if (lbl) lbl.textContent = p.strokeWidth + 'px';
        }
        const slGlow = document.getElementById('sl-caption-glow');
        if (slGlow && p.glowBlur !== undefined) {
          slGlow.value = p.glowBlur;
          const lbl = document.getElementById('lbl-caption-glow');
          if (lbl) lbl.textContent = p.glowBlur + 'px';
        }
      }
      Preview.renderFrame();
      window.History?.push('Caption Style Preset Changed');
    });

    selFont?.addEventListener('change', () => { Preview.renderFrame(); window.History?.push('Caption Font Changed'); });
    selLineAnim?.addEventListener('change', () => { Preview.renderFrame(); window.History?.push('Line Transition Changed'); });
    selAnim?.addEventListener('change', () => { Preview.renderFrame(); window.History?.push('Word Animation Changed'); });
    selCase?.addEventListener('change', () => { Preview.renderFrame(); window.History?.push('Caption Case Changed'); });

    colText?.addEventListener('input', (e) => {
      if (lblColor) lblColor.textContent = e.target.value.toUpperCase();
      Preview.renderFrame();
    });
    colText?.addEventListener('change', () => window.History?.push('Caption Text Color Changed'));

    colHl?.addEventListener('input', (e) => {
      if (lblHlColor) lblHlColor.textContent = e.target.value.toUpperCase();
      Preview.renderFrame();
    });
    colHl?.addEventListener('change', () => window.History?.push('Highlight Color Changed'));

    colStroke?.addEventListener('input', (e) => {
      if (lblStColor) lblStColor.textContent = e.target.value.toUpperCase();
      Preview.renderFrame();
    });
    colStroke?.addEventListener('change', () => window.History?.push('Caption Stroke Color Changed'));

    colGlow?.addEventListener('input', (e) => {
      if (lblGlColor) lblGlColor.textContent = e.target.value.toUpperCase();
      Preview.renderFrame();
    });
    colGlow?.addEventListener('change', () => window.History?.push('Caption Glow Color Changed'));

    sliderWithLabel('sl-caption-stroke', 'lbl-caption-stroke', v => v + 'px');
    sliderWithLabel('sl-caption-glow', 'lbl-caption-glow', v => v + 'px');
    sliderWithLabel('sl-caption-shadow', 'lbl-caption-shadow', v => v + 'px');
    sliderWithLabel('sl-caption-size', 'lbl-caption-size', v => Math.round(parseFloat(v) * 100) + '%');

    document.getElementById('sel-caption-lines')?.addEventListener('change', () => {
      Preview.renderFrame();
      window.History?.push('Caption Lines Count Changed');
    });

    sliderWithLabel('sl-caption-words-line', 'lbl-caption-words-line', v => {
      const num = parseInt(v, 10);
      return num === 0 ? 'Auto' : (num === 1 ? '1 Word' : num + ' Words');
    });

    sliderWithLabel('sl-caption-word-space', 'lbl-caption-word-space', v => {
      const num = parseInt(v, 10);
      return (num > 0 ? '+' : '') + num + 'px';
    });

    sliderWithLabel('sl-caption-line-space', 'lbl-caption-line-space', v => {
      return parseFloat(v).toFixed(2) + 'x';
    });

    // Caption Upload & Clear
    document.getElementById('btn-caption').addEventListener('click', () => {
      document.getElementById('input-caption').click();
    });
    document.getElementById('input-caption').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) parseCaptionFile(f);
    });
    document.getElementById('btn-studio-generate-captions')?.addEventListener('click', generateStudioCaptions);

    document.getElementById('btn-caption-clear')?.addEventListener('click', () => {
      captions = [];
      document.getElementById('input-caption').value = '';
      document.getElementById('caption-status-box')?.classList.add('hidden');
      Preview.renderFrame();
      window.History?.push('Captions Cleared');
    });

    // Render MP4
    document.getElementById('btn-render').addEventListener('click', startRender);

    // Cancel Render
    document.getElementById('btn-cancel-render').addEventListener('click', () => {
      Exporter.cancel();
      document.getElementById('render-modal').classList.add('hidden');
    });

    // Random transitions toggle
    document.getElementById('chk-random').addEventListener('change', () => {
      Preview.renderFrame();
    });
  }

  async function generateStudioCaptions() {
    const button = document.getElementById('btn-studio-generate-captions');
    const status = document.getElementById('studio-caption-generate-status');
    const audio = window.Uploader?.getAudio?.();
    if (!audio) {
      alert('Load a voiceover/audio track in Cipher Studio before generating captions.');
      return;
    }
    const groqKey = window.AI?.getKeys?.().groq || '';
    if (!groqKey) {
      alert('Add your Groq API key in AI Keys before generating Studio captions.');
      window.ToolsHub?.openSettingsModal?.();
      return;
    }

    button.disabled = true;
    status?.classList.remove('hidden');
    const update = (message, percent) => {
      const suffix = Number.isFinite(Number(percent)) ? ` • ${Math.round(Number(percent))}%` : '';
      if (status) status.textContent = `${message}${suffix}`;
      button.textContent = `⏳ ${message}${suffix}`;
    };

    try {
      update('Preparing voiceover', 2);
      let media = audio.file;
      const sourceName = audio.name || media?.name || 'voiceover.mp3';
      if (!media?.size && audio.url) media = await fetch(audio.url).then(response => response.blob());
      if (!media?.size) throw new Error('The loaded voiceover file is unavailable. Please load it again.');
      if (!(media instanceof File) || !media.name) media = new File([media], sourceName, { type: media.type || 'audio/mpeg' });

      const selectedWords = Number(document.getElementById('sl-caption-words-line')?.value || 0);
      const result = await window.AI.transcribeAudio(media, {
        requiredProvider: 'groq',
        language: '',
        responseFormat: 'srt',
        timestampStyle: 'word',
        wordsPerLine: selectedWords > 0 ? selectedWords : 4,
        maxCharsPerLine: 42,
        onProgress: progress => update(progress.message || 'Generating captions with Groq', progress.percent)
      });
      const generated = (result.cues || []).map(cue => ({
        start: Math.max(0, Number(cue.start) || 0),
        end: Math.max((Number(cue.start) || 0) + .05, Number(cue.end) || 0),
        text: String(cue.text || '').trim(),
        words: Array.isArray(cue.words) ? cue.words : []
      })).filter(cue => cue.text);
      if (!generated.length) throw new Error('Groq returned no usable spoken captions for this audio.');

      setCaptions(generated);
      const enabled = document.getElementById('chk-captions');
      if (enabled) enabled.checked = true;
      window.History?.push('Captions Generated with Groq');
      const engine = result.detectedLanguage ? `${result.engine} • ${result.detectedLanguage}` : result.engine;
      if (status) status.textContent = `✓ ${generated.length} captions generated${engine ? ` • ${engine}` : ''}`;
      button.textContent = `✓ ${generated.length} Captions Generated`;
      setTimeout(() => { if (!button.disabled) button.textContent = '⚡ Generate Captions with Groq'; }, 2500);
    } catch (error) {
      console.error('[Studio Groq Captions]', error);
      if (status) status.textContent = `Generation failed: ${error.message || error}`;
      alert('Caption generation failed: ' + (error.message || error));
    } finally {
      button.disabled = false;
      if (!button.textContent.startsWith('✓')) button.textContent = '⚡ Generate Captions with Groq';
    }
  }

  function togglePlay() {
    const btnPlay = document.getElementById('btn-play');
    if (Preview.getIsPlaying()) {
      Preview.pause();
      btnPlay.textContent = '▶';
      btnPlay.classList.remove('playing');
    } else {
      Preview.play();
      btnPlay.textContent = '⏸';
      btnPlay.classList.add('playing');
    }
  }

  // ── Keyboard Shortcuts ────────────────────────────────────
  function wireShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        Preview.seek(Preview.getCurrentTime() - 1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        Preview.seek(Preview.getCurrentTime() + 1);
      } else if (e.code === 'Home') {
        e.preventDefault();
        Preview.reset();
      }
    });
  }

  // ── Navigation Back Button & Project Actions ───────────────
  function wireNavigation() {
    const btnBack = document.getElementById('btn-back');
    if (btnBack) {
      btnBack.addEventListener('click', async () => {
        Preview.pause();
        if (window.Projects) {
          await window.Projects.saveCurrentProject();
          window.Projects.setActiveProjectId(null);
        }
        localStorage.removeItem('cipher_active_project_id');
        localStorage.setItem('cipher_active_screen', 'screen-upload');
        
        // Reset homepage upload dropzones to fresh clean state
        if (window.Uploader) {
          window.Uploader.resetAll();
        }

        showScreen('screen-upload');
        
        if (window.Projects) {
          window.Projects.renderRecentProjectsGrid();
        }
      });
    }

    const btnNewProject = document.getElementById('btn-start-new-project');
    if (btnNewProject) {
      btnNewProject.addEventListener('click', () => {
        if (window.Projects) {
          window.Projects.startNewProject();
        }
      });
    }
  }

  // ── Theme Manager (Dark / Light Mode) ──────────────────────
  let currentTheme = 'dark';

  
  async function initTheme() {
    let saved = localStorage.getItem('cipher_theme') || 'dark';
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.cipher_theme) saved = data.cipher_theme;
      }
    } catch(e) {}
    
    currentTheme = saved;
    applyTheme(currentTheme);

    const btnHome   = document.getElementById('btn-theme-toggle-home');
    const btnEditor = document.getElementById('btn-theme-toggle-editor');

    btnHome?.addEventListener('click', toggleTheme);
    btnEditor?.addEventListener('click', toggleTheme);

    // Bind theme select buttons in settings modal
    document.querySelectorAll('.btn-theme-select').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const theme = e.target.dataset.theme;
        if (theme) {
          currentTheme = theme;
          applyTheme(theme);
          localStorage.setItem('cipher_theme', theme);
          try {
            await fetch('/api/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cipher_theme: theme })
            });
          } catch(e) {}
        }
      });
    });
  }

  async function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('cipher_theme', currentTheme);
    applyTheme(currentTheme);
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cipher_theme: currentTheme })
      });
    } catch(e) {}
  }


  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const isLight = theme === 'light';
    const icon = isLight ? '☀️' : '🌙';
    const text = isLight ? 'Light Mode' : 'Dark Mode';

    document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
      const iconEl = btn.querySelector('.theme-icon');
      const textEl = btn.querySelector('.theme-text');
      if (iconEl) iconEl.textContent = icon;
      if (textEl) textEl.textContent = text;
      btn.title = `Switch to ${isLight ? 'Dark' : 'Light'} Mode`;
    });

    // Re-render waveform if loaded
    if (scenes.length && window.WaveformDrawer?.getBuffer()) {
      window.WaveformDrawer.draw(document.getElementById('waveform-canvas')?.width || 800, duration);
    }
  }

  // ── Collapsible Sections (Minimize / Maximize) ─────────────
  function wireCollapsibleSections() {
    document.querySelectorAll('.collapsible-header').forEach(header => {
      header.addEventListener('click', (e) => {
        // If clicking directly on a toggle switch input or slider, do not collapse
        if (e.target.closest('.toggle-switch') || e.target.closest('input')) return;
        
        const section = header.closest('.panel-section');
        if (!section) return;
        section.classList.toggle('collapsed');
      });
    });
  }

  // ── Caption Position Controls (Slider & Presets) ───────────
  function wireCaptionPosControls() {
    const slY  = document.getElementById('sl-caption-y');
    const lblY = document.getElementById('lbl-caption-y');
    
    slY?.addEventListener('input', () => {
      if (lblY) lblY.textContent = slY.value + '%';
      document.querySelectorAll('.pos-preset-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.pos) === parseInt(slY.value));
      });
      Preview.renderFrame();
    });

    document.querySelectorAll('.pos-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pos = parseInt(btn.dataset.pos, 10);
        if (slY) slY.value = pos;
        if (lblY) lblY.textContent = pos + '%';
        document.querySelectorAll('.pos-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Preview.renderFrame();
      });
    });

    document.getElementById('sel-caption-align')?.addEventListener('change', () => {
      Preview.renderFrame();
    });
  }

  // ── CapCut Category Tabs Navigation ────────────────────────
  function initCapCutTabs() {
    const tabBtns = document.querySelectorAll('.nav-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.tab;
        if (!targetId) return;

        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.editor-tab-content').forEach(panel => {
          panel.classList.remove('active');
        });

        const targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }

        // Re-render thumbnails if entering visual grid tabs
        if (targetId === 'tab-transitions') {
          initTransitionGrid();
        } else if (targetId === 'tab-effects') {
          initFxGrid();
        } else if (targetId === 'tab-captions') {
          initCaptionPresetsGrid();
        }
      });
    });

    // Wire Direct Audio Replacement input
    document.getElementById('input-audio-direct')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file && window.Uploader) {
        window.Uploader.handleAudioFile(file);
        const nameEl = document.getElementById('audio-file-name');
        if (nameEl) nameEl.textContent = file.name;
      }
    });
  }

  // ── Transition Grid UI & Live Mini Previews ───────────────
  let hoveredTrCanvas = null;
  let hoverTrType = null;
  let hoverAnimStart = 0;
  let hoverRafId = null;

  function initTransitionGrid() {
    const grid = document.getElementById('transition-grid');
    if (!grid || !window.Transitions) return;

    grid.innerHTML = '';
    const types = window.Transitions.TYPES;
    const labels = window.Transitions.LABELS;

    types.forEach((type, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tr-btn ${idx === 0 ? 'active' : ''}`;
      btn.dataset.tr = type;

      const label = labels[type] || type;

      btn.innerHTML = `
        <div class="tr-thumb-wrap">
          <canvas class="tr-thumb-canvas" width="160" height="100"></canvas>
          <span class="tr-badge-diamond">💎</span>
        </div>
        <span class="tr-card-title">${label}</span>
      `;

      const cvs = btn.querySelector('canvas');
      // Draw initial mid-transition snapshot
      window.Transitions.renderThumbnail(cvs, type, 0.5);

      // On Hover: Play smooth live transition loop preview
      btn.addEventListener('mouseenter', () => {
        hoveredTrCanvas = cvs;
        hoverTrType = type;
        hoverAnimStart = performance.now();
        if (!hoverRafId) runHoverAnimation();
      });

      btn.addEventListener('mouseleave', () => {
        if (hoveredTrCanvas === cvs) {
          hoveredTrCanvas = null;
          hoverTrType = null;
          // Reset to mid-transition snapshot
          window.Transitions.renderThumbnail(cvs, type, 0.5);
        }
      });

      grid.appendChild(btn);
    });
  }

  function runHoverAnimation() {
    if (!hoveredTrCanvas || !hoverTrType) {
      hoverRafId = null;
      return;
    }
    const elapsed = (performance.now() - hoverAnimStart) / 1000;
    // 1.2 second smooth loop
    const loopT = (elapsed % 1.2) / 1.2;
    window.Transitions.renderThumbnail(hoveredTrCanvas, hoverTrType, loopT);
    hoverRafId = requestAnimationFrame(runHoverAnimation);
  }

  // ── Atmosphere & Noise FX Grid UI & Live Mini Previews ────
  let hoveredFxCanvas = null;
  let hoverFxType = null;
  let hoverFxAnimStart = 0;
  let hoverFxRafId = null;

  function initFxGrid() {
    const grid = document.getElementById('fx-grid');
    if (!grid || !window.VisualEffects) return;

    grid.innerHTML = '';
    const presets = window.VisualEffects.PRESETS;
    const currentVal = document.getElementById('sel-fx-preset')?.value || 'none';

    Object.keys(presets).forEach(key => {
      const p = presets[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `fx-btn ${key === currentVal ? 'active' : ''}`;
      btn.dataset.fx = key;

      btn.innerHTML = `
        <div class="fx-thumb-wrap">
          <canvas class="fx-thumb-canvas" width="160" height="100"></canvas>
          <span class="fx-badge-diamond">💎</span>
        </div>
        <span class="fx-card-title">${p.name}</span>
      `;

      const cvs = btn.querySelector('canvas');
      // Draw initial preview
      window.VisualEffects.renderThumbnail(cvs, key, 0);

      // On Hover: Play smooth live noise/grain/lighting animation
      btn.addEventListener('mouseenter', () => {
        hoveredFxCanvas = cvs;
        hoverFxType = key;
        hoverFxAnimStart = performance.now();
        if (!hoverFxRafId) runFxHoverAnimation();
      });

      btn.addEventListener('mouseleave', () => {
        if (hoveredFxCanvas === cvs) {
          hoveredFxCanvas = null;
          hoverFxType = null;
          // Reset to static thumbnail
          window.VisualEffects.renderThumbnail(cvs, key, 0);
        }
      });

      btn.addEventListener('click', () => {
        document.querySelectorAll('.fx-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const selFx = document.getElementById('sel-fx-preset');
        if (selFx) {
          selFx.value = key;
        }
        Preview.renderFrame();
      });

      grid.appendChild(btn);
    });
  }

  function runFxHoverAnimation() {
    if (!hoveredFxCanvas || !hoverFxType) {
      hoverFxRafId = null;
      return;
    }
    const elapsed = (performance.now() - hoverFxAnimStart) / 1000;
    window.VisualEffects.renderThumbnail(hoveredFxCanvas, hoverFxType, elapsed);
    hoverFxRafId = requestAnimationFrame(runFxHoverAnimation);
  }

  // ── Caption Style Presets Grid & Live Mini Previews ───────
  let hoveredCapCanvas = null;
  let hoverCapType = null;
  let hoverCapAnimStart = 0;
  let hoverCapRafId = null;

  function initCaptionPresetsGrid() {
    const grid = document.getElementById('caption-presets-grid');
    if (!grid || !window.CaptionStyles) return;

    grid.innerHTML = '';
    const presets = window.CaptionStyles.PRESETS;
    const currentVal = document.getElementById('sel-caption-preset')?.value || 'poppins_yellow';

    Object.keys(presets).forEach(key => {
      const p = presets[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cap-preset-card ${key === currentVal ? 'active' : ''}`;
      btn.dataset.preset = key;

      btn.innerHTML = `
        <div class="cap-thumb-wrap">
          <canvas class="cap-thumb-canvas" width="160" height="100"></canvas>
          <span class="cap-badge-diamond">💎</span>
        </div>
        <span class="cap-card-title">${p.name}</span>
      `;

      const cvs = btn.querySelector('canvas');
      // Draw initial static thumbnail
      window.CaptionStyles.renderThumbnail(cvs, key, 0);

      // On Hover: Play smooth kinetic bounce & glow micro-animation
      btn.addEventListener('mouseenter', () => {
        hoveredCapCanvas = cvs;
        hoverCapType = key;
        hoverCapAnimStart = performance.now();
        if (!hoverCapRafId) runCaptionHoverAnimation();
      });

      btn.addEventListener('mouseleave', () => {
        if (hoveredCapCanvas === cvs) {
          hoveredCapCanvas = null;
          hoverCapType = null;
          // Reset to static thumbnail
          window.CaptionStyles.renderThumbnail(cvs, key, 0);
        }
      });

      btn.addEventListener('click', () => {
        document.querySelectorAll('.cap-preset-card').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const selCap = document.getElementById('sel-caption-preset');
        if (selCap) {
          selCap.value = key;
          selCap.dispatchEvent(new Event('change'));
        }

        Preview.renderFrame();
      });

      grid.appendChild(btn);
    });
  }

  function runCaptionHoverAnimation() {
    if (!hoveredCapCanvas || !hoverCapType) {
      hoverCapRafId = null;
      return;
    }
    const elapsed = (performance.now() - hoverCapAnimStart) / 1000;
    window.CaptionStyles.renderThumbnail(hoveredCapCanvas, hoverCapType, elapsed);
    hoverCapRafId = requestAnimationFrame(runCaptionHoverAnimation);
  }

  function sliderWithLabel(sliderId, labelId, fmt) {
    const sl  = document.getElementById(sliderId);
    const lbl = document.getElementById(labelId);
    if (!sl || !lbl) return;
    lbl.textContent = fmt(sl.value);
    sl.addEventListener('input', () => {
      lbl.textContent = fmt(sl.value);
      Preview.renderFrame();
    });
    sl.addEventListener('change', () => {
      window.History?.push(sliderId);
    });
  }

  function getSelectedTransition() {
    const active = document.querySelector('.tr-btn.active');
    return active ? active.dataset.tr : 'crossfade';
  }

  function updateTimeDisplay(t) {
    document.getElementById('time-current').textContent = formatTimecode(t);
    document.getElementById('time-total').textContent   = formatTimecode(duration);
    const idx = Preview.getCurrentSceneIndex();
    document.getElementById('now-label').textContent    = `NOW image ${idx + 1} / ${scenes.length}`;
  }

  function updateMeta() {
    const resMap = {
      '16:9': [1920, 1080],
      '9:16': [1080, 1920],
      '1:1':  [1080, 1080],
      '4:3':  [1440, 1080],
    };
    const aspect = document.getElementById('sel-aspect').value;
    const [w, h] = resMap[aspect] || [1920, 1080];
    document.getElementById('meta-res').textContent  = `${w}×${h}`;
    document.getElementById('meta-imgs').textContent = scenes.length;
    document.getElementById('meta-len').textContent  = formatTimecode(duration);
    document.getElementById('time-total').textContent= formatTimecode(duration);
  }

  // ── Render MP4 ────────────────────────────────────────────
  function startRender() {
    if (!scenes.length) return;
    const modal = document.getElementById('render-modal');
    modal.classList.remove('hidden');

    const audioData = Uploader.getAudio();
    if (!audioData) {
      alert('Please import a voiceover audio file first.');
      modal.classList.add('hidden');
      return;
    }

    const resMap = {
      '16:9': [1920, 1080],
      '9:16': [1080, 1920],
      '1:1':  [1080, 1080],
      '4:3':  [1440, 1080],
    };
    const aspect = document.getElementById('sel-aspect').value;
    const [w, h] = resMap[aspect] || [1920, 1080];
    const fps    = parseInt(document.getElementById('sel-fps').value, 10);
    const trDur  = parseFloat(document.getElementById('sl-trdur').value);
    const fi     = parseFloat(document.getElementById('sl-fadein').value);
    const fo     = parseFloat(document.getElementById('sl-fadeout')?.value || 0.6);
    const motInt  = parseFloat(document.getElementById('sl-motion').value);
    const motOn   = document.getElementById('chk-motion')?.checked !== false;
    const motPre  = document.getElementById('sel-motion-preset')?.value || 'auto';
    const fxPre   = document.getElementById('sel-fx-preset')?.value || 'none';
    const fxInt   = parseFloat(document.getElementById('sl-fx-intensity')?.value || 0.75);
    const lbox    = document.getElementById('chk-letterbox')?.checked || false;
    const parts   = document.getElementById('chk-particles')?.checked || false;
    const qual    = document.getElementById('sel-quality')?.value || 'balanced';
    const capOn   = document.getElementById('chk-captions')?.checked !== false;
    const capPre  = document.getElementById('sel-caption-preset')?.value || 'poppins_yellow';
    const capFont = document.getElementById('sel-caption-font')?.value || 'Poppins';
    const capCol  = document.getElementById('col-caption-text')?.value || '#FFFFFF';
    const capHlCol= document.getElementById('col-caption-highlight')?.value || '#FFDE00';
    const capStCol= document.getElementById('col-caption-stroke')?.value || '#000000';
    const capStW  = parseFloat(document.getElementById('sl-caption-stroke')?.value || 4);
    const capGlCol= document.getElementById('col-caption-glow')?.value || '#FFDE00';
    const capGlB  = parseFloat(document.getElementById('sl-caption-glow')?.value || 8);
    const capShB  = parseFloat(document.getElementById('sl-caption-shadow')?.value || 6);
    const capAnim = document.getElementById('sel-caption-anim')?.value || 'karaoke_pop';
    const capLineAnim = document.getElementById('sel-caption-line-anim')?.value || 'fade_in';
    const capCase = document.getElementById('sel-caption-case')?.value || 'uppercase';
    const capPosY = parseFloat(document.getElementById('sl-caption-y')?.value || 83) / 100;
    const capAlign= document.getElementById('sel-caption-align')?.value || 'center';
    const capSize = parseFloat(document.getElementById('sl-caption-size')?.value || 1.0);
    const capLines = document.getElementById('sel-caption-lines')?.value || 'auto';
    const capWordsLine = parseInt(document.getElementById('sl-caption-words-line')?.value || '0', 10) || 0;
    const capWordSpace = parseFloat(document.getElementById('sl-caption-word-space')?.value || '0') || 0;
    const capLineSpace = parseFloat(document.getElementById('sl-caption-line-space')?.value || '1.30') || 1.30;

    Exporter.exportMP4(
      {
        scenes,
        audioUrl: audioData.url,
        audioFile: audioData.file,
        audioBlob: audioData.blob || (audioData.file instanceof Blob ? audioData.file : null),
        audioFileName: audioData.name || audioData.file?.name || 'voiceover.mp3',
        audioDuration: duration,
        fps,
        width: w,
        height: h,
        fadeIn: fi,
        fadeOut: fo,
        transitionDuration: trDur,
        motionEnabled: motOn,
        motionPreset: motPre,
        motionIntensity: motInt,
        fxPreset: fxPre,
        fxIntensity: fxInt,
        letterbox: lbox,
        particles: parts,
        quality: qual,
        captionsEnabled: capOn,
        captionPreset: capPre,
        captionFont: capFont,
        captionColor: capCol,
        captionHighlightColor: capHlCol,
        captionStrokeColor: capStCol,
        captionStrokeWidth: capStW,
        captionGlowColor: capGlCol,
        captionGlowBlur: capGlB,
        captionShadowBlur: capShB,
        captionAnimStyle: capAnim,
        captionLineAnim: capLineAnim,
        captionTextCase: capCase,
        captionPosY: capPosY,
        captionAlign: capAlign,
        captionScale: capSize,
        captionLinesCount: capLines,
        captionWordsPerLine: capWordsLine,
        captionWordSpacing: capWordSpace,
        captionLineSpacing: capLineSpace,
        audioVolume: parseFloat(document.getElementById('sl-audio-volume')?.value || 100),
        proTimelineEnabled: window.ProTimeline?.hasAnyClips?.() || false
      },
      (msg, pct) => {
        document.getElementById('modal-status').textContent = msg;
        document.getElementById('modal-fill').style.width   = pct + '%';
        document.getElementById('modal-pct').textContent    = pct + '%';
      },
      (url) => {
        modal.classList.add('hidden');
        Exporter.download(url, 'cipher-final-render.mp4');
      },
      (err) => {
        modal.classList.add('hidden');
        alert('Export failed: ' + (err.message || err));
      }
    );
  }

  // ── Caption Parsing ───────────────────────────────────────
  async function parseCaptionFile(file) {
    let text = await file.text();
    text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    captions = [];

    if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
      const blocks = text.split(/\n\s*\n+/);
      blocks.forEach(block => {
        if (block.includes('WEBVTT')) return;
        const lines = block.trim().split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) return;

        const timeLineIdx = lines.findIndex(l => l.includes('-->'));
        if (timeLineIdx === -1) return;

        const timeLine = lines[timeLineIdx];
        const match = timeLine.match(/(?:(\d+):)?(\d+):(\d+)[,.](\d+)\s*-->\s*(?:(\d+):)?(\d+):(\d+)[,.](\d+)/);
        if (!match) return;

        const startH = match[1] ? parseFloat(match[1]) : 0;
        const startM = parseFloat(match[2]);
        const startS = parseFloat(match[3]);
        const startMs = parseFloat(match[4].padEnd(3, '0').slice(0, 3));
        const start = startH * 3600 + startM * 60 + startS + startMs / 1000;

        const endH = match[5] ? parseFloat(match[5]) : 0;
        const endM = parseFloat(match[6]);
        const endS = parseFloat(match[7]);
        const endMs = parseFloat(match[8].padEnd(3, '0').slice(0, 3));
        let end = endH * 3600 + endM * 60 + endS + endMs / 1000;
        if (end <= start) end = start + 2.5;

        const textLines = lines.slice(timeLineIdx + 1);
        const cleanText = textLines.join(' ').replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').trim();
        if (cleanText) {
          captions.push({ start, end, text: cleanText });
        }
      });
    } else {
      const re = /\[(\d+):(\d+)\]\s*(.+?)(?=\[\d+:\d+\]|$)/gs;
      let m;
      while ((m = re.exec(text)) !== null) {
        const start = parseFloat(m[1])*60 + parseFloat(m[2]);
        captions.push({ start, end: start + 4, text: m[3].replace(/<[^>]*>/g, '').trim() });
      }
    }

    captions.sort((a, b) => a.start - b.start);

    const statusBox = document.getElementById('caption-status-box');
    const statusTxt = document.getElementById('caption-status-text');
    const list      = document.getElementById('caption-list');

    if (captions.length) {
      if (statusBox) statusBox.classList.remove('hidden');
      if (statusTxt) statusTxt.textContent = `✓ ${captions.length} Cues Loaded`;
      if (list) {
        list.innerHTML = captions.map((c, i) =>
          `<div class="caption-cue-item" data-start="${c.start}" style="cursor:pointer;" title="Click to seek to ${formatTimecode(c.start)}">
             <span class="cue-time">${formatTimecode(c.start)}</span> 
             <span>${c.text.substring(0, 36)}${c.text.length > 36 ? '…' : ''}</span>
           </div>`
        ).join('');

        list.querySelectorAll('.caption-cue-item').forEach(item => {
          item.addEventListener('click', () => {
            const startT = parseFloat(item.dataset.start);
            if (!isNaN(startT) && window.Preview) {
              window.Preview.seek(startT);
            }
          });
        });
      }
    } else {
      if (statusBox) statusBox.classList.add('hidden');
    }
    Preview.renderFrame();
    window.History?.push('Captions File Loaded');
  }

  function setScenes(newScenes, options = {}) {
    scenes = newScenes;
    if (Number.isFinite(Number(options.duration)) && Number(options.duration) > 0) {
      duration = Number(options.duration);
    }
    Timeline.build(scenes, duration, { preserveView: options.preserveTimelineView === true });
    window.ProTimeline?.attachLegacy(scenes, duration);
    updateMeta();
    const clipBadge = document.getElementById('top-clip-count');
    if (clipBadge) clipBadge.textContent = `${scenes.length} Clips Synchronized`;
    Preview.setScenes(scenes, duration);
    Preview.renderFrame();
  }

  function setCaptions(newCaptions) {
    captions = newCaptions || [];
    const statusBox = document.getElementById('caption-status-box');
    const statusTxt = document.getElementById('caption-status-text');
    const list      = document.getElementById('caption-list');

    if (captions.length) {
      if (statusBox) statusBox.classList.remove('hidden');
      if (statusTxt) statusTxt.textContent = `✓ ${captions.length} Cues Loaded`;
      if (list) {
        list.innerHTML = captions.map((c, i) =>
          `<div class="caption-cue-item" data-start="${c.start}" style="cursor:pointer;" title="Click to seek to ${formatTimecode(c.start)}">
             <span class="cue-time">${formatTimecode(c.start)}</span> 
             <span>${c.text.substring(0, 36)}${c.text.length > 36 ? '…' : ''}</span>
           </div>`
        ).join('');

        list.querySelectorAll('.caption-cue-item').forEach(item => {
          item.addEventListener('click', () => {
            const startT = parseFloat(item.dataset.start);
            if (!isNaN(startT) && window.Preview) {
              window.Preview.seek(startT);
            }
          });
        });
      }
    } else {
      if (statusBox) statusBox.classList.add('hidden');
      if (list) list.innerHTML = '';
    }
    Preview.renderFrame();
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    localStorage.setItem('cipher_active_screen', id);
  }

  function formatTimecode(sec) {
    if (isNaN(sec) || sec < 0) return '00:00.0';
    const m  = Math.floor(sec / 60);
    const s  = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${ms}`;
  }

  function showStatus(msg) {
    if (msg) console.log('[Cipher Studio]', msg);
  }

  function getCaptions() { return captions; }
  function getScenes()   { return scenes; }
  function getDuration() { return duration; }

  return {
    buildTimeline,
    getCaptions,
    setCaptions,
    getScenes,
    setScenes,
    getDuration,
    selectClip,
    restoreState,
    showScreen,
    showStatus
  };
})();
