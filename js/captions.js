/* ============================================================
   CAPTIONS.JS — Dynamic Moving Karaoke Highlighting, Classic Clean Presets & Line Transitions
   ============================================================ */

window.CaptionStyles = (function () {

  const PRESETS = {
    poppins_yellow: {
      name: 'Poppins Yellow',
      icon: '⭐',
      sample: 'THE QUICK BROWN FOX',
      font: 'Poppins',
      baseCol: '#FFFFFF',
      highlightCol: '#FFE600',
      strokeCol: '#000000',
      strokeWidth: 4,
      glowCol: '#FFE600',
      glowBlur: 6,
      anim: 'karaoke_pop',
      desc: 'Moving yellow word tracking with clean black drop shadow.'
    },
    classic_clean_white: {
      name: 'Classic Minimal White',
      icon: '⚪',
      sample: 'The quick brown fox',
      font: 'Poppins',
      baseCol: '#FFFFFF',
      highlightCol: '#FFFFFF',
      strokeCol: '#000000',
      strokeWidth: 3,
      glowCol: '#000000',
      glowBlur: 0,
      shadowBlur: 6,
      anim: 'static',
      isStatic: true,
      desc: 'Classic clean white subtitles with soft drop shadow (BBC/Netflix style).'
    },
    classic_clean_yellow: {
      name: 'Broadcast Classic Yellow',
      icon: '🟡',
      sample: 'The quick brown fox',
      font: 'Poppins',
      baseCol: '#FFE853',
      highlightCol: '#FFE853',
      strokeCol: '#000000',
      strokeWidth: 4,
      glowCol: '#FFE853',
      glowBlur: 0,
      shadowBlur: 6,
      anim: 'static',
      isStatic: true,
      desc: 'Documentary yellow text with solid black outline & uniform clean lines.'
    },
    cinematic_minimal_box: {
      name: 'Cinema Sub-Box Backdrop',
      icon: '⬛',
      sample: 'The quick brown fox',
      font: 'Inter',
      baseCol: '#FFFFFF',
      highlightCol: '#FFFFFF',
      tagCol: 'rgba(0, 0, 0, 0.75)',
      strokeCol: '#000000',
      strokeWidth: 0,
      glowCol: '#000000',
      glowBlur: 0,
      shadowBlur: 4,
      anim: 'static',
      isStatic: true,
      desc: 'Clean white subtitles enclosed in a subtle semi-transparent black cinema backdrop.'
    },
    classic_clean_outline: {
      name: 'Clean Outline Minimal',
      icon: '🔲',
      sample: 'The quick brown fox',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#FFFFFF',
      strokeCol: '#000000',
      strokeWidth: 5,
      glowCol: '#000000',
      glowBlur: 0,
      shadowBlur: 0,
      anim: 'static',
      isStatic: true,
      desc: 'High-contrast white font with solid bold black border.'
    },
    classic_elegant_serif: {
      name: 'Timeless Classic Serif',
      icon: '📜',
      sample: 'The quick brown fox',
      font: 'Merriweather',
      baseCol: '#F8FAFC',
      highlightCol: '#F8FAFC',
      strokeCol: '#0f172a',
      strokeWidth: 2,
      glowCol: '#0f172a',
      glowBlur: 0,
      shadowBlur: 8,
      anim: 'static',
      isStatic: true,
      desc: 'Classic cinematic storybook typography with soft contrast ambient shadow.'
    },
    broadcast_lower_third: {
      name: 'Broadcast Lower Third',
      icon: '📺',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#FFFFFF',
      strokeCol: '#000000',
      strokeWidth: 3,
      glowCol: '#06b6d4',
      glowBlur: 4,
      anim: 'static',
      isStatic: true,
      desc: 'Modern broadcast uppercase subtitles with subtle bottom cyan accent.'
    },
    montserrat_white: {
      name: 'Montserrat White',
      icon: '🔲',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#E2E8F0',
      highlightCol: '#FFFFFF',
      strokeCol: '#000000',
      strokeWidth: 5,
      glowCol: '#FFFFFF',
      glowBlur: 8,
      anim: 'karaoke_pop',
      desc: 'Crisp white text with solid black outline & kinetic active word pop.'
    },
    mrbeast_viral: {
      name: 'MrBeast Viral',
      icon: '⚡',
      sample: 'THE QUICK BROWN FOX',
      font: 'Poppins',
      baseCol: '#FFFFFF',
      highlightCol: '#FFE600',
      strokeCol: '#000000',
      strokeWidth: 6,
      glowCol: '#FFE600',
      glowBlur: 10,
      anim: 'karaoke_pop',
      desc: 'High-energy yellow with explosive word pop & angled offset shadow.'
    },
    purple_box: {
      name: 'Purple Tag Box',
      icon: '🟣',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#FFFFFF',
      tagCol: '#7e22ce',
      strokeCol: '#000000',
      strokeWidth: 0,
      glowCol: '#a855f7',
      glowBlur: 8,
      anim: 'pill_slide',
      desc: 'Active spoken word is dynamically encapsulated in a sleek purple pill tag.'
    },
    pink_neon: {
      name: 'Pink Neon Bold',
      icon: '💖',
      sample: 'LE RAPIDE RENARD BRUN',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#FF2D55',
      strokeCol: '#1e0510',
      strokeWidth: 2,
      glowCol: '#f43f5e',
      glowBlur: 16,
      anim: 'neon_sweep',
      desc: 'Spoken words ignite in hot glowing neon magenta with dynamic light pulse.'
    },
    cyan_minimal: {
      name: 'Cyan Minimal',
      icon: '💠',
      sample: 'THE QUICK BROWN FOX',
      font: 'Poppins',
      baseCol: '#E0F2FE',
      highlightCol: '#00F0FF',
      strokeCol: '#082f49',
      strokeWidth: 2,
      glowCol: '#06b6d4',
      glowBlur: 14,
      anim: 'neon_sweep',
      desc: 'Modern rounded sans with glowing electric cyan active word tracking.'
    },
    yellow_keyword: {
      name: 'Yellow Keyword',
      icon: '🌟',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#FFE600',
      strokeCol: '#000000',
      strokeWidth: 3,
      glowCol: '#FFE600',
      glowBlur: 8,
      anim: 'karaoke_pop',
      desc: 'Spoken words pop in bright vivid yellow as the sentence advances.'
    },
    golden_bloom: {
      name: 'Golden Bloom',
      icon: '✨',
      sample: 'THE QUICK BROWN FOX',
      font: 'Merriweather',
      baseCol: '#FEF3C7',
      highlightCol: '#FFFBEB',
      strokeCol: '#451a03',
      strokeWidth: 2,
      glowCol: '#ffd700',
      glowBlur: 18,
      anim: 'gold_bloom',
      desc: 'Dreamy soft diffused gold aura with pulsating ethereal light on active words.'
    },
    gold_neon: {
      name: 'Gold Neon Halo',
      icon: '👑',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#EAB308',
      strokeCol: '#eab308',
      strokeWidth: 3,
      glowCol: '#eab308',
      glowBlur: 12,
      anim: 'neon_sweep',
      desc: 'Golden neon perimeter outline halo with dark contrast core.'
    },
    green_pop: {
      name: 'Green Pop Keyword',
      icon: '🟢',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#22C55E',
      strokeCol: '#052e16',
      strokeWidth: 3,
      glowCol: '#22c55e',
      glowBlur: 12,
      anim: 'karaoke_pop',
      desc: 'Electric green punch highlight tracking spoken words with dynamic bounce.'
    },
    red_accent: {
      name: 'Red Lead Accent',
      icon: '🔴',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#EF4444',
      strokeCol: '#450a0a',
      strokeWidth: 3,
      glowCol: '#ef4444',
      glowBlur: 10,
      anim: 'karaoke_pop',
      desc: 'Bold crimson red punch scale tracking currently spoken words.'
    },
    yellow_lead: {
      name: 'Yellow Lead Modern',
      icon: '🟡',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#F1F5F9',
      highlightCol: '#FBBF24',
      strokeCol: '#000000',
      strokeWidth: 3,
      glowCol: '#fbbf24',
      glowBlur: 10,
      anim: 'karaoke_pop',
      desc: 'Bright amber-yellow highlight sweeping seamlessly across words.'
    },
    lime_green: {
      name: 'Lime Green Split',
      icon: '🟩',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#84CC16',
      strokeCol: '#1a2e05',
      strokeWidth: 3,
      glowCol: '#84cc16',
      glowBlur: 12,
      anim: 'neon_sweep',
      desc: 'High-contrast white body with electric lime green active word pulse.'
    },
    editorial_serif: {
      name: 'Editorial Serif',
      icon: '📰',
      sample: 'The quick brown fox',
      font: 'Merriweather',
      baseCol: '#FFFFFF',
      highlightCol: '#FDE68A',
      strokeCol: '#000000',
      strokeWidth: 2,
      glowCol: '#fde68a',
      glowBlur: 8,
      anim: 'gold_bloom',
      desc: 'Sophisticated editorial serif with warm golden active word aura.'
    },
    golden_serif: {
      name: 'Golden Story Serif',
      icon: '📜',
      sample: 'The quick brown fox',
      font: 'Merriweather',
      baseCol: '#FDE68A',
      highlightCol: '#FFFBEB',
      strokeCol: '#78350f',
      strokeWidth: 2,
      glowCol: '#ffd700',
      glowBlur: 12,
      anim: 'gold_bloom',
      desc: 'Archival warm gold serif with soft ambient glow tracking.'
    },
    cartoon_bubble: {
      name: 'Cartoon Bubble',
      icon: '🗯️',
      sample: 'THE QUICK BROWN FOX',
      font: 'Poppins',
      baseCol: '#FFFFFF',
      highlightCol: '#FFE600',
      strokeCol: '#000000',
      strokeWidth: 7,
      glowCol: '#000000',
      glowBlur: 0,
      anim: 'bounce_jump',
      desc: 'Comic bubble rounded white text with thick black outline & active word jump.'
    },
    magenta_pop: {
      name: 'Magenta Accent',
      icon: '🌸',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#EC4899',
      strokeCol: '#500724',
      strokeWidth: 3,
      glowCol: '#ec4899',
      glowBlur: 12,
      anim: 'neon_sweep',
      desc: 'Hot magenta pop glow tracking spoken words.'
    },
    yellow_sticker: {
      name: 'Yellow Sticker',
      icon: '🏷️',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#000000',
      tagCol: '#EAB308',
      strokeCol: '#000000',
      strokeWidth: 0,
      glowCol: '#eab308',
      glowBlur: 8,
      anim: 'pill_slide',
      desc: 'Tilted bright yellow sticker badge following the active spoken word.'
    },
    cinema_pill: {
      name: 'Netflix Cinema',
      icon: '🎬',
      sample: 'The quick brown fox',
      font: 'Inter',
      baseCol: '#E2E8F0',
      highlightCol: '#FFFFFF',
      tagCol: 'rgba(0, 0, 0, 0.85)',
      strokeCol: '#000000',
      strokeWidth: 0,
      glowCol: '#FFFFFF',
      glowBlur: 6,
      anim: 'karaoke_pop',
      desc: 'Translucent cinema pill container with glowing active word highlighting.'
    },
    keyword_highlight: {
      name: 'Cyan Plate Box',
      icon: '🎯',
      sample: 'THE QUICK BROWN FOX',
      font: 'Montserrat',
      baseCol: '#FFFFFF',
      highlightCol: '#00F0FF',
      tagCol: 'rgba(10, 14, 24, 0.88)',
      strokeCol: '#00F0FF',
      strokeWidth: 1.5,
      glowCol: '#00F0FF',
      glowBlur: 10,
      anim: 'karaoke_pop',
      desc: 'High-tech dark plate with cyan neon perimeter tracking.'
    },
    // ── Urdu-safe presets ────────────────────────────────────────
    // Each uses a font loaded by index.html with proper Urdu/Arabic glyph
    // coverage, so captions do not fall back to a mismatched Latin font.
    urdu_nastaliq_classic: {
      name: 'Urdu Nastaliq Classic', icon: '🖋️', sample: 'یہ ایک خوبصورت کہانی ہے',
      font: 'Noto Nastaliq Urdu', baseCol: '#FFFFFF', highlightCol: '#FDE68A',
      strokeCol: '#0B1020', strokeWidth: 2, glowCol: '#F59E0B', glowBlur: 7,
      anim: 'karaoke_pop', desc: 'Refined white Nastaliq with a warm gold active word.'
    },
    urdu_nastaliq_gold: {
      name: 'Urdu Royal Gold', icon: '👑', sample: 'یہ ایک خوبصورت کہانی ہے',
      font: 'Noto Nastaliq Urdu', baseCol: '#FEF3C7', highlightCol: '#FFFFFF',
      strokeCol: '#451A03', strokeWidth: 2, glowCol: '#EAB308', glowBlur: 12,
      anim: 'gold_bloom', desc: 'Premium gold Nastaliq for historical and storytelling videos.'
    },
    urdu_naskh_clean: {
      name: 'Urdu Naskh Clean', icon: '📖', sample: 'یہ ایک خوبصورت کہانی ہے',
      font: 'Noto Naskh Arabic', baseCol: '#FFFFFF', highlightCol: '#FFFFFF',
      strokeCol: '#000000', strokeWidth: 3, glowCol: '#000000', glowBlur: 0,
      shadowBlur: 6, anim: 'static', isStatic: true,
      desc: 'High-legibility Naskh subtitles for tutorials and talking videos.'
    },
    urdu_naskh_yellow: {
      name: 'Urdu Broadcast Yellow', icon: '📺', sample: 'یہ ایک خوبصورت کہانی ہے',
      font: 'Noto Naskh Arabic', baseCol: '#FFE853', highlightCol: '#FFFFFF',
      strokeCol: '#111111', strokeWidth: 3, glowCol: '#FBBF24', glowBlur: 5,
      anim: 'karaoke_pop', desc: 'Broadcast yellow Naskh with a clear white active word.'
    },
    urdu_sans_modern: {
      name: 'Urdu Modern Sans', icon: '✨', sample: 'یہ ایک خوبصورت کہانی ہے',
      font: 'Noto Sans Arabic', baseCol: '#F8FAFC', highlightCol: '#22D3EE',
      strokeCol: '#082F49', strokeWidth: 2, glowCol: '#06B6D4', glowBlur: 10,
      anim: 'neon_sweep', desc: 'Crisp modern Urdu sans for tech, news, and reels.'
    },
    urdu_amiri_story: {
      name: 'Urdu Amiri Story', icon: '📜', sample: 'یہ ایک خوبصورت کہانی ہے',
      font: 'Amiri', baseCol: '#F8FAFC', highlightCol: '#FDE68A',
      strokeCol: '#1E293B', strokeWidth: 2, glowCol: '#D97706', glowBlur: 8,
      anim: 'gold_bloom', desc: 'Classic Amiri editorial look for calm narration and stories.'
    },
    urdu_gulzar_pill: {
      name: 'Urdu Gulzar Tag', icon: '🟣', sample: 'یہ ایک خوبصورت کہانی ہے',
      font: 'Gulzar', baseCol: '#FFFFFF', highlightCol: '#FFFFFF', tagCol: '#6D28D9',
      strokeCol: '#000000', strokeWidth: 0, glowCol: '#A855F7', glowBlur: 8,
      anim: 'pill_slide', desc: 'Contemporary Urdu display type with a purple active-word tag.'
    },
    urdu_markazi_news: {
      name: 'Urdu Markazi News', icon: '📰', sample: 'یہ ایک خوبصورت کہانی ہے',
      font: 'Markazi Text', baseCol: '#FFFFFF', highlightCol: '#38BDF8',
      strokeCol: '#0C4A6E', strokeWidth: 2, glowCol: '#0EA5E9', glowBlur: 8,
      anim: 'karaoke_pop', desc: 'Sharp Markazi Text news-style captions with cyan emphasis.'
    },
    urdu_lateef_soft: {
      name: 'Urdu Lateef Soft', icon: '🌙', sample: 'یہ ایک خوبصورت کہانی ہے',
      font: 'Lateef', baseCol: '#FFFFFF', highlightCol: '#F9A8D4',
      strokeCol: '#500724', strokeWidth: 2, glowCol: '#EC4899', glowBlur: 9,
      anim: 'neon_sweep', desc: 'Soft elegant Urdu captions for lifestyle and emotional stories.'
    },
    urdu_scheherazade_literary: {
      name: 'Urdu Literary Ink', icon: '🪶', sample: 'یہ ایک خوبصورت کہانی ہے',
      font: 'Scheherazade New', baseCol: '#F8FAFC', highlightCol: '#FFFFFF',
      strokeCol: '#111827', strokeWidth: 2, glowCol: '#94A3B8', glowBlur: 5,
      anim: 'static', isStatic: true,
      desc: 'Literary Scheherazade Naskh for poetry, quotes, and serious narration.'
    },
    custom: {
      name: 'Custom User Style',
      icon: '🛠️',
      sample: 'THE QUICK BROWN FOX',
      font: 'Poppins',
      baseCol: '#FFFFFF',
      highlightCol: '#FFDE00',
      strokeCol: '#000000',
      strokeWidth: 4,
      glowCol: '#FFDE00',
      glowBlur: 8,
      anim: 'karaoke_pop',
      desc: 'Fully customizable colors, stroke, glow, shadow, and word animation.'
    }
  };

  // ── Helper: Draw Rounded Rect ───────────────────────────────
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

  // ── Main Caption Render Engine ──────────────────────────────
  function render(ctx, text, targetX, targetY, w, h, opts = {}) {
    const {
      preset = 'poppins_yellow',
      fontPick = 'Poppins',
      userCol,
      highlightCol,
      strokeCol,
      strokeWidth,
      glowCol,
      glowBlur,
      shadowBlur,
      animStyle,
      lineAnim = 'fade_in',
      textCase = 'uppercase',
      align = 'center',
      scale = 1.0,
      linesCount = 'auto',
      wordsPerLine = 0,
      wordSpacing = 0,
      lineSpacing = 1.30,
      direction = 'auto',
      isDragging = false,
      isThumbnail = false,
      time = 0,
      startTime = 0,
      endTime = 0
    } = opts;

    if (!text || !text.trim()) return null;

    const presetDef = PRESETS[preset] || PRESETS.poppins_yellow;
    const isStaticPreset = opts.strictControls ? (animStyle === 'static') : (presetDef.isStatic || (animStyle === 'static'));

    // Apply User Overrides or Preset Defaults
    const effFont        = fontPick || presetDef.font || 'Poppins';
    const effBaseCol     = userCol || presetDef.baseCol || '#FFFFFF';
    const effHlCol       = isStaticPreset ? effBaseCol : (highlightCol || presetDef.highlightCol || '#FFE600');
    const effStrokeCol   = strokeCol !== undefined ? strokeCol : (presetDef.strokeCol || '#000000');
    const effStrokeW     = strokeWidth !== undefined ? strokeWidth : (presetDef.strokeWidth !== undefined ? presetDef.strokeWidth : 4);
    const effGlowCol     = glowCol || presetDef.glowCol || effHlCol;
    const effGlowBlur    = glowBlur !== undefined ? glowBlur : (presetDef.glowBlur !== undefined ? presetDef.glowBlur : 8);
    const effShadowBlur  = shadowBlur !== undefined ? shadowBlur : (presetDef.shadowBlur !== undefined ? presetDef.shadowBlur : 6);
    const effAnimStyle   = isStaticPreset ? 'static' : (animStyle || presetDef.anim || 'karaoke_pop');
    const effLineAnim    = lineAnim || 'fade_in';

    // Strip any HTML/ASS formatting and apply text case
    let processedText = text.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').trim();
    if (textCase === 'uppercase') {
      processedText = processedText.toUpperCase();
    } else if (textCase === 'titlecase' || (opts.strictControls && textCase === 'title')) {
      processedText = processedText.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
    } else if (opts.strictControls && textCase === 'lowercase') {
      processedText = processedText.toLowerCase();
    }
    const isRtl = direction === 'rtl' || (direction === 'auto' && /[\u0590-\u08FF]/.test(processedText));

    // Determine Base Font Size
    let baseSize;
    if (isThumbnail) {
      const len = processedText.length;
      if (len <= 4) {
        baseSize = Math.round(h * 0.38);
      } else if (len <= 10) {
        baseSize = Math.round(h * 0.25);
      } else if (len <= 16) {
        baseSize = Math.round(h * 0.18);
      } else {
        baseSize = Math.round(h * 0.14);
      }
    } else {
      baseSize = Math.max(opts.strictControls ? 1 : 16, Math.round(w * 0.033 * scale));
    }

    // Timing calculation
    const duration = (endTime > startTime) ? (endTime - startTime) : 1.8;
    const elapsed = isThumbnail ? (time % 1.6) : Math.max(0, time - startTime);
    const timeLeft = isThumbnail ? (1.6 - elapsed) : Math.max(0, endTime - time);
    const progress = isThumbnail ? (elapsed / 1.6) : Math.min(0.999, Math.max(0, elapsed / duration));

    // Entry & Exit Transition Progress
    const entryDuration = 0.22;
    const exitDuration  = 0.18;
    const entryT = Math.min(1, elapsed / entryDuration);
    const exitT  = Math.min(1, timeLeft / exitDuration);

    ctx.save();

    // ── Apply Line-Change In/Out Transition Animation ───────────
    if (!isThumbnail) {
      if (effLineAnim === 'fade_in') {
        ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(entryT, exitT)));
      } else if (effLineAnim === 'pop_zoom') {
        const p = 0.82 + 0.18 * Math.sin(entryT * Math.PI * 0.5);
        ctx.translate(targetX, targetY);
        ctx.scale(p, p);
        ctx.translate(-targetX, -targetY);
        ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(entryT, exitT)));
      } else if (effLineAnim === 'slide_up') {
        const dy = (1 - Math.sin(entryT * Math.PI * 0.5)) * 24;
        ctx.translate(0, dy);
        ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(entryT, exitT)));
      } else if (effLineAnim === 'slide_down') {
        const dy = -(1 - Math.sin(entryT * Math.PI * 0.5)) * 24;
        ctx.translate(0, dy);
        ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(entryT, exitT)));
      } else if (effLineAnim === 'slide_left') {
        const dx = (1 - Math.sin(entryT * Math.PI * 0.5)) * 36;
        ctx.translate(dx, 0);
        ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(entryT, exitT)));
      } else if (effLineAnim === 'blur_focus') {
        ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(entryT, exitT)));
        if (opts.strictControls) ctx.filter = `blur(${(1 - entryT) * 8}px)`;
      } else if (effLineAnim === 'drop_bounce') {
        const dropY = (1 - Math.sin(entryT * Math.PI * 0.5)) * -32;
        ctx.translate(0, dropY);
        ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(entryT, exitT)));
      } else if (effLineAnim === 'flip_in') {
        const scaleY = Math.sin(entryT * Math.PI * 0.5);
        ctx.translate(targetX, targetY);
        ctx.scale(1, Math.max(0.01, scaleY));
        ctx.translate(-targetX, -targetY);
        ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(entryT, exitT)));
      } else if (effLineAnim === 'glitch_flash') {
        if (elapsed < 0.12) {
          const gx = opts.strictControls ? Math.sin(Math.floor(elapsed * 60) * 19.17) * 3 : (Math.random() - 0.5) * 6;
          ctx.translate(gx, 0);
        }
        ctx.globalAlpha = Math.max(0, Math.min(1, Math.min(entryT, exitT)));
      }
    }

    // Typewriter effect character slice calculation
    let displayText = processedText;
    if (effLineAnim === 'typewriter' && !isThumbnail) {
      const typeDur = Math.min(1.4, duration * 0.7);
      const charPct = Math.min(1, elapsed / typeDur);
      const visibleChars = Math.max(1, Math.floor(charPct * processedText.length));
      displayText = processedText.substring(0, visibleChars);
    }

    // Word Wrap lines & calculate word bounding boxes
    const maxLineW = isThumbnail ? w * 0.88 : w * 0.82;
    // Preserve logical transcript order for both scripts.  For RTL captions
    // coordinates move from the right edge toward the left below; reversing
    // the tokens first breaks multi-line Urdu grouping and word timing.
    const rawWords = displayText.split(/\s+/).filter(Boolean);
    const totalWords = rawWords.length || 1;

    // Which word is currently active / being spoken? (Millisecond-accurate audio sync)
    let activeWordIndex = -1;
    let wordElapsedProgress = 0;

    if (opts.words && Array.isArray(opts.words) && opts.words.length) {
      const idx = opts.words.findIndex(w => time >= (w.start - 0.04) && time <= (w.end + 0.04));
      if (idx !== -1) {
        activeWordIndex = idx;
        const wDur = Math.max(0.1, (opts.words[idx].end || 0) - (opts.words[idx].start || 0));
        wordElapsedProgress = Math.min(1, Math.max(0, (time - opts.words[idx].start) / wDur));
      } else if (time >= startTime && time <= endTime) {
        for (let i = opts.words.length - 1; i >= 0; i--) {
          if (time >= (opts.words[i].start - 0.04)) {
            activeWordIndex = i;
            break;
          }
        }
      }
    } else {
      const sequentialIndex = isStaticPreset ? -1 : Math.min(totalWords - 1, Math.floor(progress * totalWords));
      activeWordIndex = sequentialIndex < 0 ? -1 : sequentialIndex;
      wordElapsedProgress = (progress * totalWords) % 1.0;
    }

    if (opts.strictControls && isStaticPreset) activeWordIndex = -1;
    ctx.font = `800 ${baseSize}px '${effFont}', 'Poppins', sans-serif`;
    ctx.direction = isRtl ? 'rtl' : 'ltr';

    const baseSpaceWidth = ctx.measureText(' ').width;
    // Preset cards use a tiny 140×70 canvas. At that scale, the normal
    // export outline can physically run into the next word. Use a smaller
    // thumbnail-only stroke and reserve enough inter-word space for it.
    const thumbnailStrokeWidth = isThumbnail
      ? Math.max(0.75, Math.min(2, effStrokeW * 0.38))
      : effStrokeW;
    const minSpaceForStroke = isThumbnail ? (thumbnailStrokeWidth * 2 + 1.5) : 2;
    const effSpaceWidth  = Math.max(minSpaceForStroke, baseSpaceWidth + (wordSpacing || 0));

    function measureWordSequenceWidth(wordsArray) {
      if (!wordsArray || !wordsArray.length) return 0;
      let total = 0;
      for (let i = 0; i < wordsArray.length; i++) {
        const txt = typeof wordsArray[i] === 'string' ? wordsArray[i] : wordsArray[i].text;
        total += ctx.measureText(txt).width;
        if (i < wordsArray.length - 1) {
          total += effSpaceWidth;
        }
      }
      return total;
    }

    const lines = [];
    let globalWordCounter = 0;

    if (linesCount === '1') {
      // ── FORCE 1 LINE ──────────────────────────────────────────
      const singleLineWords = rawWords.map(word => ({ text: word, globalIndex: globalWordCounter++ }));
      let singleLineW = measureWordSequenceWidth(singleLineWords);

      if (singleLineW > maxLineW && !isThumbnail && !opts.strictControls) {
        const fitRatio = Math.max(0.55, maxLineW / singleLineW);
        baseSize = Math.max(13, Math.round(baseSize * fitRatio));
        ctx.font = `800 ${baseSize}px '${effFont}', 'Poppins', sans-serif`;
      }
      lines.push({ text: rawWords.join(' '), words: singleLineWords });

    } else if (linesCount === '2') {
      // ── FORCE 2 LINES (MAX) ───────────────────────────────────
      let line1Count;
      if (wordsPerLine > 0 && rawWords.length > wordsPerLine) {
        line1Count = Math.min(rawWords.length - 1, wordsPerLine);
      } else {
        line1Count = Math.ceil(rawWords.length / 2);
      }

      const line1Words = rawWords.slice(0, line1Count).map(word => ({ text: word, globalIndex: globalWordCounter++ }));
      const line2Words = rawWords.slice(line1Count).map(word => ({ text: word, globalIndex: globalWordCounter++ }));

      lines.push({ text: line1Words.map(w => w.text).join(' '), words: line1Words });
      if (line2Words.length) {
        lines.push({ text: line2Words.map(w => w.text).join(' '), words: line2Words });
      }

      const max2LineW = Math.max(...lines.map(l => measureWordSequenceWidth(l.words)));
      if (max2LineW > maxLineW && !isThumbnail) {
        const fitRatio = Math.max(0.60, maxLineW / max2LineW);
        baseSize = Math.max(13, Math.round(baseSize * fitRatio));
        ctx.font = `800 ${baseSize}px '${effFont}', 'Poppins', sans-serif`;
      }

    } else {
      // ── DYNAMIC AUTO WRAP ─────────────────────────────────────
      let currentLineWords = [];
      let currentLineText = '';

      for (let i = 0; i < rawWords.length; i++) {
        const wordText = rawWords[i];
        const nextWords = [...currentLineWords, { text: wordText, globalIndex: globalWordCounter }];
        const nextW = measureWordSequenceWidth(nextWords);

        const exceedsWordsPerLine = (wordsPerLine > 0 && currentLineWords.length >= wordsPerLine);

        if ((nextW <= maxLineW && !exceedsWordsPerLine) || !currentLineWords.length) {
          currentLineWords.push({ text: wordText, globalIndex: globalWordCounter++ });
          currentLineText = currentLineWords.map(w => w.text).join(' ');
        } else {
          lines.push({ text: currentLineText, words: currentLineWords });
          currentLineWords = [{ text: wordText, globalIndex: globalWordCounter++ }];
          currentLineText = wordText;
        }
      }
      if (currentLineWords.length) {
        lines.push({ text: currentLineText, words: currentLineWords });
      }
    }

    const effLineHeight = Math.round(baseSize * (lineSpacing || 1.30));
    const totalTextH    = lines.length * effLineHeight;
    const padX          = Math.round(baseSize * 0.8);
    const padY          = Math.round(baseSize * 0.35);
    const boxH          = totalTextH + padY * 2;

    let maxW = 0;
    lines.forEach(l => {
      const lw = measureWordSequenceWidth(l.words);
      if (lw > maxW) maxW = lw;
    });

    const boxW = maxW + padX * 2;
    let boxX = targetX - boxW / 2;
    if (align === 'left')  boxX = targetX - padX;
    if (align === 'right') boxX = targetX - boxW + padX;
    const boxY = targetY - boxH / 2;
    const startY = boxY + padY + effLineHeight / 2;

    // Active drag guide
    if (isDragging && !isThumbnail) {
      ctx.save();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      roundRect(ctx, boxX - 4, boxY - 4, boxW + 8, boxH + 8, 8);
      ctx.stroke();
      ctx.restore();
    }

    // Background Container for Cinema Pill / Plate Box / Sub-Box
    if (preset === 'cinema_pill' || preset === 'cinematic_minimal_box') {
      ctx.save();
      ctx.fillStyle = presetDef.tagCol || 'rgba(0,0,0,0.78)';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      roundRect(ctx, boxX, boxY, boxW, boxH, 8);
      ctx.fill();
      ctx.restore();
    } else if (preset === 'keyword_highlight') {
      ctx.save();
      ctx.fillStyle = presetDef.tagCol || 'rgba(10, 14, 24, 0.88)';
      roundRect(ctx, boxX, boxY, boxW, boxH, 8);
      ctx.fill();
      ctx.strokeStyle = effGlowCol || '#00F0FF';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = effGlowCol || '#00F0FF';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();
    } else if (preset === 'broadcast_lower_third') {
      ctx.save();
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(boxX + padX, boxY + boxH - 4, maxW, 3);
      ctx.restore();
    }

    const spaceWidth = ctx.measureText(' ').width;

    // ── Render Each Word ─────────────────────────────────────────
    lines.forEach((lineObj, lineIdx) => {
      const lineY = startY + lineIdx * effLineHeight;
      const fullLineW = measureWordSequenceWidth(lineObj.words);

      let currentX;
      if (isRtl) {
        // RTL is laid out from the right boundary to the left while retaining
        // the original transcript/timestamp order. This also keeps the first
        // spoken Urdu word at the right-hand side where it belongs.
        if (align === 'center') currentX = targetX + fullLineW / 2;
        else if (align === 'right') currentX = targetX;
        else currentX = targetX + fullLineW;
      } else if (align === 'center') {
        currentX = targetX - fullLineW / 2;
      } else if (align === 'right') {
        currentX = targetX - fullLineW;
      } else {
        currentX = targetX;
      }

      lineObj.words.forEach(wObj => {
        const wordText = wObj.text;
        const wordW = ctx.measureText(wordText).width;
        const drawX = isRtl ? currentX - wordW : currentX;
        const isActive = (wObj.globalIndex === activeWordIndex);
        const isPast = (wObj.globalIndex < activeWordIndex);

        // Active Word Micro Animation (Pop Bounce / Jump)
        let wordScale = 1.0;
        let wordOffsetY = 0;

        if (isActive) {
          if (effAnimStyle === 'bounce_jump') {
            wordOffsetY = -Math.round(baseSize * 0.18 * Math.sin(wordElapsedProgress * Math.PI));
            wordScale = 1.0 + 0.12 * Math.sin(wordElapsedProgress * Math.PI);
          } else if (effAnimStyle === 'karaoke_pop' || effAnimStyle === 'neon_sweep') {
            wordScale = 1.0 + (opts.strictControls && effAnimStyle === 'neon_sweep' ? 0.06 : 0.18) * Math.sin(wordElapsedProgress * Math.PI);
            wordOffsetY = -Math.round(baseSize * 0.08 * Math.sin(wordElapsedProgress * Math.PI));
          } else if (effAnimStyle === 'pill_slide') {
            wordScale = 1.0 + 0.08 * Math.sin(wordElapsedProgress * Math.PI);
          }
        }

        ctx.save();
        ctx.translate(drawX + wordW / 2, lineY + wordOffsetY);
        if (wordScale !== 1.0) {
          ctx.scale(wordScale, wordScale);
        }
        ctx.translate(-(drawX + wordW / 2), -(lineY + wordOffsetY));

        // 1. Draw Active Word Background Badges (Pill Tag / Yellow Sticker)
        if (isActive && (preset === 'purple_box' || preset === 'yellow_sticker' || effAnimStyle === 'pill_slide')) {
          ctx.save();
          const badgePadX = Math.round(baseSize * 0.35);
          const badgePadY = Math.round(baseSize * 0.18);
          const bgW = wordW + badgePadX * 2;
          const bgH = baseSize * 1.25 + badgePadY * 2;
          const bgX = drawX - badgePadX;
          const bgY = lineY - bgH / 2;

          if (preset === 'yellow_sticker') {
            ctx.translate(drawX + wordW / 2, lineY);
            ctx.rotate(-0.05);
            ctx.fillStyle = presetDef.tagCol || '#EAB308';
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 6;
            roundRect(ctx, -bgW / 2, -bgH / 2, bgW, bgH, 6);
            ctx.fill();
            ctx.restore();
          } else {
            ctx.fillStyle = presetDef.tagCol || '#7e22ce';
            ctx.shadowColor = effGlowCol || '#a855f7';
            ctx.shadowBlur = isThumbnail ? 6 : 12;
            roundRect(ctx, bgX, bgY, bgW, bgH, 6);
            ctx.fill();
            ctx.restore();
          }
        }

        // 2. Setup Font & Styles
        ctx.font = `800 ${baseSize}px '${effFont}', 'Poppins', sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        // 3. Render Outline / Stroke
        const scaledStroke = thumbnailStrokeWidth;
        if (scaledStroke > 0 && (opts.strictControls || (preset !== 'purple_box' && preset !== 'yellow_sticker'))) {
          ctx.strokeStyle = isActive && !opts.strictControls ? (preset === 'gold_neon' ? '#eab308' : effStrokeCol) : effStrokeCol;
          ctx.lineWidth = scaledStroke;
          ctx.lineJoin = 'round';
        ctx.strokeText(wordText, drawX, lineY);
        }

        // 4. Render Glow & Fill Color
        if (isActive) {
          // ACTIVE WORD: Dynamic Glow & Vibrant Color
          const dynamicGlow = isThumbnail ? Math.min(10, effGlowBlur) : (effGlowBlur * (1.1 + 0.25 * Math.sin(time * 8)));
          ctx.shadowColor = effGlowCol;
          ctx.shadowBlur = dynamicGlow;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          if (opts.strictControls) {
            ctx.fillStyle = effHlCol;
          } else if (preset === 'yellow_sticker') {
            ctx.fillStyle = '#000000';
            ctx.shadowBlur = 0;
          } else if (preset === 'purple_box') {
            ctx.fillStyle = '#FFFFFF';
          } else {
            ctx.fillStyle = effHlCol;
          }
        } else {
          // INACTIVE / STATIC WORD: Clean Base Color & Drop Shadow
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
          ctx.shadowBlur = isThumbnail ? 3 : effShadowBlur;
          ctx.shadowOffsetX = 1.5;
          ctx.shadowOffsetY = 1.5;
          ctx.fillStyle = effBaseCol;
        }

          ctx.fillText(wordText, drawX, lineY);
        ctx.restore();

        currentX += isRtl ? -(wordW + effSpaceWidth) : (wordW + effSpaceWidth);
      });
    });

    ctx.restore();

    return {
      boxX,
      boxY,
      boxW,
      boxH
    };
  }

  // ── Render Live Thumbnail Preview ───────────────────────────
  function renderThumbnail(canvas, presetKey, time = 0, localFont = '') {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Dark sleek card backdrop with subtle vignette
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#1c1e28');
    bg.addColorStop(1, '#0e1017');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const preset = PRESETS[presetKey] || PRESETS.poppins_yellow;
    const sampleText = preset.sample || 'THE QUICK BROWN FOX';

    render(ctx, sampleText, w / 2, h / 2, w, h, {
      preset: presetKey,
      fontPick: localFont || preset.font || 'Poppins',
      align: 'center',
      scale: 1.0,
      isDragging: false,
      isThumbnail: true,
      time: time,
      startTime: 0,
      endTime: 1.6
    });
  }

  // ── SRT / VTT Subtitle Parser ──────────────────────────────
  function parseSRT(srtText) {
    if (!srtText || typeof srtText !== 'string') return [];
    const normalized = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    const blocks = normalized.split(/\n\s*\n/);
    const cues = [];

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      if (!lines.length) continue;

      let timeLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          timeLineIdx = i;
          break;
        }
      }
      if (timeLineIdx === -1) continue;

      const timeLine = lines[timeLineIdx];
      const match = timeLine.match(/(\d{1,2}:\d{2}:\d{2}[,\.]\d{2,3}|\d{1,2}:\d{2}[,\.]\d{2,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,\.]\d{2,3}|\d{1,2}:\d{2}[,\.]\d{2,3})/);
      if (!match) continue;

      const start = parseTimestamp(match[1]);
      const end   = parseTimestamp(match[2]);
      const text  = lines.slice(timeLineIdx + 1).join(' ').trim();

      if (!isNaN(start) && !isNaN(end) && text) {
        cues.push({ start, end, text });
      }
    }
    return cues;
  }

  function parseTimestamp(tStr) {
    const parts = (tStr || '').trim().replace(',', '.').split(':');
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(tStr) || 0;
  }

  return {
    PRESETS,
    render,
    renderThumbnail,
    parseSRT,
    roundRect
  };
})();
