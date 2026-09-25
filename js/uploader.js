/* ============================================================
   UPLOADER.JS — Studio File Uploader, Timestamp Parser & Gallery
   ============================================================ */

window.Uploader = (function () {

  // ── State ──────────────────────────────────────────────────
  let audioFile   = null;   // { file, url, buffer, duration }
  let imageSlots  = [];     // [{ file, url, seconds, name }]
  let previewAudioEl = null;

  // ── DOM References ─────────────────────────────────────────
  let zoneAudio, zoneImages, inputAudio, inputImages;
  let audioStatus, imagesStatus, btnBuild, buildHint;
  let audioDropEmpty, audioDropLoaded, audioFileName, audioFileSize, btnAudioPreview, btnAudioRemove;
  let imagesDropEmpty, imagesDropLoaded, imagesCountLabel, miniGalleryStrip, btnImagesClear;

  function init() {
    zoneAudio        = document.getElementById('zone-audio');
    zoneImages       = document.getElementById('zone-images');
    inputAudio       = document.getElementById('input-audio');
    inputImages      = document.getElementById('input-images');
    audioStatus      = document.getElementById('audio-status');
    imagesStatus     = document.getElementById('images-status');
    btnBuild         = document.getElementById('btn-build');
    buildHint        = document.getElementById('build-hint');

    audioDropEmpty   = document.getElementById('audio-drop-empty');
    audioDropLoaded  = document.getElementById('audio-drop-loaded');
    audioFileName    = document.getElementById('audio-file-name');
    audioFileSize    = document.getElementById('audio-file-size');
    btnAudioPreview  = document.getElementById('btn-audio-preview');
    btnAudioRemove   = document.getElementById('btn-audio-remove');

    imagesDropEmpty  = document.getElementById('images-drop-empty');
    imagesDropLoaded = document.getElementById('images-drop-loaded');
    imagesCountLabel = document.getElementById('images-count-label');
    miniGalleryStrip = document.getElementById('mini-gallery-strip');
    btnImagesClear   = document.getElementById('btn-images-clear');

    // Click to open file picker (avoiding button clicks)
    const audioArea = document.getElementById('audio-drop-area');
    const imagesArea= document.getElementById('images-drop-area');

    audioArea.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      inputAudio.click();
    });

    imagesArea.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      inputImages.click();
    });

    inputAudio.addEventListener('change',  e => handleAudioFiles(e.target.files));
    inputImages.addEventListener('change', e => handleImageFiles(e.target.files));

    // Drag-and-drop
    setupDrop(zoneAudio, files => {
      const audio = [...files].filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(f.name));
      if (audio.length) handleAudioFiles(audio);
    });

    setupDrop(zoneImages, files => {
      const imgs = [...files].filter(f => f.type.startsWith('image/'));
      if (imgs.length) handleImageFiles(imgs);
    });

    // Audio preview on homepage
    btnAudioPreview.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleAudioPreview();
    });

    // Remove buttons
    btnAudioRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAudio();
    });

    btnImagesClear.addEventListener('click', (e) => {
      e.stopPropagation();
      clearImages();
    });

    btnBuild.addEventListener('click', () => window.App.buildTimeline());
  }

  // ── Drag & Drop helper ─────────────────────────────────────
  function setupDrop(el, onDrop) {
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over'); });
    el.addEventListener('drop', e => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length) onDrop(files);
    });
  }

  // ── Handle Audio Files ─────────────────────────────────────
  function handleAudioFiles(files) {
    const f = Array.from(files).find(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(f.name));
    if (!f) return;

    if (audioFile?.url) URL.revokeObjectURL(audioFile.url);
    if (previewAudioEl) { previewAudioEl.pause(); previewAudioEl = null; }

    const url = URL.createObjectURL(f);
    audioFile = { file: f, url, buffer: null };

    // Update UI
    audioFileName.textContent = f.name;
    audioFileSize.textContent = formatBytes(f.size);
    audioDropEmpty.classList.add('hidden');
    audioDropLoaded.classList.remove('hidden');
    zoneAudio.classList.add('loaded');
    audioStatus.textContent = `✓ Track loaded: ${f.name} (${formatBytes(f.size)})`;

    checkReady();
  }

  function toggleAudioPreview() {
    if (!audioFile) return;
    if (!previewAudioEl) {
      previewAudioEl = new Audio(audioFile.url);
      previewAudioEl.onended = () => { btnAudioPreview.textContent = '▶ Play Track'; };
    }

    if (previewAudioEl.paused) {
      previewAudioEl.play();
      btnAudioPreview.textContent = '⏸ Pause';
    } else {
      previewAudioEl.pause();
      btnAudioPreview.textContent = '▶ Play Track';
    }
  }

  function clearAudio() {
    if (previewAudioEl) { previewAudioEl.pause(); previewAudioEl = null; }
    if (audioFile?.url) URL.revokeObjectURL(audioFile.url);
    audioFile = null;
    inputAudio.value = '';
    audioDropLoaded.classList.add('hidden');
    audioDropEmpty.classList.remove('hidden');
    zoneAudio.classList.remove('loaded');
    audioStatus.textContent = 'No audio loaded yet';
    checkReady();
  }

  // ── Handle Image Files ─────────────────────────────────────
  function handleImageFiles(files) {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!arr.length) return;

    imageSlots.forEach(s => URL.revokeObjectURL(s.url));
    imageSlots = [];

    let hasExplicitTimestamps = false;

    arr.forEach(f => {
      const seconds = parseTimestamp(f.name);
      if (seconds !== null) {
        hasExplicitTimestamps = true;
        imageSlots.push({
          file: f,
          url:  URL.createObjectURL(f),
          seconds,
          name: f.name,
        });
      }
    });

    // Fallback: If filenames have no timestamps, auto-space them (3 seconds apart)
    if (!hasExplicitTimestamps || imageSlots.length === 0) {
      imageSlots = arr.map((f, i) => ({
        file: f,
        url: URL.createObjectURL(f),
        seconds: i * 3,
        name: f.name
      }));
    }

    // Sort by timestamp
    imageSlots.sort((a, b) => a.seconds - b.seconds);

    // Update UI
    renderMiniGallery();
    imagesDropEmpty.classList.add('hidden');
    imagesDropLoaded.classList.remove('hidden');
    zoneImages.classList.add('loaded');
    imagesCountLabel.textContent = `${imageSlots.length} images synchronized`;
    imagesStatus.textContent = `✓ ${imageSlots.length} images aligned to timeline`;

    checkReady();
  }

  function renderMiniGallery() {
    miniGalleryStrip.innerHTML = '';
    imageSlots.forEach(slot => {
      const card = document.createElement('div');
      card.className = 'mini-thumb-card';

      const img = document.createElement('img');
      img.src = slot.url;

      const tag = document.createElement('div');
      tag.className = 'mini-thumb-tag';
      tag.textContent = formatTimestamp(slot.seconds);

      card.appendChild(img);
      card.appendChild(tag);
      miniGalleryStrip.appendChild(card);
    });
  }

  function clearImages() {
    imageSlots.forEach(s => URL.revokeObjectURL(s.url));
    imageSlots = [];
    inputImages.value = '';
    miniGalleryStrip.innerHTML = '';
    imagesDropLoaded.classList.add('hidden');
    imagesDropEmpty.classList.remove('hidden');
    zoneImages.classList.remove('loaded');
    imagesStatus.textContent = 'Drop timestamped images (e.g. 0-03.png)';
    checkReady();
  }

  // ── Timestamp Parsing ──────────────────────────────────────
  // Supported: 0-03.png, 00-03.png, 1-30.jpg, 0_05.png, 0.05.png, 12s.png, scene_0-15.jpg
  function parseTimestamp(filename) {
    const base = filename.replace(/\.[^.]+$/, '');

    // Pattern 1: M-SS or MM-SS or M_SS or M.SS
    let m = base.match(/(?:^|[^\d])(\d{1,2})[-_. ](\d{2})(?:[^\d]|$)/);
    if (m) {
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }

    // Pattern 2: H-MM-SS
    m = base.match(/(?:^|[^\d])(\d{1,2})[-_. ](\d{2})[-_. ](\d{2})(?:[^\d]|$)/);
    if (m) {
      return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    }

    // Pattern 3: e.g. 15s or 15sec
    m = base.match(/(?:^|[^\d])(\d+)s(?:ec)?(?:[^\d]|$)/i);
    if (m) {
      return parseInt(m[1], 10);
    }

    // Pattern 4: pure number at start/end
    m = base.match(/^(\d+)$/);
    if (m) {
      return parseInt(m[1], 10);
    }

    return null;
  }

  function checkReady() {
    const hasImages = imageSlots.length > 0;
    const hasAudio  = audioFile !== null;
    btnBuild.disabled = !hasImages;

    if (hasImages && hasAudio) {
      buildHint.textContent = `✨ Ready to generate! ${imageSlots.length} images + voiceover track aligned.`;
      buildHint.style.color = 'var(--accent-cyan)';
    } else if (hasImages) {
      buildHint.textContent = `Ready! ${imageSlots.length} images loaded (will estimate duration from images).`;
      buildHint.style.color = 'var(--text-muted)';
    } else {
      buildHint.textContent = 'Import your storyboard images to begin building.';
      buildHint.style.color = 'var(--text-dim)';
    }
  }

  function formatTimestamp(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
  }

  function handleAudioFile(file) {
    if (file) handleAudioFiles([file]);
  }

  function setAudioObject(audioObj) {
    audioFile = audioObj;
    if (audioFileName && audioObj.name) audioFileName.textContent = audioObj.name;
    if (audioDropEmpty) audioDropEmpty.classList.add('hidden');
    if (audioDropLoaded) audioDropLoaded.classList.remove('hidden');
    if (zoneAudio) zoneAudio.classList.add('loaded');
  }

  function resetAll() {
    clearAudio();
    clearImages();
  }

  function getAudio()  { return audioFile; }
  function getImages() { return imageSlots; }

  return { init, getAudio, getImages, handleAudioFile, setAudioObject, resetAll };
})();
