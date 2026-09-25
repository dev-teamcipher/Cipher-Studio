/* ============================================================
   PREVIEW.JS — Canvas preview player with Rich Motion & Camera Presets
   ============================================================ */

window.Preview = (function () {

  // ── State ──────────────────────────────────────────────────
  let canvas, ctx;
  let scenes      = [];
  let duration    = 0;
  let currentTime = 0;
  let isPlaying   = false;
  let isLooping   = false;
  let rafId       = null;
  let lastTs      = null;
  let audioEl     = null;
  let motionPreset= 'auto';

  // ── Callbacks ──────────────────────────────────────────────
  let onTimeUpdate = null;

  // ── Motion Presets Definition ──────────────────────────────
  const MOTION_PRESETS = {
    auto: {
      name: 'Dynamic Auto Mix',
      calc: (t, index, intensity, w, h) => {
        const seeds = [
          { fromS: 1.0, toS: 1.10, fx: -0.02, fy: -0.02, tx: 0.02, ty: 0.02 },
          { fromS: 1.12, toS: 1.0, fx: 0.03, fy: -0.02, tx: -0.02, ty: 0.01 },
          { fromS: 1.0, toS: 1.08, fx: 0.0, fy: 0.04, tx: 0.0, ty: -0.03 },
          { fromS: 1.08, toS: 1.02, fx: -0.04, fy: 0.0, tx: 0.04, ty: 0.0 },
          { fromS: 1.04, toS: 1.14, fx: 0.02, fy: 0.02, tx: -0.03, ty: -0.02 }
        ];
        const s = seeds[index % seeds.length];
        const ease = smoothEase(t);
        const scale = s.fromS + (s.toS - s.fromS) * ease * (intensity / 0.3);
        const dx = (s.fx + (s.tx - s.fx) * ease) * w * intensity;
        const dy = (s.fy + (s.ty - s.fy) * ease) * h * intensity;
        return { scale, dx, dy, rotate: 0 };
      }
    },
    zoomin: {
      name: 'Dramatic Zoom In',
      calc: (t, index, intensity, w, h) => {
        const ease = smoothEase(t);
        const scale = 1.0 + (0.16 * ease) * (intensity / 0.3);
        return { scale, dx: 0, dy: 0, rotate: 0 };
      }
    },
    zoomout: {
      name: 'Reveal Zoom Out',
      calc: (t, index, intensity, w, h) => {
        const ease = smoothEase(t);
        const scale = 1.0 + 0.18 * (1 - ease) * (intensity / 0.3);
        return { scale, dx: 0, dy: 0, rotate: 0 };
      }
    },
    panleft: {
      name: 'Pan Left ➔ Right',
      calc: (t, index, intensity, w, h) => {
        const ease = smoothEase(t);
        const scale = 1.08;
        const dx = (-0.06 + ease * 0.12) * w * (intensity / 0.3);
        return { scale, dx, dy: 0, rotate: 0 };
      }
    },
    panright: {
      name: 'Pan Right ➔ Left',
      calc: (t, index, intensity, w, h) => {
        const ease = smoothEase(t);
        const scale = 1.08;
        const dx = (0.06 - ease * 0.12) * w * (intensity / 0.3);
        return { scale, dx, dy: 0, rotate: 0 };
      }
    },
    tiltup: {
      name: 'Tilt Up (Vertical)',
      calc: (t, index, intensity, w, h) => {
        const ease = smoothEase(t);
        const scale = 1.10;
        const dy = (0.06 - ease * 0.12) * h * (intensity / 0.3);
        return { scale, dx: 0, dy, rotate: 0 };
      }
    },
    tiltdown: {
      name: 'Tilt Down (Vertical)',
      calc: (t, index, intensity, w, h) => {
        const ease = smoothEase(t);
        const scale = 1.10;
        const dy = (-0.06 + ease * 0.12) * h * (intensity / 0.3);
        return { scale, dx: 0, dy, rotate: 0 };
      }
    },
    handheld: {
      name: 'Handheld Cam (Organic Shake)',
      calc: (t, index, intensity, w, h) => {
        const timeSec = t * 10;
        const shakeX = Math.sin(timeSec * 3.7) * Math.cos(timeSec * 2.1) * 16 * intensity;
        const shakeY = Math.cos(timeSec * 4.3) * Math.sin(timeSec * 1.8) * 12 * intensity;
        const rotate = Math.sin(timeSec * 2.5) * 0.008 * intensity;
        const breath = 1.05 + Math.sin(timeSec * 1.5) * 0.02 * (intensity / 0.3);
        return { scale: breath, dx: shakeX, dy: shakeY, rotate };
      }
    },
    pulse: {
      name: 'Rhythmic Pulse',
      calc: (t, index, intensity, w, h) => {
        const pulse = 1.03 + Math.abs(Math.sin(t * Math.PI * 2)) * 0.08 * (intensity / 0.3);
        return { scale: pulse, dx: 0, dy: 0, rotate: 0 };
      }
    },
    diagonal: {
      name: 'Parallax Corner Drift',
      calc: (t, index, intensity, w, h) => {
        const ease = smoothEase(t);
        const scale = 1.12;
        const dx = (-0.05 + ease * 0.10) * w * (intensity / 0.3);
        const dy = (-0.04 + ease * 0.08) * h * (intensity / 0.3);
        return { scale, dx, dy, rotate: 0 };
      }
    },
    static: {
      name: 'Static (No Motion)',
      calc: () => ({ scale: 1.0, dx: 0, dy: 0, rotate: 0 })
    }
  };

  // ── Init ───────────────────────────────────────────────────
  let isDraggingCaption = false;
  let captionBox = null;

  function init() {
    canvas = document.getElementById('preview-canvas');
    ctx    = canvas.getContext('2d');
    window.addEventListener('resize', () => {
      if (scenes.length) { resize(); renderFrame(); }
    });

    // Interactive Drag & Drop for Captions directly on preview screen
    canvas.addEventListener('pointerdown', onCanvasPointerDown);
    window.addEventListener('pointermove', onCanvasPointerMove);
    window.addEventListener('pointerup', onCanvasPointerUp);
  }

  function onCanvasPointerDown(e) {
    const slY = document.getElementById('sl-caption-y');
    if (!slY) return;
    const rect = canvas.getBoundingClientRect();
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;
    const curY = parseFloat(slY.value || 83);

    if (Math.abs(clickY - curY) < 18 || (captionBox && e.clientX >= captionBox.left && e.clientX <= captionBox.right && e.clientY >= captionBox.top && e.clientY <= captionBox.bottom)) {
      isDraggingCaption = true;
      updateCaptionPosFromPointer(e);
    }
  }

  function onCanvasPointerMove(e) {
    if (!isDraggingCaption) {
      const slY = document.getElementById('sl-caption-y');
      if (slY && canvas) {
        const rect = canvas.getBoundingClientRect();
        const hoverY = ((e.clientY - rect.top) / rect.height) * 100;
        const curY = parseFloat(slY.value || 83);
        if (Math.abs(hoverY - curY) < 12) {
          canvas.style.cursor = 'ns-resize';
        } else {
          canvas.style.cursor = 'default';
        }
      }
      return;
    }
    canvas.style.cursor = 'grabbing';
    updateCaptionPosFromPointer(e);
  }

  function onCanvasPointerUp() {
    if (isDraggingCaption) {
      isDraggingCaption = false;
      if (canvas) canvas.style.cursor = 'default';
      renderFrame();
    }
  }

  function updateCaptionPosFromPointer(e) {
    const rect = canvas.getBoundingClientRect();
    const newY = Math.max(5, Math.min(95, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
    const slY = document.getElementById('sl-caption-y');
    const lblY = document.getElementById('lbl-caption-y');
    if (slY) slY.value = newY;
    if (lblY) lblY.textContent = newY + '%';

    document.querySelectorAll('.pos-preset-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.pos) === newY);
    });

    renderFrame();
  }

  // ── Resize canvas to fit preview-wrap ─────────────────────
  function resize() {
    const wrap = canvas.parentElement;
    let maxW = wrap.offsetWidth || window.innerWidth - 300;
    let maxH = wrap.offsetHeight || Math.floor(window.innerHeight * 0.6);

    if (maxW <= 0) maxW = 960;
    if (maxH <= 0) maxH = 540;

    const aspect = getAspectRatio();
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) { h = maxH; w = h * aspect; }

    canvas.width  = Math.round(w);
    canvas.height = Math.round(h);
  }

  function getAspectRatio() {
    const sel = document.getElementById('sel-aspect');
    const val = sel ? sel.value : '16:9';
    const parts = val.split(':');
    return parseFloat(parts[0]) / parseFloat(parts[1]);
  }

  // ── Load scenes + wait for all images ─────────────────────
  async function loadScenes(slots, totalDuration, globalTransition) {
    duration    = totalDuration;
    currentTime = 0;
    scenes      = [];

    // Load all images and wait
    const imgPromises = slots.map((slot) => {
      return new Promise(resolve => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = () => {
          console.warn('Image failed to load:', slot.name);
          resolve(null);
        };
        img.src = slot.url;
      });
    });

    const loadedImgs = await Promise.all(imgPromises);

    for (let i = 0; i < slots.length; i++) {
      const slot     = slots[i];
      const nextSlot = slots[i + 1];
      const endSec   = nextSlot ? nextSlot.seconds : totalDuration;

      scenes.push({
        img:        loadedImgs[i],
        file:       slot.file,
        blob:       slot.file,
        startSec:   slot.seconds,
        endSec,
        duration:   endSec - slot.seconds,
        name:       slot.name,
        transition: globalTransition || 'crossfade',
        index:      i
      });
    }

    resize();
    renderFrame();
    return scenes;
  }

  // ── Get scene at time t ───────────────────────────────────
  function getSceneAt(t) {
    let low=0,high=scenes.length-1;
    while(low<=high){
      const mid=(low+high)>>1,scene=scenes[mid];
      if(t<scene.startSec)high=mid-1;
      else if(t>=scene.endSec)low=mid+1;
      else return {scene,idx:mid};
    }
    // Editable V1 clips may intentionally leave a gap. Returning the last
    // scene here repeated unrelated media inside that gap.
    return { scene:null, idx:-1 };
  }

  // ── Render one frame ──────────────────────────────────────
  function renderFrame() {
    const w = canvas.width;
    const h = canvas.height;

    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    if (!scenes.length) {
      ctx.fillStyle = '#0a0b10';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    let { scene, idx } = getSceneAt(currentTime);
    scene = window.ProTimeline?.resolveLegacyScene?.(scene, currentTime) || scene;
    if (!scene || !scene.img) {
      ctx.fillStyle = '#0a0b10';
      ctx.fillRect(0, 0, w, h);
      if (scene?.deleted) {
        const boxW=Math.min(w*.72,520),boxH=Math.min(h*.28,120),x=(w-boxW)/2,y=(h-boxH)/2;
        ctx.save();
        ctx.setLineDash([10,8]);ctx.lineWidth=2;ctx.strokeStyle='rgba(129,140,248,.58)';ctx.strokeRect(x,y,boxW,boxH);
        ctx.setLineDash([]);ctx.fillStyle='#cbd5e1';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${Math.max(13,Math.min(20,w/42))}px Segoe UI, sans-serif`;
        ctx.fillText('Empty video slot — drop an image on V1 to restore',w/2,h/2);
        ctx.restore();
      }
      if(window.VisualEffects){window.VisualEffects.apply(ctx,w,h,currentTime,{preset:document.getElementById('sel-fx-preset')?.value||'none',intensity:parseFloat(document.getElementById('sl-fx-intensity')?.value||.75),letterbox:document.getElementById('chk-letterbox')?.checked||false,particles:document.getElementById('chk-particles')?.checked||false});}
      window.ProTimeline?.renderVisualLayers?.(ctx,currentTime,w,h);
      drawCaptions(ctx,currentTime,w,h);
      return;
    }

    const trDurEl   = document.getElementById('sl-trdur');
    const trDur     = trDurEl ? parseFloat(trDurEl.value) : 0.4;
    const nextRawScene = idx>=0 ? scenes[idx + 1] : null;
    const nextScene = window.ProTimeline?.resolveLegacyScene?.(nextRawScene, currentTime) || nextRawScene;

    const tScene = scene.duration > 0
      ? Math.max(0, Math.min(1, (currentTime - scene.startSec) / scene.duration))
      : 0;

    const timeLeft     = scene.endSec - currentTime;
    const inTransition = nextScene && nextScene.img && timeLeft < trDur && trDur > 0;
    const tTr          = inTransition ? Math.max(0, Math.min(1, 1 - timeLeft / trDur)) : 0;

    const motionOn = document.getElementById('chk-motion')?.checked !== false;

    if (inTransition) {
      const fromC = renderToOffscreen(scene, tScene, w, h, motionOn);
      const toC   = renderToOffscreen(nextScene, 0, w, h, motionOn);
      const randomOn = document.getElementById('chk-random')?.checked;
      const trType   = randomOn ? Transitions.random() : (scene.transition || 'crossfade');
      Transitions.render(ctx, fromC, toC, tTr, trType, w, h, idx);
    } else {
      if (motionOn) {
        drawMotion(ctx, scene, tScene, w, h);
      } else {
        drawStaticScene(ctx, scene, w, h);
      }
    }

    // Visual Atmosphere & Genre FX Layer
    if (window.VisualEffects) {
      const fxPreset  = document.getElementById('sel-fx-preset')?.value || 'none';
      const fxInt     = parseFloat(document.getElementById('sl-fx-intensity')?.value || 0.75);
      const letterbox = document.getElementById('chk-letterbox')?.checked || false;
      const particles = document.getElementById('chk-particles')?.checked || false;

      window.VisualEffects.apply(ctx, w, h, currentTime, {
        preset: fxPreset,
        intensity: fxInt,
        letterbox,
        particles
      });
    }

    // Additional video/image/text/overlay tracks use the same compositor in
    // live preview and export, keeping keyframe output deterministic.
    window.ProTimeline?.renderVisualLayers?.(ctx, currentTime, w, h);

    // Captions
    drawCaptions(ctx, currentTime, w, h);
  }

  // ── Motion Calculation & Draw (with Per-Clip Transform) ───
  function drawMotion(ctx, scene, t, w, h) {
    const img = scene?.img;
    if (!img) { ctx.fillStyle = '#0a0b10'; ctx.fillRect(0, 0, w, h); return; }

    const motEl     = document.getElementById('sel-motion-preset');
    const presetKey = motEl ? motEl.value : motionPreset;
    const preset    = MOTION_PRESETS[presetKey] || MOTION_PRESETS.auto;

    const intEl     = document.getElementById('sl-motion');
    const intensity = intEl ? parseFloat(intEl.value) : 0.3;

    const { scale: motScale, dx: motDx, dy: motDy, rotate: motRot } = preset.calc(t, scene.index || 0, intensity, w, h);

    // Per-Clip Transform
    const clipScale = (scene.scale !== undefined && !isNaN(scene.scale)) ? scene.scale : 1.0;
    const clipPosX  = (scene.posX !== undefined && !isNaN(scene.posX)) ? (scene.posX / 100) * w : 0;
    const clipPosY  = (scene.posY !== undefined && !isNaN(scene.posY)) ? (scene.posY / 100) * h : 0;
    const clipRot   = (scene.rotation !== undefined && !isNaN(scene.rotation)) ? (scene.rotation * Math.PI / 180) : 0;

    const scale  = motScale * clipScale;
    const dx     = motDx + clipPosX;
    const dy     = motDy + clipPosY;
    const rotate = motRot + clipRot;
    const clipOpacity = Math.max(0, Math.min(1, Number(scene.opacity ?? 100) / 100));
    const clipBlur = Math.max(0, Number(scene.blur) || 0);

    const iw = img.naturalWidth  || img.width  || w;
    const ih = img.naturalHeight || img.height || h;

    const baseScale = Math.max(w / iw, h / ih);
    const fs = baseScale * scale;
    const sw = iw * fs;
    const sh = ih * fs;
    const sx = (w - sw) / 2 + dx;
    const sy = (h - sh) / 2 + dy;

    ctx.save();
    ctx.globalAlpha = clipOpacity;
    ctx.filter = clipBlur > 0 ? `blur(${clipBlur}px)` : 'none';
    if (rotate) {
      ctx.translate(w / 2 + clipPosX, h / 2 + clipPosY);
      ctx.rotate(rotate);
      ctx.translate(-(w / 2 + clipPosX), -(h / 2 + clipPosY));
    }
    ctx.drawImage(img, sx, sy, sw, sh);
    ctx.restore();
  }

  // ── Static Draw with Per-Clip Transform ───────────────────
  function drawStaticScene(ctx, scene, w, h) {
    const img = scene?.img;
    if (!img) { ctx.fillStyle = '#0a0b10'; ctx.fillRect(0, 0, w, h); return; }

    const clipScale = (scene.scale !== undefined && !isNaN(scene.scale)) ? scene.scale : 1.0;
    const clipPosX  = (scene.posX !== undefined && !isNaN(scene.posX)) ? (scene.posX / 100) * w : 0;
    const clipPosY  = (scene.posY !== undefined && !isNaN(scene.posY)) ? (scene.posY / 100) * h : 0;
    const clipRot   = (scene.rotation !== undefined && !isNaN(scene.rotation)) ? (scene.rotation * Math.PI / 180) : 0;
    const clipOpacity = Math.max(0, Math.min(1, Number(scene.opacity ?? 100) / 100));
    const clipBlur = Math.max(0, Number(scene.blur) || 0);

    const iw = img.naturalWidth  || img.width  || w;
    const ih = img.naturalHeight || img.height || h;

    const baseScale = Math.max(w / iw, h / ih) * clipScale;
    const sw = iw * baseScale;
    const sh = ih * baseScale;
    const sx = (w - sw) / 2 + clipPosX;
    const sy = (h - sh) / 2 + clipPosY;

    ctx.save();
    ctx.globalAlpha = clipOpacity;
    ctx.filter = clipBlur > 0 ? `blur(${clipBlur}px)` : 'none';
    if (clipRot) {
      ctx.translate(w / 2 + clipPosX, h / 2 + clipPosY);
      ctx.rotate(clipRot);
      ctx.translate(-(w / 2 + clipPosX), -(h / 2 + clipPosY));
    }
    ctx.drawImage(img, sx, sy, sw, sh);
    ctx.restore();
  }

  // ── Render scene to offscreen canvas for transitions ──────
  function renderToOffscreen(scene, t, w, h, motionOn) {
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const oc  = off.getContext('2d');
    if (motionOn && scene.img) {
      drawMotion(oc, scene, t, w, h);
    } else if (scene.img) {
      drawStaticScene(oc, scene, w, h);
    } else {
      oc.fillStyle = '#0a0b10'; oc.fillRect(0, 0, w, h);
    }
    return off;
  }

  // ── Captions ──────────────────────────────────────────────
  function drawCaptions(ctx, time, w, h) {
    const chkCap = document.getElementById('chk-captions');
    if (chkCap && !chkCap.checked) return;

    const captions = window.App?.getCaptions?.() || [];
    if (!captions.length) return;

    const cap = captions.find(c => time >= c.start && time < c.end);
    if (!cap || !cap.text) return;

    try {
      const preset   = document.getElementById('sel-caption-preset')?.value || 'poppins_yellow';
      const fontPick = document.getElementById('sel-caption-font')?.value   || 'Poppins';
      const align    = document.getElementById('sel-caption-align')?.value  || 'center';
      const rawPosY  = parseFloat(document.getElementById('sl-caption-y')?.value || 83);
      const posYPct  = (isNaN(rawPosY) ? 83 : rawPosY) / 100;
      const rawScale = parseFloat(document.getElementById('sl-caption-size')?.value || 1.0);
      const scale    = isNaN(rawScale) ? 1.0 : rawScale;

      const userCol      = document.getElementById('col-caption-text')?.value  || '#FFFFFF';
      const highlightCol = document.getElementById('col-caption-highlight')?.value || '#FFDE00';
      const strokeCol    = document.getElementById('col-caption-stroke')?.value || '#000000';
      const rawStW       = parseFloat(document.getElementById('sl-caption-stroke')?.value || 4);
      const strokeWidth  = isNaN(rawStW) ? 4 : rawStW;
      const glowCol      = document.getElementById('col-caption-glow')?.value || '#FFDE00';
      const rawGlB       = parseFloat(document.getElementById('sl-caption-glow')?.value || 8);
      const glowBlur     = isNaN(rawGlB) ? 8 : rawGlB;
      const rawShB       = parseFloat(document.getElementById('sl-caption-shadow')?.value || 6);
      const shadowBlur   = isNaN(rawShB) ? 6 : rawShB;
      const animStyle    = document.getElementById('sel-caption-anim')?.value || 'karaoke_pop';
      const lineAnim     = document.getElementById('sel-caption-line-anim')?.value || 'fade_in';
      const textCase     = document.getElementById('sel-caption-case')?.value || 'uppercase';
      const linesCount   = document.getElementById('sel-caption-lines')?.value || 'auto';
      const wordsPerLine = parseInt(document.getElementById('sl-caption-words-line')?.value || '0', 10) || 0;
      const wordSpacing  = parseFloat(document.getElementById('sl-caption-word-space')?.value || '0') || 0;
      const lineSpacing  = parseFloat(document.getElementById('sl-caption-line-space')?.value || '1.30') || 1.30;

      const targetY  = h * posYPct;
      let targetX = w * 0.5;
      if (align === 'left')  targetX = w * 0.12;
      if (align === 'right') targetX = w * 0.88;

      if (window.CaptionStyles) {
        const bounds = window.CaptionStyles.render(ctx, cap.text, targetX, targetY, w, h, {
          preset,
          fontPick,
          userCol,
          highlightCol,
          strokeCol,
          strokeWidth,
          glowCol,
          glowBlur,
          shadowBlur,
          animStyle,
          lineAnim,
          textCase,
          align,
          scale,
          linesCount,
          wordsPerLine,
          wordSpacing,
          lineSpacing,
          isDragging: isDraggingCaption,
          time: time,
          startTime: cap.start,
          endTime: cap.end
        });

        if (bounds && canvas) {
          const canvasRect = canvas.getBoundingClientRect();
          const scaleX = canvasRect.width / w;
          const scaleY = canvasRect.height / h;
          captionBox = {
            left:   canvasRect.left + bounds.boxX * scaleX,
            right:  canvasRect.left + (bounds.boxX + bounds.boxW) * scaleX,
            top:    canvasRect.top + bounds.boxY * scaleY,
            bottom: canvasRect.top + (bounds.boxY + bounds.boxH) * scaleY
          };
        }
      }
    } catch (err) {
      console.warn('Caption render warning:', err);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h,     x, y + h - r,     r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y,         x + r, y,         r);
    ctx.closePath();
  }

  function smoothEase(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  // ── Playback loop ─────────────────────────────────────────
  function tick(ts) {
    if (!isPlaying) return;
    if (lastTs === null) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;

    if (audioEl && !audioEl.paused) {
      currentTime = audioEl.currentTime;
    } else {
      currentTime += dt;
    }

    if (currentTime >= duration) {
      currentTime = duration;
      if (isLooping) {
        currentTime = 0;
        if (audioEl) { audioEl.currentTime = 0; audioEl.play().catch(() => {}); }
      } else {
        isPlaying = false;
        if (audioEl) { audioEl.pause(); audioEl.currentTime = 0; }
        renderFrame();
        onTimeUpdate && onTimeUpdate(currentTime, false);
        return;
      }
    }

    renderFrame();
    onTimeUpdate && onTimeUpdate(currentTime, true);
    rafId = requestAnimationFrame(tick);
  }

  // ── Controls ──────────────────────────────────────────────
  function play() {
    if (isPlaying || !scenes.length) return;
    if (currentTime >= duration) currentTime = 0;
    isPlaying = true;
    lastTs    = null;
    const start=async()=>{
      if(audioEl){
        await audioReady;
        if(!isPlaying)return;
        audioEl.currentTime=currentTime;
        try{await audioEl.play();}catch(e){console.warn('Audio play error:',e);}
      }
      if(isPlaying&&!rafId)rafId=requestAnimationFrame(tick);
    };
    start();
  }

  function pause() {
    isPlaying = false;
    lastTs    = null;
    if (audioEl) audioEl.pause();
    if (rafId)  { cancelAnimationFrame(rafId); rafId = null; }
    // The main audio element is owned here, while optional A2/A3 and overlay
    // media are owned by ProTimeline. Emit the stopped state immediately so
    // every timeline media element pauses on the same user action.
    onTimeUpdate && onTimeUpdate(currentTime, false);
  }

  function seek(t) {
    currentTime = Math.max(0, Math.min(duration, t));
    if (audioEl) audioEl.currentTime = currentTime;
    renderFrame();
    onTimeUpdate && onTimeUpdate(currentTime, isPlaying);
  }

  function reset() {
    pause();
    seek(0);
  }

  function setLooping(v) {
    isLooping = v;
    if (audioEl) audioEl.loop = v;
  }

  function setAudio(url) {
    if (audioEl) { audioEl.pause(); audioEl.src = ''; }
    audioSource?.disconnect?.();
    gainNode?.disconnect?.();
    audioContext?.close?.().catch?.(() => {});
    audioContext = null; gainNode = null; audioSource = null;
    audioEl         = new Audio(url);
    audioEl.preload = 'auto';
    applyVolume(currentVolume);
    audioReady=new Promise(resolve=>{
      let settled=false;
      const done=()=>{if(settled)return;settled=true;clearTimeout(timer);audioEl?.removeEventListener('canplay',done);audioEl?.removeEventListener('loadedmetadata',done);audioEl?.removeEventListener('error',done);resolve();};
      const timer=setTimeout(done,1800);
      audioEl.addEventListener('canplay',done,{once:true});
      audioEl.addEventListener('loadedmetadata',done,{once:true});
      audioEl.addEventListener('error',done,{once:true});
      audioEl.load();
    });
    return audioReady;
  }

  let audioContext = null;
  let gainNode     = null;
  let audioSource  = null;
  let currentVolume= 1.0;
  let appliedVolume= 1.0;
  let audioReady=Promise.resolve();

  function applyVolume(vol) {
    const applied = Math.max(0, Math.min(2.0, Number(vol) || 0));
    appliedVolume = applied;
    if (audioEl) {
      if (applied <= 1.0) {
        audioEl.volume = applied;
        if (gainNode) gainNode.gain.value = 1.0;
      } else {
        // Boost volume past 100% up to 200% via Web Audio GainNode
        audioEl.volume = 1.0;
        try {
          if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioContext.createGain();
            audioSource = audioContext.createMediaElementSource(audioEl);
            audioSource.connect(gainNode);
            gainNode.connect(audioContext.destination);
          }
          if (audioContext.state === 'suspended') {
            audioContext.resume();
          }
          gainNode.gain.value = applied;
        } catch (e) {
          audioEl.volume = 1.0;
        }
      }
    }
  }

  function setVolume(vol) {
    currentVolume = Math.max(0, Math.min(2.0, Number(vol) || 0));
    applyVolume(currentVolume);
  }

  function setAutomationVolume(vol) { applyVolume(vol); }

  function getVolume() { return currentVolume; }
  function getAppliedVolume() { return appliedVolume; }

  function setOnTimeUpdate(cb) { onTimeUpdate = cb; }
  function setMotionPreset(p)  { motionPreset = p; renderFrame(); }

  function getCurrentTime()       { return currentTime; }
  function getDuration()          { return duration; }
  function getIsPlaying()         { return isPlaying; }
  function getScenes()            { return scenes; }
  function getMotionPresets()     { return MOTION_PRESETS; }
  function getCurrentSceneIndex() {
    const { idx } = getSceneAt(currentTime);
    return idx;
  }

  function setScenes(newScenes, newDuration) {
    scenes = newScenes || [];
    if (newDuration !== undefined && newDuration > 0) {
      duration = newDuration;
    } else if (scenes.length) {
      duration = scenes[scenes.length - 1].endSec;
    }
    resize();
    renderFrame();
  }

  return {
    init, loadScenes, setScenes, renderFrame, resize,
    play, pause, seek, reset, setLooping, setAudio, setVolume, setAutomationVolume, getVolume, setOnTimeUpdate, setMotionPreset,
    getCurrentTime, getDuration, getIsPlaying, getAppliedVolume, getScenes, getMotionPresets, getCurrentSceneIndex
  };
})();
