/* ============================================================
   EFFECTS.JS — Visual Atmosphere & Genre FX Engine & Live Previews
   ============================================================ */

window.VisualEffects = (function () {

  const PRESETS = {
    none: {
      name: 'None (Original)',
      icon: '⊘',
      desc: 'Original pristine colors without grading.'
    },
    black_noise: {
      name: 'Black Noise',
      icon: '🌑',
      desc: 'Heavy dark analog film dust, gritty grain & shadow noise.'
    },
    noise: {
      name: 'Noise',
      icon: '🎞️',
      desc: 'Classic 35mm Hollywood film grain texture.'
    },
    vintage_noise: {
      name: 'Vintage Noise',
      icon: '📜',
      desc: '8mm archival film grain, sepia tone & scratch lines.'
    },
    noise_2: {
      name: 'Noise 2',
      icon: '📺',
      desc: 'Intense analog static, VHS interference & TV snow.'
    },
    white_noise: {
      name: 'White Noise',
      icon: '❄️',
      desc: 'Crisp white specks, static sparks & ambient texture.'
    },
    noise_dust: {
      name: 'Noise Dust',
      icon: '✨',
      desc: 'Floating retro dust specks, lens dirt & hairs.'
    },
    noise_1: {
      name: 'Noise 1',
      icon: '🎬',
      desc: 'Subtle high-definition cinematic fine grain.'
    },
    bw_noise: {
      name: 'BW Noise',
      icon: '🖤',
      desc: 'Pure monochrome black & white with rich film grain.'
    },
    bw_noise_pulse: {
      name: 'BW Noise Pulse',
      icon: '💓',
      desc: 'Monochrome contrast with rhythmic pulsing vignette.'
    },
    horror: {
      name: 'Dark Horror',
      icon: '👻',
      desc: 'Cold shadows, eerie vignette & dark foggy tension.'
    },
    sleeping: {
      name: 'Dreamy Stories',
      icon: '🌙',
      desc: 'Soft pastel glow, gentle warm aura & night atmosphere.'
    },
    history: {
      name: 'Vintage History',
      icon: '🏛️',
      desc: 'Warm parchment grade, 35mm grain & archive scratches.'
    },
    documentary: {
      name: 'Cinematic 4K',
      icon: '🎥',
      desc: 'Hollywood Teal & Orange grading with deep contrast.'
    },
    vibrant: {
      name: 'Vibrant Anime',
      icon: '🎨',
      desc: 'High saturation punch, rich vibrance & pop visuals.'
    },
    fantasy: {
      name: 'Magical Fantasy',
      icon: '✨',
      desc: 'Golden bloom lighting, twilight glow & fairy sparkles.'
    },
    cyberpunk: {
      name: 'Neon Cyberpunk',
      icon: '⚡',
      desc: 'Cyan & magenta dual-tone with subtle scanlines.'
    },
    bw_noir: {
      name: '1940s Noir B&W',
      icon: '🎬',
      desc: 'Deep dramatic monochrome contrast & crisp shadows.'
    },
    golden_hour: {
      name: 'Golden Hour',
      icon: '🌅',
      desc: 'Warm sunset flare, golden rays & rich amber sunlight glow.'
    },
    matrix_code: {
      name: 'Matrix Code',
      icon: '🟢',
      desc: 'Cyberpunk green terminal glow with falling digital data stream.'
    },
    vhs_retro: {
      name: '90s VHS Camcorder',
      icon: '📼',
      desc: 'Authentic 90s tape glitch, chromatic aberration & tracking jitter.'
    },
    glow_bloom: {
      name: 'Ethereal Bloom',
      icon: '✨',
      desc: 'Dreamy soft-light diffusion, romantic mist & highlight blooming.'
    },
    fire_embers: {
      name: 'Fire Embers',
      icon: '🔥',
      desc: 'Blazing inferno heat glow with upward rising fiery spark embers.'
    },
    underwater: {
      name: 'Deep Ocean Aqua',
      icon: '🌊',
      desc: 'Deep marine cyan-teal grading, water caustics & floating bubbles.'
    },
    neon_rave: {
      name: 'Synthwave Neon',
      icon: '💜',
      desc: 'Retro 80s electric violet, hot pink aura & neon laser glow.'
    },
    polaroid_fade: {
      name: 'Vintage Polaroid',
      icon: '📸',
      desc: '1970s instant camera matte fade, lifted shadows & creamy tones.'
    },
    glitch_pulse: {
      name: 'Cyber Glitch',
      icon: '⚡',
      desc: 'RGB color displacement split, digital scan error & glitch flash.'
    },
    cinematic_moody: {
      name: 'Moody Emerald',
      icon: '🌲',
      desc: 'Deep Scandinavian forest green, desaturated cinematic gloom.'
    }
  };

  // ── Main Render Entry Point ────────────────────────────────
  function apply(ctx, w, h, time, opts = {}) {
    const {
      preset = 'none',
      intensity = 0.75,
      letterbox = false,
      particles = false
    } = opts;

    if (intensity <= 0 && !letterbox && !particles) return;

    ctx.save();

    // 1. Color Grading & Texture Layer
    switch (preset) {
      case 'black_noise':      applyBlackNoise(ctx, w, h, time, intensity); break;
      case 'noise':            applyNoise(ctx, w, h, time, intensity); break;
      case 'vintage_noise':    applyVintageNoise(ctx, w, h, time, intensity); break;
      case 'noise_2':          applyNoise2(ctx, w, h, time, intensity); break;
      case 'white_noise':      applyWhiteNoise(ctx, w, h, time, intensity); break;
      case 'noise_dust':       applyNoiseDust(ctx, w, h, time, intensity); break;
      case 'noise_1':          applyNoise1(ctx, w, h, time, intensity); break;
      case 'bw_noise':         applyBwNoise(ctx, w, h, time, intensity); break;
      case 'bw_noise_pulse':   applyBwNoisePulse(ctx, w, h, time, intensity); break;
      case 'horror':           applyHorror(ctx, w, h, time, intensity); break;
      case 'sleeping':         applySleeping(ctx, w, h, time, intensity); break;
      case 'history':          applyHistory(ctx, w, h, time, intensity); break;
      case 'documentary':      applyDocumentary(ctx, w, h, time, intensity); break;
      case 'vibrant':          applyVibrant(ctx, w, h, time, intensity); break;
      case 'fantasy':          applyFantasy(ctx, w, h, time, intensity); break;
      case 'cyberpunk':        applyCyberpunk(ctx, w, h, time, intensity); break;
      case 'bw_noir':          applyNoir(ctx, w, h, time, intensity); break;
      case 'golden_hour':      applyGoldenHour(ctx, w, h, time, intensity); break;
      case 'matrix_code':      applyMatrixCode(ctx, w, h, time, intensity); break;
      case 'vhs_retro':        applyVhsRetro(ctx, w, h, time, intensity); break;
      case 'glow_bloom':       applyGlowBloom(ctx, w, h, time, intensity); break;
      case 'fire_embers':      applyFireEmbers(ctx, w, h, time, intensity); break;
      case 'underwater':       applyUnderwater(ctx, w, h, time, intensity); break;
      case 'neon_rave':        applyNeonRave(ctx, w, h, time, intensity); break;
      case 'polaroid_fade':    applyPolaroidFade(ctx, w, h, time, intensity); break;
      case 'glitch_pulse':     applyGlitchPulse(ctx, w, h, time, intensity); break;
      case 'cinematic_moody':  applyCinematicMoody(ctx, w, h, time, intensity); break;
      default: break;
    }

    // 2. Ambient Floating Dust / Fairy Particles / Embers / Bubbles
    if (particles || preset === 'sleeping' || preset === 'fantasy' || preset === 'fire_embers' || preset === 'underwater' || preset === 'golden_hour') {
      const pIntensity = particles ? 1.0 : (preset === 'fantasy' ? 0.85 : 0.65);
      drawAmbientParticles(ctx, w, h, time, preset, pIntensity * intensity);
    }

    // 3. Cinematic Letterbox (2.35:1 widescreen bars)
    if (letterbox) {
      drawLetterbox(ctx, w, h);
    }

    ctx.restore();
  }

  // ── Noise Helper: Fast procedurally generated grain & dust ─
  function drawNoisePattern(ctx, w, h, time, density, colorR, colorG, colorB, alphaBase) {
    const numPoints = Math.round((w * h / 1200) * density);
    ctx.save();
    for (let i = 0; i < numPoints; i++) {
      const seed = Math.sin(i * 12.9898 + time * 78.233) * 43758.5453;
      const rnd = seed - Math.floor(seed);
      const seed2 = Math.cos(i * 4.898 + time * 33.123) * 23421.631;
      const rnd2 = seed2 - Math.floor(seed2);

      const x = rnd * w;
      const y = rnd2 * h;
      const sz = 1 + (i % 2);
      const a = (0.2 + (i % 5) * 0.15) * alphaBase;

      ctx.fillStyle = `rgba(${colorR}, ${colorG}, ${colorB}, ${a})`;
      ctx.fillRect(x, y, sz, sz);
    }
    ctx.restore();
  }

  // ── 1. Black Noise ─────────────────────────────────────────
  function applyBlackNoise(ctx, w, h, time, int) {
    ctx.fillStyle = `rgba(0, 0, 0, ${0.18 * int})`;
    ctx.fillRect(0, 0, w, h);
    drawNoisePattern(ctx, w, h, time, 1.8 * int, 0, 0, 0, 0.45 * int);
    const vig = ctx.createRadialGradient(w/2, h/2, w*0.35, w/2, h/2, w*0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${0.65 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 2. Classic Noise (Film Grain) ──────────────────────────
  function applyNoise(ctx, w, h, time, int) {
    drawNoisePattern(ctx, w, h, time, 1.4 * int, 20, 20, 20, 0.35 * int);
    drawNoisePattern(ctx, w, h, time + 0.1, 0.8 * int, 240, 240, 240, 0.22 * int);
  }

  // ── 3. Vintage Noise ───────────────────────────────────────
  function applyVintageNoise(ctx, w, h, time, int) {
    ctx.fillStyle = `rgba(120, 80, 40, ${0.22 * int})`;
    ctx.fillRect(0, 0, w, h);
    drawNoisePattern(ctx, w, h, time, 1.5 * int, 40, 20, 10, 0.38 * int);
    drawNoisePattern(ctx, w, h, time, 0.6 * int, 255, 240, 200, 0.25 * int);
    drawFilmArtifacts(ctx, w, h, time, int * 1.3);
  }

  // ── 4. Noise 2 (Analog Static / VHS) ──────────────────────
  function applyNoise2(ctx, w, h, time, int) {
    drawNoisePattern(ctx, w, h, time * 2, 2.2 * int, 255, 255, 255, 0.35 * int);
    drawNoisePattern(ctx, w, h, time * 2 + 1, 1.8 * int, 0, 0, 0, 0.4 * int);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.15 * int})`;
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }
  }

  // ── 5. White Noise ────────────────────────────────────────
  function applyWhiteNoise(ctx, w, h, time, int) {
    drawNoisePattern(ctx, w, h, time, 1.6 * int, 255, 255, 255, 0.32 * int);
    drawNoisePattern(ctx, w, h, time + 0.5, 0.6 * int, 220, 240, 255, 0.45 * int);
  }

  // ── 6. Noise Dust ─────────────────────────────────────────
  function applyNoiseDust(ctx, w, h, time, int) {
    drawNoisePattern(ctx, w, h, time, 0.8 * int, 240, 240, 240, 0.25 * int);
    drawFilmArtifacts(ctx, w, h, time, int * 1.5);
    drawAmbientParticles(ctx, w, h, time, 'vintage', int * 0.7);
  }

  // ── 7. Noise 1 (Subtle Fine Grain) ────────────────────────
  function applyNoise1(ctx, w, h, time, int) {
    drawNoisePattern(ctx, w, h, time, 0.9 * int, 0, 0, 0, 0.25 * int);
    drawNoisePattern(ctx, w, h, time + 0.2, 0.7 * int, 255, 255, 255, 0.18 * int);
  }

  // ── 8. BW Noise ───────────────────────────────────────────
  function applyBwNoise(ctx, w, h, time, int) {
    ctx.fillStyle = `rgba(18, 18, 20, ${0.45 * int})`;
    ctx.fillRect(0, 0, w, h);
    drawNoisePattern(ctx, w, h, time, 1.5 * int, 0, 0, 0, 0.45 * int);
    drawNoisePattern(ctx, w, h, time + 0.1, 1.2 * int, 255, 255, 255, 0.3 * int);
  }

  // ── 9. BW Noise Pulse ─────────────────────────────────────
  function applyBwNoisePulse(ctx, w, h, time, int) {
    ctx.fillStyle = `rgba(15, 15, 18, ${0.45 * int})`;
    ctx.fillRect(0, 0, w, h);
    drawNoisePattern(ctx, w, h, time, 1.4 * int, 0, 0, 0, 0.4 * int);
    drawNoisePattern(ctx, w, h, time, 1.0 * int, 255, 255, 255, 0.3 * int);
    const pulse = 0.5 + Math.sin(time * 3.5) * 0.25;
    const vig = ctx.createRadialGradient(w/2, h/2, w*0.2, w/2, h/2, w*0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${pulse * 0.85 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 10. HORROR & THRILLER ──────────────────────────────────
  function applyHorror(ctx, w, h, time, int) {
    ctx.fillStyle = `rgba(10, 25, 35, ${0.35 * int})`;
    ctx.fillRect(0, 0, w, h);

    const grad = ctx.createRadialGradient(w/2, h/2, w*0.25, w/2, h/2, w*0.75);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, `rgba(0,5,10,${0.45 * int})`);
    grad.addColorStop(1, `rgba(0,0,0,${0.92 * int})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const fog = ctx.createLinearGradient(0, h * 0.65, 0, h);
    fog.addColorStop(0, 'rgba(15,25,35,0)');
    fog.addColorStop(1, `rgba(15,35,45,${0.4 * int})`);
    ctx.fillStyle = fog;
    ctx.fillRect(0, h * 0.65, w, h * 0.35);

    const flicker = Math.sin(time * 8.5) * Math.cos(time * 3.2);
    if (flicker > 0.7) {
      ctx.fillStyle = `rgba(0,0,0,${0.15 * int})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ── 11. SLEEPING STORIES / BEDTIME ─────────────────────────
  function applySleeping(ctx, w, h, time, int) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, `rgba(30, 45, 90, ${0.28 * int})`);
    sky.addColorStop(1, `rgba(70, 50, 40, ${0.22 * int})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const moonGlow = ctx.createRadialGradient(w/2, h*0.4, w*0.1, w/2, h*0.4, w*0.65);
    moonGlow.addColorStop(0, `rgba(255, 240, 200, ${0.18 * int})`);
    moonGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(w/2, h/2, w*0.35, w/2, h/2, w*0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(10, 15, 30, ${0.65 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 12. VINTAGE HISTORY & ARCHIVAL ─────────────────────────
  function applyHistory(ctx, w, h, time, int) {
    ctx.fillStyle = `rgba(115, 75, 35, ${0.32 * int})`;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(w/2, h/2, w*0.28, w/2, h/2, w*0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.7, `rgba(45, 25, 10, ${0.45 * int})`);
    vig.addColorStop(1, `rgba(20, 10, 5, ${0.85 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    drawFilmArtifacts(ctx, w, h, time, int);
  }

  // ── 13. DOCUMENTARY & CINEMA 4K ────────────────────────────
  function applyDocumentary(ctx, w, h, time, int) {
    const grade = ctx.createLinearGradient(0, 0, w, h);
    grade.addColorStop(0, `rgba(0, 140, 160, ${0.22 * int})`);
    grade.addColorStop(1, `rgba(255, 140, 40, ${0.18 * int})`);
    ctx.fillStyle = grade;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(w/2, h/2, w*0.4, w/2, h/2, w*0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${0.6 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 14. VIBRANT CARTOON / STICKY POP ───────────────────────
  function applyVibrant(ctx, w, h, time, int) {
    const punch = ctx.createRadialGradient(w*0.5, h*0.3, w*0.2, w*0.5, h*0.5, w*0.8);
    punch.addColorStop(0, `rgba(255, 200, 50, ${0.16 * int})`);
    punch.addColorStop(1, `rgba(255, 60, 120, ${0.12 * int})`);
    ctx.fillStyle = punch;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(w/2, h/2, w*0.45, w/2, h/2, w*0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(30, 10, 40, ${0.45 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 15. FANTASY & MAGIC ────────────────────────────────────
  function applyFantasy(ctx, w, h, time, int) {
    const aura = ctx.createLinearGradient(0, 0, w, h);
    aura.addColorStop(0, `rgba(160, 60, 240, ${0.22 * int})`);
    aura.addColorStop(0.5, `rgba(255, 215, 0, ${0.15 * int})`);
    aura.addColorStop(1, `rgba(50, 180, 255, ${0.18 * int})`);
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);

    const bloom = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w*0.55);
    bloom.addColorStop(0, `rgba(255, 250, 220, ${0.2 * int})`);
    bloom.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(w/2, h/2, w*0.35, w/2, h/2, w*0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(20, 5, 40, ${0.68 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 16. NEON CYBERPUNK / SCI-FI ────────────────────────────
  function applyCyberpunk(ctx, w, h, time, int) {
    const cyan = ctx.createLinearGradient(0, 0, w*0.6, h*0.6);
    cyan.addColorStop(0, `rgba(0, 240, 255, ${0.25 * int})`);
    cyan.addColorStop(1, 'rgba(0, 240, 255, 0)');
    ctx.fillStyle = cyan;
    ctx.fillRect(0, 0, w, h);

    const mag = ctx.createLinearGradient(w, h, w*0.4, h*0.4);
    mag.addColorStop(0, `rgba(255, 0, 128, ${0.28 * int})`);
    mag.addColorStop(1, 'rgba(255, 0, 128, 0)');
    ctx.fillStyle = mag;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = `rgba(0, 0, 0, ${0.12 * int})`;
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1.5);
    }
  }

  // ── 17. NOIR B&W ───────────────────────────────────────────
  function applyNoir(ctx, w, h, time, int) {
    ctx.fillStyle = `rgba(15, 15, 18, ${0.4 * int})`;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(w/2, h/2, w*0.25, w/2, h/2, w*0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${0.85 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 18. GOLDEN HOUR SUNFLARE ──────────────────────────────
  function applyGoldenHour(ctx, w, h, time, int) {
    const sunGrad = ctx.createRadialGradient(w * 0.15, h * 0.15, 0, w * 0.15, h * 0.15, w * 0.85);
    sunGrad.addColorStop(0, `rgba(255, 230, 150, ${0.45 * int})`);
    sunGrad.addColorStop(0.3, `rgba(255, 140, 40, ${0.28 * int})`);
    sunGrad.addColorStop(1, `rgba(180, 50, 0, ${0.12 * int})`);
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, h);

    const warmVig = ctx.createRadialGradient(w/2, h/2, w*0.35, w/2, h/2, w*0.75);
    warmVig.addColorStop(0, 'rgba(0,0,0,0)');
    warmVig.addColorStop(1, `rgba(70, 30, 5, ${0.55 * int})`);
    ctx.fillStyle = warmVig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 19. MATRIX DIGITAL CODE ────────────────────────────────
  function applyMatrixCode(ctx, w, h, time, int) {
    ctx.fillStyle = `rgba(0, 35, 15, ${0.38 * int})`;
    ctx.fillRect(0, 0, w, h);

    const numCols = Math.max(10, Math.floor(w / 35));
    for (let c = 0; c < numCols; c++) {
      const colX = (c * (w / numCols)) + 8;
      const speed = 60 + (c % 7) * 25;
      const streamY = (time * speed + c * 83) % (h + 80) - 40;
      for (let dot = 0; dot < 8; dot++) {
        const dotY = streamY - dot * 12;
        if (dotY > 0 && dotY < h) {
          const alpha = (1 - dot / 8) * 0.45 * int;
          ctx.fillStyle = dot === 0 ? `rgba(220, 255, 220, ${0.85 * int})` : `rgba(0, 255, 120, ${alpha})`;
          ctx.fillRect(colX, dotY, 3, 7);
        }
      }
    }

    const vig = ctx.createRadialGradient(w/2, h/2, w*0.3, w/2, h/2, w*0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0, 20, 5, ${0.85 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 20. 90s VHS CAMCORDER ──────────────────────────────────
  function applyVhsRetro(ctx, w, h, time, int) {
    // RGB Chromatic Aberration Simulation
    const shift = Math.sin(time * 6) * 3 * int;
    ctx.fillStyle = `rgba(255, 0, 80, ${0.08 * int})`;
    ctx.fillRect(shift, 0, w, h);
    ctx.fillStyle = `rgba(0, 220, 255, ${0.08 * int})`;
    ctx.fillRect(-shift, 0, w, h);

    // CRT Scanlines
    ctx.fillStyle = `rgba(0, 0, 0, ${0.18 * int})`;
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }

    // VHS Tracking Noise Bar
    const trackY = (time * 120) % (h + 100) - 50;
    if (trackY > 0 && trackY < h) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.22 * int})`;
      ctx.fillRect(0, trackY, w, 6);
      drawNoisePattern(ctx, w, 20, time, 2.5 * int, 255, 255, 255, 0.4 * int);
    }
  }

  // ── 21. ETHEREAL GLOW & BLOOM ──────────────────────────────
  function applyGlowBloom(ctx, w, h, time, int) {
    const aura = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w*0.65);
    aura.addColorStop(0, `rgba(255, 245, 235, ${0.28 * int})`);
    aura.addColorStop(0.5, `rgba(255, 210, 180, ${0.16 * int})`);
    aura.addColorStop(1, `rgba(180, 140, 200, ${0.08 * int})`);
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);

    const softPulse = 0.5 + Math.sin(time * 2.2) * 0.15;
    ctx.fillStyle = `rgba(255, 255, 255, ${softPulse * 0.12 * int})`;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 22. BURNING FIRE EMBERS ────────────────────────────────
  function applyFireEmbers(ctx, w, h, time, int) {
    const fireGrad = ctx.createLinearGradient(0, h, 0, 0);
    fireGrad.addColorStop(0, `rgba(255, 50, 0, ${0.42 * int})`);
    fireGrad.addColorStop(0.35, `rgba(255, 120, 0, ${0.22 * int})`);
    fireGrad.addColorStop(0.7, `rgba(80, 20, 0, ${0.1 * int})`);
    fireGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fireGrad;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(w/2, h/2, w*0.3, w/2, h/2, w*0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(35, 5, 0, ${0.75 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 23. DEEP OCEAN AQUA ────────────────────────────────────
  function applyUnderwater(ctx, w, h, time, int) {
    const ocean = ctx.createLinearGradient(0, 0, 0, h);
    ocean.addColorStop(0, `rgba(0, 180, 210, ${0.3 * int})`);
    ocean.addColorStop(0.5, `rgba(0, 100, 160, ${0.35 * int})`);
    ocean.addColorStop(1, `rgba(2, 25, 60, ${0.65 * int})`);
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, w, h);

    // Caustic Light Shimmer
    const shimmer = Math.sin(time * 3) * 0.5 + 0.5;
    const caustic = ctx.createRadialGradient(w*0.5, h*0.2, 0, w*0.5, h*0.2, w*0.6);
    caustic.addColorStop(0, `rgba(180, 255, 255, ${shimmer * 0.18 * int})`);
    caustic.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = caustic;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 24. SYNTHWAVE NEON ─────────────────────────────────────
  function applyNeonRave(ctx, w, h, time, int) {
    const synth = ctx.createLinearGradient(0, 0, w, h);
    synth.addColorStop(0, `rgba(147, 51, 234, ${0.32 * int})`);
    synth.addColorStop(0.5, `rgba(236, 72, 153, ${0.22 * int})`);
    synth.addColorStop(1, `rgba(6, 182, 212, ${0.28 * int})`);
    ctx.fillStyle = synth;
    ctx.fillRect(0, 0, w, h);

    const pulse = Math.sin(time * 4) * 0.1 + 0.9;
    const vig = ctx.createRadialGradient(w/2, h/2, w*0.35, w/2, h/2, w*0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(20, 5, 35, ${pulse * 0.72 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── 25. VINTAGE POLAROID ───────────────────────────────────
  function applyPolaroidFade(ctx, w, h, time, int) {
    ctx.fillStyle = `rgba(245, 235, 215, ${0.15 * int})`;
    ctx.fillRect(0, 0, w, h);

    const fade = ctx.createRadialGradient(w/2, h/2, w*0.3, w/2, h/2, w*0.75);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, `rgba(50, 45, 40, ${0.45 * int})`);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);

    drawNoisePattern(ctx, w, h, time, 0.7 * int, 180, 160, 140, 0.22 * int);
  }

  // ── 26. CYBER GLITCH ───────────────────────────────────────
  function applyGlitchPulse(ctx, w, h, time, int) {
    const glitchSeed = Math.sin(time * 15) * Math.cos(time * 23);
    if (glitchSeed > 0.45) {
      const splitX = Math.sin(time * 40) * 12 * int;
      ctx.fillStyle = `rgba(255, 0, 50, ${0.16 * int})`;
      ctx.fillRect(splitX, 0, w, h);
      ctx.fillStyle = `rgba(0, 255, 255, ${0.16 * int})`;
      ctx.fillRect(-splitX, 0, w, h);

      // Random Glitch Block
      const blockY = (Math.abs(Math.sin(time * 9)) * h);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.28 * int})`;
      ctx.fillRect(0, blockY, w, 14);
    }
  }

  // ── 27. MOODY SCANDINAVIAN EMERALD ─────────────────────────
  function applyCinematicMoody(ctx, w, h, time, int) {
    ctx.fillStyle = `rgba(12, 35, 28, ${0.38 * int})`;
    ctx.fillRect(0, 0, w, h);

    const coolShadow = ctx.createLinearGradient(0, 0, 0, h);
    coolShadow.addColorStop(0, `rgba(10, 40, 35, ${0.25 * int})`);
    coolShadow.addColorStop(1, `rgba(5, 18, 20, ${0.65 * int})`);
    ctx.fillStyle = coolShadow;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(w/2, h/2, w*0.28, w/2, h/2, w*0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0, 12, 10, ${0.88 * int})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  // ── Helpers: Film Grain & Scratch Artifacts ────────────────
  function drawFilmArtifacts(ctx, w, h, time, int) {
    const numScratches = 4;
    ctx.strokeStyle = `rgba(255, 245, 220, ${0.25 * int})`;
    ctx.lineWidth = 1;

    for (let i = 0; i < numScratches; i++) {
      const seed = (time * 12 + i * 137.5) % 100;
      if (seed < 40) {
        const x = ((time * 73 + i * 293) % w);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (Math.sin(time + i) * 8), h);
        ctx.stroke();
      }
    }
  }

  // ── Helpers: Ambient Floating Particles / Star Dust / Embers / Bubbles ──
  function drawAmbientParticles(ctx, w, h, time, preset, int) {
    if (int <= 0) return;

    const count = 30;
    const isGold = preset === 'fantasy' || preset === 'golden_hour';
    const isPastel = preset === 'sleeping';
    const isFire = preset === 'fire_embers';
    const isOcean = preset === 'underwater';

    for (let i = 0; i < count; i++) {
      const speed = 0.08 + (i % 5) * 0.05;
      const x = (Math.sin(i * 99 + time * 0.6) * 0.5 + 0.5) * w;
      const y = isFire || isOcean
        ? ((time * speed * 60 + i * (h / count)) % h)
        : ((time * speed * 40 + i * (h / count)) % h);

      const size = 1.5 + (i % 3) * 1.6;
      const alpha = (Math.sin(time * 2 + i) * 0.3 + 0.6) * int;

      ctx.save();
      ctx.beginPath();
      ctx.arc(x, h - y, size, 0, Math.PI * 2);

      if (isFire) {
        ctx.fillStyle = `rgba(255, ${120 + (i % 80)}, 30, ${alpha * 0.9})`;
        ctx.shadowColor = '#ff4500';
        ctx.shadowBlur = 10;
      } else if (isOcean) {
        ctx.fillStyle = `rgba(180, 240, 255, ${alpha * 0.65})`;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (isGold) {
        ctx.fillStyle = `rgba(255, 220, 100, ${alpha * 0.85})`;
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 8;
      } else if (isPastel) {
        ctx.fillStyle = `rgba(220, 240, 255, ${alpha * 0.75})`;
        ctx.shadowColor = '#99ccff';
        ctx.shadowBlur = 6;
      } else {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
      }

      ctx.fill();
      ctx.restore();
    }
  }

  // ── Helpers: Cinematic Letterbox Bars (2.35:1) ─────────────
  function drawLetterbox(ctx, w, h) {
    const barHeight = Math.round(h * 0.11);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, barHeight);
    ctx.fillRect(0, h - barHeight, w, barHeight);
  }

  // ── Generate Thumbnail Sample Texture ─────────────────────
  let fxSampleCanvas = null;

  function getFxSampleCanvas() {
    if (!fxSampleCanvas) {
      fxSampleCanvas = document.createElement('canvas');
      fxSampleCanvas.width = 100;
      fxSampleCanvas.height = 70;
      const sc = fxSampleCanvas.getContext('2d');

      // Modern Studio Backdrop (Teal to Deep Blue Gradient)
      const bg = sc.createLinearGradient(0, 0, 100, 70);
      bg.addColorStop(0, '#0ea5e9');
      bg.addColorStop(0.6, '#0284c7');
      bg.addColorStop(1, '#0369a1');
      sc.fillStyle = bg;
      sc.fillRect(0, 0, 100, 70);

      // Soft circular backdrop glow
      const glow = sc.createRadialGradient(50, 32, 0, 50, 32, 36);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
      sc.fillStyle = glow;
      sc.fillRect(0, 0, 100, 70);

      // Centered Character Head
      sc.fillStyle = '#ffffff';
      sc.beginPath();
      sc.arc(50, 22, 9, 0, Math.PI * 2);
      sc.fill();

      // Sunglasses
      sc.fillStyle = '#0f172a';
      sc.fillRect(45, 20, 10, 3);

      // White Upper Torso / Shirt
      sc.fillStyle = '#f8fafc';
      sc.beginPath();
      sc.moveTo(38, 33);
      sc.lineTo(62, 33);
      sc.lineTo(65, 52);
      sc.lineTo(35, 52);
      sc.closePath();
      sc.fill();

      // Dark Jacket / Outline
      sc.strokeStyle = '#0f172a';
      sc.lineWidth = 2;
      sc.beginPath();
      sc.moveTo(35, 52);
      sc.lineTo(38, 33);
      sc.lineTo(62, 33);
      sc.lineTo(65, 52);
      sc.stroke();

      // Skateboard deck / lower accent
      sc.fillStyle = '#0f172a';
      sc.fillRect(32, 54, 36, 5);
    }
    return fxSampleCanvas;
  }

  // ── Render Live FX Preview on Mini Canvas ─────────────────
  function renderThumbnail(canvas, presetKey, time = 0) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const sample = getFxSampleCanvas();

    // 1. Draw base sample texture
    ctx.drawImage(sample, 0, 0, w, h);

    // 2. Apply effect
    apply(ctx, w, h, time, {
      preset: presetKey,
      intensity: 0.85,
      letterbox: false,
      particles: presetKey === 'fantasy' || presetKey === 'sleeping'
    });
  }

  return {
    PRESETS,
    apply,
    renderThumbnail
  };
})();
