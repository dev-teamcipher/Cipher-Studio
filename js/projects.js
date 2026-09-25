/* ============================================================
   PROJECTS.JS — Persistent IndexedDB Storage & Recent Projects System
   ============================================================ */

window.Projects = (function () {

  const DB_NAME    = 'CipherProjectsDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'projects';
  const MAX_RECENT = 3;

  let db = null;
  let activeProjectId = null;
  let autoSaveTimer   = null;
  let loadingProjectId = null;

  // ── 1. Initialize IndexedDB ─────────────────────────────────
  function init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        db = e.target.result;
        activeProjectId = localStorage.getItem('cipher_active_project_id') || null;
        // A refresh can happen before the normal debounce expires. Trigger a
        // best-effort IndexedDB save whenever the document is being hidden.
        window.addEventListener('pagehide', () => { saveCurrentProject().catch(() => {}); });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') saveCurrentProject().catch(() => {});
        });
        renderRecentProjectsGrid();
        resolve(db);
      };

      request.onerror = (e) => {
        console.error('[ProjectsDB Error]', e);
        reject(e);
      };
    });
  }

  // ── 2. Helper: Convert Image to Blob or DataURL ────────────
  async function imgToBlobOrDataUrl(s) {
    if (s.blob instanceof Blob) return { blob: s.blob, dataUrl: '' };
    if (s.file instanceof Blob) return { blob: s.file, dataUrl: '' };

    const img = s.img;
    if (!img) return { blob: null, dataUrl: s.url || '' };

    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        const w = img.naturalWidth || img.width || 800;
        const h = img.naturalHeight || img.height || 450;
        if (!w || !h) {
          return resolve({ blob: null, dataUrl: (img.src && img.src.startsWith('data:')) ? img.src : '' });
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve({ blob: blob, dataUrl: '' });
          } else {
            resolve({ blob: null, dataUrl: canvas.toDataURL('image/jpeg', 0.90) });
          }
        }, 'image/jpeg', 0.90);
      } catch (e) {
        resolve({ blob: null, dataUrl: (img.src && img.src.startsWith('data:')) ? img.src : '' });
      }
    });
  }

  // ── 3. Helper: Generate Cover Thumbnail ─────────────────────
  function generateCoverThumbnail(scenes) {
    if (!scenes || !scenes.length) return '';
    const firstImg = scenes[0].img;
    if (!firstImg) return '';

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 135;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(firstImg, 0, 0, 240, 135);
      return canvas.toDataURL('image/jpeg', 0.80);
    } catch (e) {
      return '';
    }
  }

  // ── 4. Save Current Project to IndexedDB ────────────────────
  async function saveCurrentProject() {
    if (!db || loadingProjectId) return;

    const scenes = window.App?.getScenes ? window.App.getScenes() : [];
    if (!scenes || !scenes.length) return;

    const duration = window.App?.getDuration ? window.App.getDuration() : 0;
    const uploaderAudio = window.Uploader?.getAudio ? window.Uploader.getAudio() : null;

    if (!activeProjectId) {
      activeProjectId = 'proj_' + Date.now();
      localStorage.setItem('cipher_active_project_id', activeProjectId);
    }

    const title = uploaderAudio?.file?.name
      || (scenes[0]?.name)
      || `Video Project (${scenes.length} Clips)`;

    // Convert scenes to serializable format with Blobs / DataURLs
    const serializedScenes = await Promise.all(
      scenes.map(async (s, idx) => {
        const { blob, dataUrl } = await imgToBlobOrDataUrl(s);
        return {
          name:       s.name || `Clip #${idx + 1}`,
          startSec:   s.startSec,
          endSec:     s.endSec,
          duration:   s.duration,
          scale:      s.scale !== undefined ? s.scale : 1.0,
          posX:       s.posX !== undefined ? s.posX : 0,
          posY:       s.posY !== undefined ? s.posY : 0,
          rotation:   s.rotation !== undefined ? s.rotation : 0,
          opacity:    s.opacity !== undefined ? s.opacity : 100,
          blur:       s.blur !== undefined ? s.blur : 0,
          transform:  s.transform ? JSON.parse(JSON.stringify(s.transform)) : null,
          keyframes:  s.keyframes ? JSON.parse(JSON.stringify(s.keyframes)) : null,
          transition: s.transition || 'crossfade',
          deleted:    s.deleted === true,
          stockId:    s.stockId || '',
          provider:   s.provider || '',
          creator:    s.creator || '',
          creatorUrl: s.creatorUrl || '',
          pageUrl:    s.pageUrl || '',
          attribution:s.attribution || '',
          blob:       blob,
          dataUrl:    dataUrl
        };
      })
    );

    // Audio Data
    let audioPayload = null;
    if (uploaderAudio) {
      let audioBlob = (uploaderAudio.file instanceof Blob) ? uploaderAudio.file : (uploaderAudio.blob instanceof Blob ? uploaderAudio.blob : null);
      // Recovered/older project states can have a valid object/data URL but no
      // File reference. Persist the actual bytes instead of silently saving a
      // project whose voiceover disappears the next time it is opened.
      if (!audioBlob && uploaderAudio.url) {
        try {
          const response = await fetch(uploaderAudio.url);
          if (response.ok) audioBlob = await response.blob();
        } catch (error) {
          console.warn('[Project Audio Persistence]', error);
        }
      }
      audioPayload = {
        name:     uploaderAudio.file?.name || uploaderAudio.name || 'voiceover.mp3',
        size:     audioBlob?.size || uploaderAudio.file?.size || 0,
        type:     audioBlob?.type || uploaderAudio.file?.type || 'audio/mpeg',
        duration: uploaderAudio.duration || duration,
        blob:     audioBlob,
        dataUrl:  !audioBlob && typeof uploaderAudio.url === 'string' && uploaderAudio.url.startsWith('data:') ? uploaderAudio.url : '',
        waveform: window.WaveformDrawer?.getEnvelope?.() || null
      };
    }

    // Editor Settings
    const settings = {
      aspectRatio:        document.getElementById('sel-aspect')?.value || '16:9',
      motionPreset:       document.getElementById('sel-motion-preset')?.value || 'auto',
      motionIntensity:    parseFloat(document.getElementById('sl-motion')?.value || '0.35'),
      motionEnabled:      document.getElementById('chk-motion')?.checked !== false,
      fxPreset:           document.getElementById('sel-fx-preset')?.value || 'none',
      fxIntensity:        parseFloat(document.getElementById('sl-fx-intensity')?.value || '0.75'),
      letterbox:          document.getElementById('chk-letterbox')?.checked || false,
      particles:          document.getElementById('chk-particles')?.checked || false,
      fadeIn:             parseFloat(document.getElementById('sl-fadein')?.value || '0.5'),
      fadeOut:            parseFloat(document.getElementById('sl-fadeout')?.value || '0.6'),
      transitionDuration: parseFloat(document.getElementById('sl-trdur')?.value || '0.4'),
      transitionRandom:   document.getElementById('chk-random')?.checked || false,
      audioVolume:        parseFloat(document.getElementById('sl-audio-volume')?.value || '100')
    };

    // Captions Data
    const captionsData = {
      enabled:     document.getElementById('chk-captions')?.checked !== false,
      rawText:     document.getElementById('txt-captions')?.value || '',
      preset:      document.getElementById('sel-caption-preset')?.value || 'poppins_yellow',
      font:        document.getElementById('sel-caption-font')?.value || 'Poppins',
      textColor:   document.getElementById('col-caption-text')?.value || '#FFFFFF',
      hlColor:     document.getElementById('col-caption-highlight')?.value || '#FFD700',
      strokeColor: document.getElementById('col-caption-stroke')?.value || '#000000',
      glowColor:   document.getElementById('col-caption-glow')?.value || '#EAB308',
      strokeWidth: parseFloat(document.getElementById('sl-caption-stroke')?.value || '4'),
      glowBlur:    parseFloat(document.getElementById('sl-caption-glow')?.value || '8'),
      lineAnim:    document.getElementById('sel-caption-line-anim')?.value || 'none',
      wordAnim:    document.getElementById('sel-caption-anim')?.value || 'highlight',
      textCase:    document.getElementById('sel-caption-case')?.value || 'none',
      posY:        parseInt(document.getElementById('sl-caption-y')?.value || '82', 10),
      align:       document.getElementById('sel-caption-align')?.value || 'center',
      linesCount:  document.getElementById('sel-caption-lines')?.value || 'auto',
      wordsPerLine:parseInt(document.getElementById('sl-caption-words-line')?.value || '0', 10) || 0,
      wordSpacing: parseFloat(document.getElementById('sl-caption-word-space')?.value || '0') || 0,
      lineSpacing: parseFloat(document.getElementById('sl-caption-line-space')?.value || '1.30') || 1.30
    };

    const proTimelineData = window.ProTimeline?.serialize ? await window.ProTimeline.serialize() : null;

    const projectRecord = {
      id:          activeProjectId,
      title:       title,
      updatedAt:   Date.now(),
      clipCount:   scenes.length,
      durationSec: duration,
      durationFmt: formatDuration(duration),
      coverThumb:  generateCoverThumbnail(scenes),
      scenes:      serializedScenes,
      audio:       audioPayload,
      settings:    settings,
      captions:    captionsData,
      proTimeline: proTimelineData
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const putReq = store.put(projectRecord);

      putReq.onsuccess = async () => {
        await pruneExcessProjects();
        renderRecentProjectsGrid();
        resolve(projectRecord);
      };

      putReq.onerror = (e) => {
        console.error('[Save Project Error]', e);
        reject(e);
      };
    });
  }

  // ── 5. Prune Projects to Latest 3 ───────────────────────────
  function pruneExcessProjects() {
    return new Promise((resolve) => {
      if (!db) return resolve();
      const tx = db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getAllReq = store.getAll();

      getAllReq.onsuccess = () => {
        const all = getAllReq.result || [];
        if (all.length > MAX_RECENT) {
          all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          const toDelete = all.slice(MAX_RECENT);
          toDelete.forEach(p => {
            store.delete(p.id);
          });
        }
        resolve();
      };

      getAllReq.onerror = () => resolve();
    });
  }

  // ── 6. Get Top 3 Recent Projects ────────────────────────────
  function getRecentProjects() {
    return new Promise((resolve) => {
      if (!db) return resolve([]);
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getAllReq = store.getAll();

      getAllReq.onsuccess = () => {
        const all = getAllReq.result || [];
        all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(all.slice(0, MAX_RECENT));
      };

      getAllReq.onerror = () => resolve([]);
    });
  }

  // ── 7. Load Project by ID into Studio Editor ────────────────
  async function loadProject(projectId) {
    if (!db || !projectId) return;
    if (loadingProjectId) return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    loadingProjectId = projectId;

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(projectId);

      getReq.onsuccess = async () => {
        const project = getReq.result;
        if (!project) {
          console.warn('Project not found:', projectId);
          loadingProjectId = null;
          return reject(new Error('Project not found'));
        }

        try {
          activeProjectId = project.id;
          localStorage.setItem('cipher_active_project_id', activeProjectId);
          localStorage.setItem('cipher_active_screen', 'screen-editor');

          // Switch screen
          window.App?.showScreen('screen-editor');
          window.Preview?.pause?.();
          const playButton=document.getElementById('btn-play');
          if(playButton){playButton.textContent='▶';playButton.classList.remove('playing');}

          // 1. Reconstruct Image Elements
          const loadedScenes = await Promise.all(
            project.scenes.map(s => {
              return new Promise(res => {
                if (s.deleted === true) {
                  res({
                    name: s.name || 'Empty Slot', startSec:s.startSec, endSec:s.endSec,
                    duration:s.duration, scale:s.scale ?? 1, posX:s.posX ?? 0, posY:s.posY ?? 0,
                    rotation:s.rotation ?? 0, opacity:s.opacity ?? 100, blur:s.blur ?? 0,
                    transform:s.transform ? JSON.parse(JSON.stringify(s.transform)) : null,
                    keyframes:s.keyframes ? JSON.parse(JSON.stringify(s.keyframes)) : null,
                    transition:s.transition || 'crossfade', deleted:true,
                    stockId:s.stockId||'',provider:s.provider||'',creator:s.creator||'',creatorUrl:s.creatorUrl||'',pageUrl:s.pageUrl||'',attribution:s.attribution||'',
                    img:null, file:null, blob:null, url:''
                  });
                  return;
                }
                const img = new Image();
                img.crossOrigin = 'anonymous';

                let srcUrl = '';
                if (s.blob instanceof Blob) {
                  srcUrl = URL.createObjectURL(s.blob);
                } else if (s.dataUrl && (s.dataUrl.startsWith('data:') || s.dataUrl.startsWith('http') || s.dataUrl.startsWith('/'))) {
                  srcUrl = s.dataUrl;
                }

                img.onload = () => {
                  res({
                    name:       s.name,
                    startSec:   s.startSec,
                    endSec:     s.endSec,
                    duration:   s.duration,
                    scale:      s.scale !== undefined ? s.scale : 1.0,
                    posX:       s.posX !== undefined ? s.posX : 0,
                    posY:       s.posY !== undefined ? s.posY : 0,
                    rotation:   s.rotation !== undefined ? s.rotation : 0,
                    opacity:    s.opacity !== undefined ? s.opacity : 100,
                    blur:       s.blur !== undefined ? s.blur : 0,
                    transform:  s.transform ? JSON.parse(JSON.stringify(s.transform)) : null,
                    keyframes:  s.keyframes ? JSON.parse(JSON.stringify(s.keyframes)) : null,
                    transition: s.transition || 'crossfade',
                    stockId:s.stockId||'',provider:s.provider||'',creator:s.creator||'',creatorUrl:s.creatorUrl||'',pageUrl:s.pageUrl||'',attribution:s.attribution||'',
                    img:        img,
                    file:       s.blob,
                    blob:       s.blob,
                    url:        srcUrl
                  });
                };

                img.onerror = () => {
                  console.warn('Failed to load image for scene:', s.name);
                  res({
                    name:       s.name,
                    startSec:   s.startSec,
                    endSec:     s.endSec,
                    duration:   s.duration,
                    scale:      s.scale !== undefined ? s.scale : 1.0,
                    posX:       s.posX !== undefined ? s.posX : 0,
                    posY:       s.posY !== undefined ? s.posY : 0,
                    rotation:   s.rotation !== undefined ? s.rotation : 0,
                    opacity:    s.opacity !== undefined ? s.opacity : 100,
                    blur:       s.blur !== undefined ? s.blur : 0,
                    transform:  s.transform ? JSON.parse(JSON.stringify(s.transform)) : null,
                    keyframes:  s.keyframes ? JSON.parse(JSON.stringify(s.keyframes)) : null,
                    transition: s.transition || 'crossfade',
                    stockId:s.stockId||'',provider:s.provider||'',creator:s.creator||'',creatorUrl:s.creatorUrl||'',pageUrl:s.pageUrl||'',attribution:s.attribution||'',
                    img:        null,
                    file:       s.blob,
                    blob:       s.blob,
                    url:        srcUrl
                  });
                };

                if (srcUrl) {
                  img.src = srcUrl;
                } else {
                  res(null);
                }
              });
            })
          );

          const validScenes = loadedScenes.filter(Boolean);

          // 2. Restore Audio
          let deferredWaveform = null;
          window.WaveformDrawer?.clear?.();
          if (project.audio) {
            let audioUrl = '';
            if (project.audio.blob instanceof Blob) {
              audioUrl = URL.createObjectURL(project.audio.blob);
            } else if (project.audio.dataUrl) {
              audioUrl = project.audio.dataUrl;
            }

            if (audioUrl) {
              const restoredBlob = project.audio.blob instanceof Blob ? project.audio.blob : null;
              const restoredFile = restoredBlob
                ? new File([restoredBlob], project.audio.name || 'voiceover.mp3', { type: project.audio.type || restoredBlob.type || 'audio/mpeg' })
                : new File([""], project.audio.name || 'voiceover.mp3', { type: project.audio.type || 'audio/mpeg' });
              const audioObj = {
                file:     restoredFile,
                blob:     restoredBlob,
                url:      audioUrl,
                duration: project.audio.duration || project.durationSec,
                name:     project.audio.name
              };
              if (window.Uploader) window.Uploader.setAudioObject(audioObj);
              if (window.Preview) await window.Preview.setAudio(audioUrl);
              const restoredPeaks=window.WaveformDrawer?.restoreEnvelope?.(project.audio.waveform);
              if(!restoredPeaks)deferredWaveform = async () => {
                  if (!window.WaveformDrawer || activeProjectId !== project.id) return;
                  await window.WaveformDrawer.decode(audioObj);
                  if (activeProjectId === project.id) {
                    window.Timeline?.build?.(window.App?.getScenes?.() || validScenes, project.durationSec, {preserveView:true});
                    window.Projects?.scheduleAutoSave?.();
                  }
                };
            }
          }

          // 3. Restore Editor Settings
          const set = project.settings || {};
          if (set.aspectRatio) document.getElementById('sel-aspect').value = set.aspectRatio;
          if (set.motionPreset) document.getElementById('sel-motion-preset').value = set.motionPreset;
          if (set.motionIntensity !== undefined) {
            const sl = document.getElementById('sl-motion');
            if (sl) sl.value = set.motionIntensity;
            const lbl = document.getElementById('lbl-motion');
            if (lbl) lbl.textContent = set.motionIntensity.toFixed(2);
          }
          if (set.motionEnabled !== undefined) {
            const chk = document.getElementById('chk-motion');
            if (chk) chk.checked = set.motionEnabled;
          }
          if (set.fxPreset) {
            const selFx = document.getElementById('sel-fx-preset');
            if (selFx) selFx.value = set.fxPreset;
            document.querySelectorAll('.fx-btn').forEach(b => {
              b.classList.toggle('active', b.dataset.fx === set.fxPreset);
            });
          }
          if (set.fxIntensity !== undefined) {
            const sl = document.getElementById('sl-fx-intensity');
            if (sl) sl.value = set.fxIntensity;
            const lbl = document.getElementById('lbl-fx-intensity');
            if (lbl) lbl.textContent = Math.round(set.fxIntensity * 100) + '%';
          }
          if (set.letterbox !== undefined) document.getElementById('chk-letterbox').checked = set.letterbox;
          if (set.particles !== undefined) document.getElementById('chk-particles').checked = set.particles;
          if (set.fadeIn !== undefined) {
            const sl = document.getElementById('sl-fadein');
            if (sl) sl.value = set.fadeIn;
            const lbl = document.getElementById('lbl-fadein');
            if (lbl) lbl.textContent = set.fadeIn.toFixed(1) + 's';
          }
          if (set.fadeOut !== undefined) {
            const sl = document.getElementById('sl-fadeout');
            if (sl) sl.value = set.fadeOut;
            const lbl = document.getElementById('lbl-fadeout');
            if (lbl) lbl.textContent = set.fadeOut.toFixed(1) + 's';
          }
          if (set.transitionDuration !== undefined) {
            const sl = document.getElementById('sl-trdur');
            if (sl) sl.value = set.transitionDuration;
            const lbl = document.getElementById('lbl-trdur');
            if (lbl) lbl.textContent = set.transitionDuration.toFixed(2) + 's';
          }
          if (set.transitionRandom !== undefined) document.getElementById('chk-random').checked = set.transitionRandom;
          if (set.audioVolume !== undefined) {
            const sl = document.getElementById('sl-audio-volume');
            if (sl) sl.value = set.audioVolume;
            const lbl = document.getElementById('lbl-audio-volume');
            if (lbl) lbl.textContent = set.audioVolume + '%';
            if (window.Preview) window.Preview.setVolume(set.audioVolume / 100);
          }

          // 4. Restore Captions
          const cap = project.captions || {};
          if (cap.rawText !== undefined) {
            const txt = document.getElementById('txt-captions');
            if (txt) {
              txt.value = cap.rawText;
              if (window.Captions) window.Captions.loadSRT(cap.rawText);
            }
          }
          if (cap.preset) {
            const selCap = document.getElementById('sel-caption-preset');
            if (selCap) selCap.value = cap.preset;
          }
          if (cap.font) document.getElementById('sel-caption-font').value = cap.font;
          if (cap.textColor) {
            document.getElementById('col-caption-text').value = cap.textColor;
            const lbl = document.getElementById('lbl-caption-color');
            if (lbl) lbl.textContent = cap.textColor;
          }
          if (cap.hlColor) {
            document.getElementById('col-caption-highlight').value = cap.hlColor;
            const lbl = document.getElementById('lbl-caption-hlcolor');
            if (lbl) lbl.textContent = cap.hlColor;
          }
          if (cap.strokeColor) {
            document.getElementById('col-caption-stroke').value = cap.strokeColor;
            const lbl = document.getElementById('lbl-caption-stcolor');
            if (lbl) lbl.textContent = cap.strokeColor;
          }
          if (cap.glowColor) {
            document.getElementById('col-caption-glow').value = cap.glowColor;
            const lbl = document.getElementById('lbl-caption-glcolor');
            if (lbl) lbl.textContent = cap.glowColor;
          }
          if (cap.strokeWidth !== undefined) {
            const sl = document.getElementById('sl-caption-stroke');
            if (sl) sl.value = cap.strokeWidth;
            const lbl = document.getElementById('lbl-caption-stroke');
            if (lbl) lbl.textContent = cap.strokeWidth + 'px';
          }
          if (cap.glowBlur !== undefined) {
            const sl = document.getElementById('sl-caption-glow');
            if (sl) sl.value = cap.glowBlur;
            const lbl = document.getElementById('lbl-caption-glow');
            if (lbl) lbl.textContent = cap.glowBlur + 'px';
          }
          if (cap.lineAnim) document.getElementById('sel-caption-line-anim').value = cap.lineAnim;
          if (cap.wordAnim) document.getElementById('sel-caption-anim').value = cap.wordAnim;
          if (cap.textCase) document.getElementById('sel-caption-case').value = cap.textCase;
          if (cap.posY !== undefined) {
            const sl = document.getElementById('sl-caption-y');
            if (sl) sl.value = cap.posY;
            const lbl = document.getElementById('lbl-caption-y');
            if (lbl) lbl.textContent = cap.posY + '%';
          }
          if (cap.align) document.getElementById('sel-caption-align').value = cap.align;
          if (cap.linesCount) document.getElementById('sel-caption-lines').value = cap.linesCount;
          if (cap.wordsPerLine !== undefined) {
            const sl = document.getElementById('sl-caption-words-line');
            if (sl) sl.value = cap.wordsPerLine;
            const lbl = document.getElementById('lbl-caption-words-line');
            if (lbl) lbl.textContent = cap.wordsPerLine === 0 ? 'Auto' : (cap.wordsPerLine === 1 ? '1 Word' : cap.wordsPerLine + ' Words');
          }
          if (cap.wordSpacing !== undefined) {
            const sl = document.getElementById('sl-caption-word-space');
            if (sl) sl.value = cap.wordSpacing;
            const lbl = document.getElementById('lbl-caption-word-space');
            if (lbl) lbl.textContent = (cap.wordSpacing > 0 ? '+' : '') + cap.wordSpacing + 'px';
          }
          if (cap.lineSpacing !== undefined) {
            const sl = document.getElementById('sl-caption-line-space');
            if (sl) sl.value = cap.lineSpacing;
            const lbl = document.getElementById('lbl-caption-line-space');
            if (lbl) lbl.textContent = parseFloat(cap.lineSpacing).toFixed(2) + 'x';
          }
          if (cap.enabled !== undefined) document.getElementById('chk-captions').checked = cap.enabled;

          // 5. Restore State into App, Preview & Timeline
          const previousScenes = window.App?.getScenes?.() || [];
          window.Preview.setScenes(validScenes, project.durationSec);
          window.Timeline.build(validScenes, project.durationSec);
          window.App.restoreState(validScenes, project.durationSec);
          if (window.ProTimeline) await window.ProTimeline.restore(project.proTimeline || null);
          window.Preview.resize();
          window.Preview.seek(0);
          window.Preview.renderFrame();

          previousScenes.forEach(scene => {
            if (typeof scene?.url === 'string' && scene.url.startsWith('blob:') && !validScenes.some(item => item.url === scene.url)) URL.revokeObjectURL(scene.url);
          });
          loadingProjectId = null;
          resolve(project);
          if (deferredWaveform) setTimeout(() => deferredWaveform().catch(error => console.warn('[Deferred Waveform]', error)), 0);
        } catch (err) {
          console.error('[Load Project Exception]', err);
          loadingProjectId = null;
          reject(err);
        }
      };

      getReq.onerror = (e) => { loadingProjectId = null; reject(e); };
    });
  }

  // ── 8. Delete Project by ID ─────────────────────────────────
  function deleteProject(projectId, e) {
    if (e) e.stopPropagation();
    if (!db || !projectId) return;

    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(projectId);

    tx.oncomplete = () => {
      if (activeProjectId === projectId) {
        activeProjectId = null;
        localStorage.removeItem('cipher_active_project_id');
      }
      renderRecentProjectsGrid();
    };
  }

  // ── 9. Render Recent Projects Grid on Home Screen ───────────
  async function renderRecentProjectsGrid() {
    const grid = document.getElementById('recent-projects-grid');
    const section = document.getElementById('recent-projects-section');
    if (!grid || !section) return;

    const recents = await getRecentProjects();

    if (!recents.length) {
      grid.innerHTML = `
        <div class="recent-empty-state">
          <span class="empty-icon">📂</span>
          <p>No recent projects yet. Import your storyboard assets above to start!</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = '';

    recents.forEach(project => {
      const card = document.createElement('div');
      card.className = 'recent-project-card';
      card.dataset.id = project.id;

      const timeAgo = formatTimeAgo(project.updatedAt);
      const coverSrc = project.coverThumb || 'assets/cipher-studio-icon.png';

      card.innerHTML = `
        <div class="recent-card-thumb-wrap">
          <img src="${coverSrc}" class="recent-card-thumb" alt="${escapeHtml(project.title)}" />
          <div class="recent-card-badges">
            <span class="recent-badge-duration">${project.durationFmt || '00:00'}</span>
            <span class="recent-badge-clips">${project.clipCount || 0} Clips</span>
          </div>
          <button class="recent-btn-delete" title="Delete Project" type="button">✕</button>
        </div>
        <div class="recent-card-body">
          <h4 class="recent-card-title" title="${escapeHtml(project.title)}">${escapeHtml(project.title)}</h4>
          <div class="recent-card-meta">
            <span class="recent-card-time">🕒 ${timeAgo}</span>
          </div>
          <button class="recent-btn-open" type="button">
            <span>⚡ Open Project</span>
            <span class="btn-arrow">→</span>
          </button>
        </div>
      `;

      // Click to open project
      card.addEventListener('click', (e) => {
        if (e.target.closest('.recent-btn-delete')) return;
        loadProject(project.id);
      });

      // Delete button
      card.querySelector('.recent-btn-delete').addEventListener('click', (e) => {
        deleteProject(project.id, e);
      });

      grid.appendChild(card);
    });
  }

  // ── 10. Auto-Save with Debounce ─────────────────────────────
  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      saveCurrentProject();
    }, 600);
  }

  // ── 11. Auto-Restore on Page Refresh ────────────────────────
  async function autoRestoreActive() {
    const activeScreen = localStorage.getItem('cipher_active_screen');
    const savedId = localStorage.getItem('cipher_active_project_id');

    if (activeScreen === 'screen-editor' && savedId) {
      try {
        await loadProject(savedId);
        return true;
      } catch (e) {
        console.warn('[AutoRestore Failed, opening Studio recovery screen]', e);
        activeProjectId = null;
        localStorage.removeItem('cipher_active_project_id');
        localStorage.setItem('cipher_active_screen', 'screen-upload');
        window.ToolsHub?.switchTool('cipher-studio');
      }
    } else if (activeScreen && document.getElementById(activeScreen)) {
      // Tools Hub already records the last screen. Do not overwrite it just
      // because it is not an IndexedDB Studio project.
      window.ToolsHub?.switchTool(activeScreen);
      return true;
    } else {
      // Dashboard is only the first-visit / invalid-session fallback.
      localStorage.setItem('cipher_active_screen', 'screen-hub');
      window.ToolsHub?.switchTool('hub');
    }
    return false;
  }

  // ── Helper: Start New Fresh Project ─────────────────────────
  function startNewProject() {
    activeProjectId = null;
    localStorage.removeItem('cipher_active_project_id');
    localStorage.setItem('cipher_active_screen', 'screen-upload');
    window.Uploader?.resetAll();
    window.ToolsHub?.switchTool('cipher-studio');
    renderRecentProjectsGrid();
  }

  // ── Format Helpers ──────────────────────────────────────────
  function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Recently';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    init,
    saveCurrentProject,
    scheduleAutoSave,
    loadProject,
    deleteProject,
    getRecentProjects,
    renderRecentProjectsGrid,
    autoRestoreActive,
    startNewProject,
    getActiveProjectId: () => activeProjectId,
    setActiveProjectId: (id) => { activeProjectId = id; }
  };
})();
