/* ============================================================
   BG-ANIMATION.JS — Cinematic Auto-Editing & Trimming Background Visualizer
   ============================================================ */

(function () {
  let canvas, ctx;
  let width = 0, height = 0;
  let animId = null;
  let time = 0;

  // Timeline Tracks & Clips State
  const tracks = [
    { yOffset: 0.22, height: 42, speed: 0.8, clips: [], label: 'V1 AUTO-SYNC' },
    { yOffset: 0.38, height: 38, speed: 0.6, clips: [], label: 'V2 OVERLAYS' },
    { yOffset: 0.62, height: 46, speed: 0.9, clips: [], label: 'A1 VOICEOVER' },
    { yOffset: 0.78, height: 32, speed: 0.7, clips: [], label: 'A2 AMBIENCE' }
  ];

  const particles = [];
  const sparks = [];
  const MAX_PARTICLES = 65;

  function init() {
    canvas = document.getElementById('bg-anim-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    resize();
    window.addEventListener('resize', resize);

    initClips();
    initParticles();
    animate();
  }

  function resize() {
    width  = window.innerWidth;
    height = window.innerHeight;
    canvas.width  = width;
    canvas.height = height;
  }

  function initClips() {
    const colors = [
      { border: 'rgba(99, 102, 241, 0.85)', bg: 'rgba(79, 70, 229, 0.28)', accent: '#818cf8' },
      { border: 'rgba(6, 182, 212, 0.85)', bg: 'rgba(6, 182, 212, 0.25)', accent: '#38bdf8' },
      { border: 'rgba(236, 72, 153, 0.85)', bg: 'rgba(236, 72, 153, 0.25)', accent: '#f472b6' },
      { border: 'rgba(16, 185, 129, 0.85)', bg: 'rgba(16, 185, 129, 0.28)', accent: '#34d399' },
      { border: 'rgba(245, 158, 11, 0.85)', bg: 'rgba(245, 158, 11, 0.28)', accent: '#fbbf24' }
    ];

    tracks.forEach((track, tIdx) => {
      track.clips = [];
      let currentX = 0;
      for (let i = 0; i < 24; i++) {
        const w = 130 + Math.random() * 200;
        const col = colors[(i + tIdx) % colors.length];
        const isCut = Math.random() > 0.35;
        track.clips.push({
          x: currentX,
          w: w,
          color: col,
          isCut: isCut,
          cutProgress: isCut ? Math.random() : 1,
          name: `CLIP_${String(i + 1).padStart(2, '0')}.MP4`,
          time: `00:${String(Math.floor(i * 3)).padStart(2, '0')}.${Math.floor(Math.random()*9)}`
        });
        currentX += w + 8;
      }
      track.totalWidth = currentX;
    });
  }

  function initParticles() {
    particles.length = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 2.8 + 1.0,
        alpha: Math.random() * 0.6 + 0.2,
        hue: Math.random() > 0.5 ? 230 : 190
      });
    }
  }

  function addSpark(x, y, color) {
    for (let i = 0; i < 5; i++) {
      sparks.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 1.0,
        decay: Math.random() * 0.04 + 0.02,
        color: color || '#38bdf8'
      });
    }
  }

  function animate() {
    time += 0.016;

    // Draw background gradient
    ctx.clearRect(0, 0, width, height);

    // Subtle Perspective Grid Floor Lines
    drawGridPerspective();

    // Draw Moving Timeline Tracks with Slices, Waveforms & Auto-Trimming
    drawTimelineAnimation();

    // Draw Slicing Laser Playheads
    drawTrimmingPlayheads();

    // Draw Particles & Sparks
    drawParticles();

    animId = requestAnimationFrame(animate);
  }

  function drawGridPerspective() {
    ctx.save();
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.07)';
    ctx.lineWidth = 1;

    const gridStep = 45;
    for (let x = 0; x < width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTimelineAnimation() {
    tracks.forEach((track, tIdx) => {
      const baseY = height * track.yOffset;
      const speed = track.speed;
      const offset = (time * 50 * speed) % track.totalWidth;

      ctx.save();

      // Track Guide Line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, baseY - 4);
      ctx.lineTo(width, baseY - 4);
      ctx.moveTo(0, baseY + track.height + 4);
      ctx.lineTo(width, baseY + track.height + 4);
      ctx.stroke();

      // Track Label Badge
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.fillText(track.label, 24, baseY - 7);

      // Draw Clips
      track.clips.forEach(clip => {
        let drawX = (clip.x - offset);
        if (drawX < -clip.w - 100) drawX += track.totalWidth;
        if (drawX > width + 100) return;

        // Clip Body
        ctx.fillStyle = clip.color.bg;
        ctx.strokeStyle = clip.color.border;
        ctx.lineWidth = 1.5;

        // Rounded Rect Clip
        roundRect(ctx, drawX, baseY, clip.w, track.height, 5);
        ctx.fill();
        ctx.stroke();

        // Audio Waveform inside Audio Track
        if (tIdx >= 2) {
          drawWaveformBars(drawX, baseY, clip.w, track.height, clip.color.accent);
        } else {
          // Video Strip Lines / Keyframes
          drawVideoStrip(drawX, baseY, clip.w, track.height, clip.color.accent);
        }

        // Cut Indicator Diamond
        if (clip.isCut) {
          ctx.save();
          ctx.translate(drawX, baseY + track.height / 2);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = clip.color.accent;
          ctx.shadowColor = clip.color.accent;
          ctx.shadowBlur = 8;
          ctx.fillRect(-3.5, -3.5, 7, 7);
          ctx.restore();

          // Spark occasionally
          if (Math.random() < 0.05 && drawX > 50 && drawX < width - 50) {
            addSpark(drawX, baseY + track.height / 2, clip.color.accent);
          }
        }

        // Clip Info Tag
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillText(clip.name, drawX + 8, baseY + 13);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fillText(clip.time, drawX + 8, baseY + track.height - 7);
      });

      ctx.restore();
    });
  }

  function drawWaveformBars(x, y, w, h, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.65;
    const barWidth = 3;
    const gap = 2;
    const midY = y + h / 2;

    for (let bx = x + 4; bx < x + w - 4; bx += (barWidth + gap)) {
      const wave = Math.sin((bx * 0.08) + (time * 4)) * Math.cos(bx * 0.03);
      const barH = Math.max(3, Math.abs(wave) * (h * 0.72));
      ctx.fillRect(bx, midY - barH / 2, barWidth, barH);
    }
    ctx.restore();
  }

  function drawVideoStrip(x, y, w, h, color) {
    ctx.save();
    // Film sprocket top & bottom
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (let sx = x + 6; sx < x + w - 6; sx += 12) {
      ctx.fillRect(sx, y + 2, 6, 4);
      ctx.fillRect(sx, y + h - 6, 6, 4);
    }

    // Motion curve inside clip
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + h - 10);
    ctx.bezierCurveTo(x + w * 0.3, y + 8, x + w * 0.7, y + h - 8, x + w - 8, y + 10);
    ctx.stroke();

    ctx.restore();
  }

  function drawTrimmingPlayheads() {
    // Slicing Neon Laser 1
    const laserX = (width * 0.45) + Math.sin(time * 0.8) * (width * 0.25);
    // Slicing Neon Laser 2 (Secondary)
    const laser2X = (width * 0.75) + Math.cos(time * 0.6) * (width * 0.15);

    drawSingleLaser(laserX, '#06b6d4', 'rgba(6, 182, 212, 0.6)');
    drawSingleLaser(laser2X, '#818cf8', 'rgba(99, 102, 241, 0.5)');
  }

  function drawSingleLaser(xPos, glowColor, lineColor) {
    ctx.save();
    const grad = ctx.createLinearGradient(xPos, 0, xPos, height);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0)');
    grad.addColorStop(0.2, lineColor);
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(0.8, lineColor);
    grad.addColorStop(1, 'rgba(99, 102, 241, 0)');

    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.moveTo(xPos, 0);
    ctx.lineTo(xPos, height);
    ctx.stroke();

    // Laser Cutting Cursor
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 20;
    ctx.shadowColor = glowColor;
    tracks.forEach(track => {
      const y = height * track.yOffset + track.height / 2;
      ctx.beginPath();
      ctx.arc(xPos, y, 4, 0, Math.PI * 2);
      ctx.fill();

      if (Math.random() < 0.25) {
        addSpark(xPos, y, glowColor);
      }
    });

    ctx.restore();
  }

  function drawParticles() {
    // Dust Particles
    ctx.save();
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.fillStyle = `hsla(${p.hue}, 85%, 65%, ${p.alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Trimming Sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx;
      s.y += s.vy;
      s.life -= s.decay;

      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }

      ctx.fillStyle = s.color;
      ctx.globalAlpha = s.life;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.life * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  document.addEventListener('DOMContentLoaded', init);
})();