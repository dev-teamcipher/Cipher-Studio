/* ============================================================
   HISTORY.JS — Complete Undo & Redo History State Manager
   ============================================================ */

window.History = (function () {

  const MAX_HISTORY = 50;
  const undoStack = [];
  const redoStack = [];
  let isPerformingHistoryAction = false;
  let toastTimer = null;

  // ── Capture Complete Project Snapshot ───────────────────────
  function captureSnapshot(actionLabel = 'Change') {
    const rawScenes = window.App?.getScenes?.() || [];
    const clonedScenes = rawScenes.map(s => ({
      img: s.img,
      startSec: s.startSec,
      endSec: s.endSec,
      duration: s.duration,
      name: s.name,
      transition: s.transition,
      scale: s.scale !== undefined ? s.scale : 1.0,
      posX: s.posX !== undefined ? s.posX : 0,
      posY: s.posY !== undefined ? s.posY : 0,
      rotation: s.rotation !== undefined ? s.rotation : 0,
      opacity: s.opacity !== undefined ? s.opacity : 100,
      blur: s.blur !== undefined ? s.blur : 0,
      transform: s.transform ? JSON.parse(JSON.stringify(s.transform)) : null,
      keyframes: s.keyframes ? JSON.parse(JSON.stringify(s.keyframes)) : null,
      index: s.index
    }));

    return {
      label: actionLabel,
      timestamp: Date.now(),
      scenes: clonedScenes,
      captions: JSON.parse(JSON.stringify(window.App?.getCaptions?.() || [])),
      inputs: {
        // Audio Volume
        audioVolume: document.getElementById('sl-audio-volume')?.value || '100',

        // Motion & Fades
        motionPreset: document.getElementById('sel-motion-preset')?.value || 'auto',
        motionIntensity: document.getElementById('sl-motion')?.value || '0.35',
        motionEnabled: document.getElementById('chk-motion')?.checked !== false,
        fadeIn: document.getElementById('sl-fadein')?.value || '0.5',
        fadeOut: document.getElementById('sl-fadeout')?.value || '0.6',

        // Effects & Atmosphere
        fxPreset: document.getElementById('sel-fx-preset')?.value || 'none',
        fxIntensity: document.getElementById('sl-fx-intensity')?.value || '0.75',
        letterbox: document.getElementById('chk-letterbox')?.checked || false,
        particles: document.getElementById('chk-particles')?.checked || false,

        // Transitions
        trDuration: document.getElementById('sl-trdur')?.value || '0.4',
        randomTransitions: document.getElementById('chk-random')?.checked || false,

        // Captions
        captionsEnabled: document.getElementById('chk-captions')?.checked !== false,
        captionPreset: document.getElementById('sel-caption-preset')?.value || 'poppins_yellow',
        captionFont: document.getElementById('sel-caption-font')?.value || 'Poppins',
        captionSize: document.getElementById('sl-caption-size')?.value || '1.0',
        captionY: document.getElementById('sl-caption-y')?.value || '83',
        captionLineAnim: document.getElementById('sel-caption-line-anim')?.value || 'fade_in',
        captionAnim: document.getElementById('sel-caption-anim')?.value || 'karaoke_pop',
        captionTextCol: document.getElementById('col-caption-text')?.value || '#FFFFFF',
        captionHlCol: document.getElementById('col-caption-highlight')?.value || '#FFDE00',
        captionStrokeCol: document.getElementById('col-caption-stroke')?.value || '#000000',
        captionStrokeWidth: document.getElementById('sl-caption-stroke')?.value || '4',
        captionGlowCol: document.getElementById('col-caption-glow')?.value || '#FFDE00',
        captionGlowBlur: document.getElementById('sl-caption-glow')?.value || '8',
        captionCase: document.getElementById('sel-caption-case')?.value || 'uppercase',
        captionAlign: document.getElementById('sel-caption-align')?.value || 'center',
        captionLines: document.getElementById('sel-caption-lines')?.value || 'auto',
        captionWordsLine: document.getElementById('sl-caption-words-line')?.value || '0',
        captionWordSpace: document.getElementById('sl-caption-word-space')?.value || '0',
        captionLineSpace: document.getElementById('sl-caption-line-space')?.value || '1.30',

        // Export
        aspect: document.getElementById('sel-aspect')?.value || '16:9',
        fps: document.getElementById('sel-fps')?.value || '30',
        quality: document.getElementById('sel-quality')?.value || 'balanced'
      }
    };
  }

  // ── Push State to Undo Stack ────────────────────────────────
  function push(actionLabel = 'Edit') {
    if (isPerformingHistoryAction) return;

    const snapshot = captureSnapshot(actionLabel);
    undoStack.push(snapshot);

    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift();
    }

    // New user action invalidates redo history
    redoStack.length = 0;

    updateButtons();
    window.Projects?.scheduleAutoSave();
  }

  // ── Apply Snapshot to DOM, State & Canvas ───────────────────
  function applySnapshot(snapshot) {
    if (!snapshot) return;
    isPerformingHistoryAction = true;

    try {
      // 1. Restore Scenes & Timeline with preserved Image references & transforms
      if (snapshot.scenes && window.App?.setScenes) {
        const restoredScenes = snapshot.scenes.map(s => ({
          img: s.img,
          startSec: s.startSec,
          endSec: s.endSec,
          duration: s.duration,
          name: s.name,
          transition: s.transition,
          scale: s.scale !== undefined ? s.scale : 1.0,
          posX: s.posX !== undefined ? s.posX : 0,
          posY: s.posY !== undefined ? s.posY : 0,
          rotation: s.rotation !== undefined ? s.rotation : 0,
          opacity: s.opacity !== undefined ? s.opacity : 100,
          blur: s.blur !== undefined ? s.blur : 0,
          transform: s.transform ? JSON.parse(JSON.stringify(s.transform)) : null,
          keyframes: s.keyframes ? JSON.parse(JSON.stringify(s.keyframes)) : null,
          index: s.index
        }));
        window.App.setScenes(restoredScenes);
      }

      // 2. Restore Captions
      if (snapshot.captions && window.App?.setCaptions) {
        window.App.setCaptions(snapshot.captions);
      }

      // 3. Restore Input Controls
      const inp = snapshot.inputs;
      if (inp) {
        const setVal = (id, val) => {
          const el = document.getElementById(id);
          if (el && val !== undefined) {
            el.value = val;
            el.dispatchEvent(new Event('input'));
            el.dispatchEvent(new Event('change'));
          }
        };

        const setChk = (id, val) => {
          const el = document.getElementById(id);
          if (el && val !== undefined) {
            el.checked = !!val;
            el.dispatchEvent(new Event('change'));
          }
        };

        // Audio Volume
        setVal('sl-audio-volume', inp.audioVolume || '100');

        // Motion & Fades
        setVal('sel-motion-preset', inp.motionPreset);
        setVal('sl-motion', inp.motionIntensity);
        setChk('chk-motion', inp.motionEnabled);
        setVal('sl-fadein', inp.fadeIn);
        setVal('sl-fadeout', inp.fadeOut);

        // Effects
        setVal('sel-fx-preset', inp.fxPreset);
        setVal('sl-fx-intensity', inp.fxIntensity);
        setChk('chk-letterbox', inp.letterbox);
        setChk('chk-particles', inp.particles);

        // Transitions
        setVal('sl-trdur', inp.trDuration);
        setChk('chk-random', inp.randomTransitions);

        // Captions
        setChk('chk-captions', inp.captionsEnabled);
        setVal('sel-caption-preset', inp.captionPreset);
        setVal('sel-caption-font', inp.captionFont);
        setVal('sl-caption-size', inp.captionSize);
        setVal('sl-caption-y', inp.captionY);
        setVal('sel-caption-line-anim', inp.captionLineAnim);
        setVal('sel-caption-anim', inp.captionAnim);
        setVal('col-caption-text', inp.captionTextCol);
        setVal('col-caption-highlight', inp.captionHlCol);
        setVal('col-caption-stroke', inp.captionStrokeCol);
        setVal('sl-caption-stroke', inp.captionStrokeWidth);
        setVal('col-caption-glow', inp.captionGlowCol);
        setVal('sl-caption-glow', inp.captionGlowBlur);
        setVal('sl-caption-shadow', inp.captionShadowBlur);
        setVal('sel-caption-case', inp.captionCase);
        setVal('sel-caption-align', inp.captionAlign);
        setVal('sel-caption-lines', inp.captionLines || 'auto');
        setVal('sl-caption-words-line', inp.captionWordsLine || '0');
        setVal('sl-caption-word-space', inp.captionWordSpace || '0');
        setVal('sl-caption-line-space', inp.captionLineSpace || '1.30');

        // Sync card highlights
        document.querySelectorAll('.fx-card').forEach(c => {
          c.classList.toggle('active', c.dataset.fx === inp.fxPreset);
        });
        document.querySelectorAll('.cap-preset-card').forEach(c => {
          c.classList.toggle('active', c.dataset.cap === inp.captionPreset);
        });

        // Export
        setVal('sel-aspect', inp.aspect);
        setVal('sel-fps', inp.fps);
        setVal('sel-quality', inp.quality);
      }

      // 4. Trigger Frame Re-render
      if (window.Preview) {
        window.Preview.resize();
        window.Preview.renderFrame();
      }
    } finally {
      isPerformingHistoryAction = false;
    }
  }

  // ── Perform Undo ────────────────────────────────────────────
  function undo() {
    if (undoStack.length === 0) return;

    // Current state becomes top of redo stack
    const current = captureSnapshot('Current');
    redoStack.push(current);

    const prev = undoStack.pop();
    applySnapshot(prev);
    updateButtons();
    showToast(`↶ Undone: ${prev.label || 'Action'}`);
  }

  // ── Perform Redo ────────────────────────────────────────────
  function redo() {
    if (redoStack.length === 0) return;

    const current = captureSnapshot('Current');
    undoStack.push(current);

    const next = redoStack.pop();
    applySnapshot(next);
    updateButtons();
    showToast(`↷ Redone: ${next.label || 'Action'}`);
  }

  // ── Update Button States ────────────────────────────────────
  function updateButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');

    if (btnUndo) {
      btnUndo.disabled = (undoStack.length === 0);
      btnUndo.title = undoStack.length > 0
        ? `Undo ${undoStack[undoStack.length - 1].label} (Ctrl+Z)`
        : 'Undo (Ctrl+Z)';
    }

    if (btnRedo) {
      btnRedo.disabled = (redoStack.length === 0);
      btnRedo.title = redoStack.length > 0
        ? `Redo ${redoStack[redoStack.length - 1].label} (Ctrl+Y)`
        : 'Redo (Ctrl+Y)';
    }
  }

  // ── Toast Notification ──────────────────────────────────────
  function showToast(msg) {
    const toast = document.getElementById('history-toast');
    if (!toast) return;

    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.classList.add('visible');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.classList.add('hidden'), 200);
    }, 1800);
  }

  // ── Initialize Keyboard Shortcuts & Event Listeners ─────────
  function init() {
    document.getElementById('btn-undo')?.addEventListener('click', () => undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => redo());

    // Global Keybindings: Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Y, Ctrl+Shift+Z / Cmd+Shift+Z
    window.addEventListener('keydown', (e) => {
      // Ignore if typing inside text inputs or textareas
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' && document.activeElement.type === 'text') return;
      if (activeTag === 'textarea') return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? e.metaKey : e.ctrlKey;

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (mod && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        redo();
      }
    });

    updateButtons();
  }

  return {
    init,
    push,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0
  };
})();
