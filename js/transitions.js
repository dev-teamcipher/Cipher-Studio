/* ============================================================
   TRANSITIONS.JS — High-Quality Canvas Transition Engine & Live Previews
   ============================================================ */

window.Transitions = (function () {

  // ── Available transition types ─────────────────────────────
  const TYPES = [
    'automix',
    'zoomin', 'zoomout',
    'crossfade', 'flash', 'rays', 'flare', 'heatsinge',
    'violetstrips', 'glitch', 'pullin', 'zoomspin', 'echoshift',
    'shadowsweep', 'swipeflip', 'candydisplace', 'blur',
    'shutter', 'fadeblack', 'wipeleft', 'wiperight',
    'slideleft', 'slideright', 'diagwipe', 'circleopen', 'none'
  ];

  const LABELS = {
    automix:       '✨ Dynamic Auto Mix',
    zoomin:        'Zoom In',
    zoomout:       'Zoom Out',
    crossfade:     'Slow Fade',
    flash:         'Lightning Hit',
    rays:          'Ray Expands',
    flare:         'Morning Glare',
    heatsinge:     'Heat Singe',
    violetstrips:  'Violet Strips',
    glitch:        '8-Bit Tear',
    pullin:        'Central Zoom',
    zoomspin:      '3D Spin Zoom',
    echoshift:     'Echo Shift',
    shadowsweep:   'Shadow Sweep',
    swipeflip:     'Swipe Flip',
    candydisplace: 'Candy Blasting',
    blur:          'Bright Fuzz',
    shutter:       'Camera Shutter',
    fadeblack:     'Basic Black',
    wipeleft:      'Wipe Left',
    wiperight:     'Wipe Right',
    slideleft:     'Slide Left',
    slideright:    'Slide Right',
    diagwipe:      'Diagonal Split',
    circleopen:    'Circle Iris',
    none:          'Cut (None)'
  };

  function getResolvedType(type, cutIdx = 0) {
    if (type === 'automix' || type === 'auto' || type === 'mix') {
      const pool = TYPES.filter(k => k !== 'automix' && k !== 'none');
      return pool[Math.abs(cutIdx) % pool.length];
    }
    return type || 'crossfade';
  }

  // ── Render transition between two images ───────────────────
  function render(ctx, fromImg, toImg, t, type, w, h, cutIdx = 0) {
    const activeType = getResolvedType(type, cutIdx);
    ctx.save();
    switch (activeType) {
      case 'zoomin':        renderZoomIn(ctx, fromImg, toImg, t, w, h); break;
      case 'zoomout':       renderZoomOut(ctx, fromImg, toImg, t, w, h); break;
      case 'crossfade':     renderCrossfade(ctx, fromImg, toImg, t, w, h); break;
      case 'flash':         renderFlash(ctx, fromImg, toImg, t, w, h); break;
      case 'rays':          renderRayExpands(ctx, fromImg, toImg, t, w, h); break;
      case 'flare':         renderMorningGlare(ctx, fromImg, toImg, t, w, h); break;
      case 'heatsinge':     renderHeatSinge(ctx, fromImg, toImg, t, w, h); break;
      case 'violetstrips':  renderVioletStrips(ctx, fromImg, toImg, t, w, h); break;
      case 'glitch':        renderGlitch(ctx, fromImg, toImg, t, w, h); break;
      case 'pullin':        renderPullIn(ctx, fromImg, toImg, t, w, h); break;
      case 'zoomspin':      renderZoomSpin(ctx, fromImg, toImg, t, w, h); break;
      case 'echoshift':     renderEchoShift(ctx, fromImg, toImg, t, w, h); break;
      case 'shadowsweep':   renderShadowSweep(ctx, fromImg, toImg, t, w, h); break;
      case 'swipeflip':     renderSwipeFlip(ctx, fromImg, toImg, t, w, h); break;
      case 'candydisplace': renderCandyBlasting(ctx, fromImg, toImg, t, w, h); break;
      case 'blur':          renderBlur(ctx, fromImg, toImg, t, w, h); break;
      case 'shutter':       renderShutter(ctx, fromImg, toImg, t, w, h); break;
      case 'fadeblack':     renderFadeBlack(ctx, fromImg, toImg, t, w, h); break;
      case 'wipeleft':      renderWipe(ctx, fromImg, toImg, t, w, h, 'left'); break;
      case 'wiperight':     renderWipe(ctx, fromImg, toImg, t, w, h, 'right'); break;
      case 'slideleft':     renderSlide(ctx, fromImg, toImg, t, w, h, 'left'); break;
      case 'slideright':    renderSlide(ctx, fromImg, toImg, t, w, h, 'right'); break;
      case 'diagwipe':      renderDiagWipe(ctx, fromImg, toImg, t, w, h); break;
      case 'circleopen':    renderCircleOpen(ctx, fromImg, toImg, t, w, h); break;
      default:              drawImg(ctx, toImg, 0, 0, w, h); break;
    }
    ctx.restore();
  }

  // ── Smooth Zoom In Transition ──────────────────────────────
  function renderZoomIn(ctx, from, to, t, w, h) {
    const ease = t * t * (3 - 2 * t);

    // From scene zooms in and fades
    const scaleFrom = 1 + ease * 0.45;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scaleFrom, scaleFrom);
    ctx.globalAlpha = Math.max(0, 1 - ease * 1.3);
    drawImg(ctx, from, -w / 2, -h / 2, w, h, true);
    ctx.restore();

    // To scene zooms from 0.7 to 1.0 and fades in
    const scaleTo = 0.7 + ease * 0.3;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scaleTo, scaleTo);
    ctx.globalAlpha = Math.min(1, Math.max(0, (ease - 0.2) / 0.8));
    drawImg(ctx, to, -w / 2, -h / 2, w, h, true);
    ctx.restore();
  }

  // ── Smooth Zoom Out Transition ─────────────────────────────
  function renderZoomOut(ctx, from, to, t, w, h) {
    const ease = t * t * (3 - 2 * t);

    // From scene zooms out and fades
    const scaleFrom = 1 - ease * 0.35;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scaleFrom, scaleFrom);
    ctx.globalAlpha = Math.max(0, 1 - ease * 1.2);
    drawImg(ctx, from, -w / 2, -h / 2, w, h, true);
    ctx.restore();

    // To scene zooms from 1.45 to 1.0 and fades in
    const scaleTo = 1.45 - ease * 0.45;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scaleTo, scaleTo);
    ctx.globalAlpha = Math.min(1, Math.max(0, (ease - 0.15) / 0.85));
    drawImg(ctx, to, -w / 2, -h / 2, w, h, true);
    ctx.restore();
  }

  // ── 1. Slow Fade (Crossfade) ──────────────────────────────
  function renderCrossfade(ctx, from, to, t, w, h) {
    drawImg(ctx, from, 0, 0, w, h);
    ctx.globalAlpha = Math.max(0, Math.min(1, t));
    drawImg(ctx, to, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // ── 2. Lightning Hit / Flash ──────────────────────────────
  function renderFlash(ctx, from, to, t, w, h) {
    if (t < 0.45) {
      drawImg(ctx, from, 0, 0, w, h);
      const intensity = t / 0.45;
      ctx.fillStyle = `rgba(255,255,255,${intensity * 0.95})`;
      ctx.fillRect(0, 0, w, h);
    } else if (t < 0.55) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    } else {
      drawImg(ctx, to, 0, 0, w, h);
      const fadeOut = (1 - t) / 0.45;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, fadeOut * 0.95)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ── 3. Ray Expands / Light Burst ──────────────────────────
  function renderRayExpands(ctx, from, to, t, w, h) {
    const curImg = t < 0.5 ? from : to;
    drawImg(ctx, curImg, 0, 0, w, h);

    const p = Math.sin(t * Math.PI);
    const grad = ctx.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, Math.max(w, h) * 0.85);
    grad.addColorStop(0, `rgba(255, 240, 200, ${p * 0.9})`);
    grad.addColorStop(0.4, `rgba(255, 180, 50, ${p * 0.6})`);
    grad.addColorStop(1, 'rgba(255, 120, 0, 0)');

    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Dynamic light ray beams
    ctx.strokeStyle = `rgba(255, 255, 255, ${p * 0.4})`;
    ctx.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + t * 2;
      ctx.beginPath();
      ctx.moveTo(w / 2, h / 2);
      ctx.lineTo(w / 2 + Math.cos(angle) * w, h / 2 + Math.sin(angle) * h);
      ctx.stroke();
    }
    ctx.restore();

    if (t >= 0.5) {
      ctx.globalAlpha = (t - 0.5) * 2;
      drawImg(ctx, to, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  // ── 4. Morning Glare / Warm Glow ──────────────────────────
  function renderMorningGlare(ctx, from, to, t, w, h) {
    drawImg(ctx, from, 0, 0, w, h);
    ctx.globalAlpha = Math.max(0, Math.min(1, t));
    drawImg(ctx, to, 0, 0, w, h);
    ctx.globalAlpha = 1;

    const p = Math.sin(t * Math.PI);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, `rgba(255, 220, 150, ${p * 0.85})`);
    grad.addColorStop(0.5, `rgba(255, 255, 240, ${p * 0.95})`);
    grad.addColorStop(1, `rgba(255, 180, 100, ${p * 0.85})`);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 5. Heat Singe / Burn Effect ───────────────────────────
  function renderHeatSinge(ctx, from, to, t, w, h) {
    if (t < 0.5) {
      drawImg(ctx, from, 0, 0, w, h);
      const heat = t * 2;
      ctx.fillStyle = `rgba(255, 60, 20, ${heat * 0.65})`;
      ctx.fillRect(0, 0, w, h);
    } else {
      drawImg(ctx, to, 0, 0, w, h);
      const heat = (1 - t) * 2;
      ctx.fillStyle = `rgba(255, 120, 0, ${heat * 0.65})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ── 6. Violet Strips / Vertical Slit Scan ─────────────────
  function renderVioletStrips(ctx, from, to, t, w, h) {
    drawImg(ctx, from, 0, 0, w, h);
    const numStrips = 10;
    const stripW = w / numStrips;
    const ease = easeInOut(t);

    ctx.save();
    for (let i = 0; i < numStrips; i++) {
      const delay = (i / numStrips) * 0.4;
      const progress = Math.max(0, Math.min(1, (ease - delay) / 0.6));
      const curH = h * progress;

      ctx.save();
      ctx.beginPath();
      ctx.rect(i * stripW, (h - curH) / 2, stripW, curH);
      ctx.clip();
      drawImg(ctx, to, 0, 0, w, h);

      // Violet edge border
      ctx.fillStyle = 'rgba(168, 85, 247, 0.4)';
      ctx.fillRect(i * stripW, (h - curH) / 2, stripW, curH);
      ctx.restore();
    }
    ctx.restore();
  }

  // ── 7. Central Zoom (Pull In) ─────────────────────────────
  function renderPullIn(ctx, from, to, t, w, h) {
    if (t < 0.5) {
      const scale = 1 + t * 0.8;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 1 - t * 1.5;
      drawImg(ctx, from, -w / 2, -h / 2, w, h, true);
      ctx.restore();
    } else {
      const scale = 1.6 - (t - 0.5) * 1.2;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.globalAlpha = (t - 0.5) * 2;
      drawImg(ctx, to, -w / 2, -h / 2, w, h, true);
      ctx.restore();
    }
  }

  // ── 8. 3D Spin Zoom ───────────────────────────────────────
  function renderZoomSpin(ctx, from, to, t, w, h) {
    if (t < 0.5) {
      const p = t * 2;
      const scale = 1 + p * 0.7;
      const angle = p * 0.25;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 1 - p * 0.5;
      drawImg(ctx, from, -w / 2, -h / 2, w, h, true);
      ctx.restore();
    } else {
      const p = (t - 0.5) * 2;
      const scale = 1.7 - p * 0.7;
      const angle = (1 - p) * -0.25;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 0.5 + p * 0.5;
      drawImg(ctx, to, -w / 2, -h / 2, w, h, true);
      ctx.restore();
    }
  }

  // ── 9. Echo Shift / Ghosting ──────────────────────────────
  function renderEchoShift(ctx, from, to, t, w, h) {
    drawImg(ctx, from, 0, 0, w, h);
    const shift = Math.sin(t * Math.PI) * (w * 0.08);

    ctx.save();
    ctx.globalAlpha = 0.45;
    drawImg(ctx, t < 0.5 ? from : to, shift, 0, w, h);
    drawImg(ctx, t < 0.5 ? from : to, -shift, 0, w, h);
    ctx.restore();

    if (t >= 0.5) {
      ctx.globalAlpha = (t - 0.5) * 2;
      drawImg(ctx, to, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  // ── 10. Shadow Sweep / Dark Flare ─────────────────────────
  function renderShadowSweep(ctx, from, to, t, w, h) {
    drawImg(ctx, from, 0, 0, w, h);
    const ease = easeInOut(t);
    const sweepX = w * ease;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, sweepX, h);
    ctx.clip();
    drawImg(ctx, to, 0, 0, w, h);

    // Dark shadow beam
    const grad = ctx.createLinearGradient(sweepX - 80, 0, sweepX + 80, 0);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.85)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(sweepX - 80, 0, 160, h);

    ctx.restore();
  }

  // ── 11. Swipe Flip / 3D Perspective Card ──────────────────
  function renderSwipeFlip(ctx, from, to, t, w, h) {
    if (t < 0.5) {
      const scaleX = 1 - t * 2;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(Math.max(0.01, scaleX), 1);
      drawImg(ctx, from, -w / 2, -h / 2, w, h, true);
      ctx.restore();
    } else {
      const scaleX = (t - 0.5) * 2;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(Math.max(0.01, scaleX), 1);
      drawImg(ctx, to, -w / 2, -h / 2, w, h, true);
      ctx.restore();
    }
  }

  // ── 12. Candy Blasting / RGB Warp ─────────────────────────
  function renderCandyBlasting(ctx, from, to, t, w, h) {
    const curImg = t < 0.5 ? from : to;
    drawImg(ctx, curImg, 0, 0, w, h);

    const shift = Math.sin(t * Math.PI) * 18;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.5;
    drawImg(ctx, curImg, shift, -shift, w, h);
    drawImg(ctx, curImg, -shift, shift, w, h);
    ctx.restore();

    if (t >= 0.5) {
      ctx.globalAlpha = (t - 0.5) * 2;
      drawImg(ctx, to, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  // ── 13. Cyber Glitch / 8-Bit Tear ─────────────────────────
  function renderGlitch(ctx, from, to, t, w, h) {
    const curImg = t < 0.5 ? from : to;
    drawImg(ctx, curImg, 0, 0, w, h);

    const slices = 8;
    for (let i = 0; i < slices; i++) {
      const sliceY = (i / slices) * h;
      const sliceH = h / slices;
      const shift = (Math.sin(t * 30 + i * 5) * 28) * (1 - Math.abs(t - 0.5) * 2);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, sliceY, w, sliceH);
      ctx.clip();
      ctx.translate(shift, 0);
      drawImg(ctx, curImg, 0, 0, w, h);
      
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(0, 240, 255, 0.18)';
        ctx.fillRect(0, sliceY, w, sliceH);
      } else {
        ctx.fillStyle = 'rgba(255, 0, 100, 0.18)';
        ctx.fillRect(0, sliceY, w, sliceH);
      }
      ctx.restore();
    }
  }

  // ── 14. Bright Fuzz / Blur Dissolve ───────────────────────
  function renderBlur(ctx, from, to, t, w, h) {
    if (t < 0.5) {
      drawImg(ctx, from, 0, 0, w, h);
      ctx.fillStyle = `rgba(10, 11, 16, ${t * 1.4})`;
      ctx.fillRect(0, 0, w, h);
    } else {
      drawImg(ctx, to, 0, 0, w, h);
      const fade = (1 - t) * 2;
      ctx.fillStyle = `rgba(10, 11, 16, ${fade * 1.4})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ── 15. Camera Shutter Blades ─────────────────────────────
  function renderShutter(ctx, from, to, t, w, h) {
    const isFirstHalf = t < 0.5;
    const progress = isFirstHalf ? t * 2 : (1 - (t - 0.5) * 2);
    const img = isFirstHalf ? from : to;

    drawImg(ctx, img, 0, 0, w, h);

    const numBlades = 8;
    const maxDim = Math.max(w, h) * 1.2;
    const curR = maxDim * (1 - progress * 0.95);

    ctx.save();
    ctx.fillStyle = '#08080a';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(w / 2, h / 2, Math.max(0, curR), 0, Math.PI * 2, true);
    ctx.fill();

    if (progress > 0.1) {
      ctx.strokeStyle = '#1e2230';
      ctx.lineWidth = 3;
      for (let i = 0; i < numBlades; i++) {
        const angle = (i / numBlades) * Math.PI * 2 + progress * 0.8;
        const x1 = w / 2 + Math.cos(angle) * curR;
        const y1 = h / 2 + Math.sin(angle) * curR;
        const x2 = w / 2 + Math.cos(angle + 0.6) * maxDim;
        const y2 = h / 2 + Math.sin(angle + 0.6) * maxDim;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ── 16. Basic Black / Fade Black ──────────────────────────
  function renderFadeBlack(ctx, from, to, t, w, h) {
    if (t < 0.5) {
      drawImg(ctx, from, 0, 0, w, h);
      ctx.fillStyle = `rgba(0,0,0,${t * 2})`;
      ctx.fillRect(0, 0, w, h);
    } else {
      drawImg(ctx, to, 0, 0, w, h);
      ctx.fillStyle = `rgba(0,0,0,${(1 - t) * 2})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ── 17. Wipe (Left / Right) ───────────────────────────────
  function renderWipe(ctx, from, to, t, w, h, dir) {
    drawImg(ctx, from, 0, 0, w, h);
    ctx.save();
    const ease = easeInOut(t);
    if (dir === 'left') {
      const split = w * (1 - ease);
      ctx.beginPath();
      ctx.rect(split, 0, w * ease, h);
    } else {
      const split = w * ease;
      ctx.beginPath();
      ctx.rect(0, 0, split, h);
    }
    ctx.clip();
    drawImg(ctx, to, 0, 0, w, h);
    ctx.restore();
  }

  // ── 18. Slide (Left / Right) ──────────────────────────────
  function renderSlide(ctx, from, to, t, w, h, dir) {
    const ease = easeInOut(t);
    const offset = dir === 'left' ? -w * ease : w * ease;
    ctx.save();
    ctx.translate(offset, 0);
    drawImg(ctx, from, 0, 0, w, h);
    ctx.translate(dir === 'left' ? w : -w, 0);
    drawImg(ctx, to, 0, 0, w, h);
    ctx.restore();
  }

  // ── 19. Diagonal Split ────────────────────────────────────
  function renderDiagWipe(ctx, from, to, t, w, h) {
    drawImg(ctx, from, 0, 0, w, h);
    const ease = easeInOut(t);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(w * ease * 2, 0);
    ctx.lineTo(0, h * ease * 2);
    ctx.lineTo(0, h);
    ctx.lineTo(w, h);
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.clip();
    drawImg(ctx, to, 0, 0, w, h);
    ctx.restore();
  }

  // ── 20. Circle Iris Open ──────────────────────────────────
  function renderCircleOpen(ctx, from, to, t, w, h) {
    drawImg(ctx, from, 0, 0, w, h);
    const maxR = Math.sqrt(w * w + h * h) / 2;
    const r = maxR * easeInOut(t);
    ctx.save();
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.max(0, r), 0, Math.PI * 2);
    ctx.clip();
    drawImg(ctx, to, 0, 0, w, h);
    ctx.restore();
  }

  // ── Helpers ───────────────────────────────────────────────
  function drawImg(ctx, img, x, y, w, h, centered = false) {
    if (!img) { ctx.fillStyle = '#08090d'; ctx.fillRect(0, 0, w || 1920, h || 1080); return; }
    
    const targetW = w || ctx.canvas.width;
    const targetH = h || ctx.canvas.height;
    const iw = img.naturalWidth || img.width || targetW;
    const ih = img.naturalHeight || img.height || targetH;

    const scale = Math.max(targetW / iw, targetH / ih);
    const sw = iw * scale;
    const sh = ih * scale;
    
    if (centered) {
      ctx.drawImage(img, x, y, targetW, targetH);
    } else {
      const sx = (targetW - sw) / 2;
      const sy = (targetH - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh);
    }
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function random() {
    const pool = TYPES.filter(t => t !== 'none');
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── Generate Thumbnail Sample Textures ────────────────────
  let sampleA = null, sampleB = null;

  function getSampleCanvases() {
    if (!sampleA) {
      sampleA = document.createElement('canvas');
      sampleA.width = 120; sampleA.height = 90;
      const ca = sampleA.getContext('2d');
      const gradA = ca.createLinearGradient(0, 0, 120, 90);
      gradA.addColorStop(0, '#1e1b4b');
      gradA.addColorStop(0.5, '#4338ca');
      gradA.addColorStop(1, '#06b6d4');
      ca.fillStyle = gradA;
      ca.fillRect(0, 0, 120, 90);
      // Landscape Mountain Silhouette
      ca.fillStyle = '#0f172a';
      ca.beginPath();
      ca.moveTo(0, 90);
      ca.lineTo(40, 45);
      ca.lineTo(80, 65);
      ca.lineTo(120, 35);
      ca.lineTo(120, 90);
      ca.fill();
    }

    if (!sampleB) {
      sampleB = document.createElement('canvas');
      sampleB.width = 120; sampleB.height = 90;
      const cb = sampleB.getContext('2d');
      const gradB = cb.createLinearGradient(0, 0, 120, 90);
      gradB.addColorStop(0, '#ec4899');
      gradB.addColorStop(0.5, '#f59e0b');
      gradB.addColorStop(1, '#10b981');
      cb.fillStyle = gradB;
      cb.fillRect(0, 0, 120, 90);
      // Sun & City Skyline
      cb.fillStyle = '#fff';
      cb.beginPath();
      cb.arc(60, 45, 18, 0, Math.PI * 2);
      cb.fill();
      cb.fillStyle = '#08090d';
      cb.fillRect(20, 50, 20, 40);
      cb.fillRect(50, 35, 24, 55);
      cb.fillRect(80, 45, 20, 45);
    }
    return { a: sampleA, b: sampleB };
  }

  // ── Render Live Transition Preview on Mini Canvas ─────────
  function renderThumbnail(canvas, type, t) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { a, b } = getSampleCanvases();
    if (type === 'automix') {
      const pool = TYPES.filter(k => k !== 'automix' && k !== 'none');
      const cycleIdx = Math.floor(t * 3) % pool.length;
      const subT = (t * 3) % 1;
      render(ctx, a, b, subT, pool[cycleIdx], canvas.width, canvas.height, cycleIdx);
    } else {
      render(ctx, a, b, t, type, canvas.width, canvas.height, 0);
    }
  }

  return { render, drawImg, TYPES, LABELS, random, renderThumbnail, getResolvedType };
})();
