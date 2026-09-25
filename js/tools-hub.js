/* ============================================================
   TOOLS-HUB.JS — Master Creative Suite Hub & 5 AI Tools Controller
   ============================================================ */

window.ToolsHub = (function () {

  let activeTool = 'hub';
  let analyzedTemplates = [];
  let selectedTemplate = null;
  let currentStyleBlueprint = null;
  let lastTranscribedSRT = '';
  let lastGeneratedScript = '';

  // ── 1. Initialization ───────────────────────────────────────
  function init() {
    try { wireHubNavigation(); } catch(e) { console.error('[ToolsHub] wireHubNavigation error:', e); }
    try { wireSettingsModal(); } catch(e) { console.error('[ToolsHub] wireSettingsModal error:', e); }
    try { wireTranscriberTool(); } catch(e) { console.error('[ToolsHub] wireTranscriberTool error:', e); }
    try { wirePromptGeneratorTool(); } catch(e) { console.error('[ToolsHub] wirePromptGeneratorTool error:', e); }
    try { wireAutoCaptionsTool(); } catch(e) { console.error('[ToolsHub] wireAutoCaptionsTool error:', e); }
    try { wireToolDraftPersistence(); } catch(e) { console.error('[ToolsHub] wireToolDraftPersistence error:', e); }
  }

  // Lightweight browser drafts for tool forms and generated text. Media files
  // are intentionally excluded: browsers do not allow a File input to be
  // repopulated after a reload without the user selecting it again.
  function wireToolDraftPersistence() {
    const storageKey = 'cipher_tool_drafts_v1';
    // Auto Caption owns its style persistence (including the selected preset).
    // Restoring generic form drafts afterwards overwrote that style with stale
    // fields while leaving the newly selected preset highlighted.
    const toolViews = [...document.querySelectorAll('#view-transcriber, #view-prompt-generator')];
    const readDrafts = () => {
      try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; }
    };
    const restoreDrafts = () => {
      const drafts = readDrafts();
      toolViews.forEach(view => {
        const draft = drafts[view.id];
        if (!draft) return;
        Object.entries(draft.fields || {}).forEach(([id, value]) => {
          const el = document.getElementById(id);
          if (!el || el.type === 'file') return;
          if (el.type === 'checkbox' || el.type === 'radio') el.checked = Boolean(value);
          else el.value = value;
        });
        if (draft.activeTab) {
          const tab = view.querySelector(`[data-tab="${CSS.escape(draft.activeTab)}"]`);
          tab?.click();
        }
      });
      document.dispatchEvent(new CustomEvent('cipher:drafts-restored'));
    };
    const saveDrafts = () => {
      const drafts = readDrafts();
      toolViews.forEach(view => {
        const fields = {};
        view.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
          if (el.type === 'file' || el.type === 'password') return;
          fields[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
        });
        drafts[view.id] = {
          fields,
          activeTab: view.querySelector('[data-tab].active')?.dataset.tab || '',
          savedAt: Date.now()
        };
      });
      try { localStorage.setItem(storageKey, JSON.stringify(drafts)); } catch (error) { console.warn('[Tool drafts] Could not save:', error); }
    };
    restoreDrafts();
    let timer = null;
    const queueSave = () => { clearTimeout(timer); timer = setTimeout(saveDrafts, 250); };
    toolViews.forEach(view => {
      view.addEventListener('input', queueSave);
      view.addEventListener('change', queueSave);
      view.addEventListener('click', event => { if (event.target.closest('[data-tab]')) queueSave(); });
    });
    window.addEventListener('pagehide', saveDrafts);
  }

  // ── 2. Master Hub & Screen Switching ────────────────────────
  function wireHubNavigation() {
    // Hub Tool Cards Click
    document.querySelectorAll('.hub-tool-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const externalUrl = card.dataset.externalUrl;
        if (externalUrl) {
          // Gemini does not permit iframe embedding. Opening its supplied
          // workspace externally keeps Google sign-in and image tools working.
          window.open(externalUrl, '_blank', 'noopener,noreferrer');
          return;
        }
        const toolId = card.dataset.tool;
        if (toolId) switchTool(toolId);
      });
    });

    // Bulk generator choices open their supplied Google workspaces externally.
    // The dashboard card itself only opens this selector page.
    document.querySelectorAll('.bulk-generator-option[data-external-url]').forEach(card => {
      card.addEventListener('click', (event) => {
        event.preventDefault();
        const externalUrl = card.dataset.externalUrl;
        if (externalUrl) window.open(externalUrl, '_blank', 'noopener,noreferrer');
      });
    });

    // "Back to Hub" buttons in tool headers
    document.querySelectorAll('.btn-back-to-hub').forEach(btn => {
      btn.addEventListener('click', () => {
        switchTool('hub');
      });
    });

    // The replacement Script Writer is isolated in an iframe so its UI cannot
    // leak styles or event handlers into any other Cipher tool.
    window.addEventListener('message', event => {
      if (event.origin === window.location.origin && event.data?.type === 'cipher:back-to-hub') switchTool('hub');
    });

    // Top Nav AI Settings Buttons
        // Global document event delegation for any dynamic AI settings button
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-open-ai-settings, .btn-ai-settings-pill, [data-action="open-ai-settings"]');
      if (btn) {
        e.preventDefault();
        openSettingsModal();
      }
    });
  }

  function switchTool(toolId) {
    if (!toolId) return;
    activeTool = toolId;
    const normalized = toolId.replace(/_/g, '-').toLowerCase();

    // Hide all screens and hub views across the entire application
    document.querySelectorAll('.screen, .hub-screen-view').forEach(view => {
      view.classList.remove('active');
    });

    if (normalized === 'hub' || normalized === 'screen-hub') {
      const hubEl = document.getElementById('screen-hub');
      if (hubEl) hubEl.classList.add('active');
      localStorage.setItem('cipher_active_screen', 'screen-hub');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (normalized === 'cipher-studio' || normalized === 'screen-upload') {
      const uploadEl = document.getElementById('screen-upload');
      if (uploadEl) uploadEl.classList.add('active');
      localStorage.setItem('cipher_active_screen', 'screen-upload');
      window.Projects?.renderRecentProjectsGrid();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const targetView = document.getElementById(`view-${normalized}`) || document.getElementById(normalized);
    if (targetView) {
      targetView.classList.add('active');
      localStorage.setItem('cipher_active_screen', targetView.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });

      if (normalized === 'auto-captions' || targetView.id === 'view-auto-captions') {
        window.renderAcCaptionPresets?.();
      }
    }
  }

  // ── 3. Global AI Settings Modal ─────────────────────────────
  function wireSettingsModal() {
    const modal = document.getElementById('modal-ai-settings');
    const btnClose = document.getElementById('btn-close-ai-settings');
    const btnSave  = document.getElementById('btn-save-ai-settings');
    const btnTestDeepgram = document.getElementById('btn-test-deepgram');
    const btnTestGroq = document.getElementById('btn-test-groq');
    const btnTestGemini = document.getElementById('btn-test-gemini');
    const statusBox = document.getElementById('ai-settings-status');

    btnClose?.addEventListener('click', closeSettingsModal);
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeSettingsModal();
    });

    // Password visibility toggle
    document.querySelectorAll('.btn-toggle-pw').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const input = document.getElementById(targetId);
        if (input) {
          const isPw = input.type === 'password';
          input.type = isPw ? 'text' : 'password';
          btn.textContent = isPw ? '🔒' : '👁️';
        }
      });
    });

    btnSave?.addEventListener('click', () => {
      const deepgramVal = document.getElementById('input-key-deepgram')?.value || '';
      const groqVal   = document.getElementById('input-key-groq')?.value || '';
      const geminiVal = document.getElementById('input-key-gemini')?.value || '';
      const openaiVal = document.getElementById('input-key-openai')?.value || '';
      const claudeVal = document.getElementById('input-key-claude')?.value || '';
      const pexelsVal = document.getElementById('input-key-pexels')?.value || '';
      const pixabayVal = document.getElementById('input-key-pixabay')?.value || '';

      window.AI.setKey('deepgram', deepgramVal);
      window.AI.setKey('groq', groqVal);
      window.AI.setKey('gemini', geminiVal);
      window.AI.setKey('openai', openaiVal);
      window.AI.setKey('claude', claudeVal);
      window.AI.setKey('pexels', pexelsVal);
      window.AI.setKey('pixabay', pixabayVal);

      if (statusBox) {
        statusBox.textContent = '✓ API Keys successfully saved!';
        statusBox.className = 'ai-status-msg success';
        setTimeout(() => {
          closeSettingsModal();
        }, 700);
      } else {
        closeSettingsModal();
      }
    });

    btnTestDeepgram?.addEventListener('click', async () => {
      const deepgramVal = document.getElementById('input-key-deepgram')?.value || '';
      if (statusBox) { statusBox.textContent = '⏳ Testing Deepgram API connection...'; statusBox.className = 'ai-status-msg info'; }
      try {
        await window.AI.testConnection('deepgram', deepgramVal);
        if (statusBox) { statusBox.textContent = '✓ Deepgram API Key is active & connected!'; statusBox.className = 'ai-status-msg success'; }
      } catch (err) {
        if (statusBox) { statusBox.textContent = '✕ Error: ' + err.message; statusBox.className = 'ai-status-msg error'; }
      }
    });

    btnTestGroq?.addEventListener('click', async () => {
      const groqVal = document.getElementById('input-key-groq')?.value || '';
      if (statusBox) {
        statusBox.textContent = '⏳ Testing Groq API connection...';
        statusBox.className = 'ai-status-msg info';
      }
      try {
        await window.AI.testConnection('groq', groqVal);
        if (statusBox) {
          statusBox.textContent = '✓ Groq API Key is active & connected!';
          statusBox.className = 'ai-status-msg success';
        }
      } catch (err) {
        if (statusBox) {
          statusBox.textContent = '✕ Error: ' + err.message;
          statusBox.className = 'ai-status-msg error';
        }
      }
    });

    btnTestGemini?.addEventListener('click', async () => {
      const geminiVal = document.getElementById('input-key-gemini')?.value || '';
      if (statusBox) { statusBox.textContent = '⏳ Testing Gemini API connection...'; statusBox.className = 'ai-status-msg info'; }
      try {
        await window.AI.testConnection('gemini', geminiVal);
        if (statusBox) { statusBox.textContent = '✓ Gemini API Key is active & connected!'; statusBox.className = 'ai-status-msg success'; }
      } catch (err) {
        if (statusBox) { statusBox.textContent = '✕ Error: ' + err.message; statusBox.className = 'ai-status-msg error'; }
      }
    });
  }

  


  // Expose globally so all screens and buttons can trigger it directly
  // ── 4. Tool 1: AI Audio Transcriber ─────────────────────────
  function wireTranscriberTool() {
    const dropArea       = document.getElementById('transcriber-drop-area');
    const fileInput      = document.getElementById('transcriber-file-input');
    const btnBrowse      = document.getElementById('btn-transcriber-browse');
    const btnTranscribe  = document.getElementById('btn-start-transcribe');
    const audioPreview   = document.getElementById('transcriber-audio-preview');
    const loadedCard     = document.getElementById('transcriber-loaded-card');
    const resultBox      = document.getElementById('transcriber-result-box');
    const txtOutput      = document.getElementById('transcriber-text-output');
    const btnCopy        = document.getElementById('btn-copy-transcription');
    const btnDownloadTxt = document.getElementById('btn-download-transcription-txt');
    const btnDownloadSrt = document.getElementById('btn-download-transcription-srt');
    const btnSendStudio  = document.getElementById('btn-send-transcription-studio');
    const keyBanner      = document.getElementById('transcriber-key-banner');
    const inlineKeyInput = document.getElementById('transcriber-inline-key-input');
    const btnSaveKey     = document.getElementById('btn-save-inline-groq-key');
    const btnPlayWave    = document.getElementById('btn-transcriber-play');
    const waveformCanvas = document.getElementById('transcriber-waveform-canvas');
    const outputBadge    = document.getElementById('transcriber-output-badge');
    const recentListEl   = document.getElementById('transcriber-recent-list');
    const cueLengthSelect = document.getElementById('sel-transcribe-cue-length');
    const customWordsInput = document.getElementById('input-transcribe-words-per-cue');
    const maxCueDurationSelect = document.getElementById('sel-transcribe-max-cue-duration');
    const timestampStyleSelect = document.getElementById('sel-transcribe-timestamps');
    const reformatButton = document.getElementById('btn-reformat-transcription');

    // Progress Elements
    const progressCircle = document.getElementById('transcriber-progress-circle');
    const progressPct    = document.getElementById('transcriber-progress-pct');
    const progressLinear = document.getElementById('transcriber-progress-linear-fill');
    const progressStatus = document.getElementById('transcriber-progress-status');
    const progressDetail = document.getElementById('transcriber-progress-detail');
    const timerElapsedEl = document.getElementById('transcriber-timer-elapsed');
    const timerEstEl     = document.getElementById('transcriber-timer-estimated');

    let loadedAudioFile = null;
    let audioUrl = null;
    let audioDuration = 0;
    let timerInterval = null;
    let progressTimer = null;
    let startTime = 0;
    let waveformPeaks = Array(48).fill(0.16);
    let lastTranscriptionText = '';
    let lastRawTranscription = null;

    function getCueSettings() {
      const preset = cueLengthSelect?.value || '8';
      const requested = preset === 'custom' ? Number(customWordsInput?.value) : Number(preset);
      const wordsPerLine = Math.max(3, Math.min(25, Math.round(requested || 8)));
      if (customWordsInput) customWordsInput.value = String(wordsPerLine);
      return {
        wordsPerLine,
        maxCueDuration: Math.max(0, Number(maxCueDurationSelect?.value) || 0),
        maxCharsPerLine: 240
      };
    }

    function syncCueControls() {
      const isCustom = cueLengthSelect?.value === 'custom';
      customWordsInput?.classList.toggle('hidden', !isCustom);
      const enabled = timestampStyleSelect?.value === 'word';
      document.getElementById('transcriber-cue-length-box')?.classList.toggle('is-disabled', !enabled);
      if (cueLengthSelect) cueLengthSelect.disabled = !enabled;
      if (customWordsInput) customWordsInput.disabled = !enabled;
    }

    cueLengthSelect?.addEventListener('change', syncCueControls);
    timestampStyleSelect?.addEventListener('change', syncCueControls);
    customWordsInput?.addEventListener('change', getCueSettings);
    syncCueControls();

    document.addEventListener('cipher:drafts-restored', () => {
      syncCueControls();
      const restoredOutput = txtOutput?.value || '';
      if (!restoredOutput.trim()) return;
      lastTranscriptionText = restoredOutput;
      resultBox?.classList.remove('hidden');
      if (outputBadge) outputBadge.textContent = 'RESTORED DRAFT';
    });
    const CIRCLE_CIRCUMFERENCE = 326.72; // 2 * PI * 52
    const uploadedMediaLibrary = [];

    // ── Subview Navigation Tabs ─────────────────────────────
    const tabNavTranscribe = document.getElementById('tab-nav-transcribe');
    const tabNavFiles      = document.getElementById('tab-nav-files');
    const tabNavHistory    = document.getElementById('tab-nav-history');
    const tabNavTemplates  = document.getElementById('tab-nav-templates');

    const viewMain      = document.getElementById('transcriber-view-main');
    const viewFiles     = document.getElementById('transcriber-view-files');
    const viewHistory   = document.getElementById('transcriber-view-history');
    const viewTemplates = document.getElementById('transcriber-view-templates');

    function switchTranscriberTab(tabKey) {
      // Remove active from all nav items
      [tabNavTranscribe, tabNavFiles, tabNavHistory, tabNavTemplates].forEach(b => b?.classList.remove('active'));
      // Hide all panes
      [viewMain, viewFiles, viewHistory, viewTemplates].forEach(p => {
        if (p) {
          p.classList.add('hidden');
          p.classList.remove('active');
        }
      });

      if (tabKey === 'transcribe') {
        tabNavTranscribe?.classList.add('active');
        viewMain?.classList.remove('hidden');
        viewMain?.classList.add('active');
      } else if (tabKey === 'files') {
        tabNavFiles?.classList.add('active');
        viewFiles?.classList.remove('hidden');
        viewFiles?.classList.add('active');
        renderFilesLibrary();
      } else if (tabKey === 'history') {
        tabNavHistory?.classList.add('active');
        viewHistory?.classList.remove('hidden');
        viewHistory?.classList.add('active');
        renderFullHistoryArchive();
      } else if (tabKey === 'templates') {
        tabNavTemplates?.classList.add('active');
        viewTemplates?.classList.remove('hidden');
        viewTemplates?.classList.add('active');
      }
    }

    tabNavTranscribe?.addEventListener('click', () => switchTranscriberTab('transcribe'));
    tabNavFiles?.addEventListener('click', () => switchTranscriberTab('files'));
    tabNavHistory?.addEventListener('click', () => switchTranscriberTab('history'));
    tabNavTemplates?.addEventListener('click', () => switchTranscriberTab('templates'));

    document.getElementById('btn-view-all-transcriber-history')?.addEventListener('click', () => {
      switchTranscriberTab('history');
    });

    document.getElementById('btn-files-tab-upload')?.addEventListener('click', () => {
      fileInput?.click();
    });

    // Check API Key status
    function checkKeyStatus() {
      // Local Whisper is bundled, so a Groq key is optional rather than a gate.
      if (keyBanner) keyBanner.style.display = 'none';
    }
    checkKeyStatus();

    // Groq Whisper does not provide speaker diarization and this local app has no
    // audio-enhancement backend yet. Disable both controls rather than pretending
    // that they affect the result.
    const speakerInput = document.getElementById('chk-speaker-detection');
    const enhanceInput = document.getElementById('chk-enhance-audio');
    [speakerInput, enhanceInput].forEach(input => {
      if (!input) return;
      input.checked = false;
      input.disabled = true;
      input.title = input === speakerInput ? 'Speaker labels need a diarization service, which is not configured.' : 'Audio cleanup will be available when the local processing pipeline is added.';
      input.closest('label')?.style.setProperty('opacity', '0.6');
    });

    // Inline Save Key Handler
    btnSaveKey?.addEventListener('click', () => {
      const k = (inlineKeyInput?.value || '').trim();
      if (!k) {
        alert('Please paste a valid Groq API Key (starts with gsk_...).');
        return;
      }
      window.AI.setKey('groq', k);
      if (keyBanner) keyBanner.style.display = 'none';
      alert('✓ Groq API Key saved successfully!');
      if (loadedAudioFile && btnTranscribe) btnTranscribe.disabled = false;
    });

    btnBrowse?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });
    dropArea?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleAudioSelected(file);
    });

    // Drag & Drop
    dropArea?.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('drag-over'); });
    dropArea?.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
    dropArea?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleAudioSelected(file);
    });

    function handleAudioSelected(file) {
      loadedAudioFile = file;
      document.getElementById('transcriber-filename').textContent = file.name;
      document.getElementById('transcriber-filesize').textContent = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
      loadedCard?.classList.remove('hidden');
      if (btnTranscribe) btnTranscribe.disabled = false;

      // Add to session media library if not present
      if (!uploadedMediaLibrary.some(f => f.name === file.name && f.size === file.size)) {
        uploadedMediaLibrary.unshift(file);
      }

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      audioUrl = URL.createObjectURL(file);

      if (audioPreview) {
        audioPreview.src = audioUrl;
        audioPreview.onloadedmetadata = () => {
          audioDuration = audioPreview.duration || 0;
          const durStr = formatTimecodeFull(audioDuration);
          const durEl = document.getElementById('transcriber-duration');
          if (durEl) durEl.textContent = durStr;
          drawWaveform(0);
        };
      }

      // Initial waveform
      drawWaveform(0);
      buildWaveform(file);

      // Reset progress
      setProgress(0, 'Ready to Transcribe', 'File loaded • Click Start');

      // Switch to main tab if on files
      switchTranscriberTab('transcribe');
    }

    // Audio Play / Pause on Waveform
    btnPlayWave?.addEventListener('click', () => {
      if (!audioPreview || !audioPreview.src) return;
      if (audioPreview.paused) {
        audioPreview.play();
        btnPlayWave.textContent = '⏸';
      } else {
        audioPreview.pause();
        btnPlayWave.textContent = '▶';
      }
    });

    audioPreview?.addEventListener('timeupdate', () => {
      if (!audioPreview.duration) return;
      const progress = audioPreview.currentTime / audioPreview.duration;
      drawWaveform(progress);
    });

    audioPreview?.addEventListener('ended', () => {
      btnPlayWave.textContent = '▶';
      drawWaveform(0);
    });

    // Click waveform to seek
    waveformCanvas?.addEventListener('click', (e) => {
      if (!audioPreview || !audioPreview.duration) return;
      const rect = waveformCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      audioPreview.currentTime = pct * audioPreview.duration;
      drawWaveform(pct);
    });

    function drawWaveform(playProgress = 0) {
      if (!waveformCanvas) return;
      const ctx = waveformCanvas.getContext('2d');
      const w = waveformCanvas.width;
      const h = waveformCanvas.height;

      ctx.clearRect(0, 0, w, h);

      const numBars = 48;
      const barW = 3.5;
      const gap = (w - (numBars * barW)) / (numBars - 1);

      for (let i = 0; i < numBars; i++) {
        const barPct = i / numBars;
        const x = i * (barW + gap);
        const barHeight = Math.max(4, (waveformPeaks[i] || 0.12) * (h - 4));
        const y = (h - barHeight) / 2;

        if (barPct <= playProgress) {
          ctx.fillStyle = '#38bdf8'; // Played (Cyan)
        } else {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; // Unplayed
        }

        // Draw rounded bar
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barHeight, 2);
        ctx.fill();
      }
    }

    async function buildWaveform(file) {
      try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        const context = new Context();
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        const data = buffer.getChannelData(0);
        const bars = waveformPeaks.length;
        const blockSize = Math.max(1, Math.floor(data.length / bars));
        waveformPeaks = Array.from({ length: bars }, (_, index) => {
          let peak = 0;
          const start = index * blockSize;
          const end = Math.min(data.length, start + blockSize);
          for (let sample = start; sample < end; sample++) peak = Math.max(peak, Math.abs(data[sample]));
          return Math.min(1, Math.max(0.08, peak));
        });
        context.close?.();
        drawWaveform(audioPreview?.duration ? audioPreview.currentTime / audioPreview.duration : 0);
      } catch (error) {
        console.warn('Unable to decode media waveform:', error);
        waveformPeaks = Array(48).fill(0.16);
      }
    }

    // Circular Progress Setter
    function setProgress(pct, statusText, detailText) {
      const p = Math.max(0, Math.min(100, pct));
      const offset = CIRCLE_CIRCUMFERENCE - (p / 100) * CIRCLE_CIRCUMFERENCE;
      if (progressCircle) progressCircle.style.strokeDashoffset = offset;
      if (progressPct) progressPct.textContent = `${Math.round(p)}%`;
      if (progressLinear) progressLinear.style.width = `${p}%`;
      if (progressStatus && statusText) progressStatus.textContent = statusText;
      if (progressDetail && detailText) progressDetail.textContent = detailText;
    }

    function formatTimecodeFull(sec) {
      const s = Math.max(0, parseFloat(sec) || 0);
      const hrs = Math.floor(s / 3600);
      const mins = Math.floor((s % 3600) / 60);
      const secs = Math.floor(s % 60);
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    // ── Start Transcription ──────────────────────────────────
    btnTranscribe?.addEventListener('click', async () => {
      if (!loadedAudioFile) return;

      const keys = window.AI?.getKeys() || {};

      const lang = document.getElementById('sel-transcribe-lang')?.value || '';
      const format = document.getElementById('sel-transcribe-format')?.value || 'srt';
      const timestampStyle = document.getElementById('sel-transcribe-timestamps')?.value || 'word';
      const promptText = document.getElementById('input-transcribe-prompt')?.value || '';
      const cueSettings = getCueSettings();

      btnTranscribe.disabled = true;
      btnTranscribe.innerHTML = `<span class="btn-bolt">⏳</span><span>Transcribing (${loadedAudioFile.name})...</span>`;

      // Start Timers & Circular Gauge Animation
      startTime = Date.now();
      let liveProgress = 2;
      setProgress(liveProgress, 'Preparing media…', 'Starting the local long-form transcription pipeline…');
      if (timerEstEl) timerEstEl.textContent = 'Live • 2%';

      clearInterval(timerInterval);
      timerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        if (timerElapsedEl) timerElapsedEl.textContent = formatTimecodeFull(elapsedSec);
        if (timerEstEl) timerEstEl.textContent = `Live • ${Math.round(liveProgress)}%`;
      }, 1000);

      try {
        const result = await window.AI.transcribeAudio(loadedAudioFile, {
          language: lang,
          responseFormat: format,
          timestampStyle,
          wordsPerLine: cueSettings.wordsPerLine,
          maxCharsPerLine: cueSettings.maxCharsPerLine,
          maxCueDuration: cueSettings.maxCueDuration,
          prompt: promptText,
          onProgress: progress => {
            const receivedPercent = Number(progress.percent);
            if (Number.isFinite(receivedPercent)) liveProgress = Math.max(liveProgress, Math.min(98, receivedPercent));
            else if (progress.stage === 'formatting') liveProgress = Math.max(liveProgress, 96);
            else if (progress.stage === 'uploading') liveProgress = Math.max(liveProgress, 4);
            else liveProgress = Math.max(liveProgress, 12);
            const status = progress.stage === 'extracting' ? 'Extracting compact audio…'
              : progress.stage === 'formatting' ? 'Formatting transcript…'
              : progress.stage === 'retrying' ? 'Retrying transcription part…'
              : progress.stage === 'uploading' ? 'Uploading media locally…'
              : 'Transcribing audio…';
            setProgress(liveProgress, status, progress.message || 'Working…');
            btnTranscribe.innerHTML = `<span class="btn-bolt">⏳</span><span>${status} ${Math.round(liveProgress)}%</span>`;
          }
        });

        clearInterval(progressTimer);
        clearInterval(timerInterval);

        // 100% Complete
        const engineNote = result.detectedLanguage ? `${result.engine} • detected ${result.detectedLanguage}` : result.engine;
        setProgress(100, '✓ Complete!', `Processed with ${engineNote} in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

        lastTranscribedSRT = result.srt;
        lastTranscriptionText = result.text;
        lastRawTranscription = result.raw;
        const displayedOutput = result.output;

        if (txtOutput) txtOutput.value = displayedOutput;
        if (outputBadge) outputBadge.textContent = timestampStyle === 'word'
          ? `${result.format.toUpperCase()} • ${cueSettings.wordsPerLine} words max`
          : `${result.format.toUpperCase()} Format`;
        if (resultBox) resultBox.classList.remove('hidden');

        // Save to Recent History
        saveToRecentHistory(loadedAudioFile.name, result.format.toUpperCase(), result.srt, result.text, result.output);

        btnTranscribe.innerHTML = `<span class="btn-bolt">✓</span><span>Transcription Complete!</span>`;
        setTimeout(() => {
          btnTranscribe.innerHTML = `<span class="btn-bolt">⚡</span><span>Start Transcription</span>`;
          btnTranscribe.disabled = false;
        }, 2400);

      } catch (err) {
        clearInterval(progressTimer);
        clearInterval(timerInterval);
        setProgress(0, '✕ Failed', err.message);
        alert('Transcription Failed: ' + err.message);
        btnTranscribe.innerHTML = `<span class="btn-bolt">⚡</span><span>Start Transcription</span>`;
        btnTranscribe.disabled = false;
      }
    });

    // ── Media Library (Files Tab) ───────────────────────────
    function renderFilesLibrary() {
      const listEl = document.getElementById('transcriber-files-list');
      if (!listEl) return;

      if (!uploadedMediaLibrary.length) {
        listEl.innerHTML = `
          <div class="files-empty-state">
            <span style="font-size: 2.2rem; display: block; margin-bottom: 6px;">📂</span>
            <p style="font-weight: 700; color: #fff;">No media files uploaded yet</p>
            <p style="font-size: 0.78rem; color: var(--text-dim);">Drop or browse files to build your media library.</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = uploadedMediaLibrary.map((file, idx) => `
        <div class="file-media-item-row">
          <div class="file-media-meta-left">
            <div class="file-media-icon">🎵</div>
            <div class="file-media-info">
              <strong>${escapeHtml(file.name)}</strong>
              <span>${(file.size / (1024 * 1024)).toFixed(1)} MB • ${file.type || 'audio/video'}</span>
            </div>
          </div>
          <div class="file-media-actions">
            <button class="btn-file-transcribe-action" data-idx="${idx}" type="button">⚡ Transcribe File</button>
            <button class="btn-history-action btn-delete-file-item" data-idx="${idx}" type="button">🗑️</button>
          </div>
        </div>
      `).join('');

      listEl.querySelectorAll('.btn-file-transcribe-action').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          const file = uploadedMediaLibrary[idx];
          if (file) handleAudioSelected(file);
        });
      });

      listEl.querySelectorAll('.btn-delete-file-item').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          uploadedMediaLibrary.splice(idx, 1);
          renderFilesLibrary();
        });
      });
    }

    // ── Full History Archive (History Tab) ───────────────────
    function renderFullHistoryArchive() {
      const container = document.getElementById('transcriber-full-history-container');
      if (!container) return;

      const list = JSON.parse(localStorage.getItem('cipher_transcribe_history') || '[]');
      if (!list.length) {
        container.innerHTML = `
          <div class="files-empty-state">
            <span style="font-size: 2.2rem; display: block; margin-bottom: 6px;">⏱️</span>
            <p style="font-weight: 700; color: #fff;">No transcription history found</p>
            <p style="font-size: 0.78rem; color: var(--text-dim);">Completed transcriptions will be permanently saved here.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = list.map((item, idx) => `
        <div class="history-card-item" data-idx="${idx}">
          <div class="history-card-top">
            <div class="history-card-title-group">
              <span style="font-size: 1.2rem;">🎵</span>
              <span class="history-filename">${escapeHtml(item.filename)}</span>
              <span class="history-badge-format">${item.format}</span>
            </div>
            <span class="history-time-ago">${item.timeStr || 'Recently'}</span>
          </div>

          <div class="history-snippet-box">${escapeHtml(item.output || item.srt ? (item.output || item.srt).slice(0, 300) + ((item.output || item.srt).length > 300 ? '...' : '') : 'No preview available')}</div>

          <div class="history-card-actions">
            <button class="btn-history-action btn-copy-hist" data-idx="${idx}" type="button">📋 Copy</button>
            <button class="btn-history-action btn-down-txt-hist" data-idx="${idx}" type="button">⬇️ .TXT</button>
            <button class="btn-history-action btn-down-srt-hist" data-idx="${idx}" type="button">⬇️ .SRT</button>
            <button class="btn-history-action btn-delete-hist" data-idx="${idx}" type="button" style="color: #f87171;">🗑️ Delete</button>
            <button class="btn-history-action btn-send-studio-action" data-idx="${idx}" type="button">🎬 Send to Studio →</button>
          </div>
        </div>
      `).join('');

      // Wire history action buttons
      container.querySelectorAll('.btn-copy-hist').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          const item = list[idx];
          if (item && item.srt) {
            navigator.clipboard.writeText(item.srt);
            b.textContent = '✓ Copied!';
            setTimeout(() => { b.textContent = '📋 Copy'; }, 1500);
          }
        });
      });

      container.querySelectorAll('.btn-down-txt-hist').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          const item = list[idx];
          if (item && item.srt) {
            const plain = item.srt.replace(/\d+\n\d\d:\d\d:\d\d,\d+ --> \d\d:\d\d:\d\d,\d+\n/g, '').trim();
            downloadFile(plain, `${item.filename || 'transcript'}.txt`, 'text/plain');
          }
        });
      });

      container.querySelectorAll('.btn-down-srt-hist').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          const item = list[idx];
          if (item && item.srt) {
            downloadFile(item.srt, `${item.filename || 'captions'}.srt`, 'text/plain');
          }
        });
      });

      container.querySelectorAll('.btn-delete-hist').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          list.splice(idx, 1);
          localStorage.setItem('cipher_transcribe_history', JSON.stringify(list));
          renderFullHistoryArchive();
          renderRecentHistory();
        });
      });

      container.querySelectorAll('.btn-send-studio-action').forEach(b => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          const item = list[idx];
          if (item && item.srt && window.Captions) {
            window.Captions.loadSRT(item.srt);
            switchTool('cipher-studio');
          }
        });
      });
    }

    // Clear History Button
    document.getElementById('btn-clear-transcriber-history')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all transcription history?')) {
        localStorage.removeItem('cipher_transcribe_history');
        renderFullHistoryArchive();
        renderRecentHistory();
      }
    });

    // ── Use-Case Templates Wiring ───────────────────────────
    document.querySelectorAll('.transcriber-template-card').forEach(card => {
      const btn = card.querySelector('.btn-apply-template');
      const tmplKey = card.dataset.template;

      btn?.addEventListener('click', () => {
        const selLang = document.getElementById('sel-transcribe-lang');
        const selFormat = document.getElementById('sel-transcribe-format');
        const selTimestamps = document.getElementById('sel-transcribe-timestamps');
        const chkSpeaker = document.getElementById('chk-speaker-detection');

        if (tmplKey === 'viral_shorts') {
          if (selTimestamps) selTimestamps.value = 'word';
          if (selFormat) selFormat.value = 'srt';
          if (chkSpeaker) chkSpeaker.checked = false;
        } else if (tmplKey === 'podcast') {
          if (selTimestamps) selTimestamps.value = 'segment';
          if (selFormat) selFormat.value = 'srt';
          if (chkSpeaker) chkSpeaker.checked = false;
        } else if (tmplKey === 'cinema') {
          if (selTimestamps) selTimestamps.value = 'segment';
          if (selFormat) selFormat.value = 'srt';
          if (chkSpeaker) chkSpeaker.checked = false;
        } else if (tmplKey === 'meeting') {
          if (selTimestamps) selTimestamps.value = 'none';
          if (selFormat) selFormat.value = 'txt';
          if (chkSpeaker) chkSpeaker.checked = false;
        } else if (tmplKey === 'lecture') {
          if (selTimestamps) selTimestamps.value = 'word';
          if (selFormat) selFormat.value = 'vtt';
          if (chkSpeaker) chkSpeaker.checked = false;
        } else if (tmplKey === 'translation') {
          if (selTimestamps) selTimestamps.value = 'word';
          if (selFormat) selFormat.value = 'json';
          if (chkSpeaker) chkSpeaker.checked = false;
        }

        syncCueControls();
        // Switch to main transcribe tab with visual confirmation
        switchTranscriberTab('transcribe');
        const banner = document.createElement('div');
        banner.className = 'toast-notification';
        banner.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#10b981;color:#fff;padding:12px 18px;border-radius:8px;font-weight:700;font-size:0.85rem;box-shadow:0 8px 24px rgba(0,0,0,0.5);z-index:99999;';
        banner.textContent = `✓ Template Applied! Settings configured.`;
        document.body.appendChild(banner);
        setTimeout(() => banner.remove(), 2500);
      });
    });

    // Recent History Storage & Actions
    function saveToRecentHistory(filename, format, srtText, plainText = '', displayedOutput = '') {
      try {
        const list = JSON.parse(localStorage.getItem('cipher_transcribe_history') || '[]');
        list.unshift({
          filename: filename,
          format: format,
          timeStr: 'Just now',
          timestamp: Date.now(),
          srt: srtText,
          text: plainText,
          output: displayedOutput
        });
        const trimmed = list.slice(0, 15);
        localStorage.setItem('cipher_transcribe_history', JSON.stringify(trimmed));
        renderRecentHistory();
        renderFullHistoryArchive();
      } catch (e) {}
    }

    function renderRecentHistory() {
      if (!recentListEl) return;
      try {
        const list = JSON.parse(localStorage.getItem('cipher_transcribe_history') || '[]');
        if (!list.length) return;

        recentListEl.innerHTML = list.slice(0, 3).map((item, idx) => `
          <div class="recent-item" data-idx="${idx}">
            <span class="recent-item-icon">🎵</span>
            <div class="recent-item-info">
              <span class="recent-filename" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</span>
              <span class="recent-meta">${item.format} • ${item.timeStr}</span>
            </div>
          </div>
        `).join('');

        recentListEl.querySelectorAll('.recent-item').forEach(el => {
          el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.idx, 10);
            const item = list[idx];
            if (item && (item.srt || item.text)) {
              lastTranscribedSRT = item.srt;
              lastTranscriptionText = item.text || item.srt.replace(/\d+\n\d\d:\d\d:\d\d,\d+ --> \d\d:\d\d:\d\d,\d+\n/g, '').trim();
              if (txtOutput) txtOutput.value = item.output || item.srt || item.text;
              if (resultBox) resultBox.classList.remove('hidden');
              if (outputBadge) outputBadge.textContent = `${item.format} Format`;
              switchTranscriberTab('transcribe');
            }
          });
        });
      } catch (e) {}
    }
    renderRecentHistory();

    // Copy / Download / Send Actions
    btnCopy?.addEventListener('click', () => {
      if (txtOutput?.value) {
        navigator.clipboard.writeText(txtOutput.value);
        btnCopy.textContent = '✓ Copied!';
        setTimeout(() => { btnCopy.textContent = '📋 Copy Text'; }, 1500);
      }
    });

    btnDownloadTxt?.addEventListener('click', () => {
      if (!txtOutput?.value) return;
      const plainText = lastTranscriptionText || txtOutput.value.replace(/\d+\n\d\d:\d\d:\d\d,\d+ --> \d\d:\d\d:\d\d,\d+\n/g, '').trim();
      downloadFile(plainText, 'transcript.txt', 'text/plain');
    });

    btnDownloadSrt?.addEventListener('click', () => {
      if (!lastTranscribedSRT) return;
      downloadFile(lastTranscribedSRT, 'captions.srt', 'text/plain');
    });

    reformatButton?.addEventListener('click', () => {
      if (!lastRawTranscription || !window.AI?.reformatTranscription) {
        alert('Please complete a transcription first. Saved history does not retain raw word timing data.');
        return;
      }
      const timestampStyle = timestampStyleSelect?.value || 'word';
      const responseFormat = document.getElementById('sel-transcribe-format')?.value || 'timestamped';
      const cueSettings = getCueSettings();
      const result = window.AI.reformatTranscription(lastRawTranscription, {
        timestampStyle,
        responseFormat,
        wordsPerLine: cueSettings.wordsPerLine,
        maxCharsPerLine: cueSettings.maxCharsPerLine,
        maxCueDuration: cueSettings.maxCueDuration
      });
      lastTranscribedSRT = result.srt;
      lastTranscriptionText = result.text;
      if (txtOutput) txtOutput.value = result.output;
      if (outputBadge) outputBadge.textContent = `${result.format.toUpperCase()} • ${cueSettings.wordsPerLine} words max`;
      reformatButton.textContent = '✓ Timecodes Reformatted';
      setTimeout(() => { reformatButton.textContent = '↔️ Reformat Timecodes'; }, 1800);
    });

    btnSendStudio?.addEventListener('click', () => {
      if (lastTranscribedSRT && window.Captions) {
        window.Captions.loadSRT(lastTranscribedSRT);
        switchTool('cipher-studio');
      }
    });
  }

  // ── 5. Tool 2: Viral AI Script Writer ───────────────────────
    function wireScriptWriterTool() {
    const filesContainer    = document.getElementById('vsw-files-list-container');
    const fileInput         = document.getElementById('input-upload-ref-scripts');
    const dropzoneBox       = document.getElementById('vsw-dropzone-box');
    const btnBrowseFiles    = document.getElementById('vsw-btn-browse-files');
    const btnLoadDemo       = document.getElementById('btn-load-demo-scripts');
    const btnAnalyze        = document.getElementById('btn-analyze-scripts');
    const lblTotalFiles     = document.getElementById('lbl-total-script-files');
    const selTemplateHidden = document.getElementById('sel-generator-template');
    const tplDisplayBox     = document.getElementById('vsw-selected-template-display');
    const inputTitle        = document.getElementById('input-script-title');
    const inputWordCount    = document.getElementById('input-script-word-count');
    const btnGenerate       = document.getElementById('btn-generate-script');
    const formattedView     = document.getElementById('script-formatted-view');
    const rawOutput         = document.getElementById('script-writer-output');
    const btnCopy           = document.getElementById('btn-copy-script');
    const btnDownload       = document.getElementById('btn-download-script');

    // Report Modal Elements
    const modalReport         = document.getElementById('modal-full-script-report');
    const btnCloseReportModal = document.getElementById('btn-close-script-report-modal');
    const btnCloseReportAct   = document.getElementById('btn-close-report-action');
    const btnCopyReport       = document.getElementById('btn-copy-full-report');
    const btnDownloadReport   = document.getElementById('btn-download-full-report');
    const repTabBar           = document.getElementById('rep-scripts-tab-bar');
    const repCombinedView     = document.getElementById('rep-view-combined-summary');
    const repIndividualView   = document.getElementById('rep-view-individual-scripts');

    // Stepper elements
    const stepIndicators = [
      document.getElementById('vsw-step-indicator-1'),
      document.getElementById('vsw-step-indicator-2'),
      document.getElementById('vsw-step-indicator-3'),
      document.getElementById('vsw-step-indicator-4')
    ];

    function setStepperStep(stepNum) {
      stepIndicators.forEach((item, idx) => {
        if (!item) return;
        if (idx + 1 <= stepNum) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
      const arrows = document.querySelectorAll('.vsw-step-arrow');
      arrows.forEach((arr, idx) => {
        if (idx + 1 < stepNum) {
          arr.classList.add('active');
        } else {
          arr.classList.remove('active');
        }
      });
    }

    // Sample default viral reference scripts (matching screenshot)
    const demoScripts = [
      {
        name: 'script_01.txt',
        size: '2.1 KB',
        text: `What if I told you that a single morning habit controls 90% of your daily focus? In 1962, a neuroscientist discovered something shocking about peak dopamine curves. When you wake up, your cortisol spikes naturally. If you immediately reach for your phone, you short-circuit your entire cognitive potential for the next 12 hours. Here is the exact 3-step ritual to reclaim your brain.`
      },
      {
        name: 'script_02.txt',
        size: '1.8 KB',
        text: `There is a hidden psychological trick used by the top 1% of negotiators that makes anyone say yes within 60 seconds. Most people try to use logic and statistics to convince someone. But human brains make decisions based on emotional safety. When you mirror the last three words someone speaks, their subconscious drops all defense mechanisms.`
      },
      {
        name: 'script_03.txt',
        size: '2.4 KB',
        text: `The richest man in ancient history had one unspoken rule about wealth creation that modern schools will never teach you. It wasn't about saving pennies. It wasn't about working 80 hours a week. It was a compounding principle called the 10th Coin Rule. Every dollar you spend is a worker you send to work for someone else.`
      },
      {
        name: 'script_04.txt',
        size: '2.0 KB',
        text: `In 2019, deep-sea oceanographers picked up an unknown acoustic frequency 6,000 meters beneath the Pacific Trench. It wasn't a whale. It wasn't a submarine. It was a rhythmic pulse occurring every 14.2 seconds. When they sent a remote submersible to investigate the source coordinates, their communication feed abruptly cut out.`
      },
      {
        name: 'script_05.txt',
        size: '1.9 KB',
        text: `If you want to achieve in 6 months what takes most people 5 years, stop setting goals. Goal-setting is the single biggest trap in modern self-improvement. Winners and losers share the exact same goals. The difference is the friction architecture in your daily environment. Remove 3 micro-distractions today and watch your output multiply.`
      }
    ];

    // Start with empty script list
    let currentScriptChips = [];
    let lastAnalysisReports = [];
    let selectedTemplateKey = 'template_1';
    let selectedTemplateTitle = 'The Story Flow';
    let lastGeneratedScriptText = '';
    let lastGeneratedResultData = null;

    document.addEventListener('cipher:drafts-restored', () => {
      const restoredScript = rawOutput?.value || '';
      if (selTemplateHidden?.value) {
        selectedTemplateKey = selTemplateHidden.value;
        const selectedLabel = document.querySelector(`.vsw-template-item[data-template-id="${CSS.escape(selectedTemplateKey)}"] .vsw-tpl-editable-title`);
        if (selectedLabel && tplDisplayBox) tplDisplayBox.textContent = selectedLabel.value;
      }
      if (!restoredScript.trim()) return;
      lastGeneratedScriptText = restoredScript;
      renderFormattedScript(restoredScript);
      setStepperStep(4);
    });

    // Elements
    const softRecBanner = document.getElementById('vsw-soft-rec-banner');
    const inputCustomWords = document.getElementById('input-custom-word-count');
    const progressContainer = document.getElementById('vsw-gen-progress-container');
    const progressLabel = document.getElementById('vsw-progress-label');
    const progressPct = document.getElementById('vsw-progress-pct');
    const progressBarFill = document.getElementById('vsw-progress-bar-fill');
    const sectionLiveLogs = document.getElementById('vsw-section-live-logs');
    const accuracyBadge = document.getElementById('vsw-accuracy-badge');
    const btnDownloadDocx = document.getElementById('btn-download-docx-script');
    const btnSendPrompts = document.getElementById('btn-send-script-to-prompts');

    // Handle Custom Word Count Toggle
    inputWordCount?.addEventListener('change', () => {
      if (inputWordCount.value === 'custom') {
        inputCustomWords?.classList.remove('hidden');
        inputCustomWords?.focus();
      } else {
        inputCustomWords?.classList.add('hidden');
      }
    });

    function updateRecBanner() {
      if (!softRecBanner) return;
      if (currentScriptChips.length < 5) {
        softRecBanner.classList.remove('hidden');
      } else {
        softRecBanner.classList.add('hidden');
      }
    }

    function renderFilesList() {
      if (!filesContainer) return;
      filesContainer.innerHTML = '';

      if (currentScriptChips.length === 0) {
        filesContainer.innerHTML = `
          <div class="vsw-empty-files-placeholder">
            <span class="vsw-empty-icon">📂</span>
            <span class="vsw-empty-text">No scripts uploaded yet.<br><span style="color: #64748b; font-size: 11px;">Upload 1 to 10 reference .txt scripts above.</span></span>
          </div>
        `;
      } else {
        currentScriptChips.forEach((item, idx) => {
          const row = document.createElement('div');
          row.className = 'vsw-file-row';
          row.dataset.idx = idx;
          row.innerHTML = `
            <div class="vsw-file-left">
              <span class="vsw-file-doc-icon">📄</span>
              <div class="vsw-file-name-meta">
                <span class="vsw-file-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                <span class="vsw-file-size">${item.size || '2.0 KB'} • ${item.wordCount || 0} words</span>
              </div>
            </div>
            <button class="vsw-btn-remove-file" type="button" title="Remove file">✕</button>
          `;

          row.querySelector('.vsw-btn-remove-file')?.addEventListener('click', (e) => {
            e.stopPropagation();
            currentScriptChips.splice(idx, 1);
            renderFilesList();
          });

          filesContainer.appendChild(row);
        });
      }

      if (lblTotalFiles) lblTotalFiles.textContent = `Total Files: ${currentScriptChips.length} / 10`;
      updateRecBanner();
    }
    renderFilesList();

    // Trigger File Picker
    btnBrowseFiles?.addEventListener('click', () => fileInput?.click());

    // Drag and Drop
    dropzoneBox?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneBox.classList.add('dragover');
    });

    dropzoneBox?.addEventListener('dragleave', () => {
      dropzoneBox.classList.remove('dragover');
    });

    dropzoneBox?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzoneBox.classList.remove('dragover');
      handleIncomingFiles(e.dataTransfer.files);
    });

    fileInput?.addEventListener('change', (e) => {
      handleIncomingFiles(e.target.files);
    });

    function handleIncomingFiles(filesList) {
      const files = Array.from(filesList || []);
      if (!files.length) return;

      if (currentScriptChips.length + files.length > 10) {
        alert('You can upload a maximum of 10 reference scripts at a time.');
      }

      const filesToProcess = files.slice(0, 10 - currentScriptChips.length);
      let loaded = 0;
      filesToProcess.forEach(f => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const text = evt.target.result || '';
          const words = text.trim().split(/\s+/).filter(Boolean).length;
          currentScriptChips.push({
            name: f.name,
            size: (f.size / 1024).toFixed(1) + ' KB',
            text: text,
            wordCount: words
          });
          loaded++;
          if (loaded === filesToProcess.length) {
            renderFilesList();
          }
        };
        reader.readAsText(f);
      });
    }

    // Default Baseline Viral Templates (Master Spec Definition)
    const defaultTemplates = [
      {
        id: 'template_1',
        template_name: 'The Story Flow',
        user_custom_name: 'The Story Flow',
        category_tag: 'STORY ARC',
        description: 'Story-driven structure that builds emotional tension, vulnerability, and connects.',
        structure_breakdown: [
          { section: 'Hook', purpose: 'Instant 0-3s pattern interrupt and curiosity gap', word_percentage: 10, guidelines: 'Open mid-action with high stakes.' },
          { section: 'Setup & Agitation', purpose: 'Establish the core friction and emotional urgency', word_percentage: 20, guidelines: 'Build vulnerability and relatability.' },
          { section: 'Rising Action & Evidence', purpose: 'Deliver concrete proof, escalating obstacles, and twists', word_percentage: 35, guidelines: 'Vary sentence length, layer open loops.' },
          { section: 'Climax & Transformation', purpose: 'Deliver the core revelation and master breakthrough', word_percentage: 25, guidelines: 'Deliver the ultimate payoff promised by the hook.' },
          { section: 'Resolution & CTA', purpose: 'Harmonious closure and frictionless audience debate', word_percentage: 10, guidelines: 'Ask a thought-provoking closing question.' }
        ],
        tone_guidelines: 'Cinematic, emotionally resonant, authentic, and fast-paced narrative voice.',
        emotional_trigger_pattern: 'Curiosity -> Relatable Frustration -> Escalating Suspense -> Awe & Breakthrough -> Empowered Closure.',
        anti_repetition_rules: 'Never restate previous plot points; advance the timeline forward with every sentence.',
        display_tags: ['⚡ 0-3s Open Loop', '🎭 Emotional Empathy', '📈 70%+ Retention Arc', '🛡️ Originality Safe'],
        bgClass: 'bg-purple',
        iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="6" height="6" rx="1"></rect><rect x="15" y="15" width="6" height="6" rx="1"></rect><rect x="3" y="15" width="6" height="6" rx="1"></rect><path d="M6 9v3a3 3 0 0 0 3 3h6"></path></svg>`
      },
      {
        id: 'template_2',
        template_name: 'The Contrarian Truth',
        user_custom_name: 'The Contrarian Truth',
        category_tag: 'CONTRARIAN',
        description: 'Debunks conventional mainstream lies, exposes hidden friction, and reveals the counter-intuitive framework.',
        structure_breakdown: [
          { section: 'Contrarian Shock Hook', purpose: 'Challenge a widely accepted belief immediately', word_percentage: 10, guidelines: 'State a shocking counter-intuitive fact.' },
          { section: 'The Mainstream Lie Exposed', purpose: 'Explain why popular advice fails 95% of people', word_percentage: 25, guidelines: 'Expose the systemic blind spot.' },
          { section: 'Empirical Proof & Mechanism', purpose: 'Provide irrefutable evidence and case examples', word_percentage: 35, guidelines: 'Present hard evidence and mechanisms.' },
          { section: 'The Breakthrough Protocol', purpose: 'Present the counter-intuitive actionable formula', word_percentage: 20, guidelines: 'Break down the exact 3-step master protocol.' },
          { section: 'Summary & Debate CTA', purpose: 'Drive comments and bookmark saves', word_percentage: 10, guidelines: 'Challenge viewer to share their opinion.' }
        ],
        tone_guidelines: 'Uncompromising, authoritative, polarizing, and scientifically backed.',
        emotional_trigger_pattern: 'Disbelief -> Revelation -> Cognitive Clarity -> High Confidence.',
        anti_repetition_rules: 'Do not repeat the debunked myth after Section 2; focus entirely on the new solution.',
        display_tags: ['💥 Contrarian Shock Hook', '🔍 Debunks Common Lie', '📊 Empirical Data', '💡 Breakthrough Formula'],
        bgClass: 'bg-orange',
        iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fb923c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`
      },
      {
        id: 'template_3',
        template_name: 'The Dopamine Protocol',
        user_custom_name: 'The Dopamine Protocol',
        category_tag: 'DOPAMINE PROTOCOL',
        description: 'Rapid-fire actionable milestones delivering high dopamine value every 20 seconds for maximum watch completion.',
        structure_breakdown: [
          { section: 'High-Velocity Hook', purpose: 'Promise a concrete, quantifiable transformation', word_percentage: 10, guidelines: 'Declare the exact 3-step outcome in 5 words.' },
          { section: 'Milestone 1: Foundation', purpose: 'Deliver the first immediate actionable breakthrough', word_percentage: 25, guidelines: 'Concrete step with real-world example.' },
          { section: 'Milestone 2: Execution', purpose: 'Deliver the core compounding acceleration strategy', word_percentage: 30, guidelines: 'High-leverage tactic with clear rules.' },
          { section: 'Milestone 3: Mastery', purpose: 'Deliver the unfair advantage and common mistake trap', word_percentage: 25, guidelines: 'Reveal the secret optimization.' },
          { section: 'Action Checklist & CTA', purpose: 'Prompt bookmark saves and implementation comments', word_percentage: 10, guidelines: 'Urge viewer to save video.' }
        ],
        tone_guidelines: 'Punchy, actionable, high-energy, frictionless, and practical.',
        emotional_trigger_pattern: 'Instant Gratification -> Progressive Mastery -> Urgent Motivation.',
        anti_repetition_rules: 'Keep each milestone self-contained without overlapping rules.',
        display_tags: ['⚡ Rapid Takeaways', '🔢 Actionable Steps', '🔥 Dopamine Velocity', '💾 High Save Rate'],
        bgClass: 'bg-green',
        iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>`
      },
      {
        id: 'template_4',
        template_name: 'The Forensic Deep-Dive',
        user_custom_name: 'The Forensic Deep-Dive',
        category_tag: 'PSYCHOLOGY & CASE STUDY',
        description: 'Documentary-style investigation deconstructing behavioral psychology and case evidence.',
        structure_breakdown: [
          { section: 'Forensic Teaser Hook', purpose: 'Introduce an astonishing real-world case anomaly', word_percentage: 10, guidelines: 'Present the historical paradox.' },
          { section: 'Timeline & Scene Reconstruction', purpose: 'Set the investigative context with forensic detail', word_percentage: 25, guidelines: 'Use vivid dates, locations, sensory evidence.' },
          { section: 'The Hidden Mechanism Discovered', purpose: 'Uncover the deep psychological principle at play', word_percentage: 35, guidelines: 'Explain root cause.' },
          { section: 'Modern Implication & Lesson', purpose: 'Translate case study into modern actionable wisdom', word_percentage: 20, guidelines: 'Show real-world application today.' },
          { section: 'Investigative Outro & CTA', purpose: 'Inspire organic sharing and deep comments', word_percentage: 10, guidelines: 'Leave viewer with lingering question.' }
        ],
        tone_guidelines: 'Investigative, nuanced, deep-thinking, sophisticated, and captivating.',
        emotional_trigger_pattern: 'Intrigue -> Forensic Curiosity -> Revelation -> Philosophical Resonance.',
        anti_repetition_rules: 'Maintain chronological forward progression.',
        display_tags: ['🕵️ Forensic Breakdown', '📈 Case Study Proof', '🧠 Psychology Trigger', '🔁 Organic Shares'],
        bgClass: 'bg-blue',
        iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`
      },
      {
        id: 'template_5',
        template_name: 'The Tri-Loop Question Funnel',
        user_custom_name: 'The Tri-Loop Question Funnel',
        category_tag: 'HYPNOTIC LOOP',
        description: 'Stacks 3 progressive curiosity loops that keep viewers glued until the final 20% resolution.',
        structure_breakdown: [
          { section: 'Loop 1: The Master Mystery', purpose: 'Open the supreme curiosity loop', word_percentage: 10, guidelines: 'Ask the central unsolved question.' },
          { section: 'Loop 2: The Secondary Conflict', purpose: 'Layer a second puzzle before resolving first', word_percentage: 25, guidelines: 'Add stakes and complexity.' },
          { section: 'Loop 3 & Escalation', purpose: 'Introduce climactic piece of puzzle', word_percentage: 35, guidelines: 'Escalate suspense to peak.' },
          { section: 'The Grand Climax Resolution', purpose: 'Pay off Loop 1 and 3 simultaneously with full revelation', word_percentage: 20, guidelines: 'Deliver ultimate truth.' },
          { section: 'Closing Loop & CTA', purpose: 'Lock in retention with a closing debate question', word_percentage: 10, guidelines: 'Drive comment engagement.' }
        ],
        tone_guidelines: 'Hypnotic, suspenseful, deeply engaging, and psychological.',
        emotional_trigger_pattern: 'Suspense -> Layered Curiosity -> Tension Peak -> Total Payoff.',
        anti_repetition_rules: 'Never resolve a loop in the same section it was opened.',
        display_tags: ['❓ 3 Nested Open Loops', '🧠 Cognitive Dissonance', '⏳ Delayed Payoff', '💬 Comment Debate'],
        bgClass: 'bg-pink',
        iconSvg: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f472b6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
      }
    ];

    let currentTemplates = [...defaultTemplates];
    const tplListContainer = document.getElementById('vsw-template-list') || document.querySelector('.vsw-template-list');
    const tplGuidanceBox = document.getElementById('vsw-guidance-box') || document.querySelector('.vsw-guidance-box');
    const guideBadge = document.getElementById('vsw-guide-badge');
    const guideDesc = document.getElementById('vsw-guide-desc');
    const guideRulesContainer = document.getElementById('vsw-guide-rules');

    // Render Templates with Editable Titles (Section 4.1 Requirement)
    function renderTemplatesList(templatesToRender) {
      if (!tplListContainer) return;
      tplListContainer.innerHTML = '';

      templatesToRender.forEach((tpl, idx) => {
        const item = document.createElement('div');
        item.className = `vsw-template-item ${tpl.id === selectedTemplateKey ? 'active' : ''}`;
        item.dataset.templateId = tpl.id;

        const displayName = tpl.user_custom_name || tpl.template_name || `Template ${idx + 1}`;
        const categoryTag = tpl.category_tag || 'VIRAL STRUCTURE';
        const displayTags = tpl.display_tags || ['⚡ 0-3s Open Loop', '📈 Retention Arc'];

        item.innerHTML = `
          <div class="vsw-tpl-icon-box ${tpl.bgClass || 'bg-purple'}">
            ${tpl.iconSvg || defaultTemplates[0].iconSvg}
          </div>
          <div class="vsw-tpl-meta" style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <input type="text" class="vsw-tpl-editable-title" value="${escapeHtml(displayName)}" title="Click to rename this template" style="background: transparent; border: 1px dashed transparent; border-radius: 4px; color: #f8fafc; font-size: 13px; font-weight: 700; width: 100%; padding: 2px 4px; outline: none; transition: all 0.2s;" />
              <span class="vsw-tpl-tag-badge" style="font-size: 9.5px; padding: 2px 6px; border-radius: 4px; background: rgba(168, 85, 247, 0.2); color: #c084fc; white-space: nowrap;">${escapeHtml(categoryTag)}</span>
            </div>
            <p class="vsw-tpl-desc" style="font-size: 11px; color: #94a3b8; margin: 0 0 6px 0; line-height: 1.3;">${escapeHtml(tpl.description || '')}</p>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              ${displayTags.map(tag => `<span style="font-size: 9px; padding: 1px 5px; border-radius: 3px; background: rgba(255,255,255,0.06); color: #cbd5e1;">${escapeHtml(tag)}</span>`).join('')}
            </div>
          </div>
          <div class="vsw-radio-indicator">
            <div class="radio-dot"></div>
          </div>
        `;

        // Handle inline renaming
        const titleInput = item.querySelector('.vsw-tpl-editable-title');
        titleInput?.addEventListener('focus', () => {
          titleInput.style.borderColor = '#a855f7';
          titleInput.style.background = 'rgba(0,0,0,0.4)';
        });
        titleInput?.addEventListener('blur', () => {
          titleInput.style.borderColor = 'transparent';
          titleInput.style.background = 'transparent';
          tpl.user_custom_name = titleInput.value.trim() || tpl.template_name;
          if (tpl.id === selectedTemplateKey && tplDisplayBox) {
            tplDisplayBox.textContent = tpl.user_custom_name;
          }
        });
        titleInput?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') titleInput.blur();
        });
        titleInput?.addEventListener('click', (e) => e.stopPropagation());

        item.addEventListener('click', () => {
          document.querySelectorAll('.vsw-template-item').forEach(c => c.classList.remove('active'));
          item.classList.add('active');

          selectedTemplateKey = tpl.id;
          selectedTemplateTitle = tpl.user_custom_name || tpl.template_name;

          if (selTemplateHidden) selTemplateHidden.value = selectedTemplateKey;
          if (tplDisplayBox) tplDisplayBox.textContent = selectedTemplateTitle;

          updateGuidanceCard(tpl);
          setStepperStep(3);
        });

        tplListContainer.appendChild(item);
      });

      const activeTpl = templatesToRender.find(t => t.id === selectedTemplateKey) || templatesToRender[0];
      if (activeTpl) updateGuidanceCard(activeTpl);
    }

    function updateGuidanceCard(tpl) {
      if (!tplGuidanceBox) return;
      if (guideBadge) guideBadge.textContent = tpl.category_tag || 'Expert Directive';
      if (guideDesc) guideDesc.textContent = tpl.tone_guidelines || tpl.description;
      if (guideRulesContainer) {
        const rules = tpl.display_tags || ['⚡ 0-3s Open Loop', '📈 Retention Arc'];
        guideRulesContainer.innerHTML = rules.map(r => `<span class="vsw-rule-tag">${escapeHtml(r)}</span>`).join('');
      }
    }

    // Load Demo Scripts Button Handler
    btnLoadDemo?.addEventListener('click', () => {
      currentScriptChips = demoScripts.map(s => ({
        name: s.name,
        size: s.size,
        text: s.text,
        wordCount: s.text.trim().split(/\s+/).filter(Boolean).length
      }));
      renderFilesList();
    });

    renderTemplatesList(currentTemplates);

    // ── Step 1 Action: Analyze Scripts (Concurrent Groq Calls + Modal) ───────────
    btnAnalyze?.addEventListener('click', async () => {
      if (!currentScriptChips.length) {
        // Auto-load 5 samples if user clicks analyze without selecting files
        currentScriptChips = demoScripts.map(s => ({
          name: s.name,
          size: s.size,
          text: s.text,
          wordCount: s.text.trim().split(/\s+/).filter(Boolean).length
        }));
        renderFilesList();
      }

      btnAnalyze.disabled = true;
      btnAnalyze.innerHTML = `<span class="sparkle">⏳</span> Analyzing DNA...`;
      setStepperStep(1);

      try {
        // Parallel Groq Analysis for each uploaded script (Section 9 Non-Functional Req)
        const analysisPromises = currentScriptChips.map((s, idx) => {
          if (window.AI?.hasPrimaryApiKey() && window.AI?.analyzeSingleScriptGroq) {
            return window.AI.analyzeSingleScriptGroq(s.text, s.name).catch(err => {
              console.warn(`Groq script analysis fallback for ${s.name}:`, err.message);
              return generateFallbackAnalysis(s.text, s.name, idx + 1);
            });
          }
          return Promise.resolve(generateFallbackAnalysis(s.text, s.name, idx + 1));
        });

        const individualReports = await Promise.all(analysisPromises);
        lastAnalysisReports = individualReports;

        // Step 2: Extract 5 Reusable Templates from the Analysis Reports
        let extractedTemplates = [];
        if (window.AI?.hasPrimaryApiKey() && window.AI?.extractViralTemplatesGroq) {
          try {
            extractedTemplates = await window.AI.extractViralTemplatesGroq(individualReports);
          } catch (tErr) {
            console.warn('AI Template extraction fallback:', tErr);
            extractedTemplates = defaultTemplates;
          }
        } else {
          extractedTemplates = defaultTemplates;
        }

        if (extractedTemplates && extractedTemplates.length) {
          currentTemplates = extractedTemplates;
          renderTemplatesList(currentTemplates);
        }

        setStepperStep(2);
        btnAnalyze.innerHTML = `<span class="sparkle">✓</span> Analyzed!`;

        // Open Comprehensive Intelligence Report Modal
        populateAndOpenIntelligenceModal(individualReports);

        setTimeout(() => {
          btnAnalyze.innerHTML = `<span class="sparkle">✨</span> Analyze Scripts`;
          btnAnalyze.disabled = false;
        }, 1600);

      } catch (err) {
        console.error('Analysis exception, applying safe fallback:', err);
        btnAnalyze.innerHTML = `<span class="sparkle">✨</span> Analyze Scripts`;
        btnAnalyze.disabled = false;
        const fallbackReports = currentScriptChips.map((s, i) => generateFallbackAnalysis(s.text, s.name, i + 1));
        lastAnalysisReports = fallbackReports;
        populateAndOpenIntelligenceModal(fallbackReports);
        setStepperStep(2);
      }
    });

    function generateFallbackAnalysis(text, name, index) {
      const words = (text || '').trim().split(/\s+/).filter(Boolean).length;
      return {
        scriptName: name || `Script ${index}.txt`,
        word_count: words,
        estimated_video_length_minutes: parseFloat((words / 150).toFixed(1)),
        hook_analysis: {
          hook_type: "controversial_claim",
          hook_text: (text || '').slice(0, 120) + '...',
          why_it_works: "Hooks viewers in 0-3s with high curiosity and cognitive gap."
        },
        structural_arc: "problem_solution",
        pacing_analysis: {
          avg_sentence_length_words: 14,
          pacing_style: "fast",
          rhythm_notes: "Alternates punchy sentences with vivid evidence."
        },
        emotional_triggers: ["Curiosity gap", "Transformation desire"],
        open_loops: ["Opened in intro, resolved in climax"],
        vocabulary_level: "intermediate",
        repetition_technique: "Rhythmic callbacks to core principles",
        cta_placement: "End of script",
        why_this_goes_viral: "High value density and zero fluff.",
        reusable_formula: "Hook (10%) -> Agitation (20%) -> Evidence (35%) -> Transformation (25%) -> CTA (10%)"
      };
    }

    // Populate and Open the Intelligence Report Modal
    function populateAndOpenIntelligenceModal(reports) {
      if (!reports || !reports.length) return;

      const totalWords = reports.reduce((sum, r) => sum + (r.word_count || 0), 0);
      const avgWords = Math.round(totalWords / reports.length);
      const estTime = (avgWords / 150).toFixed(1);

      // Populate Summary Cards
      const elTotal = document.getElementById('rep-total-scripts');
      if (elTotal) elTotal.textContent = String(reports.length);

      const elAvg = document.getElementById('rep-avg-words');
      if (elAvg) elAvg.textContent = `${avgWords} Words`;

      const elTime = document.getElementById('rep-est-time');
      if (elTime) elTime.textContent = `~${estTime} Mins`;

      const elSent = document.getElementById('rep-sentence-length');
      if (elSent) elSent.textContent = `${reports[0]?.pacing_analysis?.avg_sentence_length_words || 14} Words/Sent`;

      // Populate Table
      const tableContainer = document.getElementById('rep-scripts-table-container');
      if (tableContainer) {
        tableContainer.innerHTML = `
          <table class="rep-scripts-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Script Name</th>
                <th>Word Count</th>
                <th>Est. Time</th>
                <th>Hook Type</th>
                <th>Structural Arc</th>
              </tr>
            </thead>
            <tbody>
              ${reports.map((r, i) => `
                <tr>
                  <td><strong>${i + 1}</strong></td>
                  <td><strong>${escapeHtml(r.scriptName || `script_${i+1}.txt`)}</strong></td>
                  <td><span class="rep-meta-pill">${r.word_count || 0} words</span></td>
                  <td>${r.estimated_video_length_minutes || '2.0'} min</td>
                  <td><span style="color: #c084fc; font-weight: 600;">${escapeHtml(r.hook_analysis?.hook_type || 'Curiosity')}</span></td>
                  <td><span class="rep-strength-badge">${escapeHtml(r.structural_arc || 'Story Flow')}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }

      // Populate Individual Script Breakdown Cards
      if (repIndividualView) {
        repIndividualView.innerHTML = reports.map((r, i) => `
          <div class="rep-single-script-card" id="card-script-${i}">
            <div class="rep-single-header">
              <div class="rep-single-title-group">
                <span class="rep-file-badge">SCRIPT ${i + 1}</span>
                <h4 class="rep-single-filename">${escapeHtml(r.scriptName || `Script ${i + 1}`)}</h4>
              </div>
              <div class="rep-single-badges-row">
                <span class="rep-meta-pill">📊 ${r.word_count} Words</span>
                <span class="rep-meta-pill">⏱️ ${r.estimated_video_length_minutes} Min</span>
                <span class="rep-meta-pill">⚡ Pacing: ${r.pacing_analysis?.pacing_style || 'Fast'}</span>
                <span class="rep-meta-pill">🔤 Vocab: ${r.vocabulary_level || 'Intermediate'}</span>
              </div>
            </div>

            <!-- Hook Breakdown -->
            <div class="rep-hook-box">
              <div class="rep-box-label text-purple">
                <span>🪝 0-3s OPENING HOOK ANALYSIS (${escapeHtml(r.hook_analysis?.hook_type || 'Hook')})</span>
              </div>
              <div class="rep-hook-quote">"${escapeHtml(r.hook_analysis?.hook_text || '')}"</div>
              <div class="rep-hook-meta-row" style="margin-top: 6px; font-size: 11px; color: #cbd5e1;">
                <strong>Why it works:</strong> ${escapeHtml(r.hook_analysis?.why_it_works || '')}
              </div>
            </div>

            <!-- Why Viral -->
            <div class="rep-viral-why-box">
              <div class="rep-box-label text-orange">
                <span>🚀 WHY THIS GOES VIRAL (Audience Retention Mechanics)</span>
              </div>
              <p>${escapeHtml(r.why_this_goes_viral || '')}</p>
            </div>

            <!-- Reusable Formula -->
            <div class="rep-structure-flow">
              <div class="rep-box-label text-green">
                <span>📐 REUSABLE VIRAL BLUEPRINT</span>
              </div>
              <p style="font-size: 12px; color: #e2e8f0; margin: 4px 0 0 0;">${escapeHtml(r.reusable_formula || '')}</p>
            </div>
          </div>
        `).join('');
      }

      // Populate Tabs
      if (repTabBar) {
        let tabsHtml = `<button class="rep-tab-btn active" data-target="rep-view-combined-summary" type="button">📊 All Scripts Overview</button>`;
        reports.forEach((r, i) => {
          tabsHtml += `<button class="rep-tab-btn" data-target="card-script-${i}" type="button">📄 ${escapeHtml(r.scriptName || `Script ${i + 1}`)}</button>`;
        });
        repTabBar.innerHTML = tabsHtml;

        repTabBar.querySelectorAll('.rep-tab-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            repTabBar.querySelectorAll('.rep-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const target = btn.dataset.target;
            if (target === 'rep-view-combined-summary') {
              if (repCombinedView) repCombinedView.style.display = 'block';
              if (repIndividualView) repIndividualView.style.display = 'block';
              repCombinedView?.scrollIntoView({ behavior: 'smooth' });
            } else {
              if (repCombinedView) repCombinedView.style.display = 'none';
              if (repIndividualView) repIndividualView.style.display = 'block';
              document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          });
        });
      }

      modalReport?.classList.remove('hidden');
    }

    // Modal Close
    btnCloseReportModal?.addEventListener('click', () => modalReport?.classList.add('hidden'));
    btnCloseReportAct?.addEventListener('click', () => modalReport?.classList.add('hidden'));
    modalReport?.addEventListener('click', (e) => {
      if (e.target === modalReport) modalReport.classList.add('hidden');
    });

    // Copy Report
    btnCopyReport?.addEventListener('click', () => {
      if (!lastAnalysisReports.length) return;
      const text = JSON.stringify(lastAnalysisReports, null, 2);
      navigator.clipboard.writeText(text);
      btnCopyReport.textContent = '✓ Copied!';
      setTimeout(() => { btnCopyReport.textContent = '📋 Copy Full Report'; }, 1500);
    });

    // ── Step 3 Action: Generate Script (Exact Word Count Accuracy Engine) ───────
    btnGenerate?.addEventListener('click', async () => {
      const title = (inputTitle?.value || '').trim();
      let targetWords = parseInt(inputWordCount?.value || '800', 10);
      if (inputWordCount?.value === 'custom') {
        targetWords = parseInt(inputCustomWords?.value || '800', 10);
      }

      if (!title) {
        alert('Please enter a script title or topic.');
        inputTitle?.focus();
        return;
      }

      const activeTpl = currentTemplates.find(t => t.id === selectedTemplateKey) || currentTemplates[0];

      btnGenerate.disabled = true;
      btnGenerate.innerHTML = `Generating Script <span class="sparkle">⏳</span>`;
      progressContainer?.classList.remove('hidden');
      if (sectionLiveLogs) sectionLiveLogs.innerHTML = '';
      if (accuracyBadge) accuracyBadge.classList.add('hidden');
      setStepperStep(3);

      try {
        let result = null;
        if (window.AI?.generateScriptExactWordCount) {
          result = await window.AI.generateScriptExactWordCount({
            title: title,
            template: activeTpl,
            targetWordCount: targetWords
          }, (prog) => {
            // Live Progress Callback
            if (progressLabel) progressLabel.textContent = prog.message || 'Generating...';
            if (progressPct) progressPct.textContent = `${prog.percent || 0}%`;
            if (progressBarFill) progressBarFill.style.width = `${prog.percent || 0}%`;

            if (prog.stage === 'generating_section' && sectionLiveLogs) {
              const line = document.createElement('div');
              line.textContent = `▶ Section ${prog.sectionIndex}/${prog.totalSections}: "${prog.sectionName}" (Target ~${prog.budget}w)`;
              sectionLiveLogs.appendChild(line);
            } else if (prog.stage === 'adjusting_section' && sectionLiveLogs) {
              const line = document.createElement('div');
              line.style.color = '#facc15';
              line.textContent = `⚙️ Word count adjust pass: ${prog.currentWords}w ➔ ~${prog.targetWords}w`;
              sectionLiveLogs.appendChild(line);
            }
          });
        }

        if (!result || !result.script) {
          throw new Error('Generation produced no script content.');
        }

        lastGeneratedResultData = result;
        lastGeneratedScriptText = result.script;
        if (rawOutput) rawOutput.value = result.script;

        // Render Formatted Script
        renderFormattedScript(result.script);
        setStepperStep(4);

        // Display Word Count Accuracy Badge (Section 5.2 #5)
        if (accuracyBadge) {
          accuracyBadge.textContent = `🎯 Target: ${result.targetWordCount} | Actual: ${result.finalWordCount} words | Accuracy: ${result.accuracyPct}`;
          accuracyBadge.classList.remove('hidden');
        }

        btnGenerate.innerHTML = `Script Ready! <span class="sparkle">✓</span>`;
        setTimeout(() => {
          btnGenerate.innerHTML = `Generate Script <span class="sparkle">✨</span>`;
          btnGenerate.disabled = false;
        }, 2000);

      } catch (err) {
        console.error('Exact Script Generation Exception:', err);
        btnGenerate.innerHTML = `Generate Script <span class="sparkle">✨</span>`;
        btnGenerate.disabled = false;
        alert('Error generating script: ' + err.message);
      }
    });

    function renderFormattedScript(fullText) {
      if (!formattedView) return;
      const lines = fullText.split('\n');
      let html = '';
      let currentSection = '';
      let currentParagraph = '';

      lines.forEach(line => {
        const trimmed = line.trim();
        if (/^\[(.*?)\]$/i.test(trimmed) || /^(HOOK|INTRO|AGITATION|STORY|EVIDENCE|LESSON|SOLUTION|TRANSFORMATION|CLIMAX|CTA|OUTRO):/i.test(trimmed)) {
          if (currentSection && currentParagraph) {
            html += formatBlock(currentSection, currentParagraph);
          }
          currentSection = trimmed.replace(/^\[|\]$/g, '').toUpperCase();
          currentParagraph = '';
        } else if (trimmed) {
          currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
        }
      });

      if (currentSection && currentParagraph) {
        html += formatBlock(currentSection, currentParagraph);
      }

      if (!html) {
        html = `<div class="vsw-script-chunk"><p>${escapeHtml(fullText)}</p></div>`;
      }

      formattedView.innerHTML = html;
    }

    function formatBlock(section, text) {
      return `
        <div class="vsw-script-chunk" style="margin-bottom: 16px; padding: 12px 14px; background: rgba(30, 41, 59, 0.4); border-left: 3px solid #a855f7; border-radius: 6px;">
          <span class="vsw-chunk-pill" style="font-size: 11px; font-weight: 700; color: #c084fc; display: inline-block; margin-bottom: 6px;">[${escapeHtml(section)}]</span>
          <p style="margin: 0; color: #e2e8f0; font-size: 13.5px; line-height: 1.6;">${escapeHtml(text)}</p>
        </div>
      `;
    }

    // ── Step 4 Actions: Export Handlers (Copy, TXT, DOCX, To Prompts) ───────────
    btnCopy?.addEventListener('click', () => {
      const textToCopy = rawOutput?.value || lastGeneratedScriptText;
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy);
        btnCopy.textContent = '✓ Copied!';
        setTimeout(() => { btnCopy.textContent = '📋 Copy'; }, 1500);
      }
    });

    btnDownload?.addEventListener('click', () => {
      const textToSave = rawOutput?.value || lastGeneratedScriptText;
      if (textToSave) {
        const title = (inputTitle?.value || 'viral_script').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        downloadFile(textToSave, `${title}.txt`, 'text/plain');
      }
    });

    // Real DOCX Export Handler (Section 1 & 8)
    btnDownloadDocx?.addEventListener('click', () => {
      const textToSave = rawOutput?.value || lastGeneratedScriptText;
      if (!textToSave) {
        alert('Please generate a script first.');
        return;
      }
      const title = (inputTitle?.value || 'viral_script').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadDocx(textToSave, `${title}.docx`);
    });

    function downloadDocx(text, filename) {
      const htmlContent = `
        <!DOCTYPE html>
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${escapeHtml(filename)}</title>
        <style>
          body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #111; padding: 24px; }
          h2 { color: #581c87; font-size: 13pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-top: 18px; }
          p { margin-bottom: 12px; }
          .meta { font-size: 9.5pt; color: #64748b; font-style: italic; margin-bottom: 18px; }
        </style>
        </head>
        <body>
          <h1>${escapeHtml(filename.replace(/\.docx$/i, ''))}</h1>
          <div class="meta">Generated by AutoEdit Viral AI Script Writer • Target Calibrated</div>
          ${text.split('\n\n').map(p => {
            if (/^\[(.*?)\]/.test(p.trim())) {
              const match = p.trim().match(/^\[(.*?)\]/);
              const rest = p.trim().replace(/^\[(.*?)\]\s*/, '');
              return `<h2>${match[1]}</h2><p>${escapeHtml(rest)}</p>`;
            }
            return `<p>${escapeHtml(p)}</p>`;
          }).join('')}
        </body>
        </html>
      `;
      const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.endsWith('.docx') ? filename : `${filename}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    btnSendPrompts?.addEventListener('click', () => {
      const text = rawOutput?.value || lastGeneratedScriptText;
      if (text) {
        const promptScriptInp = document.getElementById('vpg-input-script');
        if (promptScriptInp) {
          promptScriptInp.value = text;
          promptScriptInp.dispatchEvent(new Event('input', { bubbles: true }));
        }
        switchTool('prompt-generator');
      }
    });
  }

  // ── 6. Tool 3: Visual Prompt Generator (Pixel-Perfect Full Implementation) ───
    function wirePromptGeneratorTool() {
    // DOM Elements
    const dropzoneBox       = document.getElementById('vpg-dropzone-box');
    const fileInput         = document.getElementById('input-vpg-ref-images');
    const btnBrowse         = document.getElementById('vpg-btn-browse-images');
    const thumbsContainer   = document.getElementById('vpg-thumbnails-container');
    const countNumEl        = document.getElementById('vpg-img-count-num');
    const checkCircleEl     = document.getElementById('vpg-check-circle');
    const btnAnalyzeStyle   = document.getElementById('btn-vpg-analyze-style');

    // Analysis Card Elements
    const valStyle          = document.getElementById('vpg-val-style');
    const valEnv            = document.getElementById('vpg-val-environment');
    const valMood           = document.getElementById('vpg-val-mood');
    const valCamera         = document.getElementById('vpg-val-camera');
    const valSubjects       = document.getElementById('vpg-val-subjects');
    const valLighting       = document.getElementById('vpg-val-lighting');
    const valTexture        = document.getElementById('vpg-val-texture');
    const swatchesBox       = document.getElementById('vpg-swatches-container');
    const btnViewFullReport = document.getElementById('btn-vpg-view-full-report');
    const analysisTextReport = document.getElementById('vpg-analysis-text-report');
    const analysisTextWrap = document.getElementById('vpg-analysis-text-wrap');
    const btnCopyAnalysisText = document.getElementById('btn-vpg-copy-analysis-text');

    // Full Report Modal Elements
    const modalStyleReport  = document.getElementById('modal-visual-style-report');
    const btnCloseModal     = document.getElementById('btn-close-vpg-report-modal');
    const btnCloseModalAct  = document.getElementById('btn-close-vpg-report-action');
    const btnCopyReport     = document.getElementById('btn-vpg-copy-full-report');
    const btnDownloadReport = document.getElementById('btn-vpg-download-full-report');
    const btnCopySuffix     = document.getElementById('btn-vpg-copy-master-suffix');
    const repTotalImgs      = document.getElementById('vpg-rep-total-images');
    const repPaletteGrid    = document.getElementById('vpg-rep-palette-grid');

    // Card 3: Create Template
    const btnCreateTemplate = document.getElementById('btn-vpg-create-template');
    const templateLibrary  = document.getElementById('vpg-template-library');
    const masterPromptWrap = document.getElementById('vpg-master-prompt-wrap');
    const masterPromptText = document.getElementById('vpg-master-prompt-text');
    const btnCopyMasterPrompt = document.getElementById('btn-vpg-copy-master-prompt');
    const btnDownloadMasterPrompt = document.getElementById('btn-vpg-download-master-prompt');

    // Master Prompt file library
    const btnOpenMasterLibrary = document.getElementById('btn-vpg-open-master-library');
    const masterLibraryModal = document.getElementById('modal-vpg-master-library');
    const btnCloseMasterLibrary = document.getElementById('btn-vpg-close-master-library');
    const btnUploadMasterFile = document.getElementById('btn-vpg-upload-master-file');
    const inputMasterFile = document.getElementById('input-vpg-master-file');
    const masterLibraryList = document.getElementById('vpg-master-library-list');
    const masterLibraryCount = document.getElementById('vpg-library-count');
    const masterLibraryPreview = document.getElementById('vpg-master-library-preview');
    const masterLibraryPreviewTitle = document.getElementById('vpg-library-preview-title');
    const masterLibraryName = document.getElementById('vpg-master-library-name');
    const btnSaveLibraryName = document.getElementById('btn-vpg-save-library-name');
    const btnCopyLibraryPrompt = document.getElementById('btn-vpg-copy-library-prompt');
    const btnUseLibraryPrompt = document.getElementById('btn-vpg-use-library-prompt');

    // Card 4: Script to Prompts
    const inputScript       = document.getElementById('vpg-input-script');
    const scriptWordCounter = document.getElementById('vpg-script-words-counter');
    const detailPillBtns    = document.querySelectorAll('.vpg-pill-btn');
    const btnUploadTxtFile  = document.getElementById('btn-vpg-upload-script-file');
    const inputScriptFile   = document.getElementById('input-vpg-script-file');
    const btnGeneratePrompts= document.getElementById('btn-vpg-generate-prompts');
    const workflowStatus    = document.getElementById('vpg-workflow-status');

    // Card 5: Output
    const emptyPlaceholder  = document.getElementById('vpg-empty-prompts-placeholder');
    const promptsListGrid   = document.getElementById('vpg-prompts-list-grid');
    const btnCopyAll        = document.getElementById('btn-vpg-copy-all');
    const btnDownloadTxt    = document.getElementById('btn-vpg-download-txt');

    // State Variables
    let uploadedImageFiles = [];
    const uploadedImageUrls = new Map();
    let selectedDetailLevel = 'standard';
    try { selectedDetailLevel = localStorage.getItem('cipher_vpg_detail_level') || 'standard'; } catch (_) {}
    let generatedPromptsData = [];
    let nextSceneBeatOffset = 0;
    const ashfolkStyleSuffix = 'hand-drawn 2D animated-documentary illustration, simple faceless stick-figure characters with plain white round or oval heads, two small black dot eyes, thin eyebrows for emotion, one simple black line mouth, absolutely NO nose, NO ears, NO additional facial detail, thin black line arms and legs, simple flat hide/fur clothing shapes, bold clean black ink outlines, placed inside a rich fully-illustrated atmospheric environment with soft shading, subtle gradients and cinematic lighting, moody colour palette matched to the setting, detailed background with real depth and atmosphere, warm firelight glow or cold blue tones where appropriate, animated documentary look, NOT flat, NOT a plain white or empty background, no realism, no 3D, no photorealism, no glossy rendering, cinematic 16:9';
    const ashfolkRules = 'ASHFOLK channel workflow: simple white-faced stick figures in rich atmospheric illustrated worlds, never blank backgrounds; use varied shots; use a bold red X only for meaningful explicit negation; use visual symbols inside real environments for abstract ideas; preserve every supplied timestamp exactly; keep recurring figures visually consistent directly inside each scene prompt.';
    try {
      const savedPrompts = JSON.parse(localStorage.getItem('cipher_vpg_generated_prompts') || '[]');
      if (Array.isArray(savedPrompts)) generatedPromptsData = savedPrompts;
    } catch (error) { console.warn('[VPG] Could not restore generated prompts:', error); }
    let activeStyleAnalysis = {
      style: 'Cinematic, Realistic',
      environment: 'Medieval, Ancient, Natural, Indoor',
      mood: 'Dark, Dramatic, Mysterious',
      camera: 'Wide Shots, Deep Depth, Rule of Thirds',
      subjects: 'Castles, Landscapes, Architecture, No People',
      lighting: 'Low Light, High Contrast, Moody',
      texture: 'Detailed, Realistic, Rich Textures',
      colors: [
        { hex: '#1e3a5f', name: 'Deep Midnight Slate' },
        { hex: '#334155', name: 'Cold Charcoal Stone' },
        { hex: '#cbd5e1', name: 'Misty Platinum Sky' },
        { hex: '#78350f', name: 'Aged Weathered Timber' },
        { hex: '#92400e', name: 'Warm Amber Hearth' }
      ],
      masterSuffix: '--ar 16:9 --style raw --v 6.0 --c 5 --s 750 cinematic lighting, ultra-detailed textures, 8k resolution, volumetric atmospheric fog, photorealistic octane render'
    };
    try {
      const savedStyle = JSON.parse(localStorage.getItem('cipher_vpg_style_blueprint') || 'null');
      if (savedStyle?.style) activeStyleAnalysis = { ...activeStyleAnalysis, ...savedStyle.style };
    } catch (error) { console.warn('[VPG] Could not restore style blueprint:', error); }
    let hasAnalyzedStyle = Boolean(localStorage.getItem('cipher_vpg_style_blueprint'));

    function saveGeneratedPrompts() {
      try { localStorage.setItem('cipher_vpg_generated_prompts', JSON.stringify(generatedPromptsData.slice(0, 150))); }
      catch (error) { console.warn('[VPG] Could not save prompts:', error); }
    }

    function safeVpgColors(colors, fallback = activeStyleAnalysis.colors) {
      const cleaned = (Array.isArray(colors) ? colors : []).map(color => ({
        hex: String(color?.hex || '').trim(), name: String(color?.name || '').trim()
      })).filter(color => /^#[0-9a-f]{6}$/i.test(color.hex)).slice(0, 8);
      return cleaned.length ? cleaned : fallback;
    }

    function copyVpgText(value, button, originalLabel) {
      const fallback = () => {
        const textarea = document.createElement('textarea');
        textarea.value = value; textarea.style.position = 'fixed'; textarea.style.opacity = '0';
        document.body.appendChild(textarea); textarea.select();
        const copied = document.execCommand('copy'); document.body.removeChild(textarea);
        if (!copied) throw new Error('Clipboard access was denied.');
      };
      Promise.resolve(navigator.clipboard?.writeText ? navigator.clipboard.writeText(value) : fallback())
        .then(() => { button.textContent = '✓ Copied!'; setTimeout(() => { button.textContent = originalLabel; }, 1500); })
        .catch(() => alert('Could not copy automatically. Please select and copy the text manually.'));
    }

    function renderTemplateLibrary() {
      if (!templateLibrary) return;
      const templates = getSavedVpgTemplates();
      templateLibrary.innerHTML = '<option value="">Saved templates...</option><option value="builtin-ashfolk">ASHFOLK — stick-figure documentary</option>' + templates.map(template =>
        `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`).join('');
    }

    let selectedMasterLibraryId = '';
    function getPersistedVpgTemplates() {
      try { return JSON.parse(localStorage.getItem('cipher_vpg_style_templates') || '[]'); }
      catch (_) { return []; }
    }
    function getSavedVpgTemplates() {
      // A built-in Master Prompt is a reusable instruction document, not an
      // image-analysis result. Never fabricate an analysis report from it.
      const builtIn = window.AI?.getBuiltInVpgMasterPrompts?.() || [];
      const persisted = getPersistedVpgTemplates().filter(template => !builtIn.some(defaultTemplate => defaultTemplate.id === template.id));
      return [...builtIn, ...persisted];
    }

    function renderMasterPromptLibrary(selectedId = selectedMasterLibraryId) {
      if (!masterLibraryList) return;
      const templates = getSavedVpgTemplates().filter(template => String(template?.masterPrompt || '').trim());
      const selected = templates.find(template => template.id === selectedId) || null;
      selectedMasterLibraryId = selected?.id || '';
      if (masterLibraryCount) masterLibraryCount.textContent = String(templates.length);
      masterLibraryList.innerHTML = templates.length ? '' : '<div class="vpg-library-empty">No imported Master Prompts yet. Upload a <b>.txt</b> or <b>.md</b> file to start your library.</div>';
      templates.forEach(template => {
        const row = document.createElement('div');
        row.className = `vpg-library-item${template.id === selectedMasterLibraryId ? ' active' : ''}`;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'vpg-library-item-select';
        item.innerHTML = `<strong>${escapeHtml(template.name || 'Untitled Master Prompt')}</strong><small>${escapeHtml(String(template.masterPrompt).replace(/\s+/g, ' ').slice(0, 78))}</small>`;
        item.addEventListener('click', () => renderMasterPromptLibrary(template.id));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'vpg-library-item-delete';
        remove.title = `Delete ${template.name || 'Master Prompt'}`;
        remove.setAttribute('aria-label', remove.title);
        remove.textContent = '🗑';
        if (template.builtin) {
          remove.disabled = true;
          remove.title = 'Built-in default Master Prompt';
          remove.setAttribute('aria-label', remove.title);
          remove.textContent = '🔒';
        } else remove.addEventListener('click', () => {
          if (!confirm(`Delete “${template.name || 'this Master Prompt'}”? This only removes the local saved copy.`)) return;
          const remaining = getPersistedVpgTemplates().filter(entry => entry.id !== template.id);
          localStorage.setItem('cipher_vpg_style_templates', JSON.stringify(remaining));
          if (templateLibrary?.value === template.id) templateLibrary.value = '';
          if (selectedMasterLibraryId === template.id) selectedMasterLibraryId = '';
          renderTemplateLibrary();
          renderMasterPromptLibrary();
        });
        row.append(item, remove);
        masterLibraryList.appendChild(row);
      });
      if (masterLibraryPreview) masterLibraryPreview.value = selected?.masterPrompt || '';
      if (masterLibraryPreviewTitle) masterLibraryPreviewTitle.textContent = selected ? selected.name : 'Prompt Preview';
      if (masterLibraryName) { masterLibraryName.value = selected?.name || ''; masterLibraryName.disabled = !selected; }
      if (btnSaveLibraryName) btnSaveLibraryName.disabled = !selected;
      if (btnCopyLibraryPrompt) btnCopyLibraryPrompt.disabled = !selected;
      if (btnUseLibraryPrompt) btnUseLibraryPrompt.disabled = !selected;
    }

    function closeMasterPromptLibrary() {
      masterLibraryModal?.classList.add('hidden');
    }

    function updateWorkflowStatus(message) { if (workflowStatus) workflowStatus.textContent = message; }

    function getAnalysisTextReport() {
      const palette = (activeStyleAnalysis.colors || []).map(color => `- ${color.hex}${color.name ? ` (${color.name})` : ''}`).join('\n') || 'No palette returned';
      const structured = `VISUAL STYLE ANALYSIS\n\nOverall style\n${activeStyleAnalysis.style || 'Not detected'}\n\nEnvironment\n${activeStyleAnalysis.environment || 'Not detected'}\n\nTone / mood\n${activeStyleAnalysis.mood || 'Not detected'}\n\nCamera / composition\n${activeStyleAnalysis.camera || 'Not detected'}\n\nSubjects / recurring motifs\n${activeStyleAnalysis.subjects || 'Not detected'}\n\nLighting\n${activeStyleAnalysis.lighting || 'Not detected'}\n\nTexture / detail\n${activeStyleAnalysis.texture || 'Not detected'}\n\nColor palette\n${palette}\n\nStyle summary\n${activeStyleAnalysis.styleSummary || 'The AI did not provide an additional written summary.'}\n\nNegative prompt / exclusions\n${activeStyleAnalysis.negativePrompt || 'None supplied'}\n\nMaster prompt suffix\n${activeStyleAnalysis.masterSuffix || 'None supplied'}`;
      return activeStyleAnalysis.detailedReport ? `${activeStyleAnalysis.detailedReport}\n\n================================================================\n${structured}` : structured;
    }

    function renderAnalysisTextReport() {
      if (analysisTextReport) analysisTextReport.value = getAnalysisTextReport();
      analysisTextWrap?.classList.toggle('hidden', !hasAnalyzedStyle);
    }

    function renderMasterPrompt() {
      const masterPrompt = String(activeStyleAnalysis.masterPrompt || '').trim();
      if (masterPromptText) masterPromptText.value = masterPrompt;
      masterPromptWrap?.classList.toggle('hidden', !masterPrompt);
    }

    // ── Stepper Navigation ──────────────────────────────────
      function setVpgStepper(stepNum) {
        // The interface has three user-facing stages. Export actions belong to
        // Scene Prompts, so a legacy completion state (4) resolves to stage 3.
        const visibleStep = Math.min(stepNum, 3);
        for (let i = 1; i <= 3; i++) {
          const item = document.getElementById(`vpg-step-indicator-${i}`);
          if (item) {
            if (i <= visibleStep) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        }
      }
        // Arrows
        document.querySelectorAll('.vpg-stepper-bar .vpg-step-arrow').forEach((arrow, idx) => {
          if (idx < visibleStep - 1) {
          arrow.classList.add('active');
        } else {
          arrow.classList.remove('active');
        }
      });
        for (let i = 1; i <= 3; i++) {
         document.getElementById(`vpg-side-stage-${i}`)?.classList.toggle('active', i === visibleStep);
        }
      }

    // ── Dropzone & Browse Handlers ───────────────────────────
    btnBrowse?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });

    dropzoneBox?.addEventListener('click', () => {
      fileInput?.click();
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropzoneBox?.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzoneBox.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzoneBox?.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzoneBox.classList.remove('dragover');
      });
    });

    dropzoneBox?.addEventListener('drop', (e) => {
      const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
      handleImagesAdded(files);
    });

    fileInput?.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      handleImagesAdded(files);
    });

    function handleImagesAdded(newFiles) {
      const validFiles = newFiles.filter(file => file?.type?.startsWith('image/') && file.size > 0 && file.size <= 12 * 1024 * 1024);
      const existing = new Set(uploadedImageFiles.map(file => `${file.name}:${file.size}:${file.lastModified}`));
      const unique = validFiles.filter(file => !existing.has(`${file.name}:${file.size}:${file.lastModified}`));
      const room = Math.max(0, 10 - uploadedImageFiles.length);
      if (!unique.length) { alert('Choose valid, unique images up to 12 MB each.'); return; }
      if (!room) { alert('You can use a maximum of 10 reference images.'); return; }
      uploadedImageFiles.push(...unique.slice(0, room));
      if (unique.length > room) alert(`Only ${room} image(s) were added; the limit is 10.`);
      renderUploadedThumbnails();
      setVpgStepper(1);
      if (fileInput) fileInput.value = '';
    }

    function renderUploadedThumbnails() {
      if (!thumbsContainer) return;
      thumbsContainer.innerHTML = '';

      const count = uploadedImageFiles.length;
      if (countNumEl) countNumEl.textContent = count;
      if (repTotalImgs) repTotalImgs.textContent = count;

      if (count >= 1) {
        checkCircleEl?.classList.remove('hidden');
        if (btnAnalyzeStyle) btnAnalyzeStyle.disabled = count < 5;
      } else {
        checkCircleEl?.classList.add('hidden');
        if (btnAnalyzeStyle) btnAnalyzeStyle.disabled = true;
      }

      // Every selected image remains removable, even beyond the preview row.
      const displayCount = count;
      for (let i = 0; i < displayCount; i++) {
        const file = uploadedImageFiles[i];
        const item = document.createElement('div');
        item.className = 'vpg-thumb-item';

        const img = document.createElement('img');
        img.className = 'vpg-thumb-img';
        let url = uploadedImageUrls.get(file);
        if (!url) { url = URL.createObjectURL(file); uploadedImageUrls.set(file, url); }
        img.src = url;
        img.alt = file.name;

        const btnRemove = document.createElement('button');
        btnRemove.className = 'vpg-thumb-remove';
        btnRemove.innerHTML = '✕';
        btnRemove.type = 'button';
        btnRemove.title = 'Remove Image';
        btnRemove.addEventListener('click', (e) => {
          e.stopPropagation();
          const removed = uploadedImageFiles.splice(i, 1)[0];
          const removedUrl = uploadedImageUrls.get(removed);
          if (removedUrl) URL.revokeObjectURL(removedUrl);
          uploadedImageUrls.delete(removed);
          renderUploadedThumbnails();
        });

        item.appendChild(img);
        item.appendChild(btnRemove);
        thumbsContainer.appendChild(item);
      }

    }

    renderUploadedThumbnails();

    // ── Analyze Visual Style Action ──────────────────────────
    btnAnalyzeStyle?.addEventListener('click', async () => {
      if (uploadedImageFiles.length < 5) {
        alert('Upload at least 5 reference images before analysis.');
        return;
      }
      btnAnalyzeStyle.disabled = true;
      btnAnalyzeStyle.innerHTML = `<span class="sparkle">⏳</span> Analyzing Visual DNA...`;

      try {
        if (!window.AI?.analyzeImageStylePrompts) throw new Error('Visual analysis provider is unavailable.');
        const res = await window.AI.analyzeImageStylePrompts(uploadedImageFiles);
        if (!res) throw new Error('The provider returned no visual analysis.');
        activeStyleAnalysis = {
          ...activeStyleAnalysis,
          style: res.styleName || activeStyleAnalysis.style,
          environment: res.environment || activeStyleAnalysis.environment,
          mood: res.mood || activeStyleAnalysis.mood,
          lighting: res.lighting || activeStyleAnalysis.lighting,
          camera: res.camera || res.cameraLens || activeStyleAnalysis.camera,
          subjects: res.subjects || activeStyleAnalysis.subjects,
          texture: res.texture || res.medium || activeStyleAnalysis.texture,
          colors: safeVpgColors(res.colors),
          masterSuffix: res.masterSuffix || res.masterPromptSuffix || activeStyleAnalysis.masterSuffix,
          negativePrompt: res.negativePrompt || activeStyleAnalysis.negativePrompt || '',
          styleSummary: res.styleSummary || activeStyleAnalysis.styleSummary || '',
          detailedReport: res.detailedReport || activeStyleAnalysis.detailedReport || ''
        };
        localStorage.setItem('cipher_vpg_style_blueprint', JSON.stringify({ style: activeStyleAnalysis, savedAt: Date.now() }));
        hasAnalyzedStyle = true;

        // Update UI attributes
        if (valStyle) valStyle.textContent = activeStyleAnalysis.style;
        if (valEnv) valEnv.textContent = activeStyleAnalysis.environment;
        if (valMood) valMood.textContent = activeStyleAnalysis.mood;
        if (valCamera) valCamera.textContent = activeStyleAnalysis.camera;
        if (valSubjects) valSubjects.textContent = activeStyleAnalysis.subjects;
        if (valLighting) valLighting.textContent = activeStyleAnalysis.lighting;
        if (valTexture) valTexture.textContent = activeStyleAnalysis.texture;
        if (swatchesBox) swatchesBox.innerHTML = activeStyleAnalysis.colors.map(color => `<span class="vpg-color-dot" style="background:${escapeHtml(color.hex)}" title="${escapeHtml(color.hex)}"></span>`).join('');
        renderAnalysisTextReport();

        setVpgStepper(2);
        btnAnalyzeStyle.innerHTML = `<span class="sparkle">✓</span> Analyzed!`;
        setTimeout(() => {
          btnAnalyzeStyle.innerHTML = `<span>✨</span> Analyze Visual Style`;
          btnAnalyzeStyle.disabled = false;
        }, 1600);

      } catch (err) {
        console.error('[VPG] Style analysis failed:', err);
        alert(`Visual analysis failed: ${err.message || 'Please check your API key and selected images.'}`);
        btnAnalyzeStyle.innerHTML = `<span>✨</span> Analyze Visual Style`;
        btnAnalyzeStyle.disabled = uploadedImageFiles.length < 5;
      }
    });

    // ── Full Report Modal Management ─────────────────────────
    function openStyleReportModal() {
      // Render palette grid
      if (repPaletteGrid) {
        repPaletteGrid.innerHTML = activeStyleAnalysis.colors.map(c => `
          <div class="vpg-palette-card">
            <div class="vpg-palette-swatch" style="background: ${c.hex};"></div>
            <span class="vpg-palette-hex">${c.hex}</span>
            <span style="font-size:10px;color:#94a3b8;text-align:center;">${c.name}</span>
          </div>
        `).join('');
      }

      modalStyleReport?.classList.remove('hidden');
    }

    function closeStyleReportModal() {
      modalStyleReport?.classList.add('hidden');
    }

    btnViewFullReport?.addEventListener('click', openStyleReportModal);
    btnCloseModal?.addEventListener('click', closeStyleReportModal);
    btnCloseModalAct?.addEventListener('click', closeStyleReportModal);
    modalStyleReport?.addEventListener('click', (e) => {
      if (e.target === modalStyleReport) closeStyleReportModal();
    });
    btnCopyAnalysisText?.addEventListener('click', () => copyVpgText(getAnalysisTextReport(), btnCopyAnalysisText, '📋 Copy'));
    btnCopyMasterPrompt?.addEventListener('click', () => copyVpgText(activeStyleAnalysis.masterPrompt || '', btnCopyMasterPrompt, '📋 Copy'));
    btnDownloadMasterPrompt?.addEventListener('click', () => {
      if (activeStyleAnalysis.masterPrompt) downloadFile(activeStyleAnalysis.masterPrompt, 'master_visual_prompt.txt', 'text/plain');
    });

    btnCopySuffix?.addEventListener('click', () => copyVpgText(activeStyleAnalysis.masterSuffix, btnCopySuffix, '📋 Copy Suffix'));

    btnCopyReport?.addEventListener('click', () => {
      const fullReportText = `=== VISUAL STYLE INTELLIGENCE REPORT ===
OVERALL STYLE: ${activeStyleAnalysis.style}
ENVIRONMENT: ${activeStyleAnalysis.environment}
TONE / MOOD: ${activeStyleAnalysis.mood}
CAMERA / COMPOSITION: ${activeStyleAnalysis.camera}
LIGHTING: ${activeStyleAnalysis.lighting}
SUBJECTS: ${activeStyleAnalysis.subjects}
TEXTURE / DETAILS: ${activeStyleAnalysis.texture}

MASTER PROMPT SUFFIX:
${activeStyleAnalysis.masterSuffix}

EXTRACTED COLOR PALETTE:
${activeStyleAnalysis.colors.map(c => `- ${c.hex} (${c.name})`).join('\n')}
`;
      copyVpgText(fullReportText, btnCopyReport, '📋 Copy Full Report');
    });

    btnDownloadReport?.addEventListener('click', () => {
      const fullReportText = `=== VISUAL STYLE INTELLIGENCE REPORT ===\nOVERALL STYLE: ${activeStyleAnalysis.style}\nENVIRONMENT: ${activeStyleAnalysis.environment}\nTONE / MOOD: ${activeStyleAnalysis.mood}\nCAMERA / COMPOSITION: ${activeStyleAnalysis.camera}\nLIGHTING: ${activeStyleAnalysis.lighting}\nSUBJECTS: ${activeStyleAnalysis.subjects}\nTEXTURE / DETAILS: ${activeStyleAnalysis.texture}\n\nMASTER PROMPT SUFFIX:\n${activeStyleAnalysis.masterSuffix}\n\nCOLOR PALETTE:\n${activeStyleAnalysis.colors.map(c => `- ${c.hex} (${c.name})`).join('\n')}\n`;
      downloadFile(fullReportText, 'visual_style_blueprint_report.txt', 'text/plain');
    });

    function getMasterPromptCreationSource() {
      // Groq's free tier has an 8k TPM ceiling. The report stays detailed, but
      // this phase gets the highest-signal portion plus the structured facts.
      const fullReport = getAnalysisTextReport();
      const maxCharacters = 12000;
      if (fullReport.length <= maxCharacters) return fullReport;
      const structuredFacts = `\n\nLOCKED FACTS\nSTYLE: ${activeStyleAnalysis.style}\nENVIRONMENT: ${activeStyleAnalysis.environment}\nMOOD: ${activeStyleAnalysis.mood}\nLIGHTING: ${activeStyleAnalysis.lighting}\nCAMERA: ${activeStyleAnalysis.camera}\nSUBJECTS: ${activeStyleAnalysis.subjects}\nTEXTURE: ${activeStyleAnalysis.texture}\nAVOID: ${activeStyleAnalysis.negativePrompt}`;
      return `${fullReport.slice(0, maxCharacters - structuredFacts.length)}\n\n[The remainder of the report is condensed into the locked facts below.]${structuredFacts}`;
    }

    const MASTER_PROMPT_CREATION_ENGINE = `Run PHASE 2 only for the Universal Visual Style workflow. Turn the supplied approved analysis into one reusable Universal Master Style Prompt; never lock a single story scene. Use exactly these sections: [MASTER VISUAL STYLE], [CHARACTER SYSTEM], [COLOR SYSTEM], [ENVIRONMENT SYSTEM], [LIGHTING SYSTEM], [COMPOSITION & CAMERA SYSTEM], [TEXTURE & RENDERING SYSTEM], [NEGATIVE STYLE CONSTRAINTS]. Preserve the analysis facts, separate locked visual rules from scene variables, maintain recurring-character clothing/face/proportion consistency, require text-free imagery, include a final exact style-lock phrase and a compact yes/no quality checklist. Return only the Master Prompt document, with no commentary.`;

    // ── Create Template Action ───────────────────────────────
    btnCreateTemplate?.addEventListener('click', async () => {
      if (!hasAnalyzedStyle) { alert('Pehle at least 5 reference images ka visual style analyze karein.'); return; }
      if (!window.AI?.completePrompt) { alert('AI provider available nahi hai.'); return; }
      if (!window.AI.getKeys?.().groq) { alert('Master Prompt ke liye Groq API key configure karein.'); return; }
      btnCreateTemplate.disabled = true;
      btnCreateTemplate.textContent = 'Creating Master Prompt...';
      const name = `Master Prompt — ${activeStyleAnalysis.style}`;
      let templates = [];
      try { templates = JSON.parse(localStorage.getItem('cipher_vpg_style_templates') || '[]'); } catch (_) {}
      try {
        const masterPrompt = await window.AI.completePrompt([
          { role: 'system', content: MASTER_PROMPT_CREATION_ENGINE },
          { role: 'user', content: `APPROVED PHASE 1 STYLE BREAKDOWN:\n${getMasterPromptCreationSource()}` }
        ], { provider: 'groq', allowProviderFallback: false, temperature: 0.2, maxTokens: 2600 });
        if (!masterPrompt?.trim()) throw new Error('Groq returned an empty Master Prompt.');
        activeStyleAnalysis.masterPrompt = masterPrompt.trim();
        localStorage.setItem('cipher_vpg_style_blueprint', JSON.stringify({ style: activeStyleAnalysis, savedAt: Date.now() }));
        templates.unshift({ id: `vpg-${Date.now()}`, name, style: activeStyleAnalysis, masterPrompt: activeStyleAnalysis.masterPrompt, createdAt: Date.now() });
        localStorage.setItem('cipher_vpg_style_templates', JSON.stringify(templates.slice(0, 25)));
        renderTemplateLibrary();
        if (templateLibrary) templateLibrary.value = templates[0].id;
        renderMasterPrompt();
        btnCreateTemplate.innerHTML = `<span class="sparkle">✓</span> Master Prompt Saved!`;
        setVpgStepper(3);
        updateWorkflowStatus('Master Prompt saved. Ab script paste karke direct Generate Scene Prompts karein.');
      } catch (error) {
        alert(`Master Prompt creation failed: ${error.message}`);
      } finally {
        btnCreateTemplate.disabled = false;
        setTimeout(() => { btnCreateTemplate.innerHTML = `<span>✨</span> Create Master Prompt`; }, 1600);
      }
    });

    templateLibrary?.addEventListener('change', () => {
      if (!templateLibrary.value) return;
      try {
        if (templateLibrary.value === 'builtin-ashfolk') {
          activeStyleAnalysis = {
            ...activeStyleAnalysis,
            style: 'ASHFOLK hand-drawn stick-figure documentary',
            environment: 'Rich, shaded Ice Age / cave / grassland environments with atmospheric depth',
            mood: 'Cinematic, moody, warm-vs-cold contrast',
            camera: 'Varied documentary shots: establishing, medium, close-up, high-angle',
            subjects: 'Simple faceless stick figures, recurring creatures, narrative symbols',
            lighting: 'Soft gradients, cold blue snow/night, warm orange firelight',
            texture: 'Organic black ink outlines, soft shading, hand-drawn 2D',
            masterSuffix: ashfolkStyleSuffix,
            workflowRules: ashfolkRules,
            masterPrompt: '',
            negativePrompt: 'plain white background, empty scene, realistic anatomy, nose, ears, 3D, Pixar, anime, photorealism, glossy render, text, watermark'
          };
          hasAnalyzedStyle = true;
          localStorage.setItem('cipher_vpg_style_blueprint', JSON.stringify({ style: activeStyleAnalysis, savedAt: Date.now() }));
          if (valStyle) valStyle.textContent = activeStyleAnalysis.style;
          if (valEnv) valEnv.textContent = activeStyleAnalysis.environment;
          if (valMood) valMood.textContent = activeStyleAnalysis.mood;
          if (valCamera) valCamera.textContent = activeStyleAnalysis.camera;
          if (valSubjects) valSubjects.textContent = activeStyleAnalysis.subjects;
          if (valLighting) valLighting.textContent = activeStyleAnalysis.lighting;
          if (valTexture) valTexture.textContent = activeStyleAnalysis.texture;
          renderAnalysisTextReport();
          renderMasterPrompt();
          updateWorkflowStatus('ASHFOLK template active. Stage 1: recurring references generate karein.');
          setVpgStepper(3);
          return;
        }
        const templates = getSavedVpgTemplates();
        const template = templates.find(item => item.id === templateLibrary.value);
        if (!template?.masterPrompt) return;
        if (template.style) {
          activeStyleAnalysis = { ...activeStyleAnalysis, ...template.style, colors: safeVpgColors(template.style.colors) };
          hasAnalyzedStyle = true;
          localStorage.setItem('cipher_vpg_style_blueprint', JSON.stringify({ style: activeStyleAnalysis, savedAt: Date.now() }));
        } else {
          activeStyleAnalysis = { ...activeStyleAnalysis, masterPrompt: template.masterPrompt };
        }
        if (valStyle) valStyle.textContent = activeStyleAnalysis.style;
        if (valEnv) valEnv.textContent = activeStyleAnalysis.environment;
        if (valMood) valMood.textContent = activeStyleAnalysis.mood;
        if (valCamera) valCamera.textContent = activeStyleAnalysis.camera;
        if (valSubjects) valSubjects.textContent = activeStyleAnalysis.subjects;
        if (valLighting) valLighting.textContent = activeStyleAnalysis.lighting;
        if (valTexture) valTexture.textContent = activeStyleAnalysis.texture;
        if (swatchesBox) swatchesBox.innerHTML = activeStyleAnalysis.colors.map(c => `<span class="vpg-color-dot" style="background:${escapeHtml(c.hex)}" title="${escapeHtml(c.hex)}"></span>`).join('');
        renderAnalysisTextReport();
        renderMasterPrompt();
        setVpgStepper(3);
      } catch (error) { console.warn('[VPG] Could not load template:', error); }
    });

    btnOpenMasterLibrary?.addEventListener('click', () => {
      selectedMasterLibraryId = templateLibrary?.value || '';
      renderMasterPromptLibrary(selectedMasterLibraryId);
      masterLibraryModal?.classList.remove('hidden');
    });
    btnCloseMasterLibrary?.addEventListener('click', closeMasterPromptLibrary);
    masterLibraryModal?.addEventListener('click', (event) => {
      if (event.target === masterLibraryModal) closeMasterPromptLibrary();
    });
    btnUploadMasterFile?.addEventListener('click', () => inputMasterFile?.click());
    inputMasterFile?.addEventListener('change', () => {
      const file = inputMasterFile.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const masterPrompt = String(reader.result || '').trim();
        if (!masterPrompt) { alert('This text file is empty. Please upload a Master Prompt file with content.'); return; }
        const name = file.name.replace(/\.(txt|md)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imported Master Prompt';
        const templates = getPersistedVpgTemplates();
        const id = `vpg-import-${Date.now()}`;
        const importedStyle = {
          ...activeStyleAnalysis,
          style: activeStyleAnalysis.style || 'Imported visual style',
          masterPrompt,
          colors: safeVpgColors(activeStyleAnalysis.colors)
        };
        templates.unshift({ id, name, style: importedStyle, masterPrompt, createdAt: Date.now(), imported: true });
        localStorage.setItem('cipher_vpg_style_templates', JSON.stringify(templates.slice(0, 25)));
        renderTemplateLibrary();
        selectedMasterLibraryId = id;
        renderMasterPromptLibrary(id);
      };
      reader.onerror = () => alert('Master Prompt file could not be read. Please try a valid .txt or .md file.');
      reader.readAsText(file);
      inputMasterFile.value = '';
    });
    btnCopyLibraryPrompt?.addEventListener('click', () => {
      const value = masterLibraryPreview?.value || '';
      if (value) copyVpgText(value, btnCopyLibraryPrompt, '📋 Copy');
    });
    btnSaveLibraryName?.addEventListener('click', () => {
      const name = String(masterLibraryName?.value || '').trim();
      if (!selectedMasterLibraryId || !name) { alert('Please enter a name for this Master Prompt.'); return; }
      const templates = getPersistedVpgTemplates();
      const template = templates.find(item => item.id === selectedMasterLibraryId);
      if (!template) return;
      template.name = name.slice(0, 100);
      localStorage.setItem('cipher_vpg_style_templates', JSON.stringify(templates));
      renderTemplateLibrary();
      renderMasterPromptLibrary(selectedMasterLibraryId);
      btnSaveLibraryName.textContent = '✓ Saved';
      setTimeout(() => { btnSaveLibraryName.textContent = 'Save'; }, 1200);
    });
    btnUseLibraryPrompt?.addEventListener('click', () => {
      if (!selectedMasterLibraryId || !templateLibrary) return;
      templateLibrary.value = selectedMasterLibraryId;
      templateLibrary.dispatchEvent(new Event('change'));
      closeMasterPromptLibrary();
      updateWorkflowStatus('Imported Master Prompt selected. Paste a script and generate your scene prompts.');
    });

    // ── Script to Prompts Input Counter & Detail Level ────────
    inputScript?.addEventListener('input', () => {
      const text = (inputScript.value || '').trim();
      const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
      if (scriptWordCounter) scriptWordCounter.textContent = `${words} Words`;
      const metrics = document.getElementById('vpg-script-metrics');
      const timestampCount = parseExplicitTimelineBeats(text).length;
      if (metrics) metrics.textContent = timestampCount
        ? `${timestampCount} timestamps detected · ${Math.ceil(timestampCount / 10)} generation parts · 10 scenes per part`
        : (text ? 'No timestamps detected · scenes will be estimated at 3–5 seconds' : 'No timestamps detected yet');
      nextSceneBeatOffset = 0;
      if (btnGeneratePrompts) btnGeneratePrompts.disabled = false;
      updateWorkflowStatus('Ready: Generate Scene Prompts to create visuals directly from this script.');
    });
    document.addEventListener('cipher:drafts-restored', () => inputScript?.dispatchEvent(new Event('input')));

    detailPillBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.detail === selectedDetailLevel);
      btn.addEventListener('click', () => {
        detailPillBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedDetailLevel = btn.dataset.detail || 'standard';
        try { localStorage.setItem('cipher_vpg_detail_level', selectedDetailLevel); } catch (_) {}
      });
    });

    btnUploadTxtFile?.addEventListener('click', () => {
      inputScriptFile?.click();
    });

    inputScriptFile?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (inputScript) {
          inputScript.value = evt.target.result;
          inputScript.dispatchEvent(new Event('input'));
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    function scriptForStoryboard(rawText) {
      const text = rawText.replace(/\r/g, '').trim();
      // SRT/VTT: remove cue numbers and timing rows while preserving spoken narration.
      if (/-->/.test(text)) {
        return text.split('\n').filter(line => line.trim() && !/-->/.test(line) && !/^\d+$/.test(line.trim()) && !/^WEBVTT/i.test(line.trim()))
          .join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      return text.replace(/\s+/g, ' ').trim();
    }

    function parseExplicitTimelineBeats(rawText) {
      const text = rawText.replace(/\r/g, '').trim();
      const toSeconds = value => {
        const normalized = value.replace('-', ':').split(':').map(Number);
        return normalized.length === 3 ? normalized[0] * 3600 + normalized[1] * 60 + normalized[2] : normalized[0] * 60 + normalized[1];
      };
      if (/-->/.test(text)) {
        return text.split(/\n\s*\n/).map(block => {
          const lines = block.split('\n').map(line => line.trim()).filter(Boolean);
          const timing = lines.find(line => line.includes('-->'));
          if (!timing) return null;
          const start = timing.split('-->')[0].trim().replace(',', '.');
          const parts = start.split(':');
          const seconds = parts.length === 3 ? Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]) : Number(parts[0]) * 60 + Number(parts[1]);
          const narration = lines.slice(lines.indexOf(timing) + 1).join(' ').replace(/<[^>]*>/g, '').trim();
          return narration ? { seconds, timestampStr: formatStoryboardTime(seconds).replace(':', '-'), narration } : null;
        }).filter(Boolean);
      }
      const matcher = /(?:\((\d{1,2}:\d{2})\)|#(\d{1,3}-\d{2}))/g;
      const matches = [...text.matchAll(matcher)];
      if (!matches.length) return [];
      return matches.map((match, index) => {
        const value = match[1] || match[2].replace('-', ':');
        const narration = text.slice(match.index + match[0].length, matches[index + 1]?.index || text.length).replace(/\s+/g, ' ').trim();
        return narration ? { seconds: toSeconds(value), timestampStr: formatStoryboardTime(toSeconds(value)).replace(':', '-'), narration } : null;
      }).filter(Boolean);
    }

    function formatStoryboardTime(seconds) {
      const total = Math.max(0, Math.round(Number(seconds) || 0));
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }

    function normalizeStoryboard(raw, fixedBeats = []) {
      if (!Array.isArray(raw?.scenes) || !raw.scenes.length) throw new Error('AI returned no usable storyboard scenes.');
      if (fixedBeats.length && raw.scenes.length > fixedBeats.length) throw new Error(`AI returned ${raw.scenes.length} scenes for a ${fixedBeats.length}-beat batch.`);
      return raw.scenes.slice(0, 150).map((scene, index) => {
        const fixedBeat = fixedBeats[index];
        const seconds = fixedBeat ? fixedBeat.seconds : (Number.isFinite(Number(scene.seconds)) ? Number(scene.seconds) : index * 4);
        const next = raw.scenes[index + 1];
        const end = fixedBeats[index + 1]?.seconds ?? (next && Number.isFinite(Number(next.seconds)) ? Number(next.seconds) : seconds + 4);
        const rawPrompt = String(scene.fullPrompt || scene.prompt || '').trim();
        if (!rawPrompt) throw new Error(`Scene ${index + 1} is missing its visual prompt.`);
        const timestampCode = fixedBeat?.timestampStr || scene.timestampStr || formatStoryboardTime(seconds).replace(':', '-');
        // Keep the Universal Master Prompt contract in the actual exported text:
        // every generation-ready prompt starts with its own exact timestamp.
        const promptBody = rawPrompt.replace(/^#?\d{1,3}[-:]\d{2}\s*/u, '').trim();
        const prompt = `#${timestampCode} ${promptBody}`;
        return {
          id: scene.id || `scene-${Date.now()}-${index}`,
          sceneNum: index + 1,
          timestampCode,
          timeRange: `${formatStoryboardTime(seconds)} - ${formatStoryboardTime(Math.max(seconds + 1, end))}`,
          narration: String(fixedBeat?.narration || scene.narration || '').trim(),
          prompt,
          negativePrompt: String(scene.negativePrompt || activeStyleAnalysis.negativePrompt || '').trim(),
          tags: [scene.subject, scene.environment, scene.lightingColor].filter(Boolean).slice(0, 3).map(tag => `#${String(tag).replace(/\s+/g, '')}`)
        };
      });
    }

    // ── Generate Prompts Action ──────────────────────────────
    btnGeneratePrompts?.addEventListener('click', async () => {
      const scriptText = (inputScript?.value || '').trim();
      if (!scriptText) {
        alert('Please paste your script or upload a .txt file first.');
        inputScript?.focus();
        return;
      }

      btnGeneratePrompts.disabled = true;
      btnGeneratePrompts.innerHTML = `Synthesizing Prompts <span class="sparkle">⏳</span>`;

      try {
        if (!hasAnalyzedStyle && !activeStyleAnalysis.masterPrompt) throw new Error('Analyze reference images or select a saved template before generating prompts.');
        if (!activeStyleAnalysis.masterPrompt) throw new Error('Pehle Phase 2 mein Create Master Prompt karein.');
        const cleanScript = scriptForStoryboard(scriptText);
        if (cleanScript.split(/\s+/).length < 3) throw new Error('Script mein kam az kam 3 meaningful words hone chahiye.');
        if (!window.AI?.generateTimestampedPrompts) throw new Error('Prompt generation provider is unavailable.');
        const allBeats = parseExplicitTimelineBeats(scriptText);
        // A locked Master Prompt is intentionally long. Ten detailed images
        // per call keeps Gemini well below its output ceiling for 15+ minute
        // scripts; a smaller partial response is retained and resumed, never
        // discarded or treated as a lost timestamp.
        const promptBatchSize = 10;
        const pendingBeats = allBeats.length ? allBeats.slice(nextSceneBeatOffset, nextSceneBeatOffset + promptBatchSize) : [];
        if (allBeats.length && !pendingBeats.length) { updateWorkflowStatus('Tamam timestamped scene prompts generate ho chuke hain.'); return; }
        const cutIntervalSec = selectedDetailLevel === 'basic' ? 7 : selectedDetailLevel === 'detailed' ? 2.5 : 4;
        const storyboard = await window.AI.generateTimestampedPrompts(cleanScript, activeStyleAnalysis, {
          cutIntervalSec, detailLevel: selectedDetailLevel, targetGenerator: 'Flow / Midjourney v6', aspectRatio: '16:9', explicitBeats: pendingBeats
        });
        const scenes = normalizeStoryboard(storyboard, pendingBeats);

        generatedPromptsData = allBeats.length ? [...generatedPromptsData.filter(scene => !scene.isReference), ...scenes] : scenes;
        if (allBeats.length) nextSceneBeatOffset += scenes.length;
        saveGeneratedPrompts();
        renderGeneratedPromptsList(generatedPromptsData);
        setVpgStepper(4);

        if (btnCopyAll) btnCopyAll.disabled = false;
        if (btnDownloadTxt) btnDownloadTxt.disabled = false;
        if (allBeats.length) {
          const totalParts = Math.ceil(allBeats.length / promptBatchSize);
          const currentPart = Math.ceil(nextSceneBeatOffset / promptBatchSize);
          updateWorkflowStatus(`Part ${currentPart} of ${totalParts} ready — ${nextSceneBeatOffset < allBeats.length ? 'next part ke liye Generate Scene Prompts dabayein.' : 'all exact timestamp beats complete.'}`);
          if (nextSceneBeatOffset < allBeats.length) btnGeneratePrompts.innerHTML = `<span>Generate Part ${currentPart + 1} of ${totalParts}</span><span class="sparkle">✨</span>`;
        }

        if (!allBeats.length || nextSceneBeatOffset >= allBeats.length) btnGeneratePrompts.innerHTML = `Prompts Ready! <span class="sparkle">✓</span>`;
        setTimeout(() => {
          if (!allBeats.length || nextSceneBeatOffset >= allBeats.length) btnGeneratePrompts.innerHTML = `<span>Generate Scene Prompts</span> <span class="sparkle">✨</span>`;
          btnGeneratePrompts.disabled = false;
        }, 1800);

      } catch (err) {
        alert('Prompt Generation Error: ' + err.message);
        btnGeneratePrompts.innerHTML = `<span>Generate Scene Prompts</span> <span class="sparkle">✨</span>`;
        btnGeneratePrompts.disabled = false;
      }
    });

    function renderGeneratedPromptsList(scenes) {
      if (!promptsListGrid) return;
      emptyPlaceholder?.classList.add('hidden');
      promptsListGrid.classList.remove('hidden');
      promptsListGrid.innerHTML = '';

      scenes.forEach((s) => {
        const card = document.createElement('div');
        card.className = 'vpg-prompt-card';

        card.innerHTML = `
          <div class="vpg-prompt-card-header">
            <span class="vpg-prompt-ts">${escapeHtml(s.timestampCode ? `#${s.timestampCode}` : `Scene ${s.sceneNum} [${s.timeRange}]`)}</span>
            <button class="vpg-btn-copy-single" type="button">📋 Copy</button>
          </div>
          <textarea class="vpg-prompt-edit" aria-label="Edit prompt for scene ${s.sceneNum}">${escapeHtml(s.prompt)}</textarea>
          <div class="vpg-prompt-tags">
            ${(s.tags || []).map(t => `<span class="vpg-tag-pill">${escapeHtml(t)}</span>`).join('')}
          </div>
          <div class="vpg-prompt-actions"><button class="vpg-btn-copy-single vpg-btn-delete-single" type="button">Delete</button></div>
        `;

        card.querySelector('.vpg-btn-copy-single')?.addEventListener('click', (e) => {
          copyVpgText(s.prompt, e.target, '📋 Copy');
        });
        card.querySelector('.vpg-prompt-edit')?.addEventListener('input', (e) => {
          s.prompt = e.target.value; saveGeneratedPrompts();
        });
        card.querySelector('.vpg-btn-delete-single')?.addEventListener('click', () => {
          generatedPromptsData = generatedPromptsData.filter(item => item !== s);
          generatedPromptsData.forEach((item, idx) => { item.sceneNum = idx + 1; });
          saveGeneratedPrompts();
          if (generatedPromptsData.length) renderGeneratedPromptsList(generatedPromptsData);
          else { promptsListGrid.classList.add('hidden'); emptyPlaceholder?.classList.remove('hidden'); if (btnCopyAll) btnCopyAll.disabled = true; if (btnDownloadTxt) btnDownloadTxt.disabled = true; }
        });

        promptsListGrid.appendChild(card);
      });
    }

    // ── Export Actions (Copy All & Download TXT) ──────────────
    btnCopyAll?.addEventListener('click', () => {
      if (!generatedPromptsData.length) return;
      const allText = generatedPromptsData.map(s => `${s.prompt}\n`).join('\n');
      copyVpgText(allText, btnCopyAll, '📋 Copy All');
    });

    btnDownloadTxt?.addEventListener('click', () => {
      if (!generatedPromptsData.length) return;
      const allText = generatedPromptsData.map(s => `${s.prompt}\n`).join('\n');
      downloadFile(allText, 'visual_image_prompts.txt', 'text/plain');
    });

    if (generatedPromptsData.length) {
      renderGeneratedPromptsList(generatedPromptsData);
      setVpgStepper(4);
      if (btnCopyAll) btnCopyAll.disabled = false;
      if (btnDownloadTxt) btnDownloadTxt.disabled = false;
    }
    renderTemplateLibrary();
    renderAnalysisTextReport();
    renderMasterPrompt();
    inputScript?.dispatchEvent(new Event('input'));
    window.addEventListener('pagehide', () => uploadedImageUrls.forEach(url => URL.revokeObjectURL(url)), { once: true });
  }

  // ── 7. Tool 4: Standalone Auto Captions Studio (Pixel-Perfect Full Implementation) ───
  function wireAutoCaptionsTool() {
    // Stepper Indicators
    function setAcgStepper(stepNum) {
      for (let i = 1; i <= 4; i++) {
        const item = document.getElementById(`acg-step-indicator-${i}`);
        if (item) {
          if (i <= stepNum) {
            item.classList.add('active');
          } else {
            item.classList.remove('active');
          }
        }
      }
      document.querySelectorAll('.acg-stepper-bar .acg-step-arrow').forEach((arrow, idx) => {
        if (idx < stepNum - 1) {
          arrow.classList.add('active');
        } else {
          arrow.classList.remove('active');
        }
      });
    }

    const sampleMotivationalCues = [
      {
        start: 0.0,
        end: 1.8,
        text: 'STOP SCROLLING RIGHT NOW',
        words: [
          { text: 'STOP', start: 0.0, end: 0.4 },
          { text: 'SCROLLING', start: 0.4, end: 0.9 },
          { text: 'RIGHT', start: 0.9, end: 1.3 },
          { text: 'NOW', start: 1.3, end: 1.8 }
        ]
      },
      {
        start: 1.9,
        end: 3.8,
        text: 'THIS SECRET CHANGES EVERYTHING',
        words: [
          { text: 'THIS', start: 1.9, end: 2.3 },
          { text: 'SECRET', start: 2.3, end: 2.8 },
          { text: 'CHANGES', start: 2.8, end: 3.3 },
          { text: 'EVERYTHING', start: 3.3, end: 3.8 }
        ]
      },
      {
        start: 3.9,
        end: 5.8,
        text: 'VIRAL CREATORS USE THIS DAILY',
        words: [
          { text: 'VIRAL', start: 3.9, end: 4.3 },
          { text: 'CREATORS', start: 4.3, end: 4.8 },
          { text: 'USE', start: 4.8, end: 5.2 },
          { text: 'THIS', start: 5.2, end: 5.5 },
          { text: 'DAILY', start: 5.5, end: 5.8 }
        ]
      },
      {
        start: 5.9,
        end: 7.9,
        text: 'CREATE HIGH RETENTION REELS FAST',
        words: [
          { text: 'CREATE', start: 5.9, end: 6.3 },
          { text: 'HIGH', start: 6.3, end: 6.7 },
          { text: 'RETENTION', start: 6.7, end: 7.2 },
          { text: 'REELS', start: 7.2, end: 7.5 },
          { text: 'FAST', start: 7.5, end: 7.9 }
        ]
      }
    ];

    // DOM Elements - Upload
    const dropArea = document.getElementById('caption-media-drop-area');
    const fileInput = document.getElementById('input-caption-media');
    const btnBrowse = document.getElementById('acg-btn-browse');
    const uploadedCard = document.getElementById('acg-uploaded-file-card');
    const btnRemoveFile = document.getElementById('btn-acg-remove-file');
    const filenameEl = document.getElementById('caption-media-filename');
    const fileResEl = document.getElementById('acg-file-res');
    const fileDurEl = document.getElementById('acg-file-dur');
    const fileSizeEl = document.getElementById('acg-file-size');

    const selLang = document.getElementById('sel-caption-media-lang');
    const btnUploadSrt = document.getElementById('ac-btn-caption-upload');
    const inputUploadSrt = document.getElementById('ac-input-caption-upload');

    // DOM Elements - Presets
    const styleCards = document.querySelectorAll('.acg-style-card');
    const presetsGrid = document.getElementById('ac-caption-presets-grid');
    const presetsCountBadge = document.getElementById('acg-presets-count-badge');

    // DOM Elements - Typography & Sliders
    const selFont = document.getElementById('ac-sel-caption-font');
    const slSize = document.getElementById('ac-sl-caption-size');
    const lblSize = document.getElementById('ac-lbl-caption-size');
    const selCase = document.getElementById('ac-sel-caption-case');
    const selAlign = document.getElementById('ac-sel-caption-align');

    const selLines = document.getElementById('ac-sel-caption-lines');
    const slWords = document.getElementById('ac-sl-caption-words-line');
    const lblWords = document.getElementById('ac-lbl-caption-words-line');
    const slWordSpace = document.getElementById('ac-sl-caption-word-space');
    const lblWordSpace = document.getElementById('ac-lbl-caption-word-space');
    const slLineSpace = document.getElementById('ac-sl-caption-line-space');
    const lblLineSpace = document.getElementById('ac-lbl-caption-line-space');
    const slY = document.getElementById('ac-sl-caption-y');
    const lblY = document.getElementById('ac-lbl-caption-y');

    const selAnim = document.getElementById('ac-sel-caption-anim');
    const selLineAnim = document.getElementById('ac-sel-caption-line-anim');

    const colText = document.getElementById('ac-col-caption-text');
    const lblTextCol = document.getElementById('ac-lbl-caption-color');
    const colHighlight = document.getElementById('ac-col-caption-highlight');
    const lblHighlightCol = document.getElementById('ac-lbl-caption-hlcolor');
    const colStroke = document.getElementById('ac-col-caption-stroke');
    const lblStrokeCol = document.getElementById('ac-lbl-caption-stcolor');
    const slStroke = document.getElementById('ac-sl-caption-stroke');
    const lblStroke = document.getElementById('ac-lbl-caption-stroke');
    const colGlow = document.getElementById('ac-col-caption-glow');
    const lblGlowCol = document.getElementById('ac-lbl-caption-glcolor');
    const slGlow = document.getElementById('ac-sl-caption-glow');
    const lblGlow = document.getElementById('ac-lbl-caption-glow');

    // DOM Elements - Advanced & Bottom Actions
    const btnAutoCap = document.getElementById('btn-generate-media-captions');
    const btnSaveDefaults = document.getElementById('btn-acg-save-defaults');

    // DOM Elements - Player & Segments
    const videoEl = document.getElementById('caption-tool-video');
    const canvas = document.getElementById('ac-preview-canvas');
    const ctx = canvas?.getContext('2d');
    const previewCaptionOverlay = document.getElementById('ac-preview-caption-overlay');
    const nativeCaptionOverlay = document.getElementById('ac-native-caption-overlay');
    const stagePlaceholder = document.getElementById('ac-stage-placeholder');
    const btnPlay = document.getElementById('btn-ac-play');
    const scrubber = document.getElementById('ac-scrubber');
    const timeDisplay = document.getElementById('ac-time-display');
    const btnToggleCc = document.getElementById('btn-acg-toggle-cc');
    const btnFullscreen = document.getElementById('btn-acg-fullscreen');

    const cuesList = document.getElementById('caption-tool-cues-list');
    const cueCountBadge = document.getElementById('caption-cue-count-badge');
    const btnEditAllCues = document.getElementById('btn-acg-edit-all-cues');
    const btnAddManualCue = document.getElementById('btn-acg-add-manual-cue');

    // Action Buttons
    const btnDownloadSrt = document.getElementById('btn-download-tool-srt');
    const btnDownloadVtt = document.getElementById('btn-download-tool-vtt');
    const btnCopySrt = document.getElementById('btn-copy-tool-srt');
    const btnExportMp4Burned = document.getElementById('btn-export-mp4-burned');
    const btnSendStudio = document.getElementById('btn-send-tool-to-studio');

    // State Variables
    let loadedMediaFile = null;
    let mediaDuration = 8.0;
    let captionCues = [];
    let rawSRTText = '';
    let selectedPresetKey = 'purple_box';
    let isPlaying = false;
    let animFrameId = null;
    let isCaptionsVisible = true;
    let timelineZoomFactor = 1.0;
    let activeMediaUrl = null;
    let exportAbortController = null;
    let activeExportJobId = null;
    let isPreviewLoopRunning = false;
    let lastTimelinePaint = 0;
    let timelineThumbnails = [];
    let timelineThumbnailGeneration = 0;
    let timelineThumbnailError = false;
    let timelineThumbnailTimer = null;
    let lastPreviewFramePaint = 0;
    let activeTimelineCueId = '';
    let activeTimelineElements = [];
    let lastPreviewCaptionSignature = '';
    let lastPreviewLineTransitionKey = '';
    let cueHistory = [];
    let cueHistoryIndex = -1;
    let isRestoringCueHistory = false;
    let recoveredCaptionStyle = null;
    const captionProjectStorageKey = 'cipher-caption-project-v2';
    let localCaptionFont = '';
    let pendingCaptionFont = '';

    function captionDocumentSnapshot() {
      const preset = window.CaptionStyles.PRESETS[selectedPresetKey] || {};
      return {
        ...getExportSpec(), cues: captionCues,
        fps: Number(selExportFps?.value || 30),
        volume: videoEl.muted ? 0 : Math.round(videoEl.volume * 100),
        settings: {
          preset: selectedPresetKey, fontPick: selFont.value,
          scale: Number(slSize.value), position: Number(slY.value),
          textCase: selCase.value, align: selAlign.value, linesCount: selLines.value,
          wordsPerLine: Number(slWords.value), wordSpacing: Number(slWordSpace.value),
          lineSpacing: Number(slLineSpace.value), animStyle: selAnim.value,
          lineAnim: selLineAnim.value, userCol: colText.value,
          highlightCol: colHighlight.value, strokeCol: colStroke.value,
          strokeWidth: Number(slStroke.value), glowCol: colGlow.value,
          glowBlur: Number(slGlow.value), shadowBlur: preset.shadowBlur ?? 6
        }
      };
    }

    function drawCaptionDocumentPreview(time) {
      if (previewCaptionOverlay) previewCaptionOverlay.style.display = 'none';
      if (nativeCaptionOverlay) nativeCaptionOverlay.style.display = 'none';
      if (!window.CaptionDocument || !videoEl.videoWidth) {
        canvas.style.display = 'none';
        return;
      }
      const snapshot = captionDocumentSnapshot();
      const wrap = document.getElementById('acg-player-preview-wrap');
      const fit = Math.min(wrap.clientWidth / snapshot.width, wrap.clientHeight / snapshot.height);
      const displayWidth = Math.round(snapshot.width * fit), displayHeight = Math.round(snapshot.height * fit);
      Object.assign(canvas.style, { position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)', width: `${displayWidth}px`, height: `${displayHeight}px`,
        pointerEvents: 'none', zIndex: '4', display: isCaptionsVisible ? 'block' : 'none' });
      Object.assign(videoEl.style, { width: `${displayWidth}px`, height: `${displayHeight}px`, objectFit: 'contain' });
      const font = snapshot.settings.fontPick;
      if (localCaptionFont !== font) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (pendingCaptionFont !== font) {
          pendingCaptionFont = font;
          window.CaptionDocument.loadFont(font).then(() => {
            if (pendingCaptionFont !== font) return;
            localCaptionFont = font;
            pendingCaptionFont = '';
            drawFrame();
          }).catch(error => {
            pendingCaptionFont = '';
            console.error('[AutoCaption font]', error);
            const label = document.getElementById('acg-now-cue-label');
            if (label) label.textContent = error.message;
          });
        }
        return;
      }
      window.CaptionDocument.draw(canvas, snapshot, time);
    }

    function createCueId() {
      return (window.crypto?.randomUUID?.() || `cue_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
    }

    function getTimelineDuration(cues = captionCues) {
      if (videoEl && Number.isFinite(videoEl.duration) && videoEl.duration > 0) return videoEl.duration;
      return cues.length ? Math.max(...cues.map(cue => Number(cue.end) || 0)) + 0.5 : 8;
    }

    // Cues are chronological. This keeps preview lookup cheap even for a
    // 20–30 minute transcript containing thousands of captions.
    function findActiveCaptionCue(time) {
      let low = 0;
      let high = captionCues.length - 1;
      let candidate = null;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const cue = captionCues[mid];
        if (cue.start - 0.05 <= time) {
          candidate = cue;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return candidate && time <= candidate.end + 0.1 ? candidate : null;
    }


    function normalizeCaptionCues(cues, { preventOverlaps = false } = {}) {
      const maxDuration = getTimelineDuration(cues || []);
      const normalized = (cues || []).filter(cue => cue && String(cue.text || '').trim()).map(cue => {
        const start = Math.max(0, Math.min(Number(cue.start) || 0, maxDuration - 0.05));
        const end = Math.max(start + 0.05, Math.min(Number(cue.end) || start + 1, maxDuration));
        return {
          ...cue,
          id: cue.id || createCueId(),
          start,
          end,
          text: String(cue.text).trim(),
          words: Array.isArray(cue.words) && cue.words.length ? cue.words : retimeWords(cue.text, start, end)
        };
      }).sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));

      if (preventOverlaps) {
        let lastEnd = 0;
        normalized.forEach(cue => {
          if (cue.start < lastEnd) {
            const duration = Math.max(0.05, cue.end - cue.start);
            cue.start = lastEnd;
            cue.end = Math.min(maxDuration, cue.start + duration);
            if (cue.end - cue.start < 0.05) return;
            // Never redistribute AI word timestamps here. This branch is only
            // used by an explicit manual timing edit; transcription timestamps
            // remain the source of truth for caption-word synchronization.
          }
          lastEnd = Math.max(lastEnd, cue.end);
        });
      }
      return normalized.filter(cue => cue.end - cue.start >= 0.05);
    }

    function persistCaptionProject() {
      try {
        const styleControls = [selFont, slSize, selCase, selAlign, selLines, slWords, slWordSpace, slLineSpace, slY, selAnim, selLineAnim, colText, colHighlight, colStroke, slStroke, colGlow, slGlow];
        localStorage.setItem(captionProjectStorageKey, JSON.stringify({
          style: { preset: selectedPresetKey, fields: Object.fromEntries(styleControls.filter(Boolean).map(el => [el.id, el.value])) },
          savedAt: Date.now()
        }));
      } catch (error) {
        console.warn('[AutoCaptions] Could not save caption project:', error);
      }
    }

    function restoreCaptionProject() {
      try {
        const saved = JSON.parse(localStorage.getItem(captionProjectStorageKey) || 'null');
        recoveredCaptionStyle = saved?.style || null;
        // Browser File objects cannot survive a refresh. Restoring captions
        // without their matching video leaves a misleading, unusable timeline,
        // so only the user's styling preferences are recovered.
        return [];
      } catch (error) {
        console.warn('[AutoCaptions] Could not restore caption project:', error);
        return [];
      }
    }

    function applyRecoveredCaptionStyle() {
      if (!recoveredCaptionStyle?.fields) return;
      Object.entries(recoveredCaptionStyle.fields).forEach(([id, value]) => {
        const control = document.getElementById(id);
        if (control) control.value = value;
      });
      if (recoveredCaptionStyle.preset && window.CaptionStyles?.PRESETS?.[recoveredCaptionStyle.preset]) {
        selectedPresetKey = recoveredCaptionStyle.preset;
      }
      [
        [lblSize, slSize, value => `${Math.round(parseFloat(value) * 100)}%`],
        [lblWords, slWords, value => `${value} words`], [lblWordSpace, slWordSpace, value => `${value}px`],
        [lblLineSpace, slLineSpace, value => `${parseFloat(value).toFixed(2)}x`], [lblY, slY, value => `${value}%`],
        [lblStroke, slStroke, value => `${value}px`], [lblGlow, slGlow, value => `${value}px`],
        [lblTextCol, colText, value => value.toUpperCase()], [lblHighlightCol, colHighlight, value => value.toUpperCase()],
        [lblStrokeCol, colStroke, value => value.toUpperCase()], [lblGlowCol, colGlow, value => value.toUpperCase()]
      ].forEach(([label, control, format]) => { if (label && control) label.textContent = format(control.value); });
    }

    function pushCueHistory() {
      if (isRestoringCueHistory) return;
      const snapshot = JSON.stringify(captionCues);
      if (cueHistory[cueHistoryIndex] === snapshot) return;
      cueHistory = cueHistory.slice(0, cueHistoryIndex + 1);
      cueHistory.push(snapshot);
      if (cueHistory.length > 60) cueHistory.shift();
      cueHistoryIndex = cueHistory.length - 1;
    }

    function commitCueChange({ history = true } = {}) {
      captionCues = normalizeCaptionCues(captionCues);
      rawSRTText = serializeSRT(captionCues);
      persistCaptionProject();
      if (history) pushCueHistory();
      renderCuesList(captionCues);
      drawFrame();
    }

    function restoreCueHistory(direction) {
      const nextIndex = cueHistoryIndex + direction;
      if (nextIndex < 0 || nextIndex >= cueHistory.length) return;
      isRestoringCueHistory = true;
      captionCues = normalizeCaptionCues(JSON.parse(cueHistory[nextIndex]));
      cueHistoryIndex = nextIndex;
      isRestoringCueHistory = false;
      rawSRTText = serializeSRT(captionCues);
      persistCaptionProject();
      renderCuesList(captionCues);
      drawFrame();
    }

    // A refreshed browser cannot restore the selected video file. Start with
    // an empty caption timeline; only style preferences are retained.
    captionCues = restoreCaptionProject();
    rawSRTText = serializeSRT(captionCues);
    pushCueHistory();
    renderCuesList(captionCues);

    // ── CapCut Style Tab Switching ────────────────────────────
    const acgTabButtons = document.querySelectorAll('#acg-capcut-nav-bar .nav-tab-btn');
    const acgTabPanels = document.querySelectorAll('#acg-left-settings-panel .editor-tab-content');

    acgTabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        acgTabButtons.forEach(b => b.classList.remove('active'));
        acgTabPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.dataset.tab;
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.classList.add('active');
          if (targetId === 'tab-acg-presets') {
            renderCaptionPresets();
          }
        }
      });
    });

    // ── Collapsible Headers ──────────────────────────────────
    document.querySelectorAll('#view-auto-captions .collapsible-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('.toggle-switch') || e.target.closest('input') || e.target.closest('select')) return;
        const targetId = header.dataset.target;
        const body = document.getElementById(targetId);
        if (body) {
          body.classList.toggle('collapsed');
          const collapseBtn = header.querySelector('.section-collapse-btn');
          if (collapseBtn) {
            collapseBtn.textContent = body.classList.contains('collapsed') ? '▸' : '▾';
          }
        }
      });
    });

    // ── Volume Control ────────────────────────────────────────
    const slVolume = document.getElementById('ac-sl-volume');
    slVolume?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (videoEl) videoEl.volume = v;
      const volLbl = document.getElementById('lbl-ac-volume');
      if (volLbl) volLbl.textContent = `${Math.round(v * 100)}%`;
    });

    // ── Timeline Zoom Controls ────────────────────────────────
    function applyTimelineZoom(newPercent, centerTime = null) {
      const zoomPct = Math.max(30, Math.min(400, Math.round(newPercent)));
      timelineZoomFactor = zoomPct / 100;

      if (zoomSlider) zoomSlider.value = zoomPct;
      if (zoomValLbl) zoomValLbl.textContent = `${zoomPct}%`;

      const wrap = document.getElementById('acg-timeline-wrap');
      if (!wrap) return;

      const baseWidth = Math.max(300, wrap.clientWidth - 32);
      const totalWidthPx = Math.round(baseWidth * timelineZoomFactor);

      // Apply scaled width to ruler and both tracks
      const ruler = document.getElementById('acg-timeline-ruler');
      const cueTrack = document.getElementById('acg-timeline-cues-track');
      const videoTrack = document.getElementById('acg-timeline-video-track');

      if (ruler) ruler.style.width = `${totalWidthPx + 28}px`;
      if (cueTrack) {
        cueTrack.style.width = `${totalWidthPx}px`;
        cueTrack.style.minWidth = `${totalWidthPx}px`;
      }
      if (videoTrack) {
        videoTrack.style.width = `${totalWidthPx}px`;
        videoTrack.style.minWidth = `${totalWidthPx}px`;
      }

      // Re-render ruler with fine-tuned ticks for current zoom
      renderTimelineRulerAndWaveform();

      // Keep playhead synchronized
      const curTime = (centerTime !== null) ? centerTime : (videoEl?.currentTime || 0);
      const maxDur = (videoEl && !isNaN(videoEl.duration) && videoEl.duration > 0)
        ? videoEl.duration
        : (captionCues.length ? Math.max(...captionCues.map(c => c.end)) + 2 : 10);

      const playhead = document.getElementById('acg-timeline-playhead');
      if (playhead && maxDur > 0) {
        const playheadX = 28 + (curTime / maxDur) * totalWidthPx;
        playhead.style.left = `${playheadX}px`;

        // Auto-scroll to center playhead if zoomed in
        if (timelineZoomFactor > 1.0) {
          wrap.scrollLeft = Math.max(0, playheadX - wrap.clientWidth / 2);
        }
      }
    }

    const zoomSlider = document.getElementById('acg-timeline-zoom');
    const btnZoomIn = document.getElementById('acg-btn-zoom-in');
    const btnZoomOut = document.getElementById('acg-btn-zoom-out');
    const btnZoomFit = document.getElementById('acg-btn-zoom-fit');
    const zoomValLbl = document.getElementById('acg-lbl-zoom-val');
    const btnUndoCue = document.getElementById('btn-acg-undo');
    const btnRedoCue = document.getElementById('btn-acg-redo');

    zoomSlider?.addEventListener('input', (e) => {
      applyTimelineZoom(e.target.value);
    });

    btnZoomIn?.addEventListener('click', () => {
      const curVal = parseInt(zoomSlider?.value || '100', 10);
      applyTimelineZoom(curVal + 25);
    });

    btnZoomOut?.addEventListener('click', () => {
      const curVal = parseInt(zoomSlider?.value || '100', 10);
      applyTimelineZoom(curVal - 25);
    });

    btnZoomFit?.addEventListener('click', () => {
      applyTimelineZoom(100);
      const wrap = document.getElementById('acg-timeline-wrap');
      if (wrap) wrap.scrollLeft = 0;
    });
    btnUndoCue?.addEventListener('click', () => restoreCueHistory(-1));
    btnRedoCue?.addEventListener('click', () => restoreCueHistory(1));

    // ── Dropzone & Browse Handlers ───────────────────────────
    btnBrowse?.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput?.click();
    });

    dropArea?.addEventListener('click', () => {
      fileInput?.click();
    });

    dropArea?.addEventListener('dragover', (e) => { 
      e.preventDefault(); 
      dropArea.classList.add('dragover'); 
    });

    dropArea?.addEventListener('dragleave', () => {
      dropArea.classList.remove('dragover'); 
    });

    dropArea?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('dragover');
      const f = e.dataTransfer?.files?.[0];
      if (f) handleMediaFile(f);
    });

    fileInput?.addEventListener('change', (e) => {
      const f = e.target.files?.[0];
      if (f) handleMediaFile(f);
    });

    btnRemoveFile?.addEventListener('click', () => {
      if (activeMediaUrl) URL.revokeObjectURL(activeMediaUrl);
      activeMediaUrl = null;
      loadedMediaFile = null;
      captionCues = [];
      rawSRTText = '';
      timelineThumbnails = [];
      timelineThumbnailGeneration++;
      timelineThumbnailError = false;
      if (fileInput) fileInput.value = '';
      uploadedCard?.classList.add('hidden');
      dropArea?.classList.remove('hidden');
      if (videoEl) {
        videoEl.removeAttribute('src');
        videoEl.load();
      }
      if (stagePlaceholder) {
        stagePlaceholder.classList.remove('hidden');
        stagePlaceholder.style.display = 'flex';
      }
      setAcgStepper(1);
      renderCuesList(captionCues);
      drawFrame();
    });

    function handleMediaFile(file) {
      if (!file) return;
      if (activeMediaUrl) URL.revokeObjectURL(activeMediaUrl);
      loadedMediaFile = file;
      captionCues = [];
      rawSRTText = '';
      timelineThumbnails = [];
      timelineThumbnailGeneration++;
      timelineThumbnailError = false;

      if (filenameEl) filenameEl.textContent = file.name;
      if (fileSizeEl) fileSizeEl.textContent = `💾 ${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      uploadedCard?.classList.remove('hidden');
      dropArea?.classList.add('hidden');

      setAcgStepper(2);

      const mediaUrl = URL.createObjectURL(file);
      activeMediaUrl = mediaUrl;

      if (videoEl) {
        videoEl.src = mediaUrl;
        videoEl.muted = false;
        videoEl.volume = parseFloat(slVolume?.value || '1.0');
        videoEl.preload = 'auto';
        videoEl.load();

        const onReady = () => {
          mediaDuration = videoEl.duration || 8.0;
          if (scrubber) scrubber.max = mediaDuration;
          if (fileDurEl) fileDurEl.textContent = formatTimecode(mediaDuration).slice(0, 5);
          if (fileResEl) fileResEl.textContent = `${videoEl.videoWidth || 1280}×${videoEl.videoHeight || 720}`;
          const previewResMeta = document.getElementById('ac-meta-res');
          if (previewResMeta) previewResMeta.textContent = `${videoEl.videoWidth || 1280}×${videoEl.videoHeight || 720}`;
          
          if (canvas) {
            // Keep preview responsive even when a 4K source is loaded. The source
            // video remains full quality; only the interactive preview is capped.
            const sourceW = videoEl.videoWidth || 1280;
            const sourceH = videoEl.videoHeight || 720;
            // The stage is composited on every preview frame. A 4K/1080p
            // canvas at 60fps makes playback stutter on many laptops, while a
            // 720p–1280px interactive preview remains visually sharp.
            const deviceMemory = Number(navigator.deviceMemory || 8);
            const previewMaxWidth = deviceMemory <= 4 ? 960 : 1280;
            const previewScale = Math.min(1, previewMaxWidth / sourceW);
            canvas.width = Math.round(sourceW * previewScale);
            canvas.height = Math.round(sourceH * previewScale);
          }

          if (stagePlaceholder) {
            stagePlaceholder.classList.add('hidden');
            stagePlaceholder.style.display = 'none';
          }

          videoEl.currentTime = 0;
          renderCuesList(captionCues);
          applyTimelineZoom(100);
          drawFrame();
        };

        videoEl.onloadedmetadata = onReady;
        videoEl.onloadeddata = null;
        videoEl.oncanplay = null;

        videoEl.onplay = () => {
          isPlaying = true;
          lastPreviewFramePaint = 0;
          if (btnPlay) btnPlay.textContent = '⏸';
          // Native video owns playback. Keep caption/timeline work on the
          // browser's normal media-time events, not on every decoded frame.
          drawFrame();
        };

        videoEl.onpause = () => {
          isPlaying = false;
          if (btnPlay) btnPlay.textContent = '▶';
        };

        videoEl.ontimeupdate = () => {
          const t = videoEl.currentTime || 0;
          if (scrubber) scrubber.value = t;
          updateTimecodeDisplay(t, mediaDuration);
          drawFrame();
        };

        videoEl.onended = () => {
          isPlaying = false;
          if (btnPlay) btnPlay.textContent = '▶';
          drawFrame();
        };

        if (videoEl.readyState >= 1) {
          onReady();
        }
        setTimeout(onReady, 250);
      }
    }

    // ── Script File Upload (.SRT / .VTT / .TXT) ───────────────
    btnUploadSrt?.addEventListener('click', (e) => {
      e.stopPropagation();
      inputUploadSrt?.click();
    });
    inputUploadSrt?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      rawSRTText = text;
      captionCues = parseSRTCues(text);
      if (!captionCues.length) {
        alert('No usable caption text was found in this file. Use a valid SRT/VTT file or a TXT script with text.');
        e.target.value = '';
        return;
      }
      rawSRTText = serializeSRT(captionCues);
      commitCueChange();
      setAcgStepper(3);
      e.target.value = '';
    });

    // ── Style Selection & 27+ Live Animated Diamonds Grid ─────
    styleCards.forEach(card => {
      card.addEventListener('click', () => {
        styleCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const key = card.dataset.preset || 'purple_box';
        selectPreset(key);
      });
    });

    function selectPreset(key) {
      const presets = window.CaptionStyles?.PRESETS || {};
      if (!presets[key]) return;
      selectedPresetKey = key;

      // Update 4 quick cards
      styleCards.forEach(c => {
        if (c.dataset.preset === key) c.classList.add('active');
        else c.classList.remove('active');
      });

      // Update 27+ presets grid
      if (presetsGrid) {
        presetsGrid.querySelectorAll('.cap-preset-card').forEach(b => {
          if (b.dataset.preset === key) b.classList.add('active');
          else b.classList.remove('active');
        });
      }

      const p = presets[key];
      if (p) syncControlsFromPreset(p);

      setAcgStepper(2);
      persistCaptionProject();
      drawFrame();
    }

    // index.html has a late-load preset-grid fallback. Route every fallback
    // card through the same state-changing function; merely toggling a card
    // class left the old preset active and was the reason some presets looked
    // as if they did not apply.
    window.selectAcCaptionPreset = selectPreset;

    let hoveredAcCapCanvas = null;
    let hoverAcCapType = null;
    let hoverAcCapAnimStart = 0;
    let hoverAcCapRafId = null;

    function renderLocalPresetThumbnail(cvs, key, time = 0) {
      const font = window.CaptionStyles.PRESETS[key]?.font || 'Poppins';
      window.CaptionDocument.loadFont(font).then(() => {
        if (cvs.isConnected) window.CaptionStyles.renderThumbnail(cvs, key, time, window.CaptionDocument.fontName(font));
      }).catch(error => console.error('[Caption preset font]', error));
    }

    function renderCaptionPresets() {
      const grid = presetsGrid || document.getElementById('ac-caption-presets-grid');
      if (!grid) { console.warn('[ACG] presetsGrid not found'); return; }
      if (!window.CaptionStyles || !window.CaptionStyles.PRESETS) {
        console.warn('[ACG] CaptionStyles not ready, retrying in 500ms...');
        setTimeout(renderCaptionPresets, 500);
        return;
      }

      grid.innerHTML = '';

      const presets = window.CaptionStyles.PRESETS;
      const keys = Object.keys(presets);
      if (presetsCountBadge) presetsCountBadge.textContent = `${keys.length} Presets`;

      keys.forEach(key => {
        const p = presets[key];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `cap-preset-card ${key === selectedPresetKey ? 'active' : ''}`;
        btn.dataset.preset = key;

        btn.innerHTML = `
          <div class="cap-thumb-wrap">
            <canvas class="cap-thumb-canvas" width="140" height="70"></canvas>
            <span class="cap-badge-diamond">💎</span>
          </div>
          <span class="cap-card-title">${escapeHtml(p.name)}</span>
        `;

        grid.appendChild(btn);

        try {
          const cvs = btn.querySelector('canvas');
          if (cvs) renderLocalPresetThumbnail(cvs, key, 0);
        } catch (e) {
          console.warn('[ACG] Thumbnail render error for', key, e);
        }

        btn.addEventListener('mouseenter', () => {
          const cvs = btn.querySelector('canvas');
          hoveredAcCapCanvas = cvs;
          hoverAcCapType = key;
          hoverAcCapAnimStart = performance.now();
          if (!hoverAcCapRafId) runAcCaptionHoverAnim();
        });

        btn.addEventListener('mouseleave', () => {
          const cvs = btn.querySelector('canvas');
          if (hoveredAcCapCanvas === cvs) {
            hoveredAcCapCanvas = null;
            hoverAcCapType = null;
            try { renderLocalPresetThumbnail(cvs, key, 0); } catch(e) {}
          }
        });

        btn.addEventListener('click', () => {
          selectPreset(key);
        });
      });

      console.log('[ACG] Rendered', keys.length, 'caption presets into grid');
    }

    // Initialize 27+ viral caption presets immediately + delayed fallback
    window.renderAcCaptionPresets = renderCaptionPresets;
    renderCaptionPresets();
    setTimeout(renderCaptionPresets, 800);

    function runAcCaptionHoverAnim() {
      if (!hoveredAcCapCanvas || !hoverAcCapType) {
        hoverAcCapRafId = null;
        return;
      }
      const elapsed = (performance.now() - hoverAcCapAnimStart) / 1000;
      renderLocalPresetThumbnail(hoveredAcCapCanvas, hoverAcCapType, elapsed);
      hoverAcCapRafId = requestAnimationFrame(runAcCaptionHoverAnim);
    }

    function syncControlsFromPreset(p) {
      if (!p) return;
      if (p.font && selFont) selFont.value = p.font;
      if (p.baseCol && colText) { colText.value = p.baseCol; if (lblTextCol) lblTextCol.textContent = p.baseCol.toUpperCase(); }
      if (p.highlightCol && colHighlight) { colHighlight.value = p.highlightCol; if (lblHighlightCol) lblHighlightCol.textContent = p.highlightCol.toUpperCase(); }
      if (p.strokeCol && colStroke) { colStroke.value = p.strokeCol; if (lblStrokeCol) lblStrokeCol.textContent = p.strokeCol.toUpperCase(); }
      if (p.strokeWidth !== undefined && slStroke) { slStroke.value = p.strokeWidth; if (lblStroke) lblStroke.textContent = `${p.strokeWidth}px`; }
      if (p.glowCol && colGlow) { colGlow.value = p.glowCol; if (lblGlowCol) lblGlowCol.textContent = p.glowCol.toUpperCase(); }
      if (p.glowBlur !== undefined && slGlow) { slGlow.value = p.glowBlur; if (lblGlow) lblGlow.textContent = `${p.glowBlur}px`; }
      if (p.anim && selAnim) selAnim.value = p.anim;
    }

    // ── Position Presets Row ─────────────────────────────────
    document.querySelectorAll('#ac-caption-pos-presets .pos-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#ac-caption-pos-presets .pos-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const posVal = parseInt(btn.dataset.pos, 10);
        if (slY) slY.value = posVal;
        if (lblY) lblY.textContent = `${posVal}%`;
        drawFrame();
      });
    });

    // ── Sliders & Inputs Real-time Listeners ──────────────────
    const controls = [
      { el: selFont },
      { el: slSize, lbl: lblSize, fmt: v => `${Math.round(parseFloat(v) * 100)}%` },
      { el: selCase },
      { el: selAlign },
      { el: selLines, action: () => reChunkCues() },
      { el: slWords, lbl: lblWords, fmt: v => `${v} words`, action: () => reChunkCues() },
      { el: slWordSpace, lbl: lblWordSpace, fmt: v => `${v}px` },
      { el: slLineSpace, lbl: lblLineSpace, fmt: v => `${parseFloat(v).toFixed(2)}x` },
      { el: slY, lbl: lblY, fmt: v => `${v}%` },
      { el: selAnim },
      { el: selLineAnim },
      { el: colText, lbl: lblTextCol, fmt: v => v.toUpperCase() },
      { el: colHighlight, lbl: lblHighlightCol, fmt: v => v.toUpperCase() },
      { el: colStroke, lbl: lblStrokeCol, fmt: v => v.toUpperCase() },
      { el: slStroke, lbl: lblStroke, fmt: v => `${v}px` },
      { el: colGlow, lbl: lblGlowCol, fmt: v => v.toUpperCase() },
      { el: slGlow, lbl: lblGlow, fmt: v => `${v}px` }
    ];

    controls.forEach(c => {
      const updateControl = (e) => {
        if (c.lbl && c.fmt) c.lbl.textContent = c.fmt(e.target.value);
        if (c.action) c.action();
        persistCaptionProject();
        drawFrame();
      };
      // Native selects use change; ranges/colors use input for live feedback.
      if (c.el?.tagName === 'SELECT') c.el.addEventListener('change', updateControl);
      else c.el?.addEventListener('input', updateControl);
    });

    function reChunkCues() {
      const wordsPerLine = Math.max(1, parseInt(slWords?.value || '4', 10));
      const maxLines = selLines?.value === '1' ? 1 : 2;
      const wordsPerCue = wordsPerLine * maxLines;
      const words = captionCues.flatMap(cue => Array.isArray(cue.words) && cue.words.length
        ? cue.words
        : retimeWords(cue.text, cue.start, cue.end));
      if (!words.length) return;
      const reChunked = [];
      for (let index = 0; index < words.length; index += wordsPerCue) {
        const group = words.slice(index, index + wordsPerCue);
        reChunked.push({
          start: Number(group[0].start) || 0,
          end: Number(group[group.length - 1].end) || 0,
          text: group.map(word => word.text || word.word || '').join(' ').trim(),
          words: group
        });
      }
      captionCues = reChunked;
      commitCueChange();
    }

    // ── Player Controls ──────────────────────────────────────
    const previewWrap = document.getElementById('acg-player-preview-wrap');
    const btnMute = document.getElementById('btn-ac-mute');
    const btnFrameBack = document.getElementById('btn-ac-frame-back');
    const btnFrameForward = document.getElementById('btn-ac-frame-forward');

    btnPlay?.addEventListener('click', togglePlayback);
    previewWrap?.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      togglePlayback();
    });

    async function togglePlayback() {
      if (!videoEl || !videoEl.src) return;
      if (videoEl.paused) {
        if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          if (btnPlay) btnPlay.textContent = '⏳';
          videoEl.addEventListener('canplay', () => togglePlayback(), { once: true });
          return;
        }
        if (videoEl.currentTime >= (videoEl.duration - 0.1)) {
          videoEl.currentTime = 0;
        }
        try {
          await videoEl.play();
        } catch (error) {
          console.error('[AutoCaptions] Video playback failed:', error);
          if (btnPlay) btnPlay.textContent = '▶';
        }
      } else {
        videoEl.pause();
        isPlaying = false;
        if (btnPlay) btnPlay.textContent = '▶';
        stopPreviewLoop();
      }
    }

    btnMute?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!videoEl) return;
      videoEl.muted = !videoEl.muted;
      if (btnMute) btnMute.textContent = videoEl.muted ? '🔇' : '🔊';
    });

    function stepVideoFrame(direction) {
      if (!videoEl?.src) return;
      videoEl.pause();
      const frameDuration = 1 / Math.max(1, parseInt(selExportFps?.value || '30', 10));
      videoEl.currentTime = Math.max(0, Math.min(mediaDuration, (videoEl.currentTime || 0) + direction * frameDuration));
      drawFrame();
    }
    btnFrameBack?.addEventListener('click', () => stepVideoFrame(-1));
    btnFrameForward?.addEventListener('click', () => stepVideoFrame(1));

    scrubber?.addEventListener('input', (e) => {
      const t = parseFloat(e.target.value);
      if (videoEl && videoEl.src) {
        videoEl.currentTime = t;
        updateTimecodeDisplay(t, mediaDuration);
        drawFrame();
      }
    });

    btnToggleCc?.addEventListener('click', () => {
      isCaptionsVisible = !isCaptionsVisible;
      btnToggleCc.classList.toggle('active', isCaptionsVisible);
      drawFrame();
    });

    btnFullscreen?.addEventListener('click', () => {
      const wrap = document.querySelector('.acg-player-stage-wrap') || previewWrap;
      if (!document.fullscreenElement) {
        wrap?.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    function updateTimecodeDisplay(cur, tot) {
      if (timeDisplay) {
        const curStr = formatTimecode(cur).slice(0, 5);
        const totStr = formatTimecode(tot).slice(0, 5);
        timeDisplay.textContent = `${curStr} / ${totStr}`;
      }
    }

    function startPreviewLoop() {
      if (isPreviewLoopRunning) return;
      isPreviewLoopRunning = true;
      animFrameId = requestAnimationFrame(renderLoop);
    }

    function stopPreviewLoop() {
      isPreviewLoopRunning = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    function renderLoop(now = performance.now()) {
      animFrameId = null;
      if (!isPreviewLoopRunning || !videoEl || videoEl.paused || videoEl.ended) {
        isPlaying = false;
        isPreviewLoopRunning = false;
        if (btnPlay) btnPlay.textContent = '▶';
        return;
      }
      // Canvas composition is intentionally capped at 30fps. Video continues
      // decoding normally, but captions and the UI no longer consume a full
      // 60fps of canvas and DOM work on long/high-resolution footage.
      if (now - lastPreviewFramePaint >= (1000 / 30)) {
        lastPreviewFramePaint = now;
        drawFrame();
      }
      animFrameId = requestAnimationFrame(renderLoop);
    }

    // ── Canvas Rendering Engine & Timeline Playhead Sync ────
    function drawFrame() {
      if (!ctx || !canvas) return;
      const curTime = videoEl?.currentTime || 0;
      const maxDur = (videoEl && !isNaN(videoEl.duration) && videoEl.duration > 0) ? videoEl.duration : (captionCues.length ? Math.max(...captionCues.map(c => c.end)) + 2 : 10);

      // Sync bottom timeline without forcing a full DOM repaint for every video frame.
      const playhead = document.getElementById('acg-timeline-playhead');
      const wrap = document.getElementById('acg-timeline-wrap');
      const timeDisplay = document.getElementById('acg-timeline-time-display');

      if (playhead && wrap && maxDur > 0) {
        const baseWidth = Math.max(300, wrap.clientWidth - 32);
        const totalWidthPx = Math.round(baseWidth * timelineZoomFactor);
        const playheadX = 28 + (curTime / maxDur) * totalWidthPx;
        playhead.style.left = `${playheadX}px`;

        // If playing and zoomed in, auto-scroll to keep playhead centered
        if (isPlaying && timelineZoomFactor > 1.0) {
          const targetScroll = playheadX - wrap.clientWidth / 2;
          if (Math.abs(wrap.scrollLeft - targetScroll) > 40) {
            wrap.scrollLeft = Math.max(0, targetScroll);
          }
        }
      }

      if (timeDisplay) {
        const curM = Math.floor(curTime / 60);
        const curS = (curTime % 60 < 10 ? '0' : '') + (curTime % 60).toFixed(1);
        const durM = Math.floor(maxDur / 60);
        const durS = (maxDur % 60 < 10 ? '0' : '') + (maxDur % 60).toFixed(1);
        timeDisplay.textContent = `${curM}:${curS} / ${durM}:${durS}`;
      }

      const activeCue = findActiveCaptionCue(curTime);
      const activeCueId = activeCue?.id || '';
      // Long transcripts can contain thousands of DOM cue blocks. Updating
      // every block repeatedly is the main source of playback jank. Only the
      // old and new active cue are touched when the active cue actually moves.
      if (activeCueId !== activeTimelineCueId) {
        activeTimelineElements.forEach(element => element.classList.remove('active'));
        activeTimelineCueId = activeCueId;
        activeTimelineElements = activeCueId
          ? [...document.querySelectorAll(`.acg-timeline-cue-block[data-cue-id="${CSS.escape(activeCueId)}"], .acg-timeline-cue-chip[data-cue-id="${CSS.escape(activeCueId)}"]`)]
          : [];
        activeTimelineElements.forEach(element => element.classList.add('active'));
      }
      drawCaptionDocumentPreview(curTime);
      const nowCueLabel = document.getElementById('acg-now-cue-label');
      if (nowCueLabel) {
        const cueIndex = activeCue ? captionCues.indexOf(activeCue) : -1;
        nowCueLabel.textContent = cueIndex >= 0 ? `NOW cue ${cueIndex + 1} / ${captionCues.length}` : 'No active caption';
      }
    }

    function drawVideoCover(targetCtx, width, height) {
      targetCtx.clearRect(0, 0, width, height);
      targetCtx.fillStyle = '#080a10';
      targetCtx.fillRect(0, 0, width, height);
      if (!videoEl || !videoEl.src || !videoEl.videoWidth || videoEl.error) return;
      try {
        const scale = Math.max(width / videoEl.videoWidth, height / videoEl.videoHeight);
        const drawW = videoEl.videoWidth * scale;
        const drawH = videoEl.videoHeight * scale;
        targetCtx.drawImage(videoEl, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
      } catch (e) {
        console.warn('[AutoCaptions] Preview frame could not be drawn:', e);
      }
    }


    // ── Cue Segments List & Timeline Tracks Renderer ─────────
    function resizeCueTextEditor(editor) {
      if (!editor) return;
      editor.style.height = 'auto';
      const targetHeight = Math.max(54, Math.min(160, editor.scrollHeight));
      editor.style.height = `${targetHeight}px`;
      editor.classList.toggle('is-overflowing', editor.scrollHeight > 160);
    }

    function renderCuesList(cues) {
      // Timeline cards are recreated below; invalidate cached DOM references so
      // the next playback frame activates the new current cue correctly.
      activeTimelineCueId = '';
      activeTimelineElements = [];
      captionCues = normalizeCaptionCues(cues);
      cues = captionCues;
      persistCaptionProject();
      if (cueCountBadge) cueCountBadge.textContent = `${cues.length} Cues`;
      
      const topCuesBadge = document.getElementById('acg-top-cues-badge');
      if (topCuesBadge) topCuesBadge.textContent = `${cues.length} Cues Synchronized`;

      const timelineCuesBadge = document.getElementById('acg-timeline-cues-count');
      if (timelineCuesBadge) timelineCuesBadge.textContent = `${cues.length} Cues`;

      const exportCuesBadge = document.getElementById('ac-lbl-export-cues');
      if (exportCuesBadge) exportCuesBadge.textContent = `${cues.length} Cues`;

      // 1. Render Left Column Segments
      if (cuesList) {
        if (!cues.length) {
          cuesList.innerHTML = `
            <div class="acg-empty-cues-state" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 12px;text-align:center;gap:6px;">
              <span style="font-size:24px;opacity:0.6;">💬</span>
              <p style="color:#cbd5e1;font-size:12px;font-weight:600;margin:0;">No captions generated yet</p>
              <span style="color:#64748b;font-size:11px;">Click "Generate Captions" or upload a script to view &amp; edit segments.</span>
            </div>
          `;
        } else {
          cuesList.innerHTML = cues.map((c, i) => `
            <div class="acg-cue-card" data-cue-id="${c.id}">
              <div class="acg-cue-meta">
                <span class="acg-cue-index">${i + 1}</span>
                <input class="acg-cue-time acg-cue-start" data-cue-id="${c.id}" type="number" min="0" step="0.01" value="${c.start.toFixed(2)}" title="Start time (seconds)" aria-label="Cue ${i + 1} start time in seconds" />
                <span class="acg-cue-time-separator">→</span>
                <input class="acg-cue-time acg-cue-end" data-cue-id="${c.id}" type="number" min="0" step="0.01" value="${c.end.toFixed(2)}" title="End time (seconds)" aria-label="Cue ${i + 1} end time in seconds" />
              </div>
              <div class="acg-cue-actions">
                <button class="acg-cue-action acg-btn-edit-single" type="button" title="Edit caption text" aria-label="Edit cue ${i + 1}">✏️</button>
                <button class="acg-cue-action acg-btn-split-single" type="button" title="Split cue" aria-label="Split cue ${i + 1}">✂️</button>
                <button class="acg-cue-action acg-btn-delete-single" type="button" title="Delete cue" aria-label="Delete cue ${i + 1}" style="color:#f87171;">✕</button>
              </div>
              <textarea class="acg-cue-text" data-cue-id="${c.id}" dir="auto" rows="2" aria-label="Edit cue ${i + 1}">${escapeHtml(c.text)}</textarea>
            </div>
          `).join('');

          cuesList.querySelectorAll('.acg-cue-text').forEach(resizeCueTextEditor);

          cuesList.querySelectorAll('.acg-cue-card').forEach(item => {
            item.addEventListener('click', (e) => {
              if (e.target.closest('.acg-cue-time')) return;
              const foundIndex = captionCues.findIndex(c => c.id === item.dataset.cueId);
              if (foundIndex < 0) return;
              if (e.target.closest('.acg-btn-delete-single')) {
                captionCues.splice(foundIndex, 1);
                commitCueChange();
                return;
              }
              if (e.target.closest('.acg-btn-split-single')) {
                splitCue(foundIndex);
                return;
              }
              if (e.target.closest('.acg-btn-edit-single')) {
                const cueTextEl = item.querySelector('.acg-cue-text');
                cueTextEl?.focus();
                cueTextEl?.select();
                return;
              }
              const t = captionCues[foundIndex]?.start;
              if (!isNaN(t) && videoEl) {
                videoEl.currentTime = t;
                drawFrame();
              }
            });
          });
          cuesList.querySelectorAll('.acg-cue-time').forEach(input => {
            input.addEventListener('change', () => {
              const cue = captionCues.find(item => item.id === input.dataset.cueId);
              if (!cue) return;
              const value = Math.max(0, parseFloat(input.value) || 0);
              setCueTiming(cue.id, input.classList.contains('acg-cue-start') ? value : cue.start, input.classList.contains('acg-cue-end') ? value : cue.end);
              commitCueChange();
            });
          });
          cuesList.querySelectorAll('.acg-cue-text').forEach(input => {
            let initialText = input.value;
            const applyText = () => {
              const cue = captionCues.find(item => item.id === input.dataset.cueId);
              const text = String(input.value || '').trim();
              if (!cue) return;
              if (!text) {
                // Never leave a cue blank because an accidental edit was
                // abandoned. Restore the last committed transcript text.
                input.value = initialText;
                cue.text = initialText;
                input.style.borderColor = 'transparent';
                drawFrame();
                return;
              }
              if (text === initialText) return;
              cue.text = text;
              // Text edits intentionally retime only this cue. Its original
              // time range stays untouched, while word-level tracking follows
              // the user's edited sentence instead of stale AI tokens.
              cue.words = retimeWords(text, cue.start, cue.end);
              initialText = text;
              commitCueChange();
            };
            input.addEventListener('click', event => event.stopPropagation());
            input.addEventListener('input', () => {
              input.style.borderColor = '#7c3aed';
              resizeCueTextEditor(input);
              const cue = captionCues.find(item => item.id === input.dataset.cueId);
              if (cue) { cue.text = String(input.value || ''); drawFrame(); }
            });
            input.addEventListener('change', applyText);
            input.addEventListener('blur', applyText);
          });
        }
      }

      // 2. Render Upper CC Captions Layer Track
      const timelineTrack = document.getElementById('acg-timeline-cues-track');
      const maxTimelineDuration = (videoEl && !isNaN(videoEl.duration) && videoEl.duration > 0)
        ? videoEl.duration
        : (cues.length ? Math.max(...cues.map(c => c.end)) + 0.5 : 8.0);

      if (timelineTrack) {
        if (!cues.length) {
          timelineTrack.innerHTML = `<span style="font-size: 11px; color: #64748b; font-style: italic; padding-left: 12px; display:flex; align-items:center; height:100%;">💬 No caption layers generated yet</span>`;
        } else {
          timelineTrack.innerHTML = cues.map((c, i) => {
            const startPct = Math.max(0, (c.start / maxTimelineDuration) * 100);
            const endPct   = Math.min(100, (c.end / maxTimelineDuration) * 100);
            const widthPct = Math.max(0.15, endPct - startPct);

            return `
              <div class="acg-timeline-cue-block" style="left: ${startPct}%; width: ${widthPct}%;" data-cue-id="${c.id}" data-start="${c.start}" data-end="${c.end}" title="Cue #${i + 1}: ${escapeHtml(c.text)} (${c.start.toFixed(2)}s - ${c.end.toFixed(2)}s)">
                <span class="acg-cue-resize-handle acg-cue-resize-start" aria-label="Resize cue start"></span>
                <span class="acg-cue-block-badge">#${i + 1}</span>
                <span class="acg-cue-block-text">${escapeHtml(c.text)}</span>
                <span class="acg-cue-block-time">${c.start.toFixed(2)}s</span>
                <span class="acg-cue-resize-handle acg-cue-resize-end" aria-label="Resize cue end"></span>
              </div>
            `;
          }).join('');

          timelineTrack.querySelectorAll('.acg-timeline-cue-block').forEach(block => {
            block.addEventListener('pointerdown', startCueTimelineDrag);
            block.addEventListener('click', (e) => {
              if (block.dataset.dragged === '1') return;
              e.stopPropagation();
              const cue = captionCues.find(item => item.id === block.dataset.cueId);
              if (cue && videoEl) {
                videoEl.currentTime = cue.start;
                drawFrame();
              }
            });
          });
        }
      }

      // 3. Render Lower V1 Video Media Track
      const videoTimelineTrack = document.getElementById('acg-timeline-video-track');
      if (videoTimelineTrack) {
        if (loadedMediaFile || (videoEl && videoEl.src)) {
          const durStr = (videoEl && !isNaN(videoEl.duration) && videoEl.duration > 0)
            ? `${Math.floor(videoEl.duration / 60)}:${(videoEl.duration % 60 < 10 ? '0' : '') + (videoEl.duration % 60).toFixed(1)}`
            : '00:08.0';
          const resStr = (videoEl && videoEl.videoWidth > 0) ? `${videoEl.videoWidth}×${videoEl.videoHeight}` : '1080p FHD';
          
          const thumbnailHtml = timelineThumbnails.length
            ? `<div class="acg-video-filmstrip" aria-label="Video frame thumbnails">${timelineThumbnails.map((src, index) => `<img src="${src}" alt="Frame ${index + 1}" draggable="false" />`).join('')}</div>`
            // Do not create a second hidden video decoder automatically. It
            // competes with playback on long/high-bitrate media. The media
            // track remains accurate and clickable without a filmstrip.
            : `<div class="acg-video-filmstrip acg-video-filmstrip-loading"><span>Video track</span></div>`;
          videoTimelineTrack.innerHTML = `
            <div class="acg-video-track-block" title="Uploaded Video Media: ${escapeHtml(loadedMediaFile?.name || 'video.mp4')} (${durStr})">
              ${thumbnailHtml}
              <div class="acg-video-track-meta acg-video-track-overlay">
                <span class="acg-video-badge">VIDEO</span>
                <span>🎬 ${escapeHtml(loadedMediaFile?.name || 'video.mp4')}</span>
                <span style="opacity:0.85; font-size:10px; font-family:monospace;">(${durStr} • ${resStr})</span>
              </div>
            </div>
          `;
        } else {
          videoTimelineTrack.innerHTML = `
            <div class="acg-video-placeholder-block">
              <span>🎬 Upload a video file above to view media track here</span>
            </div>
          `;
        }

        videoTimelineTrack.querySelectorAll('.acg-video-track-block').forEach(block => {
          block.addEventListener('click', (e) => {
            e.stopPropagation();
            if (videoEl) {
              const rect = block.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const pct = Math.max(0, Math.min(1, clickX / rect.width));
              videoEl.currentTime = pct * (videoEl.duration || 8.0);
              drawFrame();
            }
          });
        });
      }

      // 4. Render Timeline Time Ruler
      renderTimelineRulerAndWaveform();
    }

    function waitForThumbnailSeek(media, time, generation) {
      return new Promise((resolve, reject) => {
        if (generation !== timelineThumbnailGeneration) return reject(new Error('Thumbnail generation superseded.'));
        const finish = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error('Could not decode video frame.')); };
        const cleanup = () => {
          media.removeEventListener('seeked', finish);
          media.removeEventListener('error', failed);
        };
        const target = Math.max(0, Math.min(time, Math.max(0, media.duration - 0.001)));
        if (Math.abs((media.currentTime || 0) - target) < 0.002) {
          requestAnimationFrame(finish);
          return;
        }
        media.addEventListener('seeked', finish, { once: true });
        media.addEventListener('error', failed, { once: true });
        media.currentTime = target;
      });
    }

    function scheduleTimelineThumbnails(delay = 900) {
      if (timelineThumbnailTimer) clearTimeout(timelineThumbnailTimer);
      timelineThumbnailTimer = setTimeout(() => {
        timelineThumbnailTimer = null;
        if (!isPlaying) generateTimelineThumbnails();
      }, delay);
    }

    async function generateTimelineThumbnails() {
      if (!activeMediaUrl || !videoEl?.videoWidth || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return;
      const generation = ++timelineThumbnailGeneration;
      timelineThumbnailError = false;
      const sourceDuration = videoEl.duration;
      const track = document.getElementById('acg-timeline-video-track');
      // About one thumbnail per 135px keeps the track readable without making
      // a long upload seek hundreds of times.
      const targetCount = Math.max(6, Math.min(24, Math.ceil((track?.clientWidth || 1280) / 135)));
      const thumbnailVideo = document.createElement('video');
      thumbnailVideo.muted = true;
      thumbnailVideo.playsInline = true;
      thumbnailVideo.preload = 'auto';
      thumbnailVideo.src = activeMediaUrl;
      const waitForMetadata = new Promise((resolve, reject) => {
        thumbnailVideo.addEventListener('loadedmetadata', resolve, { once: true });
        thumbnailVideo.addEventListener('error', () => reject(new Error('Video metadata could not be loaded.')), { once: true });
      });

      try {
        await waitForMetadata;
        if (generation !== timelineThumbnailGeneration) return;
        const frameCanvas = document.createElement('canvas');
        const targetHeight = 72;
        frameCanvas.height = targetHeight;
        frameCanvas.width = Math.max(96, Math.round((thumbnailVideo.videoWidth / thumbnailVideo.videoHeight) * targetHeight));
        const frameCtx = frameCanvas.getContext('2d', { alpha: false });
        if (!frameCtx) throw new Error('Thumbnail canvas is unavailable.');
        const frames = [];
        for (let index = 0; index < targetCount; index++) {
          if (generation !== timelineThumbnailGeneration || isPlaying) return;
          const time = targetCount === 1 ? 0 : (index / (targetCount - 1)) * Math.max(0, sourceDuration - 0.05);
          await waitForThumbnailSeek(thumbnailVideo, time, generation);
          frameCtx.drawImage(thumbnailVideo, 0, 0, frameCanvas.width, frameCanvas.height);
          frames.push(frameCanvas.toDataURL('image/jpeg', 0.72));
          // Yield between seeks so the editor stays responsive on long clips.
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (generation !== timelineThumbnailGeneration) return;
        timelineThumbnails = frames;
        renderCuesList(captionCues);
      } catch (error) {
        if (generation === timelineThumbnailGeneration) {
          console.warn('[AutoCaptions] Timeline thumbnail generation failed:', error);
          timelineThumbnails = [];
          timelineThumbnailError = true;
          renderCuesList(captionCues);
        }
      } finally {
        thumbnailVideo.removeAttribute('src');
        thumbnailVideo.load();
      }
    }

    function renderTimelineRulerAndWaveform() {
      const ruler = document.getElementById('acg-timeline-ruler');
      const maxDuration = (videoEl && !isNaN(videoEl.duration) && videoEl.duration > 0) ? videoEl.duration : (captionCues.length ? Math.max(...captionCues.map(c => c.end)) + 2 : 10);
      
      const durText = `${Math.floor(maxDuration / 60)}:${(maxDuration % 60 < 10 ? '0' : '') + (maxDuration % 60).toFixed(1)}`;
      const exportDur = document.getElementById('ac-lbl-export-dur');
      if (exportDur) exportDur.textContent = durText;

      const timeDisplay = document.getElementById('acg-timeline-time-display');
      if (timeDisplay && videoEl) {
        const cur = videoEl.currentTime || 0;
        timeDisplay.textContent = `${Math.floor(cur / 60)}:${(cur % 60 < 10 ? '0' : '') + (cur % 60).toFixed(1)} / ${durText}`;
      }

      if (ruler) {
        let rulerHtml = '';
        let step = 2.0;
        if (timelineZoomFactor >= 3.0) step = 0.5;
        else if (timelineZoomFactor >= 2.0) step = 1.0;
        else if (timelineZoomFactor >= 1.5) step = 1.5;
        else if (maxDuration > 60) step = 10.0;
        else if (maxDuration > 30) step = 5.0;

        for (let t = 0; t <= maxDuration + 0.01; t += step) {
          const pct = Math.min(100, (t / maxDuration) * 100);
          const min = Math.floor(t / 60);
          const sec = (t % 60 < 10 ? '0' : '') + (t % 60).toFixed(1);
          rulerHtml += `<span class="ruler-tick" style="left:${pct}%;">${min}:${sec}</span>`;
        }
        ruler.innerHTML = rulerHtml;
      }
    }

    // ── CTI Playhead Mouse Drag & Scrub Controller ───────────
    let isDraggingPlayhead = false;

    function seekTimelineFromClientX(clientX) {
      if (!videoEl) return;
      const wrap = document.getElementById('acg-timeline-wrap');
      if (!wrap) return;
      const maxDur = (!isNaN(videoEl.duration) && videoEl.duration > 0)
        ? videoEl.duration
        : (captionCues.length ? Math.max(...captionCues.map(c => c.end)) + 2 : 10);
      if (maxDur <= 0) return;

      const rect = wrap.getBoundingClientRect();
      const baseWidth = Math.max(300, wrap.clientWidth - 32);
      const totalWidthPx = Math.round(baseWidth * timelineZoomFactor);
      const clickX = clientX - rect.left + wrap.scrollLeft - 28; // account for scrollLeft and 28px track label
      const targetTime = Math.max(0, Math.min(maxDur, (clickX / totalWidthPx) * maxDur));

      videoEl.currentTime = targetTime;
      if (scrubber) scrubber.value = targetTime;
      updateTimecodeDisplay(targetTime, maxDur);
      drawFrame();
    }

    function snapTimelineTime(value, cueId) {
      const duration = getTimelineDuration();
      const frame = 1 / Math.max(1, parseInt(selExportFps?.value || '30', 10));
      const threshold = Math.max(frame * 2, 0.08);
      const candidates = [0, duration, videoEl?.currentTime || 0];
      captionCues.forEach(cue => {
        if (cue.id !== cueId) candidates.push(cue.start, cue.end);
      });
      const closest = candidates.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best, value);
      return Math.abs(closest - value) <= threshold ? closest : value;
    }

    function setCueTiming(cueId, requestedStart, requestedEnd) {
      const cue = captionCues.find(item => item.id === cueId);
      if (!cue) return;
      const duration = getTimelineDuration();
      const ordered = [...captionCues].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
      const index = ordered.findIndex(item => item.id === cueId);
      const previous = ordered[index - 1];
      const next = ordered[index + 1];
      const lowerBound = previous ? previous.end : 0;
      const upperBound = next ? next.start : duration;
      let start = snapTimelineTime(Number(requestedStart), cueId);
      let end = snapTimelineTime(Number(requestedEnd), cueId);
      start = Math.max(lowerBound, Math.min(start, upperBound - 0.05));
      end = Math.max(start + 0.05, Math.min(end, upperBound));
      if (end - start < 0.05) {
        if (requestedStart !== cue.start) start = Math.max(lowerBound, end - 0.05);
        else end = Math.min(upperBound, start + 0.05);
      }
      cue.start = start;
      cue.end = end;
      cue.words = retimeWords(cue.text, start, end);
    }

    let cueTimelineDrag = null;
    function startCueTimelineDrag(event) {
      const block = event.currentTarget;
      const cue = captionCues.find(item => item.id === block.dataset.cueId);
      if (!cue || event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const resizeStart = event.target.closest('.acg-cue-resize-start');
      const resizeEnd = event.target.closest('.acg-cue-resize-end');
      cueTimelineDrag = {
        cueId: cue.id,
        mode: resizeStart ? 'start' : (resizeEnd ? 'end' : 'move'),
        pointerStart: event.clientX,
        originalStart: cue.start,
        originalEnd: cue.end,
        didMove: false,
        block
      };
      block.classList.add('dragging');
      block.setPointerCapture?.(event.pointerId);
    }

    window.addEventListener('pointermove', event => {
      if (!cueTimelineDrag) return;
      const wrap = document.getElementById('acg-timeline-wrap');
      if (!wrap) return;
      const baseWidth = Math.max(300, wrap.clientWidth - 32);
      const pixelsPerSecond = (baseWidth * timelineZoomFactor) / getTimelineDuration();
      const delta = (event.clientX - cueTimelineDrag.pointerStart) / pixelsPerSecond;
      const cue = captionCues.find(item => item.id === cueTimelineDrag.cueId);
      if (!cue) return;
      if (Math.abs(delta) > 0.002) cueTimelineDrag.didMove = true;
      if (cueTimelineDrag.mode === 'move') {
        const cueDuration = cueTimelineDrag.originalEnd - cueTimelineDrag.originalStart;
        setCueTiming(cue.id, cueTimelineDrag.originalStart + delta, cueTimelineDrag.originalStart + delta + cueDuration);
      } else if (cueTimelineDrag.mode === 'start') {
        setCueTiming(cue.id, cueTimelineDrag.originalStart + delta, cueTimelineDrag.originalEnd);
      } else {
        setCueTiming(cue.id, cueTimelineDrag.originalStart, cueTimelineDrag.originalEnd + delta);
      }
      const duration = getTimelineDuration();
      const left = (cue.start / duration) * 100;
      const width = ((cue.end - cue.start) / duration) * 100;
      cueTimelineDrag.block.style.left = `${left}%`;
      cueTimelineDrag.block.style.width = `${Math.max(0.15, width)}%`;
      cueTimelineDrag.block.dataset.start = cue.start;
      cueTimelineDrag.block.dataset.end = cue.end;
      drawFrame();
    });

    window.addEventListener('pointerup', () => {
      if (!cueTimelineDrag) return;
      cueTimelineDrag.block.classList.remove('dragging');
      if (cueTimelineDrag.didMove) {
        const draggedBlock = cueTimelineDrag.block;
        draggedBlock.dataset.dragged = '1';
        setTimeout(() => { draggedBlock.dataset.dragged = ''; }, 0);
        commitCueChange();
      }
      cueTimelineDrag = null;
    });

    const acgTlWrap = document.getElementById('acg-timeline-wrap');
    const acgPlayhead = document.getElementById('acg-timeline-playhead');
    const acgRuler = document.getElementById('acg-timeline-ruler');

    acgPlayhead?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isDraggingPlayhead = true;
      acgPlayhead.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    });

    acgRuler?.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDraggingPlayhead = true;
      acgPlayhead?.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
      seekTimelineFromClientX(e.clientX);
    });

    acgTlWrap?.addEventListener('mousedown', (e) => {
      if (e.target.closest('.acg-timeline-cue-block') || e.target.closest('.acg-btn-edit-single') || e.target.closest('button')) return;
      isDraggingPlayhead = true;
      acgPlayhead?.classList.add('dragging');
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
      seekTimelineFromClientX(e.clientX);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingPlayhead) return;
      seekTimelineFromClientX(e.clientX);
    });

    window.addEventListener('mouseup', () => {
      if (isDraggingPlayhead) {
        isDraggingPlayhead = false;
        acgPlayhead?.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    });

    acgTlWrap?.addEventListener('touchstart', (e) => {
      if (e.touches.length) {
        isDraggingPlayhead = true;
        acgPlayhead?.classList.add('dragging');
        seekTimelineFromClientX(e.touches[0].clientX);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (isDraggingPlayhead && e.touches.length) {
        seekTimelineFromClientX(e.touches[0].clientX);
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      if (isDraggingPlayhead) {
        isDraggingPlayhead = false;
        acgPlayhead?.classList.remove('dragging');
      }
    });

    btnAddManualCue?.addEventListener('click', () => {
      const text = prompt('Enter new caption text:');
      if (!text || !text.trim()) return;
      const curT = videoEl?.currentTime || 0;
      const maxDuration = getTimelineDuration();
      const start = Math.max(0, Math.min(curT, maxDuration - 0.05));
      const end = Math.min(maxDuration, Math.max(start + 0.05, start + 2.5));
      captionCues.push({
        id: createCueId(),
        start,
        end,
        text: text.trim(),
        words: retimeWords(text.trim(), start, end)
      });
      commitCueChange();
    });

    btnEditAllCues?.addEventListener('click', () => {
      if (!captionCues.length) return;
      document.querySelector('.acg-bulk-editor-backdrop')?.remove();
      const backdrop = document.createElement('div');
      backdrop.className = 'acg-bulk-editor-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.setAttribute('aria-labelledby', 'acg-bulk-editor-title');
      backdrop.innerHTML = `
        <div class="acg-bulk-editor">
          <div class="acg-bulk-editor-header">
            <div><h3 id="acg-bulk-editor-title">Edit All Caption Cues</h3><p>Edit SRT text and timings, then save the complete cue list.</p></div>
            <button class="btn-outline-sm acg-bulk-close" type="button" aria-label="Close cue editor">✕</button>
          </div>
          <textarea class="acg-bulk-editor-text" spellcheck="true" dir="auto" aria-label="Complete SRT subtitles"></textarea>
          <div class="acg-bulk-editor-actions">
            <span class="acg-bulk-editor-status" aria-live="polite"></span>
            <div><button class="btn-outline-sm acg-bulk-cancel" type="button">Cancel</button> <button class="btn-render acg-bulk-save" type="button">Save Cues</button></div>
          </div>
        </div>`;
      document.body.appendChild(backdrop);
      const editor = backdrop.querySelector('.acg-bulk-editor-text');
      const close = () => backdrop.remove();
      editor.value = serializeSRT(captionCues);
      backdrop.querySelector('.acg-bulk-close').addEventListener('click', close);
      backdrop.querySelector('.acg-bulk-cancel').addEventListener('click', close);
      backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
      backdrop.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
      backdrop.querySelector('.acg-bulk-save').addEventListener('click', () => {
        const parsed = parseSRTCues(editor.value);
        const status = backdrop.querySelector('.acg-bulk-editor-status');
        if (!parsed.length) {
          status.textContent = 'No valid SRT cues found. Check cue timings and text.';
          status.style.color = '#fca5a5';
          return;
        }
        rawSRTText = editor.value;
        captionCues = parsed;
        commitCueChange();
        close();
      });
      requestAnimationFrame(() => editor.focus());
    });

    document.addEventListener('keydown', event => {
      const activeView = document.getElementById('view-auto-captions');
      if (!activeView?.classList.contains('active') || event.target.matches('input, textarea, select')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        restoreCueHistory(event.shiftKey ? 1 : -1);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        restoreCueHistory(1);
      }
    });

    async function transcribeWithLocalCaptionPipeline(file, providerKeys, language, wordsPerLine, onProgress) {
      const response = await fetch('/api/caption-transcribe', {
        method: 'POST', headers: { 'X-Deepgram-Key': providerKeys.deepgram || '', 'X-Groq-Key': providerKeys.groq || '', 'X-Caption-Language': language || 'auto', 'Content-Type': file.type || 'application/octet-stream' }, body: file
      });
      if (!response.ok || !response.body) throw new Error(await response.text() || 'Local caption pipeline could not start.');
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = ''; let completed = null;
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = pending.split('\n'); pending = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue; const event = JSON.parse(line);
          if (event.type === 'progress') onProgress(event);
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'complete') completed = event;
        }
        if (done) break;
      }
      if (!completed?.words?.length) throw new Error('No spoken words were returned from the transcription engine.');
      const cues = []; let bucket = [];
      const flush = () => { if (!bucket.length) return; cues.push({ start:Number(bucket[0].start)||0, end:Number(bucket[bucket.length-1].end)||0, text:bucket.map(w=>w.word||'').join(' ').trim(), words:[...bucket] }); bucket=[]; };
      completed.words.forEach(word => { bucket.push(word); if (bucket.length >= Math.max(1, Number(wordsPerLine)||4) || /[.!?۔]$/.test(word.word || '')) flush(); }); flush();
      return { srt: 'local-pipeline', cues, text: completed.text, engine: completed.engine || 'Unknown engine', detectedLanguage: completed.detectedLanguage || '' };
    }

    // ── Generate Captions Action (local FFmpeg + Groq Whisper) ────────────
    btnAutoCap?.addEventListener('click', async () => {
      if (!loadedMediaFile) {
        alert('Please upload a video or audio file first.');
        fileInput?.click();
        return;
      }

      const keys = window.AI?.getKeys() || {};
      btnAutoCap.disabled = true;
      btnAutoCap.innerHTML = `<span>⏳</span> Transcribing audio with ${keys.groq ? 'Groq Whisper' : (keys.deepgram ? 'Deepgram' : 'Local Whisper')}...`;

      try {
        const lang = selLang?.value || 'auto';
        const wordsPerLine = slWords?.value || '4';

        // The server extracts 32 kbps audio and sends normal long recordings
        // to Groq in one native-timestamp request; only oversized media uses
        // chunks. This preserves both accuracy and a continuous timeline.
        const transcription = await transcribeWithLocalCaptionPipeline(loadedMediaFile, { deepgram: keys.deepgram || '', groq: keys.groq || '' }, lang === 'auto' ? '' : lang, wordsPerLine, progress => {
              const label = progress.message || (progress.stage === 'extracting' ? 'Extracting compact audio…'
                : progress.stage === 'retrying' ? 'Retrying a transcription part…'
                : progress.stage === 'fallback' ? 'Switching to Local Whisper…'
                : 'Transcribing captions…');
              const percent = Number.isFinite(Number(progress.percent)) ? ` ${Math.round(Number(progress.percent))}%` : '';
              btnAutoCap.innerHTML = `<span>⏳</span> ${label}${percent}`;
            });
        const srt = transcription.srt;

        if (!srt || !srt.trim()) {
          throw new Error('No speech was detected in the audio file.');
        }

        captionCues = transcription.cues?.length ? transcription.cues.map(cue => ({
          id: createCueId(),
          start: Number(cue.start) || 0,
          end: Number(cue.end) || 0,
          text: cue.text || '',
          words: cue.words || retimeWords(cue.text || '', cue.start, cue.end)
        })) : parseSRTCues(srt);
        if (!captionCues.length) {
          throw new Error('Could not parse subtitle cues from transcription output.');
        }

        commitCueChange();
        setAcgStepper(3);

        const engineLabel = transcription.detectedLanguage ? `${transcription.engine} • ${transcription.detectedLanguage}` : transcription.engine;
        btnAutoCap.innerHTML = `<span>✓</span> ${captionCues.length} Cues • ${engineLabel}`;
        setTimeout(() => {
          btnAutoCap.innerHTML = `<span>⚡</span> Generate Captions`;
          btnAutoCap.disabled = false;
        }, 2000);

        drawFrame();

        // Switch to Presets tab so user can pick their favorite kinetic caption style
        const presetsTabBtn = document.querySelector('#acg-capcut-nav-bar .nav-tab-btn[data-tab="tab-acg-presets"]');
        presetsTabBtn?.click();

      } catch (err) {
        console.error('Transcription error:', err);
        alert('Transcription Error: ' + (err.message || 'Failed to transcribe audio. Please check your media file, Local Whisper, or Groq connection.'));
        btnAutoCap.innerHTML = `<span>⚡</span> Generate Captions`;
        btnAutoCap.disabled = false;
      }
    });

    // ── Export Aspect Ratio & Specs Sync ─────────────────────
    const selExportAspect = document.getElementById('ac-sel-export-aspect');
    const selExportFps = document.getElementById('ac-sel-export-fps');
    const selExportQuality = document.getElementById('ac-sel-export-quality');
    const lblExportRes = document.getElementById('ac-lbl-export-res');
    function getExportSpec() {
      const aspect = selExportAspect?.value || '16:9';
      const specs = {
        '16:9': { width: 1920, height: 1080 },
        '9:16': { width: 1080, height: 1920 },
        '1:1': { width: 1080, height: 1080 },
        '4:5': { width: 1080, height: 1350 }
      };
      return specs[aspect] || specs['16:9'];
    }


    function refreshExportSpecs() {
      const spec = getExportSpec();
      const fps = Math.max(1, parseInt(selExportFps?.value || '30', 10));
      if (lblExportRes) lblExportRes.textContent = `${spec.width}×${spec.height}`;
      const previewFpsMeta = document.getElementById('ac-meta-fps');
      if (previewFpsMeta) previewFpsMeta.textContent = `${fps} FPS`;
    }

    selExportAspect?.addEventListener('change', () => {
      drawFrame();
      const asp = selExportAspect.value;
      if (asp === '9:16') {
        if (lblExportRes) lblExportRes.textContent = '1080×1920';
      } else if (asp === '1:1') {
        if (lblExportRes) lblExportRes.textContent = '1080×1080';
      } else if (asp === '4:5') {
        if (lblExportRes) lblExportRes.textContent = '1080×1350';
      } else {
        if (lblExportRes) lblExportRes.textContent = '1920×1080';
      }
    });
    selExportFps?.addEventListener('change', refreshExportSpecs);

    function captionDefaults() {
      return {
        preset: selectedPresetKey,
        fields: Object.fromEntries([
          selFont, slSize, selCase, selAlign, selLines, slWords, slWordSpace, slLineSpace,
          slY, selAnim, selLineAnim, colText, colHighlight, colStroke, slStroke, colGlow,
          slGlow, selExportAspect, selExportFps, selExportQuality
        ].filter(Boolean).map(el => [el.id, el.value]))
      };
    }

    function restoreCaptionDefaults() {
      try {
        const saved = JSON.parse(localStorage.getItem('cipher-caption-defaults') || 'null');
        if (!saved || !saved.fields) return;
        Object.entries(saved.fields).forEach(([id, value]) => {
          const el = document.getElementById(id);
          const isSupportedOption = el && Array.from(el.options || []).some(option => option.value === value);
          if (isSupportedOption || el?.type === 'range' || el?.type === 'color') el.value = value;
        });
        if (saved.preset && window.CaptionStyles?.PRESETS?.[saved.preset]) {
          selectedPresetKey = saved.preset;
          styleCards.forEach(card => card.classList.toggle('active', card.dataset.preset === saved.preset));
        }
        [
          [lblSize, slSize, value => `${Math.round(parseFloat(value) * 100)}%`],
          [lblWords, slWords, value => `${value} words`],
          [lblWordSpace, slWordSpace, value => `${value}px`],
          [lblLineSpace, slLineSpace, value => `${parseFloat(value).toFixed(2)}x`],
          [lblY, slY, value => `${value}%`],
          [lblStroke, slStroke, value => `${value}px`],
          [lblGlow, slGlow, value => `${value}px`],
          [lblTextCol, colText, value => value.toUpperCase()],
          [lblHighlightCol, colHighlight, value => value.toUpperCase()],
          [lblStrokeCol, colStroke, value => value.toUpperCase()],
          [lblGlowCol, colGlow, value => value.toUpperCase()]
        ].forEach(([label, control, formatter]) => { if (label && control) label.textContent = formatter(control.value); });
        refreshExportSpecs();
      } catch (error) {
        console.warn('[AutoCaptions] Could not restore saved defaults:', error);
      }
    }

    btnSaveDefaults?.addEventListener('click', () => {
      localStorage.setItem('cipher-caption-defaults', JSON.stringify(captionDefaults()));
      btnSaveDefaults.textContent = '✓ Default Saved';
      setTimeout(() => { btnSaveDefaults.textContent = '💾 Save Current Style as Default'; }, 1500);
    });

    // ── Export Actions ────────────────────────────────────────
    btnDownloadSrt?.addEventListener('click', () => {
      setAcgStepper(4);
      downloadFile(serializeSRT(captionCues), 'captions.srt', 'text/plain;charset=utf-8');
    });

    btnDownloadVtt?.addEventListener('click', () => {
      setAcgStepper(4);
      downloadFile(serializeVTT(captionCues), 'captions.vtt', 'text/vtt;charset=utf-8');
    });

    btnCopySrt?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(serializeSRT(captionCues));
        btnCopySrt.textContent = '✓ Copied!';
      } catch (error) {
        console.error('[AutoCaptions] Clipboard copy failed:', error);
        btnCopySrt.textContent = 'Copy blocked';
      }
      setTimeout(() => { btnCopySrt.textContent = '📋 Copy SRT'; }, 1200);
    });

    btnExportMp4Burned?.addEventListener('click', async () => {
      setAcgStepper(4);
      if (exportAbortController) {
        exportAbortController.abort();
        return;
      }
      await renderCaptionedMP4();
    });

    function seekVideoForExport(time, signal) {
      return new Promise((resolve, reject) => {
        if (!videoEl) return reject(new Error('Preview video is unavailable.'));
        if (signal?.aborted) return reject(new DOMException('Export cancelled', 'AbortError'));
        const target = Math.max(0, Math.min(time, Math.max(0, (videoEl.duration || time) - 0.001)));
        const done = () => { cleanup(); resolve(); };
        const fail = () => { cleanup(); reject(new Error('Could not seek the video for rendering.')); };
        const cancelled = () => { cleanup(); reject(new DOMException('Export cancelled', 'AbortError')); };
        const cleanup = () => {
          videoEl.removeEventListener('seeked', done);
          videoEl.removeEventListener('error', fail);
          signal?.removeEventListener('abort', cancelled);
        };
        if (Math.abs(videoEl.currentTime - target) < 0.002) return requestAnimationFrame(done);
        videoEl.addEventListener('seeked', done, { once: true });
        videoEl.addEventListener('error', fail, { once: true });
        signal?.addEventListener('abort', cancelled, { once: true });
        videoEl.currentTime = target;
      });
    }


    async function fetchRenderJson(url, options) {
      const response = await fetch(url, options);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) throw new Error(payload.error || `Render request failed (${response.status}).`);
      return payload;
    }

    async function renderCaptionedMP4() {
      if (!loadedMediaFile || !videoEl?.src || !videoEl.videoWidth) {
        alert('Upload a video first, then render the captioned MP4.');
        return;
      }
      if (!captionCues.length) {
        alert('Generate or upload captions before exporting a captioned MP4.');
        return;
      }

      const spec = getExportSpec();
      // Freeze the complete caption document before any async upload begins.
      // The user may continue clicking presets/sliders while the source video
      // streams to disk; that must never alter this export half-way through.
      const exportSnapshot = JSON.parse(JSON.stringify(captionDocumentSnapshot()));
      const qualityMap = { web: 'balanced', high: 'high', mobile: 'compact' };
      const exportQuality = qualityMap[selExportQuality?.value] || 'balanced';
      const controller = new AbortController();
      const signal = controller.signal;
      const originalTime = videoEl.currentTime || 0;
      const wasPlaying = !videoEl.paused;
      const originalButtonText = btnExportMp4Burned.textContent;
      exportAbortController = controller;
      videoEl.pause();
      btnExportMp4Burned.disabled = false;

      const cancelServerJob = () => {
        if (!activeExportJobId) return;
        fetch('/api/stream-render-cancel', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: activeExportJobId })
        }).catch(() => {});
      };
      signal.addEventListener('abort', cancelServerJob, { once: true });

      try {
        // Upload directly to the local render disk stream.  Do not place a
        // 20–60 minute video inside FormData: that used to duplicate it in
        // renderer and server memory before FFmpeg could start.
        btnExportMp4Burned.textContent = '⏳ Uploading source video…';
        const extension = (loadedMediaFile.name.split('.').pop() || 'mp4').replace(/[^a-z0-9]/gi, '') || 'mp4';
        const source = await fetchRenderJson('/api/stream-render-source', {
          method: 'POST', headers: { 'X-File-Ext': extension }, body: loadedMediaFile, signal
        });
        if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
        btnExportMp4Burned.textContent = '⏳ Rendering captions with FFmpeg…';
        const result = await fetchRenderJson('/api/caption-exact-export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceId: source.sourceId,
            cues: exportSnapshot.cues,
            width: exportSnapshot.width,
            height: exportSnapshot.height,
            quality: exportQuality,
            fps: exportSnapshot.fps,
            volume: exportSnapshot.volume,
            settings: exportSnapshot.settings
          }), signal
        });
        activeExportJobId = null;
        const download = document.createElement('a');
        download.href = result.downloadUrl;
        download.download = result.fileName || 'Cipher_captioned.mp4';
        document.body.appendChild(download);
        download.click();
        download.remove();
        btnExportMp4Burned.textContent = '✓ MP4 Downloaded';
      } catch (error) {
        if (error?.name === 'AbortError') {
          btnExportMp4Burned.textContent = 'Render Cancelled';
        } else {
          console.error('[AutoCaptions] MP4 export failed:', error);
          alert(`MP4 export failed: ${error.message || 'Unknown rendering error.'}`);
          btnExportMp4Burned.textContent = 'Render Failed';
        }
      } finally {
        signal.removeEventListener('abort', cancelServerJob);
        activeExportJobId = null;
        exportAbortController = null;
        await seekVideoForExport(originalTime).catch(() => {});
        drawFrame();
        if (wasPlaying) videoEl.play().catch(() => {});
        setTimeout(() => { if (btnExportMp4Burned) btnExportMp4Burned.textContent = originalButtonText; }, 1600);
      }
    }

    btnSendStudio?.addEventListener('click', () => {
      setAcgStepper(4);
      if (window.Captions && captionCues.length) {
        window.Captions.loadSRT(serializeSRT(captionCues));
      }
      switchTool('cipher-studio');
    });

    function formatSubtitleTimestamp(seconds, separator = ',') {
      const totalMs = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
      const hours = Math.floor(totalMs / 3600000);
      const minutes = Math.floor((totalMs % 3600000) / 60000);
      const secs = Math.floor((totalMs % 60000) / 1000);
      const ms = totalMs % 1000;
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}${separator}${String(ms).padStart(3, '0')}`;
    }

    function serializeSRT(cues) {
      return (cues || []).map((cue, index) => `${index + 1}\n${formatSubtitleTimestamp(cue.start)} --> ${formatSubtitleTimestamp(cue.end)}\n${String(cue.text || '').trim()}\n`).join('\n');
    }

    function serializeVTT(cues) {
      return `WEBVTT\n\n${(cues || []).map(cue => `${formatSubtitleTimestamp(cue.start, '.')} --> ${formatSubtitleTimestamp(cue.end, '.')}\n${String(cue.text || '').trim()}\n`).join('\n')}`;
    }

    function retimeWords(text, start, end) {
      const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
      const safeStart = Number(start) || 0;
      const duration = Math.max(0.05, (Number(end) || safeStart + 1) - safeStart);
      const perWord = duration / Math.max(1, tokens.length);
      return tokens.map((token, index) => ({ text: token, start: safeStart + index * perWord, end: safeStart + (index + 1) * perWord }));
    }

    function splitCue(index) {
      const cue = captionCues[index];
      if (!cue) return;
      const words = Array.isArray(cue.words) && cue.words.length ? cue.words : retimeWords(cue.text, cue.start, cue.end);
      if (words.length < 2) {
        alert('A cue needs at least two words before it can be split.');
        return;
      }
      const pivot = Math.ceil(words.length / 2);
      const left = words.slice(0, pivot);
      const right = words.slice(pivot);
      const leftCue = { id: createCueId(), start: left[0].start, end: left[left.length - 1].end, text: left.map(word => word.text || word.word || '').join(' '), words: left };
      const rightCue = { id: createCueId(), start: right[0].start, end: right[right.length - 1].end, text: right.map(word => word.text || word.word || '').join(' '), words: right };
      captionCues.splice(index, 1, leftCue, rightCue);
      commitCueChange();
    }

    function parseSRTCues(srtText) {
      if (!srtText) return [];
      const normalized = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      const blocks = normalized.split(/\n\s*\n/);
      const cues = [];

      for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (!lines.length) continue;
        let timeIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('-->')) { timeIdx = i; break; }
        }
        if (timeIdx === -1) continue;
        const match = lines[timeIdx].match(/(\d{1,2}:\d{2}:\d{2}[,\.]\d{2,3}|\d{1,2}:\d{2}[,\.]\d{2,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{2,3}|\d{1,2}:\d{2}[,\.]\d{2,3})/);
        if (!match) continue;

        const parseT = (str) => {
          const parts = (str || '').trim().replace(',', '.').split(':');
          if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
          if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
          return parseFloat(str) || 0;
        };

        const start = parseT(match[1]);
        const end = parseT(match[2]);
        const text = lines.slice(timeIdx + 1).join(' ').trim();
        if (!isNaN(start) && !isNaN(end) && text) {
          const rawWords = text.trim().split(/\s+/);
          const wCount = Math.max(1, rawWords.length);
          const wDur = Math.max(0.1, (end - start) / wCount);
          const words = rawWords.map((w, idx) => ({
            text: w,
            start: start + idx * wDur,
            end: start + (idx + 1) * wDur
          }));
          cues.push({ start, end, text, words });
        }
      }
      if (cues.length) return cues;

      // Timestamped transcript TXT: (0:00) First line ... (0:06) Next line
      // This is also the format generated by the Audio Transcriber tool.
      const timestampPattern = /\(?\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*\)?/g;
      const timestamped = [];
      const matches = [...normalized.matchAll(timestampPattern)];
      if (matches.length) {
        const toSeconds = (value) => value.split(':').reduce((total, part) => total * 60 + (parseFloat(part) || 0), 0);
        matches.forEach((match, index) => {
          const start = toSeconds(match[1]);
          const textStart = (match.index || 0) + match[0].length;
          const textEnd = index + 1 < matches.length ? (matches[index + 1].index || normalized.length) : normalized.length;
          const text = normalized.slice(textStart, textEnd).replace(/\s+/g, ' ').trim();
          const nextStart = index + 1 < matches.length ? toSeconds(matches[index + 1][1]) : Math.max(start + 1, mediaDuration || start + 3);
          if (text && nextStart > start) timestamped.push({ start, end: nextStart, text, words: retimeWords(text, start, nextStart) });
        });
      }
      if (timestamped.length) return timestamped;

      // Plain scripts are chunked into short, editable caption cards. Their
      // timing is evenly distributed over the loaded media length so users can
      // immediately refine it in the cue editor instead of receiving an empty UI.
      const words = normalized.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
      if (!words.length) return [];
      const maxWords = Math.max(1, parseInt(slWords?.value || '4', 10)) * (selLines?.value === '2' ? 2 : 1);
      const chunks = [];
      for (let i = 0; i < words.length; i += maxWords) chunks.push(words.slice(i, i + maxWords).join(' '));
      const totalDuration = Math.max(chunks.length * 1.2, Number(mediaDuration) || 0);
      const cueDuration = totalDuration / chunks.length;
      return chunks.map((text, index) => {
        const start = index * cueDuration;
        const end = Math.min(totalDuration, (index + 1) * cueDuration);
        return { start, end: Math.max(start + 0.05, end), text, words: retimeWords(text, start, Math.max(start + 0.05, end)) };
      });
    }

    refreshExportSpecs();
    restoreCaptionDefaults();
    applyRecoveredCaptionStyle();

    const captionPreviewWrap = document.getElementById('acg-player-preview-wrap');
    if (captionPreviewWrap) new ResizeObserver(() => drawFrame()).observe(captionPreviewWrap);

    // Initialize 27+ Live Presets Grid
    renderCaptionPresets();
  }

  // ── Helper: Download File ───────────────────────────────────
  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatTimecode(seconds) {
    if (isNaN(seconds) || seconds === null || seconds === undefined) return '00:00.0';
    const s = Math.max(0, parseFloat(seconds) || 0);
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const tenths = Math.floor((s % 1) * 10);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${tenths}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Expose globally
  window.formatTimecode = formatTimecode;

  return {
    init,
    switchTool,
    formatTimecode
  };
})();


  // Settings Page Events
  setTimeout(() => {
    const statusBox = document.getElementById('settings-status-box');
    const setStatus = (msg, color) => { if (statusBox) { statusBox.textContent = msg; statusBox.style.color = color; } };

    document.getElementById('page-test-deepgram')?.addEventListener('click', async () => {
      const val = document.getElementById('page-key-deepgram')?.value;
      setStatus('Testing Deepgram API...', '#38bdf8');
      try { await window.AI.testConnection('deepgram', val); setStatus('✅ Deepgram Connected!', '#10b981'); }
      catch(e) { setStatus('❌ Deepgram Error: ' + e.message, '#ef4444'); }
    });
    document.getElementById('page-test-groq')?.addEventListener('click', async () => {
      const val = document.getElementById('page-key-groq')?.value;
      setStatus('Testing Groq API...', '#38bdf8');
      try { await window.AI.testConnection('groq', val); setStatus('✅ Groq Connected!', '#10b981'); }
      catch(e) { setStatus('❌ Groq Error: ' + e.message, '#ef4444'); }
    });
    document.getElementById('page-test-gemini')?.addEventListener('click', async () => {
      const val = document.getElementById('page-key-gemini')?.value;
      setStatus('Testing Gemini API...', '#38bdf8');
      try { await window.AI.testConnection('gemini', val); setStatus('✅ Gemini Connected!', '#10b981'); }
      catch(e) { setStatus('❌ Gemini Error: ' + e.message, '#ef4444'); }
    });
    document.getElementById('page-test-openai')?.addEventListener('click', async () => {
      const val = document.getElementById('page-key-openai')?.value;
      setStatus('Testing OpenAI API...', '#38bdf8');
      try { await window.AI.testConnection('openai', val); setStatus('✅ OpenAI Connected!', '#10b981'); }
      catch(e) { setStatus('❌ OpenAI Error: ' + e.message, '#ef4444'); }
    });

    document.getElementById('btn-save-presets')?.addEventListener('click', () => {
      window.AI.setKey('deepgram', document.getElementById('page-key-deepgram')?.value);
      window.AI.setKey('groq', document.getElementById('page-key-groq')?.value);
      window.AI.setKey('gemini', document.getElementById('page-key-gemini')?.value);
      window.AI.setKey('openai', document.getElementById('page-key-openai')?.value);
      setStatus('✅ All Configuration & API Keys Saved to Backend!', '#10b981');
    });
  }, 1000);
