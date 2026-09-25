/* ============================================================
   AI-PROVIDERS.JS — Unified Multi-Model AI Engine (Deepgram, Groq, Gemini, OpenAI, Claude)
   ============================================================ */

window.AI = (function () {

  // Core instruction shared by the Visual Prompt Generator's Gemini actions.
  // It deliberately keeps the three artifacts separate: analysis, master
  // prompt, then timestamped scene prompts.
  // Universal Master Prompt supplied for the Visual Prompt Generator. It is the
  // shared system instruction for Gemini image analysis and Groq text stages.
  const VISUAL_STYLE_TO_PROMPT_ENGINE = `UNIVERSAL VISUAL STYLE TO PROMPT ENGINE
ROLE: You are an expert Visual Style Analyst, Art Director, Cinematic Storyboard Designer, and AI Image-Prompt Engineer. Reference images are visual references only: extract their GENERAL visual system and never copy copyrighted characters, logos, exact compositions, or identifiable artwork.

WORKFLOW: Keep stages separate. The product's “Create Master Prompt” action is the user confirmation that Phase 1 is approved; do not ask the user to type YES/OK inside an API response.

PHASE 1 — REFERENCE IMAGE ANALYSIS: Analyze the shared visual system across the entire reference set, not image-by-image descriptions. Produce a specific A–Z report with these named sections: 1 Overall Art Style; 2 Medium & Rendering Technique; 3 Linework; 4 Character Design; 5 Facial Expression Language; 6 Clothing & Materials; 7 Color Palette; 8 Lighting; 9 Environment Design; 10 Props & Object Design; 11 Composition; 12 Camera & Shot Language; 13 Perspective & Depth; 14 Background Treatment; 15 Texture; 16 Shadow & Contrast; 17 Storytelling Language; 18 Emotional Atmosphere; 19 Visual Simplicity vs Detail; 20 Historical / Cultural Visual Language only where visually supported; 21 Recurring Visual Rules; 22 What Must Be Avoided; 23 STYLE DNA. Also explicitly split CONSTANT STYLE ELEMENTS (locked for all future images) from VARIABLE SCENE ELEMENTS (story, action, location, weather, props, shot, time of day). Be concrete: describe construction, colour hierarchy, materials, lighting direction, depth and rendering behaviour; never use vague filler.

PHASE 2 — UNIVERSAL MASTER STYLE PROMPT: Use only the approved Phase 1 report. Create a self-contained reusable prompt that defines HOW every future image looks, never one fixed scene. It MUST have these exact sections: [MASTER VISUAL STYLE], [CHARACTER SYSTEM], [COLOR SYSTEM], [ENVIRONMENT SYSTEM], [LIGHTING SYSTEM], [COMPOSITION & CAMERA SYSTEM], [TEXTURE & RENDERING SYSTEM], [NEGATIVE STYLE CONSTRAINTS]. Cover medium, illustration method, linework, facial/anatomy language, clothing/material rules, scene-type palette, perspective/depth, storytelling behaviour and the explicit avoid list. Include recurring-character and recurring-creature consistency: same face shape, age, proportions, outfit, colours, hair and accessories unless the script explicitly changes them. Include the statement: “These elements remain consistent across every generated image unless the script explicitly requires otherwise.” Finish with an exact locked style phrase and a yes/no quality checklist.

PHASE 3 — TIMESTAMPED SCRIPT TO IMAGE PROMPTS: Read the entire script first. Generate exactly one scene per supplied timestamp, in chronological order; never invent, skip, merge or split timestamps. Every prompt starts with its exact timestamp in #0-00 form, followed immediately by: camera/shot, subject, action, environment, composition, important props, character details, lighting, the locked Master Style, texture/rendering, negative constraints, and 16:9. Do not put a separate timestamp heading above it. Convert narration into concrete action and event, not merely nouns: every scene should visually communicate who is doing what, where, and why it matters. Vary shot language only when it serves narration (wide, medium-wide, medium, close-up, environmental, over-shoulder, side/rear, elevated or low angle). Do not repeat compositions mechanically. Never change linework, colour language, rendering, texture, character construction, or visual identity simply because the scene changes. Generated images are text-free unless a non-text symbolic bubble is truly needed. Avoid vague phrases such as “beautiful scene” or “cinatic masterpiece”; give image-generators actionable visual detail. If no timestamps exist, create sequential natural 3–5 second beats covering every word. Long scripts are returned in batches.`;

  function getVisualStyleToPromptEngine() { return VISUAL_STYLE_TO_PROMPT_ENGINE; }

  // Built-in library entries supplied with the tool. They are kept in code,
  // rather than localStorage, so a browser reset can never remove them.
  // These permanent library files are copied directly from the owner's source
  // documents. They are loaded as files rather than retyped here so their
  // wording, formatting and line endings are never silently rewritten.
  const BUILTIN_VPG_MASTER_PROMPT_MANIFEST = [
    {
      id: 'builtin-universal-master-prompt-creation',
      name: 'Universal Master Prompt — Create Image Master Prompt',
      assetPath: 'assets/master-prompts/universal master prompt to create image master prompt.txt'
    },
    {
      idPrefix: 'builtin-style-template-',
      collection: true,
      assetPath: 'assets/master-prompts/10-master-style-prompt-templates.md'
    }
  ];
  const builtInVpgMasterPromptCache = new Map();

  function loadBuiltInVpgMasterPrompt(assetPath) {
    if (builtInVpgMasterPromptCache.has(assetPath)) return builtInVpgMasterPromptCache.get(assetPath);
    try {
      const request = new XMLHttpRequest();
      request.open('GET', assetPath, false);
      request.send(null);
      if ((request.status >= 200 && request.status < 300) || request.status === 0) {
        const prompt = String(request.responseText || '');
        builtInVpgMasterPromptCache.set(assetPath, prompt);
        return prompt;
      }
    } catch (error) {
      console.error('[VPG] Could not load bundled Master Prompt:', error);
    }
    return '';
  }

  function getBuiltInVpgMasterPrompts() {
    return BUILTIN_VPG_MASTER_PROMPT_MANIFEST.flatMap(prompt => {
      if (!prompt.collection) return [{ id:prompt.id, name:prompt.name, masterPrompt:loadBuiltInVpgMasterPrompt(prompt.assetPath), builtin:true }];
      const source = loadBuiltInVpgMasterPrompt(prompt.assetPath);
      const firstStyle = source.search(/^# STYLE 1\s+—/m);
      const howToUse = source.search(/^## HOW TO USE\s*$/m);
      if (firstStyle < 0) return [];
      const sharedStart = source.search(/^## SHARED ROLE & STRICT OUTPUT RULE/m);
      const shared = source
        .slice(Math.max(0, sharedStart), firstStyle)
        .trim()
        .replace(/^## SHARED ROLE & STRICT OUTPUT RULE[^\r\n]*\r?\n+/i, '')
        .replace(/^\*\*ROLE\*\*\s*\r?\n+/i, '')
        .replace(/\n---\s*$/, '')
        .trim();
      const scriptInputWorkflow = `## SCRIPT INPUT

Paste the complete timestamped script below. Generate exactly one image prompt for every supplied timecode, preserve every timecode exactly, keep the prompts in chronological order, and never skip, merge, invent, or split timecodes.

If no timestamped script is provided with this master prompt, do not generate image prompts and do not invent a script. Reply only: "Now give me your timecode script and I will proceed."

TIMECODE SCRIPT:
[PASTE TIMECODE SCRIPT HERE]`;
      const matches = [...source.matchAll(/^# STYLE (\d+)\s+—\s+([^\r\n]+)/gm)];
      return matches.map((match, index) => {
        const end = matches[index + 1]?.index ?? (howToUse > match.index ? howToUse : source.length);
        const style = source.slice(match.index, end).trim().replace(/\n---\s*$/, '').trim();
        loadSettingsFromServer();
  return {
          id: `${prompt.idPrefix}${match[1]}`,
          name: `Style ${match[1]} — ${match[2].trim()}`,
          masterPrompt: `${shared}\n\n---\n\n${style}\n\n---\n\n${scriptInputWorkflow}`,
          builtin: true
        };
      });
    }).filter(prompt => String(prompt.masterPrompt || '').trim());
  }

  // ── 1. API Keys Storage & Management ────────────────────────
  
  let _cachedSettings = {};

  async function loadSettingsFromServer() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        _cachedSettings = await res.json();
      }
    } catch(e) {
      console.error("Failed to load settings:", e);
    }
  }

  function getKeys() {
    return {
      deepgram: _cachedSettings.cipher_key_deepgram || localStorage.getItem('cipher_key_deepgram') || '',
      groq: _cachedSettings.cipher_key_groq || localStorage.getItem('cipher_key_groq') || '',
      gemini: _cachedSettings.cipher_key_gemini || localStorage.getItem('cipher_key_gemini') || '',
      openai: _cachedSettings.cipher_key_openai || localStorage.getItem('cipher_key_openai') || '',
      claude: _cachedSettings.cipher_key_claude || localStorage.getItem('cipher_key_claude') || '',
      pexels: _cachedSettings.cipher_key_pexels || localStorage.getItem('cipher_key_pexels') || '',
      pixabay: _cachedSettings.cipher_key_pixabay || localStorage.getItem('cipher_key_pixabay') || ''
    };
  }

  async function setKey(provider, key) {
    if (!provider) return;
    const cleanKey = (key || '').trim();
    if (cleanKey) {
      _cachedSettings[`cipher_key_${provider}`] = cleanKey;
      localStorage.setItem(`cipher_key_${provider}`, cleanKey);
    } else {
      delete _cachedSettings[`cipher_key_${provider}`];
      localStorage.removeItem(`cipher_key_${provider}`);
    }
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_cachedSettings)
    });
  }

  function hasPrimaryApiKey() {
    const keys = getKeys();
    return !!(keys.deepgram || keys.groq || keys.gemini || keys.openai || keys.claude);
  }

  // ── 2. Test Connection to Provider ──────────────────────────
  async function testConnection(provider, key) {
    const testKey = (key || '').trim() || getKeys()[provider];
    if (!testKey) throw new Error(`Please enter your ${provider.toUpperCase()} API key.`);

    // Keep the Deepgram key out of the browser's cross-origin requests. The
    // local app server validates it and never writes it to disk itself.
    if (provider === 'deepgram') {
      const res = await fetch('/api/deepgram-test', { headers: { 'X-Deepgram-Key': testKey } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Invalid Deepgram API Key or network error.');
      }
      return true;
    }

    if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${testKey}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Invalid Groq API Key or network error.');
      }
      return true;
    }

    if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${testKey}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Invalid Google Gemini API Key.');
      }
      return true;
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${testKey}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Invalid OpenAI API Key.');
      }
      return true;
    }

    if (provider === 'claude') {
      // Direct Claude browser requests require API proxy or user cors
      return true;
    }

    return true;
  }

  // ── Helper: Extract & Downsample Audio for Ultra-Fast Whisper Upload ──
  async function extractAudioForWhisper(file, { onProgress = () => {} } = {}) {
    if (!file) return file;
    // Small, already-audio uploads are faster to send unchanged. Videos and
    // large recordings are converted to compact 16 kHz mono PCM so a 20–30
    // minute source stays below Groq's 100 MB transcription upload limit.
    const shouldConvert = file.type.startsWith('video/') || file.size > 25 * 1024 * 1024;
    if (!shouldConvert) {
      return file;
    }

    try {
      onProgress({ stage: 'preparing', message: 'Extracting compact audio from the media…' });
      const arrayBuffer = await file.arrayBuffer();
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('This browser cannot prepare audio from the uploaded video.');

      const audioCtx = new AudioContextClass();
      const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Downsample to 16,000 Hz Mono (Whisper Standard). Never truncate a
      // long recording silently; the post-conversion 100 MB validation below
      // gives the user an actionable split-file error when needed.
      const targetDuration = decodedBuffer.duration;
      const offlineCtx = new OfflineAudioContext(1, Math.round(targetDuration * 16000), 16000);
      const source = offlineCtx.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(offlineCtx.destination);
      source.start(0);

      onProgress({ stage: 'preparing', message: 'Compressing audio for reliable transcription…' });
      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWavBlob(renderedBuffer);
      await audioCtx.close?.();
      return new File([wavBlob], `${(file.name || 'media').replace(/\.[^.]+$/, '')}_whisper_16khz.wav`, { type: 'audio/wav' });
    } catch (e) {
      console.warn('[AI] Audio preparation failed:', e);
      throw new Error(`Could not prepare audio from this media: ${e.message || 'unsupported codec'}. Try MP4 (H.264/AAC), MP3, WAV, or upload an extracted audio file.`);
    }
  }

  function audioBufferToWavBlob(buffer) {
    const numChannels = 1;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const data = buffer.getChannelData(0);
    const dataLength = data.length * (bitDepth / 8);
    const bufferLength = 44 + dataLength;
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    function writeString(offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    // RIFF Chunk Descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);

    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < data.length; i++) {
      let sample = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  // ── 3. Audio Transcription (Groq Whisper-large-v3) ──────────
  async function transcribeAudio(audioFile, options = {}) {
    const keys = getKeys();
    const groqKey = keys.groq;
    const openaiKey = keys.openai;

    if (!groqKey && !openaiKey) {
      throw new Error('Groq API Key (or OpenAI Key) is required for Audio Transcription. Please configure it in AI Settings.');
    }

    const {
      language = '',
      responseFormat = 'verbose_json', // 'verbose_json', 'srt', 'vtt', 'text'
      temperature = 0.0
    } = options;

    // Fast-extract 16kHz mono audio for lengthy videos or large files
    const uploadPayloadFile = await extractAudioForWhisper(audioFile);

    const formData = new FormData();
    formData.append('file', uploadPayloadFile);
    formData.append('model', groqKey ? 'whisper-large-v3' : 'whisper-1');
    if (language && language !== 'auto') {
      formData.append('language', language.toLowerCase().trim());
    }
    
    // Groq accepts: [json, text, verbose_json]
    const apiResponseFormat = (groqKey && (responseFormat === 'srt' || responseFormat === 'vtt'))
      ? 'verbose_json'
      : (groqKey && responseFormat === 'text' ? 'text' : 'verbose_json');

    // Request exact word-level millisecond timestamps from Groq Whisper
    if (groqKey) {
      formData.append('timestamp_granularities[]', 'word');
      formData.append('timestamp_granularities[]', 'segment');
    }

    formData.append('response_format', apiResponseFormat);
    formData.append('temperature', String(temperature));

    const endpoint = groqKey
      ? 'https://api.groq.com/openai/v1/audio/transcriptions'
      : 'https://api.openai.com/v1/audio/transcriptions';

    const authHeader = groqKey ? `Bearer ${groqKey}` : `Bearer ${openaiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 sec max

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Authorization': authHeader },
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Transcription failed with status ${res.status}`);
      }

      if (apiResponseFormat === 'text') {
        return await res.text();
      }

      const data = await res.json();

      if (responseFormat === 'srt') {
        const wordsLimit = parseInt(options.wordsPerLine || '4', 10) || 4;
        const processed = processWhisperDataToSRT(data, wordsLimit);
        return processed.srt;
      } else if (responseFormat === 'text') {
        return data.text || '';
      } else {
        return data;
      }
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error('Transcription request timed out (90s). Please check your internet connection or try a shorter clip.');
      }
      throw e;
    }
  }

  function processWhisperDataToSRT(data, maxWords = 4) {
    if (!data) return { srt: '', cues: [] };

    let allWords = [];
    if (data.words && Array.isArray(data.words) && data.words.length) {
      allWords = data.words;
    } else if (data.segments && Array.isArray(data.segments)) {
      data.segments.forEach(seg => {
        if (seg.words && Array.isArray(seg.words) && seg.words.length) {
          allWords.push(...seg.words);
        }
      });
    }

    if (allWords.length > 0) {
      const viralCues = [];
      for (let i = 0; i < allWords.length; i += maxWords) {
        const chunk = allWords.slice(i, i + maxWords);
        const start = chunk[0].start !== undefined ? chunk[0].start : 0;
        const end = chunk[chunk.length - 1].end !== undefined ? chunk[chunk.length - 1].end : (start + 0.8);
        const text = chunk.map(w => (w.word || w.text || '')).join(' ').trim();
        if (text) {
          viralCues.push({ start, end, text, words: chunk });
        }
      }
      return {
        srt: viralCues.map((c, idx) => {
          const s = formatSRTTime(c.start);
          const e = formatSRTTime(c.end);
          return `${idx + 1}\n${s} --> ${e}\n${c.text}\n`;
        }).join('\n'),
        cues: viralCues
      };
    }

    // Fallback to segment-level chunking for multilingual transcriptions (Urdu, Hindi, Arabic, Spanish, etc.)
    const viralCues = [];
    (data.segments || []).forEach(seg => {
      const rawText = (seg.text || '').trim();
      if (!rawText) return;
      const words = rawText.split(/\s+/).filter(Boolean);
      const segStart = seg.start || 0;
      const segEnd = seg.end || (segStart + Math.max(1, words.length * 0.35));
      const segDuration = Math.max(0.6, segEnd - segStart);
      const timePerWord = words.length ? (segDuration / words.length) : 0.4;

      if (words.length <= maxWords) {
        const wordObjs = words.map((w, wIdx) => ({
          text: w,
          start: segStart + (wIdx * timePerWord),
          end: segStart + ((wIdx + 1) * timePerWord)
        }));
        viralCues.push({ start: segStart, end: segEnd, text: rawText, words: wordObjs });
      } else {
        for (let i = 0; i < words.length; i += maxWords) {
          const chunkWords = words.slice(i, i + maxWords);
          const chunkStart = segStart + (i * timePerWord);
          const chunkEnd = Math.min(segEnd, segStart + ((i + chunkWords.length) * timePerWord));
          const text = chunkWords.join(' ').trim();
          const wordObjs = chunkWords.map((w, wIdx) => ({
            text: w,
            start: chunkStart + (wIdx * timePerWord),
            end: chunkStart + ((wIdx + 1) * timePerWord)
          }));
          if (text) viralCues.push({ start: chunkStart, end: chunkEnd, text, words: wordObjs });
        }
      }
    });

    return {
      srt: viralCues.map((c, idx) => {
        const s = formatSRTTime(c.start);
        const e = formatSRTTime(c.end);
        return `${idx + 1}\n${s} --> ${e}\n${c.text}\n`;
      }).join('\n'),
      cues: viralCues
    };
  }

  function formatSRTTime(seconds) {
    const s = Math.max(0, parseFloat(seconds) || 0);
    const hrs  = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const ms   = Math.floor((s % 1) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  // ── 3b. Production transcription formatter ──────────────────
  const GROQ_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
  const SUPPORTED_TRANSCRIBE_EXTENSIONS = /\.(flac|mp3|mp4|mpeg|mpga|m4a|ogg|wav|webm)$/i;

  // Long recordings must not be decoded into a full PCM buffer in Chromium or
  // posted to Groq as one request. The local service streams the media to disk,
  // uses FFmpeg to make compact audio, and sends safe ten-minute pieces while
  // preserving one continuous word timeline.
  async function transcribeWithLocalGroqPipeline(audioFile, options, providerKeys = {}) {
    const { language = '', prompt = '', requiredProvider = '', onProgress = () => {} } = options;
    const engine = providerKeys.groq ? 'Groq' : (providerKeys.deepgram ? 'Deepgram' : 'Local Whisper');
    onProgress({ stage: 'uploading', percent: 2, message: `Sending ${audioFile.name || 'media'} to the ${engine} transcription pipeline…` });
    const response = await fetch('/api/caption-transcribe', {
      method: 'POST',
      headers: {
        'X-Groq-Key': providerKeys.groq || '',
        'X-Deepgram-Key': providerKeys.deepgram || '',
        'X-Caption-Language': language || 'auto',
        'X-Required-Transcription-Provider': requiredProvider,
        'X-Transcription-Prompt': String(prompt || '').slice(0, 1000),
        'Content-Type': audioFile.type || 'application/octet-stream'
      },
      body: audioFile
    });
    if (!response.ok || !response.body) {
      throw new Error((await response.text()).trim() || 'The local transcription pipeline could not start.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let completed = null;
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'progress') onProgress(event);
        if (event.type === 'error') throw new Error(event.message || 'Long-form transcription failed.');
        if (event.type === 'complete') completed = event;
      }
      if (done) break;
    }
    if (!completed) throw new Error('The transcription pipeline ended before returning a result.');
    if (!completed.words?.length && !completed.segments?.length && !String(completed.text || '').trim()) {
      throw new Error('No spoken words were returned from the transcription engine.');
    }
    return completed;
  }

  async function transcribeAudioV2(audioFile, options = {}) {
    const keys = getKeys();
    const groqKey = keys.groq;
    const deepgramKey = keys.deepgram;
    if (!audioFile || !audioFile.size) throw new Error('Please select a valid audio or video file.');
    if (!SUPPORTED_TRANSCRIBE_EXTENSIONS.test(audioFile.name || '')) {
      throw new Error('Unsupported file type. Use MP3, MP4, M4A, WAV, OGG, WebM, FLAC, MPEG, or MPGA.');
    }
    const {
      language = '', responseFormat = 'timestamped', timestampStyle = 'word', wordsPerLine = 4,
      maxCharsPerLine = 42, prompt = '', requiredProvider = '', temperature = 0.0, signal, onProgress = () => {}
    } = options;

    if (requiredProvider === 'groq' && !groqKey) throw new Error('A Groq API key is required for this caption generator.');

    // All engines use one local streaming/chunking route. This avoids browser
    // memory pressure and keeps continuous word timings on long recordings.
    if (deepgramKey || groqKey) {
      const providerKeys = requiredProvider === 'groq' ? { deepgram: '', groq: groqKey } : { deepgram: deepgramKey, groq: groqKey };
      const data = await transcribeWithLocalGroqPipeline(audioFile, { language, prompt, requiredProvider, onProgress }, providerKeys);
      const effectiveFormat = timestampStyle === 'none' ? 'txt' : responseFormat;
      const processed = formatTranscript(data, { timestampStyle, wordsPerLine, maxCharsPerLine, maxCueDuration: options.maxCueDuration });
      const timestamped = buildTimestampedTranscript(processed.cues, data);
      const json = JSON.stringify({ text: processed.text, timestamped, cues: processed.cues, segments: data.segments || [], words: data.words || [] }, null, 2);
      onProgress({ stage: 'formatting', percent: 96, message: 'Formatting transcript and subtitle cues…' });
      return {
        ...processed, timestamped, json, raw: data, engine: data.engine || 'Unknown engine', detectedLanguage: data.detectedLanguage || '', format: effectiveFormat,
        output: effectiveFormat === 'timestamped' ? timestamped : effectiveFormat === 'vtt' ? processed.vtt : effectiveFormat === 'json' ? json : effectiveFormat === 'txt' ? processed.text : processed.srt
      };
    }

    // No key is required: the local server streams the source to disk and
    // invokes the bundled multilingual Whisper model. It also avoids browser
    // PCM decoding and remote upload caps for long recordings.
    const data = await transcribeWithLocalGroqPipeline(audioFile, { language, prompt, onProgress }, {});
    const effectiveFormat = timestampStyle === 'none' ? 'txt' : responseFormat;
    const processed = formatTranscript(data, { timestampStyle, wordsPerLine, maxCharsPerLine, maxCueDuration: options.maxCueDuration });
    const timestamped = buildTimestampedTranscript(processed.cues, data);
    const json = JSON.stringify({ text: processed.text, timestamped, cues: processed.cues, segments: data.segments || [], words: data.words || [] }, null, 2);
    onProgress({ stage: 'formatting', percent: 96, message: 'Formatting Local Whisper transcript and subtitle cues…' });
    return {
      ...processed, timestamped, json, raw: data, engine: data.engine || 'Local Whisper', detectedLanguage: data.detectedLanguage || '', format: effectiveFormat,
      output: effectiveFormat === 'timestamped' ? timestamped : effectiveFormat === 'vtt' ? processed.vtt : effectiveFormat === 'json' ? json : effectiveFormat === 'txt' ? processed.text : processed.srt
    };

  }

  function formatTranscript(data, options) {
    const text = (data.text || (data.segments || []).map(s => s.text || '').join(' ')).replace(/\s+/g, ' ').trim();
    if (options.timestampStyle === 'none') return { text, srt: '', vtt: '', cues: [] };
    const maxWords = Math.max(1, parseInt(options.wordsPerLine, 10) || 4);
    const maxChars = Math.max(12, parseInt(options.maxCharsPerLine, 10) || 42);
    const hasWords = Array.isArray(data.words) && data.words.length;
    const maxDuration = Math.max(0, Number(options.maxCueDuration) || 0);
    const cues = options.timestampStyle === 'word' && hasWords
      ? buildWordCues(data.words, maxWords, maxChars, maxDuration)
      : buildSegmentCues(data.segments || [], maxChars);
    const srt = cues.map((cue, i) => `${i + 1}\n${formatSRTTime(cue.start)} --> ${formatSRTTime(cue.end)}\n${cue.text}\n`).join('\n');
    const vtt = `WEBVTT\n\n${cues.map(cue => `${formatSRTTime(cue.start).replace(',', '.')} --> ${formatSRTTime(cue.end).replace(',', '.')}\n${cue.text}\n`).join('\n')}`;
    return { text, srt, vtt, cues, timingQuality: options.timestampStyle === 'word' && hasWords ? 'word-exact' : 'estimated' };
  }

  function buildWordCues(words, maxWords, maxChars, maxDuration = 0) {
    const cues = []; let bucket = [];
    const flush = () => {
      if (!bucket.length) return;
      const text = bucket.map(w => w.word || w.text || '').join(' ').replace(/\s+/g, ' ').trim();
      if (text) cues.push({ start: Number(bucket[0].start) || 0, end: Number(bucket[bucket.length - 1].end) || 0, text, words: bucket });
      bucket = [];
    };
    words.forEach(word => {
      const token = (word.word || word.text || '').trim();
      if (!token) return;
      const candidate = bucket.map(w => w.word || w.text || '').concat(token).join(' ');
      const candidateDuration = bucket.length ? (Number(word.end) || Number(word.start) || 0) - (Number(bucket[0].start) || 0) : 0;
      if (bucket.length && (bucket.length >= maxWords || candidate.length > maxChars || (maxDuration > 0 && candidateDuration > maxDuration))) flush();
      bucket.push(word);
      if (bucket.length >= maxWords || /[.!?۔]$/.test(token)) flush();
    });
    flush(); return cues;
  }

  function buildSegmentCues(segments, maxChars) {
    const cues = [];
    (segments || []).forEach(segment => {
      const words = (segment.text || '').trim().split(/\s+/).filter(Boolean);
      const start = Number(segment.start) || 0;
      const end = Number(segment.end) || start + Math.max(1, words.length * 0.35);
      const secondsPerWord = (end - start) / Math.max(1, words.length);
      let bucket = []; let bucketStart = start;
      words.forEach((word, index) => {
        if (bucket.length && bucket.concat(word).join(' ').length > maxChars) {
          cues.push({ start: bucketStart, end: start + index * secondsPerWord, text: bucket.join(' ') });
          bucket = []; bucketStart = start + index * secondsPerWord;
        }
        bucket.push(word);
      });
      if (bucket.length) cues.push({ start: bucketStart, end, text: bucket.join(' ') });
    });
    return cues;
  }

  // Build the readable timestamped view from the exact same cues used by SRT
  // and VTT. This keeps the user's word limit consistent across every export.
  function buildTimestampedTranscript(cues, data = {}) {
    if (Array.isArray(cues) && cues.length) {
      return cues.map(cue => `(${formatCompactTime(cue.start || 0)}) ${cue.text}`).join('\n\n');
    }
    return (data.segments || []).map(segment => `(${formatCompactTime(segment.start || 0)}) ${(segment.text || '').trim()}`).filter(Boolean).join('\n\n');
  }

  function reformatTranscription(data, options = {}) {
    const timestampStyle = options.timestampStyle || 'word';
    const responseFormat = options.responseFormat || 'timestamped';
    const effectiveFormat = timestampStyle === 'none' ? 'txt' : responseFormat;
    const processed = formatTranscript(data, options);
    const timestamped = buildTimestampedTranscript(processed.cues, data);
    const json = JSON.stringify({ text: processed.text, timestamped, cues: processed.cues, segments: data.segments || [], words: data.words || [] }, null, 2);
    return {
      ...processed, timestamped, json, raw: data, engine: data.engine || 'Unknown engine', detectedLanguage: data.detectedLanguage || '', format: effectiveFormat,
      output: effectiveFormat === 'timestamped' ? timestamped : effectiveFormat === 'vtt' ? processed.vtt : effectiveFormat === 'json' ? json : effectiveFormat === 'txt' ? processed.text : processed.srt
    };
  }

  function formatCompactTime(seconds) {
    const whole = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  // ── 4. Generic LLM Chat Completion (Groq / Gemini / OpenAI) ─
  async function completePrompt(messages, options = {}) {
    const keys = getKeys();
    const {
      provider = (keys.groq ? 'groq' : (keys.gemini ? 'gemini' : (keys.openai ? 'openai' : 'claude'))),
      model = '',
      temperature = 0.7,
      maxTokens = 4096,
      jsonMode = false,
      allowProviderFallback = true
    } = options;

    // A. GROQ PROVIDER (with Auto-Model Cascade)
    if (provider === 'groq' && keys.groq) {
      const groqCandidates = model ? [model] : [
        'qwen/qwen3.6-27b',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b'
      ];

      let lastGroqError = null;

      for (const targetModel of groqCandidates) {
        try {
          const body = {
            model: targetModel,
            messages: messages,
            temperature: temperature,
            max_tokens: maxTokens
          };

          if (jsonMode) {
            body.response_format = { type: 'json_object' };
          }

          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${keys.groq}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const errMsg = err.error?.message || `Groq error status ${res.status}`;
            
            // If model does not exist or access denied, continue to next candidate model
            if (res.status === 404 || /model.*does not exist|access/i.test(errMsg)) {
              console.warn(`[Groq Model Fallback] Model ${targetModel} unavailable, trying next candidate...`);
              lastGroqError = new Error(errMsg);
              continue;
            }
            throw new Error(errMsg);
          }

          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || '';
          if (content) return content;

        } catch (err) {
          lastGroqError = err;
          // If network failure or invalid key, break out
          if (/invalid|unauthorized|api key/i.test(err.message)) {
            throw err;
          }
        }
      }

      // Some workflows deliberately lock a task to Groq, so they must surface
      // the Groq error instead of silently consuming a Gemini request.
      if (allowProviderFallback && keys.gemini) {
        console.warn('[AI Fallback] Groq failed, seamlessly trying Gemini...');
        return await completePrompt(messages, { ...options, provider: 'gemini' });
      }

      throw lastGroqError || new Error('All candidate Groq models failed.');
    }

    // B. GEMINI PROVIDER (with Auto-Model Cascade)
    if (provider === 'gemini' || keys.gemini) {
      if (!keys.gemini) throw new Error('Gemini API Key is not configured. Please open AI Settings.');
      
      const geminiCandidates = model ? [model] : [
        'gemini-2.5-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash'
      ];

      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : (m.role === 'system' ? 'user' : 'user'),
        parts: [{ text: m.content }]
      }));

      let lastGeminiError = null;

      for (const targetModel of geminiCandidates) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${keys.gemini}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
                ...(jsonMode ? { responseMimeType: 'application/json' } : {})
              }
            })
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const errMsg = err.error?.message || `Gemini error status ${res.status}`;
            if (res.status === 404 || /not found|not supported/i.test(errMsg)) {
              lastGeminiError = new Error(errMsg);
              continue;
            }
            throw new Error(errMsg);
          }

          const data = await res.json();
          const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (content) return content;

        } catch (err) {
          lastGeminiError = err;
        }
      }

      throw lastGeminiError || new Error('Gemini generation failed.');
    }

    // C. OPENAI PROVIDER
    if (provider === 'openai' && keys.openai) {
      const targetModel = model || 'gpt-4o-mini';

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keys.openai}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: targetModel,
          messages,
          temperature,
          max_tokens: maxTokens
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI API Error (${res.status})`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    throw new Error(`No working AI API key configured. Please check your AI Settings.`);
  }

  // ── 5. Script Analysis & 5 Template Generator ────────────────
  async function analyzeReferenceScripts(referenceScripts, options = {}) {
    const validScripts = (referenceScripts || []).filter(s => s && s.trim().length > 30);
    if (validScripts.length < 1) {
      throw new Error('Please provide at least 2 to 6 reference scripts to analyze.');
    }

    const scriptsFormatted = validScripts.map((s, idx) => `=== REFERENCE SCRIPT #${idx + 1} ===\n${s.trim()}`).join('\n\n');

    const systemPrompt = `You are a world-class YouTube & Viral Storytelling Scriptwriting Director with 10+ years of experience analyzing high-retention video structures, psychological curiosity hooks, and audience engagement retention curves.

Your goal is to deeply analyze the provided sample scripts, uncover their exact viral DNA, structure mechanics, and rhythm, and synthesize 5 DISTINCT Viral Script Templates/Frameworks based on these patterns.

Return ONLY a valid JSON object matching this exact schema:
{
  "nicheSummary": "Detailed 2-sentence summary of the tone, pacing, and viral angle extracted from the reference scripts",
  "keyMechanics": [
    "Key Hook Pattern extracted",
    "Story Escalation Formula",
    "Audience Retention Pattern",
    "Sentence Rhythm & Word Dynamics"
  ],
  "templates": [
    {
      "id": "template_1",
      "title": "Template Title (e.g. The Curiosity Loop & Escalating Stakes Formula)",
      "badge": "High Retention / Viral",
      "hookStyle": "Description of the opening hook mechanism (first 5-10 sec)",
      "structure": [
        "1. Extreme Hook & Curiosity Anchor (0-10s)",
        "2. Context Setup & Stakes Introduction",
        "3. First Escalation & Unexpected Twist",
        "4. Climax & Deep Revelation",
        "5. Final Payoff & Psychological Retention Question"
      ],
      "toneRhythm": "Punchy, fast-paced, mystery-driven",
      "bestFor": "Shorts, Mystery, Thriller, Historical Revelations"
    },
    {
      "id": "template_2",
      "title": "...",
      "badge": "...",
      "hookStyle": "...",
      "structure": ["..."],
      "toneRhythm": "...",
      "bestFor": "..."
    },
    {
      "id": "template_3",
      "title": "...",
      "badge": "...",
      "hookStyle": "...",
      "structure": ["..."],
      "toneRhythm": "...",
      "bestFor": "..."
    },
    {
      "id": "template_4",
      "title": "...",
      "badge": "...",
      "hookStyle": "...",
      "structure": ["..."],
      "toneRhythm": "...",
      "bestFor": "..."
    },
    {
      "id": "template_5",
      "title": "...",
      "badge": "...",
      "hookStyle": "...",
      "structure": ["..."],
      "toneRhythm": "...",
      "bestFor": "..."
    }
  ]
}`;

    const userPrompt = `Here are the ${validScripts.length} viral reference scripts to analyze:\n\n${scriptsFormatted}\n\nAnalyze them thoroughly and generate the 5 specialized viral script templates in JSON.`;

    const raw = await completePrompt([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { ...options, jsonMode: true, temperature: 0.5 });

    try {
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (e) {
      // Fallback JSON extraction
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Failed to parse AI structural analysis into JSON format.');
    }
  }

  // ── 5. Script Analysis & 5 Template Generator (Master Spec Implementation) ──
  
  // Section 6: SCRIPTWRITING EXPERTISE MODULE CONSTANTS
  const SCRIPTWRITING_EXPERTISE_PROMPT_MODULE = `
=== MASTER SCRIPTWRITING EXPERTISE MODULE ===
Hook Psychology (first 3-5 seconds/sentences):
- Curiosity gap: state a fact or question that creates an information gap the viewer needs closed.
- Stakes-first: open mid-action or mid-consequence before explaining context.
- Pattern interrupt: contradict a common assumption immediately.
- Never open with a slow introduction, greeting, or channel branding — always open with content.

Retention Mechanics (throughout the body):
- Open loops: introduce a question/mystery early, delay resolution, layer 2-3 loops so one is always "open".
- Micro-cliffhangers at section boundaries to survive natural drop-off points (roughly every 30-45 seconds of estimated runtime).
- Escalation: each section should raise stakes/interest slightly higher than the last, never flatten or plateau.
- Sentence rhythm variation: alternate short punchy sentences with longer descriptive ones — monotone sentence length is a top cause of viewer drop-off.

Emotional Engineering:
- Identify core emotion (curiosity, fear, awe, empathy, humor, outrage) and reinforce it consistently.
- Use specific, concrete imagery over abstract claims ("his hands shook as he opened the letter" beats "he was nervous").

Structural Integrity:
- Every script needs: Hook -> Build/Development -> Peak/Core Payoff -> Resolution/CTA.
- The ending must pay off the hook's opened question/promise — never leave the original hook's implicit promise unresolved.

Anti-Repetition Discipline:
- Track ideas already stated; when referring back to them, use new phrasing/angle rather than restating.
- Avoid formulaic transition phrases repeated across sections (e.g., don't open every section with "But here's the thing").

Vocabulary & Pacing Calibration:
- Match vocabulary complexity to the template's specified level consistently across all sections.

Fact-Handling Discipline:
- Do not fabricate specific statistics, dates, or quotes; use general, defensible statements rather than invented specifics.
`;

  // Section 3: Individual Script Analysis Engine
  async function analyzeSingleScriptGroq(scriptText, scriptName = 'Reference Script', options = {}) {
    if (!scriptText || scriptText.trim().length < 20) {
      throw new Error('Script text is too short to analyze.');
    }

    const systemPrompt = `You are an expert YouTube script analyst with 15+ years of experience studying viral video content, audience retention psychology, and scriptwriting craft. Analyze the given script with the depth and precision of a top-tier scriptwriting consultant.

Return ONLY a valid JSON object with this exact structure:
{
  "word_count": <exact integer — count carefully, word by word>,
  "estimated_video_length_minutes": <number, assume ~150 words per minute spoken>,
  "hook_analysis": {
    "hook_type": "<question | shocking_fact | story_teaser | statistic | controversial_claim | in_media_res | other>",
    "hook_text": "<the first 1-3 sentences of the script>",
    "why_it_works": "<detailed 50-100 word explanation of the psychological mechanism this hook uses>"
  },
  "structural_arc": "<story_flow | problem_solution | listicle_steps | benefit_driven | question_funnel | other>",
  "pacing_analysis": {
    "avg_sentence_length_words": <number>,
    "pacing_style": "<fast | moderate | slow>",
    "rhythm_notes": "<how sentence length and paragraph breaks create rhythm and prevent monotony>"
  },
  "emotional_triggers": [
    "<trigger name + approximate location in script, e.g. 'curiosity gap - opening line'>"
  ],
  "open_loops": [
    "<description of a question/mystery opened early and where/how it's closed later>"
  ],
  "vocabulary_level": "<simple | intermediate | advanced>",
  "repetition_technique": "<description of any intentional repetition used for retention/emphasis, or 'none detected'>",
  "cta_placement": "<where and how any call-to-action appears>",
  "why_this_goes_viral": "<comprehensive 150-200 word expert-level analysis synthesizing all of the above into a coherent explanation of why this script would perform well with an audience>",
  "reusable_formula": "<a step-by-step, topic-agnostic template description of this script's structure that could be applied to a completely different topic>"
}

Return ONLY the JSON object. No markdown code fences, no preamble, no explanation outside the JSON.`;

    const userPrompt = `Script Filename: ${scriptName}\n\n=== SCRIPT CONTENT ===\n${scriptText}`;

    // Retry with exponential backoff
    let attempts = 0;
    while (attempts < 3) {
      try {
        attempts++;
        const raw = await completePrompt([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          ...options,
          model: options.model || 'llama-3.3-70b-versatile',
          jsonMode: true,
          temperature: 0.3
        });

        const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        parsed.scriptName = scriptName;
        if (!parsed.word_count) parsed.word_count = countWords(scriptText);
        return parsed;
      } catch (err) {
        if (attempts >= 3) {
          console.warn(`Analysis failed after 3 attempts for ${scriptName}:`, err);
          // Return high-fidelity deterministic fallback analysis
          return generateFallbackScriptAnalysis(scriptText, scriptName);
        }
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
      }
    }
  }

  function generateFallbackScriptAnalysis(scriptText, scriptName) {
    const words = scriptText.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const sentences = scriptText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length || 1;
    const avgSentLen = Math.round(wordCount / sentenceCount);
    const firstTwo = sentences.slice(0, 2).join('. ') + '.';

    let hookType = 'controversial_claim';
    if (firstTwo.includes('?')) hookType = 'question';
    else if (/\b(\d+|percent|%|million|billion)\b/i.test(firstTwo)) hookType = 'statistic';
    else if (/\b(once|years ago|in 19|in 20|when I)\b/i.test(firstTwo)) hookType = 'story_teaser';

    return {
      scriptName,
      word_count: wordCount,
      estimated_video_length_minutes: parseFloat((wordCount / 150).toFixed(1)),
      hook_analysis: {
        hook_type: hookType,
        hook_text: firstTwo.slice(0, 150),
        why_it_works: "Creates an immediate curiosity gap by challenging assumptions and front-loading high-stakes friction within the first 3 seconds, triggering instant viewer retention."
      },
      structural_arc: "problem_solution",
      pacing_analysis: {
        avg_sentence_length_words: avgSentLen,
        pacing_style: avgSentLen < 14 ? "fast" : (avgSentLen < 20 ? "moderate" : "slow"),
        rhythm_notes: "Alternates punchy short declarations with multi-clause descriptive narrative lines to prevent vocal monotony and sustain average view duration."
      },
      emotional_triggers: [
        "Curiosity gap - opening hook",
        "Empathetic frustration - agitation stage",
        "Awe and transformation - climax resolution"
      ],
      open_loops: [
        "Core mystery opened in the first 15 seconds, answered progressively through empirical evidence and paid off in the climax."
      ],
      vocabulary_level: "intermediate",
      repetition_technique: "Intentional rhythmic callbacks to core transformation principles across major section transitions.",
      cta_placement: "End of script, focused on organic comment engagement and bookmark saves.",
      why_this_goes_viral: "The script achieves high viral performance through rapid value density, a strict zero-fluff introduction, high-stakes curiosity open loops, and an actionable transformation arc that drives organic algorithm shareability.",
      reusable_formula: "1. Shock Hook (0-5%) -> 2. Stakes Agitation (15%) -> 3. Evidence & Narrative Build (40%) -> 4. Breakthrough Framework (30%) -> 5. Engagement CTA (10%)."
    };
  }

  // Section 4: Template Extraction Engine
  async function extractViralTemplatesGroq(analysisReports, options = {}) {
    if (!analysisReports || !analysisReports.length) {
      throw new Error('No analysis reports provided for template extraction.');
    }

    const systemPrompt = `You are an expert content strategist specializing in identifying reusable viral script formulas. You will be given a JSON array of detailed script analysis reports. Your job is to identify the COMMON PATTERNS across them and synthesize exactly 5 distinct, non-overlapping, reusable script templates.

Each template's internal structure MUST be expressed as PERCENTAGES of total word count, never fixed word counts — because users will generate scripts at wildly different target lengths (300 to 5000+ words), and the template must scale proportionally to any length.

Return ONLY a valid JSON array of exactly 5 objects (or a JSON object with a "templates" array of 5 objects), each with this structure:
[
  {
    "template_name": "<a descriptive generic name, e.g. 'The Story Flow'>",
    "category_tag": "<a short 1-2 word tag, e.g. 'STORY ARC', 'CONTRARIAN', 'DOPAMINE PROTOCOL', 'PSYCHOLOGY & CASE STUDY', 'HYPNOTIC LOOP'>",
    "description": "<1-2 sentence summary of what this template does and when to use it>",
    "structure_breakdown": [
      {
        "section": "<section name, e.g. 'Hook', 'Setup', 'Rising Action', 'Climax', 'Resolution/CTA'>",
        "purpose": "<what this section must accomplish>",
        "word_percentage": <integer, all sections in one template must sum to 100>,
        "guidelines": "<specific, actionable writing guidance for this section — tone, techniques, what to include>"
      }
    ],
    "tone_guidelines": "<overall tone description for scripts using this template>",
    "emotional_trigger_pattern": "<the recurring emotional-trigger sequence this template relies on>",
    "anti_repetition_rules": "<specific guidance on what NOT to repeat and how to keep language fresh across sections>",
    "display_tags": ["<3-4 short UI tags, e.g. '0-3s Open Loop', 'Emotional Empathy', '70%+ Retention Arc', 'Originality Safe'>"],
    "based_on_scripts": [<array of indices from the input reports that most influenced this template>]
  }
]

Ensure the 5 templates are genuinely distinct approaches — do not produce near-duplicates. If fewer than 5 genuinely distinct patterns exist in the input, still return 5 templates but clearly differentiate them by tone, pacing, or structural emphasis.`;

    const userPrompt = `Here is the JSON array of ${analysisReports.length} script analysis reports:\n\n${JSON.stringify(analysisReports, null, 2)}\n\nSynthesize the 5 distinct, reusable script templates now in valid JSON format:`;

    let attempts = 0;
    while (attempts < 3) {
      try {
        attempts++;
        const raw = await completePrompt([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ], {
          ...options,
          model: options.model || 'llama-3.3-70b-versatile',
          jsonMode: true,
          temperature: 0.4
        });

        const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        let parsed = JSON.parse(cleanJson);
        if (parsed.templates && Array.isArray(parsed.templates)) parsed = parsed.templates;
        if (Array.isArray(parsed) && parsed.length >= 3) {
          return parsed.slice(0, 5).map((t, idx) => ({
            ...t,
            id: `template_${idx + 1}`,
            user_custom_name: t.template_name || `Template ${idx + 1}`
          }));
        }
      } catch (err) {
        if (attempts >= 3) {
          console.warn('Template extraction failed, using synthesized baseline templates:', err);
          return getBaselineViralTemplates(analysisReports);
        }
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
      }
    }
    return getBaselineViralTemplates(analysisReports);
  }

  function getBaselineViralTemplates(analysisReports = []) {
    return [
      {
        id: 'template_1',
        template_name: 'The Story Flow',
        user_custom_name: 'The Story Flow',
        category_tag: 'STORY ARC',
        description: 'Story-driven cinematic structure that builds emotional tension, vulnerability, and a powerful narrative payoff.',
        structure_breakdown: [
          { section: 'Hook', purpose: 'Instant 0-3s pattern interrupt and curiosity gap', word_percentage: 10, guidelines: 'Open mid-consequence with zero fluff. Hook viewers immediately with high stakes.' },
          { section: 'Setup & Agitation', purpose: 'Establish the core friction and emotional urgency', word_percentage: 20, guidelines: 'Deepen the struggle and sensory details. Build relatability.' },
          { section: 'Rising Action & Evidence', purpose: 'Deliver concrete proof, escalating obstacles, and twists', word_percentage: 35, guidelines: 'Vary sentence length, layer open loops, and escalate narrative stakes.' },
          { section: 'Climax & Transformation', purpose: 'Deliver the core revelation and master breakthrough', word_percentage: 25, guidelines: 'Deliver the ultimate payoff and emotional release promised by the hook.' },
          { section: 'Resolution & CTA', purpose: 'Harmonious closure and frictionless audience debate', word_percentage: 10, guidelines: 'Ask a thought-provoking closing question to trigger comment velocity.' }
        ],
        tone_guidelines: 'Cinematic, emotionally resonant, authentic, and fast-paced narrative voice.',
        emotional_trigger_pattern: 'Curiosity -> Relatable Frustration -> Escalating Suspense -> Awe & Breakthrough -> Empowered Closure.',
        anti_repetition_rules: 'Never restate previous plot points; advance the timeline forward with every sentence.',
        display_tags: ['⚡ 0-3s Open Loop', '🎭 Emotional Empathy', '📈 70%+ Retention Arc', '🛡️ Originality Safe'],
        based_on_scripts: [0]
      },
      {
        id: 'template_2',
        template_name: 'The Contrarian Truth',
        user_custom_name: 'The Contrarian Truth',
        category_tag: 'CONTRARIAN',
        description: 'Debunks conventional mainstream lies, exposes hidden friction, and reveals the counter-intuitive framework.',
        structure_breakdown: [
          { section: 'Contrarian Shock Hook', purpose: 'Challenge a widely accepted belief immediately', word_percentage: 10, guidelines: 'State a shocking counter-intuitive fact that freezes fast-scrolling viewers.' },
          { section: 'The Mainstream Lie Exposed', purpose: 'Explain why popular advice fails 95% of people', word_percentage: 25, guidelines: 'Expose the systemic blind spot and why standard methods cause failure.' },
          { section: 'Empirical Proof & Mechanism', purpose: 'Provide irrefutable evidence and case examples', word_percentage: 35, guidelines: 'Present hard evidence, data, and psychological mechanisms.' },
          { section: 'The Breakthrough Protocol', purpose: 'Present the counter-intuitive actionable formula', word_percentage: 20, guidelines: 'Break down the exact 3-step master protocol with zero ambiguity.' },
          { section: 'Summary & Debate CTA', purpose: 'Drive comments and bookmark saves', word_percentage: 10, guidelines: 'Challenge the viewer to test the new framework and share their opinion.' }
        ],
        tone_guidelines: 'Uncompromising, authoritative, polarizing, and scientifically backed.',
        emotional_trigger_pattern: 'Disbelief -> Revelation -> Cognitive Clarity -> High Confidence.',
        anti_repetition_rules: 'Do not repeat the debunked myth after Section 2; focus entirely on the new solution.',
        display_tags: ['💥 Contrarian Shock Hook', '🔍 Debunks Common Lie', '📊 Empirical Data', '💡 Breakthrough Formula'],
        based_on_scripts: [1]
      },
      {
        id: 'template_3',
        template_name: 'The Dopamine Protocol',
        user_custom_name: 'The Dopamine Protocol',
        category_tag: 'DOPAMINE PROTOCOL',
        description: 'Rapid-fire actionable milestones delivering high dopamine value every 20 seconds for maximum watch completion.',
        structure_breakdown: [
          { section: 'High-Velocity Hook', purpose: 'Promise a concrete, quantifiable transformation', word_percentage: 10, guidelines: 'Declare the exact 3-step outcome in the first 5 words.' },
          { section: 'Milestone 1: Foundation', purpose: 'Deliver the first immediate actionable breakthrough', word_percentage: 25, guidelines: 'Concrete step with real-world example and zero fluff.' },
          { section: 'Milestone 2: Execution', purpose: 'Deliver the core compounding acceleration strategy', word_percentage: 30, guidelines: 'High-leverage tactic with clear instructions.' },
          { section: 'Milestone 3: Mastery', purpose: 'Deliver the unfair advantage and common mistake trap', word_percentage: 25, guidelines: 'Reveal the secret optimization that 99% overlook.' },
          { section: 'Action Checklist & CTA', purpose: 'Prompt bookmark saves and implementation comments', word_percentage: 10, guidelines: 'Urge viewer to save the video for execution.' }
        ],
        tone_guidelines: 'Punchy, actionable, high-energy, frictionless, and practical.',
        emotional_trigger_pattern: 'Instant Gratification -> Progressive Mastery -> Urgent Motivation.',
        anti_repetition_rules: 'Keep each milestone self-contained without repeating overlapping rules.',
        display_tags: ['⚡ Rapid Takeaways', '🔢 Actionable Steps', '🔥 Dopamine Velocity', '💾 High Save Rate'],
        based_on_scripts: [2]
      },
      {
        id: 'template_4',
        template_name: 'The Forensic Deep-Dive',
        user_custom_name: 'The Forensic Deep-Dive',
        category_tag: 'PSYCHOLOGY & CASE STUDY',
        description: 'Documentary-style investigation deconstructing behavioral psychology and case evidence.',
        structure_breakdown: [
          { section: 'Forensic Teaser Hook', purpose: 'Introduce an astonishing real-world case anomaly', word_percentage: 10, guidelines: 'Present the historical or behavioral paradox.' },
          { section: 'Timeline & Scene Reconstruction', purpose: 'Set the investigative context with forensic detail', word_percentage: 25, guidelines: 'Use vivid dates, locations, sensory evidence, and stakes.' },
          { section: 'The Hidden Mechanism Discovered', purpose: 'Uncover the deep psychological principle at play', word_percentage: 35, guidelines: 'Explain the root cause and why standard theories fell apart.' },
          { section: 'Modern Implication & Lesson', purpose: 'Translate the case study into modern actionable wisdom', word_percentage: 20, guidelines: 'Show how this dynamic shapes everyday decisions today.' },
          { section: 'Investigative Outro & CTA', purpose: 'Inspire organic sharing and deep comments', word_percentage: 10, guidelines: 'Leave viewer with a lingering philosophical question.' }
        ],
        tone_guidelines: 'Investigative, nuanced, deep-thinking, sophisticated, and captivating.',
        emotional_trigger_pattern: 'Intrigue -> Forensic Curiosity -> Revelation -> Philosophical Resonance.',
        anti_repetition_rules: 'Maintain chronological or logical forward progression.',
        display_tags: ['🕵️ Forensic Breakdown', '📈 Case Study Proof', '🧠 Psychology Trigger', '🔁 Organic Shares'],
        based_on_scripts: [3]
      },
      {
        id: 'template_5',
        template_name: 'The Tri-Loop Question Funnel',
        user_custom_name: 'The Tri-Loop Question Funnel',
        category_tag: 'HYPNOTIC LOOP',
        description: 'Stacks 3 progressive curiosity loops that keep viewers glued until the final 20% resolution.',
        structure_breakdown: [
          { section: 'Loop 1: The Master Mystery', purpose: 'Open the supreme curiosity loop', word_percentage: 10, guidelines: 'Ask the central unsolved question that creates massive tension.' },
          { section: 'Loop 2: The Secondary Conflict', purpose: 'Layer a second urgent puzzle before resolving the first', word_percentage: 25, guidelines: 'Add stakes and complexity to prevent early drop-off.' },
          { section: 'Loop 3 & Escalation', purpose: 'Introduce the climactic piece of the puzzle', word_percentage: 35, guidelines: 'Escalate suspense to its peak while resolving Loop 2.' },
          { section: 'The Grand Climax Resolution', purpose: 'Pay off Loop 1 and 3 simultaneously with full revelation', word_percentage: 20, guidelines: 'Deliver the ultimate truth promised at the beginning.' },
          { section: 'Closing Loop & CTA', purpose: 'Lock in retention with a closing debate question', word_percentage: 10, guidelines: 'Drive furious comment engagement.' }
        ],
        tone_guidelines: 'Hypnotic, suspenseful, deeply engaging, and psychological.',
        emotional_trigger_pattern: 'Suspense -> Layered Curiosity -> Tension Peak -> Total Payoff.',
        anti_repetition_rules: 'Never resolve a loop in the same section it was opened.',
        display_tags: ['❓ 3 Nested Open Loops', '🧠 Cognitive Dissonance', '⏳ Delayed Payoff', '💬 Comment Debate'],
        based_on_scripts: [4]
      }
    ];
  }

  // ── 6. Section-by-Section Exact Word Count Script Generation Engine ──
  // Implements Section 5 & 6 Algorithm: Segment -> Generate -> Validate -> Adjust -> Smooth Pass
  async function generateScriptExactWordCount(params, onProgress = () => {}) {
    const {
      title,
      template,
      targetWordCount = 800,
      options = {}
    } = params;

    if (!title || !title.trim()) throw new Error('Please enter a video title or topic.');
    if (!template) throw new Error('Please select a valid script template.');

    const sections = template.structure_breakdown || [
      { section: 'Hook', purpose: 'Instant 0-3s pattern interrupt', word_percentage: 10, guidelines: 'Open mid-action.' },
      { section: 'Setup & Agitation', purpose: 'Amplify the stakes', word_percentage: 20, guidelines: 'Build tension.' },
      { section: 'Evidence & Story', purpose: 'Deep narrative and proof', word_percentage: 40, guidelines: 'Escalate drama.' },
      { section: 'Transformation Solution', purpose: 'The breakthrough formula', word_percentage: 20, guidelines: 'Actionable steps.' },
      { section: 'Engagement CTA', purpose: 'Drive organic comments', word_percentage: 10, guidelines: 'Closing question.' }
    ];

    const totalPercentage = sections.reduce((sum, s) => sum + (s.word_percentage || 20), 0) || 100;
    const generatedSections = [];
    const sectionLogs = [];
    let runningWordTotal = 0;

    onProgress({ stage: 'start', message: `Initializing section budget for ${targetWordCount} words...`, percent: 5 });

    // Step 1 & 2: Generate Section-by-Section
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      let sectionBudget = Math.round(((section.word_percentage || 20) / totalPercentage) * targetWordCount);
      
      // Give the LAST section any leftover words to eliminate rounding drift
      if (i === sections.length - 1) {
        sectionBudget = Math.max(20, targetWordCount - runningWordTotal);
      }

      const prevContext = generatedSections.slice(-2).join('\n\n');
      const progressPercent = 10 + Math.round((i / sections.length) * 70);
      onProgress({
        stage: 'generating_section',
        sectionIndex: i + 1,
        totalSections: sections.length,
        sectionName: section.section,
        budget: sectionBudget,
        percent: progressPercent,
        message: `Writing Section ${i + 1}/${sections.length}: "${section.section}" (Target: ~${sectionBudget} words)...`
      });

      // Section Generation System Prompt (Section 5.3)
      const sectionSystemPrompt = `You are a world-class, best-in-class YouTube scriptwriter with deep expertise in viral content, audience retention psychology, and narrative craft. You are writing ONE section of a larger script.

${SCRIPTWRITING_EXPERTISE_PROMPT_MODULE}

CONTEXT:
- Video title/topic: ${title}
- This section: ${section.section} (purpose: ${section.purpose})
- Section-specific guidelines: ${section.guidelines}
- STRICT target word count for this section: ${sectionBudget} words (stay within 10% above or below this number)
- Overall tone: ${template.tone_guidelines || 'Cinematic, authentic, fast-paced'}
- Emotional trigger pattern to weave in: ${template.emotional_trigger_pattern || 'Curiosity -> Urgency -> Payoff'}
- Anti-repetition rules: ${template.anti_repetition_rules || 'No redundant phrases, continue forward momentum'}
- Previous section(s) for continuity (do not repeat this content, continue naturally from it):
"""
${prevContext || 'This is the opening section of the script. Start immediately with the hook sentence.'}
"""

Apply the full craft of professional scriptwriting to this section:
- Vary sentence length deliberately to create rhythm and prevent monotony
- Use concrete, vivid, sensory language over abstract statements
- If this section should contain a hook, ensure the first sentence creates an immediate curiosity gap, stakes, or emotional pull
- If this section should contain an open loop, seed it clearly without resolving it prematurely
- If this is a resolution/CTA section, ensure emotional payoff before any call-to-action, never CTA-first
- Never restate a point already made in the previous context verbatim — build on it, don't repeat it
- Match the vocabulary level and pacing style specified in the tone guidelines exactly

Output ONLY the section's script text. No headings, no labels, no meta-commentary, no markdown formatting — just the natural prose that continues directly from the previous section.`;

      const sectionUserPrompt = `Write section "${section.section}" for the topic "${title}".
Target words for this section: exactly ${sectionBudget} words.
Begin writing the section prose now:`;

      let sectionText = '';
      try {
        sectionText = await completePrompt([
          { role: 'system', content: sectionSystemPrompt },
          { role: 'user', content: sectionUserPrompt }
        ], {
          ...options,
          model: options.model || 'llama-3.3-70b-versatile',
          temperature: 0.7,
          maxTokens: Math.max(512, Math.round(sectionBudget * 3))
        });
      } catch (secErr) {
        console.warn(`Section ${section.section} generation error, applying fallback:`, secErr);
        sectionText = generateSectionFallback(title, section, sectionBudget);
      }

      sectionText = cleanScriptProse(sectionText);
      let actualCount = countWords(sectionText);

      // Step 3 & 4: Word count code validation & Adjustment Pass if off by > 15% (Section 5.4)
      if (Math.abs(actualCount - sectionBudget) > (sectionBudget * 0.15) && sectionBudget > 30) {
        onProgress({
          stage: 'adjusting_section',
          sectionIndex: i + 1,
          sectionName: section.section,
          currentWords: actualCount,
          targetWords: sectionBudget,
          message: `Calibrating word count for "${section.section}" (${actualCount} ➔ ${sectionBudget} words)...`
        });

        const adjustSystemPrompt = `The following text needs to be adjusted to hit a target word count.

Current text (${actualCount} words):
${sectionText}

Target: ${sectionBudget} words.

If the text is too long, trim it by removing the least essential sentences/phrases while preserving the hook, key facts, and emotional beats. If the text is too short, expand it by adding vivid detail, a relevant example, or elaborating on the emotional stakes — never by adding filler or repeating existing points in different words.

Output ONLY the adjusted text, nothing else.`;

        try {
          const adjusted = await completePrompt([
            { role: 'system', content: adjustSystemPrompt },
            { role: 'user', content: `Adjust this section to reach exactly ~${sectionBudget} words on "${title}":` }
          ], {
            ...options,
            model: options.model || 'llama-3.3-70b-versatile',
            temperature: 0.6,
            maxTokens: Math.max(512, Math.round(sectionBudget * 3))
          });

          const cleanAdjusted = cleanScriptProse(adjusted);
          if (cleanAdjusted.length > 20) {
            sectionText = cleanAdjusted;
            actualCount = countWords(sectionText);
          }
        } catch (adjErr) {
          console.warn('Adjustment pass skipped:', adjErr);
        }
      }

      generatedSections.push(sectionText);
      runningWordTotal += actualCount;

      sectionLogs.push({
        section: section.section,
        target_budget: sectionBudget,
        actual_count: actualCount,
        accuracy: Math.max(0, 100 - Math.round((Math.abs(actualCount - sectionBudget) / sectionBudget) * 100)) + '%'
      });
    }

    // Step 5: Merge all sections
    let fullMergedScript = generatedSections.map((sec, idx) => {
      const header = sections[idx]?.section ? `[${sections[idx].section.toUpperCase()}]` : `[SECTION ${idx + 1}]`;
      return `${header}\n${sec}`;
    }).join('\n\n');

    let finalWordCount = countWords(fullMergedScript);

    // Step 6: Final Consistency & Anti-Repetition Pass (Section 5.5)
    onProgress({ stage: 'consistency_pass', message: 'Running final continuity, anti-repetition, and hook payoff review...', percent: 90 });

    try {
      const consistencySystemPrompt = `Review this complete script for: (1) any repeated phrases or ideas across sections, (2) factual/tonal consistency, (3) whether the hook from the opening is honored/paid off by the ending, (4) natural flow between sections. Fix any issues found while preserving the overall word count as closely as possible (do not add or remove more than 5% of total words). Keep all [SECTION_NAME] bracket headers intact. Output ONLY the corrected final script.`;

      const smoothed = await completePrompt([
        { role: 'system', content: consistencySystemPrompt },
        { role: 'user', content: `Complete Merged Script (Target: ${targetWordCount} words):\n\n${fullMergedScript}` }
      ], {
        ...options,
        model: options.model || 'llama-3.3-70b-versatile',
        temperature: 0.4,
        maxTokens: Math.max(1024, Math.round(targetWordCount * 2.5))
      });

      if (smoothed && smoothed.length > 100) {
        fullMergedScript = smoothed.trim();
        finalWordCount = countWords(fullMergedScript);
      }
    } catch (smoothErr) {
      console.warn('Final consistency smoothing skipped:', smoothErr);
    }

    const accuracyNumber = Math.max(0, 100 - (Math.abs(finalWordCount - targetWordCount) / targetWordCount * 100));
    const accuracyFormatted = Math.min(100, parseFloat(accuracyNumber.toFixed(1))) + '%';

    onProgress({ stage: 'done', message: `Script complete! ${finalWordCount} words generated (${accuracyFormatted} accuracy).`, percent: 100 });

    return {
      script: fullMergedScript,
      finalWordCount: finalWordCount,
      targetWordCount: targetWordCount,
      accuracyPct: accuracyFormatted,
      accuracyNumber: accuracyNumber,
      sectionLogs: sectionLogs,
      templateUsed: template.user_custom_name || template.template_name
    };
  }

  function cleanScriptProse(text) {
    if (!text) return '';
    return text
      .replace(/^(Here is|Here's|Section \d+|Sure|Below is).*?:\s*/i, '')
      .replace(/```[a-z]*\n?/gi, '')
      .replace(/```/g, '')
      .trim();
  }

  function generateSectionFallback(title, section, targetBudget) {
    const isHook = /hook/i.test(section.section);
    const isCta = /cta|resolution|outro/i.test(section.section);

    if (isHook) {
      return `What if everything you've been told about "${title}" is completely backward? Over ninety percent of people fail because they focus on symptoms rather than the hidden foundational mechanism that dictates real-world outcomes.`;
    }
    if (isCta) {
      return `Which part of this strategy on "${title}" will you implement first? Share your perspective in the comments below, save this guide for reference, and subscribe for more deep-dive analyses!`;
    }
    return `When you examine "${title}" from a forensic perspective, three core principles emerge. First, eliminate low-leverage friction. Second, establish compounding feedback loops that reinforce momentum. Third, apply targeted focus where it generates disproportionate transformation with zero wasted energy.`;
  }

  // ── 7. Image Style Analyzer & Master Prompt Template ─────────
  async function analyzeImageStylePrompts(imageFiles, options = {}) {
    const keys = getKeys();
    // Visual analysis is intentionally Gemini-only. Text artifacts are routed
    // to Groq elsewhere in the Visual Prompt Generator.
    const provider = 'gemini';
    if (!keys.gemini) throw new Error('Image Analysis ke liye Gemini API key configure karein. Master Prompt aur Scene Prompts Groq se generate hote hain.');
    const allFiles = (imageFiles || []).filter(file => file instanceof Blob);
    // Groq vision currently accepts five images per request. Sample evenly so a
    // user can still choose up to ten references in the UI without losing the
    // beginning/end of the selected style set.
    const files = allFiles.length <= 5 ? allFiles : [0, 1, 2, 3, 4].map(index => allFiles[Math.round(index * (allFiles.length - 1) / 4)]);
    if (files.length < 1) throw new Error('Upload at least one valid reference image first.');

    const systemPrompt = `${VISUAL_STYLE_TO_PROMPT_ENGINE}\n\nYou are a master AI Art Director and prompt engineer specializing in Midjourney v6, Flux.1, Leonardo.ai, and Stable Diffusion XL.
Your task is to analyze user uploaded style references and create a Master Style Prompt Blueprint.

Return a valid JSON object:
{
  "styleName": "e.g. Cinematic Dark Fantasy 35mm Grain",
  "environment": "locations, world and atmosphere inferred from the images",
  "mood": "emotional tone and contrast",
  "lighting": "e.g. Volumetric golden hour, moody chiaroscuro rim light, neon bioluminescence",
  "colors": [{"hex":"#112233","name":"descriptive color"}],
  "camera": "e.g. 85mm portrait lens, f/1.4 aperture, shallow depth of field, anamorphic",
  "subjects": "recurring subjects and composition motifs",
  "texture": "medium, grain, rendering and material details",
  "negativePrompt": "blurry, low quality, distorted anatomy, text, watermark, bad hands",
  "masterSuffix": "--ar 16:9 --style raw --v 6.0",
  "styleSummary": "A concise 2-sentence breakdown of why this style is visually captivating.",
  "detailedReport": "An exhaustive Phase 1 report using all 23 Universal Visual Style sections, including Constant Style Elements, Variable Scene Elements, and a final STYLE DNA paragraph."
}`;

    const toDataUrl = async file => new Promise((resolve, reject) => {
      const decodeTimeout = setTimeout(() => reject(new Error(`Image processing timed out for ${file.name || 'a reference image'}. Try a JPG or PNG under 12 MB.`)), 20000);
      const reader = new FileReader();
      reader.onload = () => {
        const source = new Image();
        source.onload = () => {
          // A compact image is more reliable for 5–10 vision references and is
          // still large enough to preserve palette, composition and texture.
          const maxEdge = 1600;
          const scale = Math.min(1, maxEdge / Math.max(source.naturalWidth || 1, source.naturalHeight || 1));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
          const context = canvas.getContext('2d');
          context.drawImage(source, 0, 0, canvas.width, canvas.height);
          clearTimeout(decodeTimeout);
          resolve(canvas.toDataURL('image/jpeg', 0.84));
        };
        source.onerror = () => { clearTimeout(decodeTimeout); reject(new Error(`Could not decode ${file.name || 'reference image'}.`)); };
        source.src = reader.result;
      };
      reader.onerror = () => { clearTimeout(decodeTimeout); reject(new Error(`Could not read ${file.name || 'reference image'}.`)); };
      reader.readAsDataURL(file);
    });

    const fetchWithTimeout = async (url, init, timeoutMs = 60000) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try { return await fetch(url, { ...init, signal: controller.signal }); }
      catch (error) {
        if (error.name === 'AbortError') throw new Error('Gemini analysis timed out after 60 seconds. Try 5 smaller JPG/PNG images and check your Gemini API quota.');
        throw error;
      } finally { clearTimeout(timeout); }
    };
    const images = await Promise.all(files.map(toDataUrl));
    const content = [
      { type: 'text', text: `Analyze these ${images.length} actual reference images. Return only the requested JSON blueprint.` },
      ...images.map(url => ({ type: 'image_url', image_url: { url } }))
    ];
    if (provider === 'gemini') {
      const geminiParts = [
        { text: `${systemPrompt}\n\nAnalyze these ${images.length} actual reference images. Return only the requested JSON blueprint.` },
        ...images.map(url => ({ inlineData: { mimeType: 'image/jpeg', data: String(url).split(',')[1] } }))
      ];
      // Use separate, currently supported vision-capable Gemini families so a
      // quota spike on one model does not block image analysis altogether.
      // Flash-Lite is deliberately last: it is fast and economical, while the
      // first two options provide richer visual-style descriptions.
      const models = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
      let payload;
      let lastError;
      for (const model of models) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(keys.gemini)}`;
        const send = generationConfig => fetchWithTimeout(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: geminiParts }], generationConfig })
        });
        const sendWithDemandRetry = async generationConfig => {
          let response;
          for (let attempt = 0; attempt < 3; attempt++) {
            response = await send(generationConfig);
            if (response.status !== 429 && response.status !== 503) return response;
            // Provider demand spikes are normally short-lived. Back off before
            // trying the same model, then move to the fallback model.
            if (attempt < 2) await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1200));
          }
          return response;
        };
        let response = await sendWithDemandRetry({ temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } });
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          lastError = error.error?.message || `Gemini image analysis failed (${response.status}).`;
          // Some Gemini model/account combinations reject an optional JSON or
          // thinking setting. Retry the exact same request with only the
          // universally supported generation fields before changing models.
          if (response.status === 400 && /invalid argument|invalid.*config|unsupported/i.test(lastError)) {
            response = await sendWithDemandRetry({ temperature: 0.2, maxOutputTokens: 8192 });
            if (!response.ok) {
              const retryError = await response.json().catch(() => ({}));
              lastError = retryError.error?.message || `Gemini image analysis failed (${response.status}).`;
            }
          }
        }
        if (response.ok) { payload = await response.json(); break; }
        if (response.status !== 404 && response.status !== 429 && response.status !== 503 && !/not found|not supported|does not exist|invalid argument/i.test(lastError)) break;
      }
      if (!payload) throw new Error(lastError || 'Gemini image analysis failed.');
      const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
      try { return JSON.parse(raw); }
      catch (e) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
        throw new Error('Gemini returned an invalid visual style blueprint.');
      }
    }
    const endpoint = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    // Scout was retired from Groq's developer tier. Qwen 3.6 is its current
    // production multimodal replacement; a second current model is kept as a
    // safe fallback for accounts where the first rollout is unavailable.
    const models = provider === 'groq' ? ['qwen/qwen3.6-27b', 'qwen/qwen3.8-27b'] : ['gpt-4o-mini'];
    let payload;
    let lastError;
    for (const model of models) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys[provider]}` },
        body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content }], ...(provider === 'openai' ? { response_format: { type: 'json_object' } } : {}) })
      });
      if (response.ok) { payload = await response.json(); break; }
      const error = await response.json().catch(() => ({}));
      lastError = error.error?.message || `Image analysis failed (${response.status}).`;
      // Only try another model when the account/model is unavailable; surface
      // authentication, quota and image-validation errors immediately.
      if (response.status !== 404) break;
    }
    if (!payload) throw new Error(lastError || 'Image analysis failed.');
    const raw = payload.choices?.[0]?.message?.content || '';

    try {
      return JSON.parse(raw);
    } catch (e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Failed to parse Image Style Blueprint JSON.');
    }
  }

  // ── 8. Script to Timestamped Storyboard Prompts Generator ────
  async function generateTimestampedPrompts(scriptText, styleBlueprint, options = {}) {
    if (!scriptText || !scriptText.trim()) throw new Error('Please paste or provide a script.');

    const {
      targetGenerator = 'Flux.1 / Midjourney v6',
      aspectRatio = '16:9',
      cutIntervalSec = 3.5, // 1 prompt every 3.5s
      detailLevel = 'standard',
      explicitBeats = []
    } = options;

    const styleStr = styleBlueprint ? JSON.stringify(styleBlueprint, null, 2) : 'Photorealistic cinematic 8k, volumetric lighting, rich textures, award winning photography.';

    const systemPrompt = `${VISUAL_STYLE_TO_PROMPT_ENGINE}\n\nYou are an elite cinematic storyboard artist and AI prompt engineer.
Your job is to read the provided script, partition it into sequential visual scenes with exact cut-in timestamps matching Cipher naming conventions (e.g. 0-00.png, 0-04.png, 0-07.png, 0-11.png, 1-15.png), and write vivid, master-level AI image generation prompts for each scene.

Style Blueprint to Apply to EVERY prompt:
${styleStr}

Target AI Generator: ${targetGenerator}
Aspect Ratio: ${aspectRatio}
Target Cut Interval: ~${cutIntervalSec} seconds per visual cut.
Prompt Detail Level: ${detailLevel}. Use concise visuals for basic, balanced cinematic detail for standard, and rich specific composition/lighting/material detail for detailed. Do not invent a fixed subject, location, or story; derive each visual from its matching narration.
${Array.isArray(explicitBeats) && explicitBeats.length ? `\nCRITICAL TIMELINE RULE: Generate exactly ONE scene for each of these supplied beats. Preserve its seconds, timestampStr and narration; do not add, split, omit, or invent timestamps:\n${explicitBeats.map(beat => `- ${beat.timestampStr} (${beat.seconds}s): ${beat.narration}`).join('\n')}` : ''}

Return a valid JSON object matching this schema:
{
  "totalScenes": 12,
  "estimatedDurationSec": 42,
  "styleSuffix": "--ar ${aspectRatio} --v 6.0",
  "scenes": [
    {
      "index": 1,
      "timestampStr": "0-00",
      "seconds": 0,
      "filename": "0-00.png",
      "narration": "Snippet of spoken script line during this visual...",
      "subject": "Main character or visual element",
      "environment": "Location, background, atmosphere",
      "lightingColor": "Specific lighting direction and color mood",
      "fullPrompt": "Must begin with the exact #0-00 timestamp, then a complete ready-to-copy image prompt with all style constraints and parameters",
      "negativePrompt": "blurry, text, watermark, deformed"
    }
  ]
}`;

    const userPrompt = `Here is the full script to convert into sequential timestamped storyboard prompts:\n\n${scriptText}\n\nGenerate the complete JSON storyboard prompt list now:`;

    const keys = getKeys();
    const parseStoryboard = (value) => {
      const clean = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const candidates = [clean];
      const objectMatch = clean.match(/\{[\s\S]*\}/);
      if (objectMatch && objectMatch[0] !== clean) candidates.push(objectMatch[0]);
      for (const candidate of candidates) {
        try { return JSON.parse(candidate); } catch (_) {}
      }

      // Recover valid scene objects even if the model forgot commas between
      // array entries. This is a common failure mode in large JSON outputs.
      const scenesMarker = clean.search(/"scenes"\s*:\s*\[/i);
      if (scenesMarker === -1) return null;
      const start = clean.indexOf('[', scenesMarker);
      const scenes = [];
      let depth = 0, inString = false, escaped = false, objectStart = -1;
      for (let index = start + 1; index < clean.length; index++) {
        const char = clean[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === '\\') escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') { inString = true; continue; }
        if (char === '{') { if (depth === 0) objectStart = index; depth++; continue; }
        if (char === '}' && depth) {
          depth--;
          if (depth === 0 && objectStart >= 0) {
            try { scenes.push(JSON.parse(clean.slice(objectStart, index + 1))); } catch (_) {}
            objectStart = -1;
          }
        }
        if (char === ']' && depth === 0) break;
      }
      return scenes.length ? { totalScenes: scenes.length, scenes } : null;
    };
    if (!keys.groq) throw new Error('Scene Prompts ke liye Groq API key configure karein.');
    const raw = await completePrompt([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { ...options, provider: 'groq', allowProviderFallback: false, jsonMode: true, temperature: 0.7, maxTokens: 8192 });

    const parsed = parseStoryboard(raw);
    if (parsed?.scenes?.length) return parsed;

    // Ask the same selected provider for a clean repair once before failing.
    // Keeping this separate makes an occasional model formatting mistake
    // recoverable without fabricating scenes in the client.
    const repairedRaw = await completePrompt([
      { role: 'system', content: 'Return only valid JSON. Repair the storyboard JSON below without changing its scenes, narration, timestamps, or prompts.' },
      { role: 'user', content: raw }
    ], { provider: 'groq', allowProviderFallback: false, jsonMode: true, temperature: 0, maxTokens: 8192 });
    const repaired = parseStoryboard(repairedRaw);
    if (repaired?.scenes?.length) return repaired;
    throw new Error('AI returned an invalid storyboard response. Please try again.');
  }

  // ── Helper: Word Counter ────────────────────────────────────
  function countWords(str) {
    if (!str) return 0;
    const clean = str.replace(/<[^>]*>/g, ' ').replace(/\[[^\]]*\]/g, ' ').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    return words.length;
  }

  // ── Helper: Viral Score Calculator ──────────────────────────
  function calculateViralScore(script, targetWords) {
    if (!script) return { overall: 0, hook: 0, retention: 0, pacing: 0, clarity: 0 };

    const words = countWords(script);
    const hasVisualMarkers = /\[Visual|Scene|Cut/i.test(script);
    const first50Words = script.slice(0, 300);
    const hasQuestionOrCuriosity = /\?|mystery|secret|never|shocking|discover|truth|imagine/i.test(first50Words);
    
    let hook = hasQuestionOrCuriosity ? 94 : 82;
    let retention = hasVisualMarkers ? 92 : 80;
    let pacing = words >= (targetWords * 0.95) ? 95 : 85;
    let clarity = 90;

    const overall = Math.round((hook * 0.35) + (retention * 0.30) + (pacing * 0.20) + (clarity * 0.15));

    return {
      overall,
      hook,
      retention,
      pacing,
      clarity
    };
  }

  return {
    getKeys, loadSettingsFromServer,
    setKey,
    hasPrimaryApiKey,
    testConnection,
    transcribeAudio: transcribeAudioV2,
    reformatTranscription,
    completePrompt,
    analyzeSingleScriptGroq,
    extractViralTemplatesGroq,
    generateScriptExactWordCount,
    analyzeReferenceScripts,
    generateViralScript: generateScriptExactWordCount,
    analyzeImageStylePrompts,
    generateTimestampedPrompts,
    getVisualStyleToPromptEngine,
    getBuiltInVpgMasterPrompts,
    countWords,
    calculateViralScore
  };
})();
