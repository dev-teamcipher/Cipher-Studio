/* ============================================================
   EXPORTER.JS — Exact Frame-Accurate Direct Streaming Engine
   ============================================================ */

window.Exporter = (function () {

  let cancelled = false;
  let activeJobId = null, activeController = null, exporting = false;
  const transitionCanvases = [];
  let nativeProgressTimer = null;
  let activeRenderWorkers = [];
  function exportFetch(url, init = {}) {
    return fetch(url, { ...init, signal: activeController?.signal });
  }

  async function createRenderWorkers(count, options, imgs) {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return [];
    const sources = imgs.map(img => img?.currentSrc || img?.src || '').filter(Boolean);
    if (sources.length !== imgs.length) return [];
    const scenes = options.scenes.map(scene => {
      const copy = {};
      for (const [key, value] of Object.entries(scene)) {
        if (key !== 'img' && key !== 'image' && (value == null || ['string','number','boolean'].includes(typeof value))) copy[key] = value;
      }
      return copy;
    });
    const workerOptions = { ...options, scenes, audioBlob:null, audioFile:null, audioUrl:'', duration:options.audioDuration };
    delete workerOptions.onProgress;
    const make = () => new Promise((resolve, reject) => {
      const worker = new Worker('js/render-worker.js');
      const pending = new Map(); let sequence = 0, settled = false;
      const api = {
        worker,
        frame(time, quality) { return new Promise((ok, fail) => { const id=++sequence; pending.set(id,{ok,fail}); worker.postMessage({type:'frame',id,time,quality}); }); },
        stop() { worker.terminate(); for (const p of pending.values()) p.fail(new DOMException('Export cancelled','AbortError')); pending.clear(); }
      };
      const fail = error => { if (!settled) { settled=true; worker.terminate(); reject(error); } else { for(const p of pending.values())p.fail(error);pending.clear(); } };
      const timer=setTimeout(()=>fail(new Error('Background renderer initialization timed out.')),15000);
      worker.onerror = event => fail(new Error(event.message || 'Background renderer failed.'));
      worker.onmessage = event => {
        const message=event.data;
        if(message.type==='ready'){settled=true;clearTimeout(timer);resolve(api);return;}
        const task=pending.get(message.id);if(!task)return;pending.delete(message.id);
        if(message.type==='error')task.fail(new Error(message.message));else task.ok(new Blob([message.buffer],{type:'image/jpeg'}));
      };
      worker.postMessage({type:'init',options:workerOptions,sources});
    });
    const results = await Promise.allSettled(Array.from({length:count},make));
    const ready = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    const failed = results.length - ready.length;
    if (failed) console.warn(`[Exporter] ${failed} background renderer lane(s) unavailable; continuing with ${ready.length || 'the main'} renderer.`);
    return ready;
  }

  function nativeTimelineSupported(options) {
    // Added audio tracks and A1 automation are native FFmpeg operations and
    // must not force thousands of browser-rendered JPEG frames. Only visual
    // ProTimeline layers still require the exact compatibility renderer.
    return window.StudioNative && !window.ProTimeline?.hasVisualClips?.() && !StudioNative.reason(options) && options.scenes.every(s => (s.img || s.image)?.src);
  }

  function captionSettingsFromOptions(options) {
    const preset=window.CaptionStyles?.PRESETS?.[options.captionPreset] || {};
    const scale=Number(options.captionScale) || 1;
    return {
      font: options.captionFont || preset.font || 'Poppins', scale,
      fontSize:Math.max(1,Math.round((Number(options.width)||1920)*.033*scale)),
      position: Math.round((Number(options.captionPosY) || 0.83) * 100), align: options.captionAlign || 'center',
      textCase: options.captionTextCase || 'uppercase', wordsPerLine: Number(options.captionWordsPerLine) || 0,
      wordSpacing: Number(options.captionWordSpacing) || 0, baseColor: options.captionColor || '#FFFFFF',
      highlightColor: options.captionHighlightColor || '#FFDE00', strokeColor: options.captionStrokeColor || '#000000',
      strokeWidth: Number(options.captionStrokeWidth) || 0, glowBlur: Number(options.captionGlowBlur) || 0,
      shadowBlur:Number(options.captionShadowBlur) || 0,tagColor:preset.tagCol || '',
      isStatic:options.captionAnimStyle==='static'||preset.isStatic===true,
      animStyle:options.captionAnimStyle||preset.anim||'karaoke_pop',lineAnim:options.captionLineAnim||'fade_in'
    };
  }

  async function exportNativeTimeline(options, onProgress, onDone) {
    const audioBlob = options.audioBlob || (options.audioFile instanceof Blob ? options.audioFile : await fetch(options.audioUrl).then(r => r.blob()));
    if (!audioBlob) throw new Error('Timeline audio is unavailable for native export.');
    const audioExt = /\.wav$/i.test(options.audioFileName || options.audioUrl || '') ? 'wav' : 'mp3';
    onProgress('Preparing native FFmpeg timeline…', 3);
    const sourceResponse = await exportFetch('/api/stream-render-source', { method:'POST', headers:{'X-File-Ext':audioExt}, body:audioBlob });
    const source = await sourceResponse.json().catch(() => ({}));
    if (!sourceResponse.ok || !source.success) throw new Error(source.error || 'Could not stage timeline audio.');
    const extraAudio=window.ProTimeline?.getAudioClips?.() || [],nativeAudioTracks=[];
    for(let index=0;index<extraAudio.length;index++){
      const clip=extraAudio[index],ext=(clip.name?.split('.').pop()||(clip.blob.type.includes('wav')?'wav':'mp3')).replace(/[^a-z0-9]/gi,'').slice(0,8)||'mp3';
      onProgress(`Preparing native audio track ${index+1} of ${extraAudio.length}…`,4);
      const response=await exportFetch('/api/stream-render-source',{method:'POST',headers:{'X-File-Ext':ext},body:clip.blob});const staged=await response.json().catch(()=>({}));
      if(!response.ok||!staged.success)throw new Error(staged.error||`Could not stage audio track ${index+1}.`);
      nativeAudioTracks.push({sourceId:staged.sourceId,start:clip.start,duration:clip.duration,sourceOffset:clip.sourceOffset,volume:clip.volume,keyframes:clip.keyframes});
    }
    const mainAudioAutomation=window.ProTimeline?.getMainAudioAutomation?.()||{volume:options.audioVolume??100,keyframes:[]};
    const captions = options.captionsEnabled === false ? [] : options.captionCues;
    const initResponse = await exportFetch('/api/native-timeline-init', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
      scenes: options.scenes.map(scene => ({ duration:Number(scene.duration) || Math.max(.2, Number(scene.endSec) - Number(scene.startSec)), transition:scene.transition || 'crossfade', scale: scene.scale ?? 1 })),
      width:options.width, height:options.height, fps:options.fps, quality:options.quality || 'balanced', motionEnabled:options.motionEnabled !== false,
      motionPreset:options.motionPreset, motionIntensity:options.motionIntensity, letterbox:options.letterbox,
      transitionDuration:options.transitionDuration || 0, fadeIn:options.fadeIn || 0, fadeOut:options.fadeOut || 0,
      captions, captionSettings:captionSettingsFromOptions(options), audioSourceId:source.sourceId,
      volume:mainAudioAutomation.volume,mainAudioKeyframes:mainAudioAutomation.keyframes||[],audioTracks:nativeAudioTracks
    })});
    const init = await initResponse.json().catch(() => ({}));
    if (!initResponse.ok || !init.success) throw new Error(init.error || 'Could not initialize native timeline.');
    activeJobId = init.jobId;
    for (let index = 0; index < options.scenes.length; index++) {
      if (cancelled) return false;
      const image = options.scenes[index].img || options.scenes[index].image;
      const imageResponse = await fetch(image.currentSrc || image.src);
      const imageBlob = await imageResponse.blob();
      const ext = imageBlob.type.includes('png') ? 'png' : imageBlob.type.includes('webp') ? 'webp' : 'jpg';
      const upload = await exportFetch(`/api/native-timeline-asset?jobId=${encodeURIComponent(init.jobId)}&index=${index}`, { method:'POST', headers:{'X-File-Ext':ext}, body:imageBlob });
      if (!upload.ok) throw new Error('Could not upload a timeline image for native export.');
      onProgress(`Preparing native timeline images (${index + 1}/${options.scenes.length})…`, Math.round(5 + ((index + 1) / options.scenes.length) * 18));
    }
    onProgress('Rendering with native GPU timeline engine…', 28);
    nativeProgressTimer = setInterval(async()=>{
      try {
        const r=await exportFetch(`/api/native-timeline-progress?jobId=${encodeURIComponent(init.jobId)}`);
        if(!r.ok)return;
        const p=await r.json();
        if(p.seconds>=0)onProgress(`Native render • ${p.encoder || 'Detecting encoder'} • ${p.speed || 'starting'} • ${p.seconds.toFixed(1)}s encoded`,Math.min(98,28+70*p.seconds/options.audioDuration));
      } catch { /* Completion/cancellation closes the job. */ }
    },1000);
    const finishResponse = await exportFetch('/api/native-timeline-finish', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({jobId:init.jobId}) });
    clearInterval(nativeProgressTimer); nativeProgressTimer=null;
    const result = await finishResponse.json().catch(() => ({}));
    if (!finishResponse.ok || !result.success) throw new Error(result.error || 'Native timeline export failed.');
    activeJobId = null;
    onProgress(`Native export complete — ${result.encoder}.`, 100);
    onDone(result.downloadUrl, result.fileName);
    return true;
  }

  async function exportMP4(options, onProgress, onDone, onError) {
    const {
      scenes,
      audioUrl,
      audioDuration,
      fps = 30,
      width = 1920,
      height = 1080,
      fadeIn = 0.5,
      fadeOut = 0.6,
      transitionDuration = 0.4,
      motionEnabled = true,
      motionPreset = 'auto',
      motionIntensity = 0.35,
      fxPreset = 'none',
      fxIntensity = 0.75,
      letterbox = false,
      particles = false,
    } = options;

    if (exporting) { onError(new Error('An export is already running.')); return; }
    exporting = true;
    cancelled = false;
    activeController = new AbortController();
    options = { ...options, scenes: scenes.map(s=>({...s})), captionCues: (window.App?.getCaptions?.() || []).map(c=>({...c})) };
    options.hasCaptions = options.captionCues.length > 0;
    const started = performance.now();

    try {
      onProgress('Initializing hardware-accelerated video pipeline…', 2);

      // Fast path: native FFmpeg handles the whole image timeline directly.
      // The canvas engine remains as a compatibility fallback for effects that
      // are not yet represented by native FFmpeg filters.
      if (nativeTimelineSupported(options)) {
        try {
          if (await exportNativeTimeline(options, onProgress, onDone)) return;
        } catch (nativeError) {
          clearInterval(nativeProgressTimer); nativeProgressTimer=null;
          if (cancelled || nativeError.name === 'AbortError') throw nativeError;
          console.warn('[Native Timeline Export] Falling back to compatibility renderer:', nativeError);
          onProgress('Native timeline unavailable; using compatibility renderer…', 3);
        }
      }

      // Use pre-loaded images directly from scenes
      const imgs = scenes.map(s => s.img || s.image);

      // ── 1. Initialize Pipeline with Server ─────────────────────
      const formData = new FormData();
      formData.append('fps', String(fps));
      formData.append('quality', options.quality || 'balanced');

      let audioExt = 'mp3';
      let audioBlob = options.audioBlob || (options.audioFile instanceof Blob ? options.audioFile : null);

      if (!audioBlob && audioUrl) {
        try {
          audioBlob = await fetch(audioUrl).then(r => r.blob());
        } catch (e) {
          console.warn('[Exporter Audio Fetch Notice]', e);
        }
      }

      if (audioBlob) {
        audioExt = (options.audioFileName && options.audioFileName.endsWith('.wav')) ? 'wav' : (audioUrl && audioUrl.includes('.wav') ? 'wav' : 'mp3');
        // Stream media once to the local render disk instead of embedding it
        // in the settings multipart body. This keeps long exports out of RAM.
          const sourceRes = await exportFetch('/api/stream-render-source', {
          method: 'POST', headers: { 'X-File-Ext': audioExt }, body: audioBlob
        });
        const sourceData = await sourceRes.json().catch(() => ({}));
        if (!sourceRes.ok || !sourceData.success) throw new Error(sourceData.error || 'Could not stage the export audio.');
        formData.append('sourceId', sourceData.sourceId);
      }

      // Stage optional A2+ clips independently. The local FFmpeg process mixes
      // these sources; no cloud/API service is involved.
      const extraAudio = window.ProTimeline?.getAudioClips?.() || [];
      const stagedAudio = [];
      for (let index=0; index<extraAudio.length; index++) {
        const clip=extraAudio[index];
        const ext=(clip.name?.split('.').pop() || (clip.blob.type.includes('wav')?'wav':'mp3')).replace(/[^a-z0-9]/gi,'').slice(0,8) || 'mp3';
        onProgress(`Preparing audio track ${index+1} of ${extraAudio.length}…`, 3);
        const response=await exportFetch('/api/stream-render-source',{method:'POST',headers:{'X-File-Ext':ext},body:clip.blob});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||!result.success)throw new Error(result.error||`Could not stage audio track ${index+1}.`);
        stagedAudio.push({sourceId:result.sourceId,start:clip.start,duration:clip.duration,sourceOffset:clip.sourceOffset,volume:clip.volume,keyframes:clip.keyframes});
      }
      if(stagedAudio.length)formData.append('audioTracks',JSON.stringify(stagedAudio));
      formData.append('audioExt', audioExt);
      const mainAudioAutomation=window.ProTimeline?.getMainAudioAutomation?.() || {volume:options.audioVolume !== undefined ? options.audioVolume : 100,keyframes:[]};
      formData.append('volume', String(mainAudioAutomation.volume));
      if(mainAudioAutomation.keyframes?.length)formData.append('mainAudioKeyframes',JSON.stringify(mainAudioAutomation.keyframes));

      const initRes = await exportFetch('/api/stream-render-init', {
        method: 'POST',
        body: formData
      });

      let initData;
      try {
        initData = await initRes.json();
      } catch (err) {
        throw new Error('Render server connection error: Server did not return a valid response. Please ensure server is running.');
      }
      if (!initRes.ok || !initData.success) {
        throw new Error(initData.error || 'Failed to initialize render stream on server');
      }

      const jobId = initData.jobId;
      activeJobId = jobId;

      // ── 2. Render Frame by Frame & Stream to FFmpeg Stdin ──────
      const totalFrames = Math.max(1, Math.ceil(audioDuration * fps));
      // One canvas forced every JPEG conversion to wait for the previous frame.
      // Use a small canvas pool so Chromium can encode several frames in
      // parallel while the main thread prepares the next visual frames.
      const hasProVideo = window.ProTimeline?.hasVideoClips?.() || false;
      const hasProEdits = window.ProTimeline?.hasAnyClips?.() || false;
      const ENCODE_WORKERS = hasProVideo ? 1 : Math.max(1, Math.min(6, navigator.hardwareConcurrency || 4, Math.floor(64 * 1024 * 1024 / (width * height * 4))));
      const canvasPool = Array.from({ length: ENCODE_WORKERS }, () => {
        const canvas = new OffscreenCanvas(width, height);
        return { canvas, ctx: canvas.getContext('2d') };
      });
      activeRenderWorkers = hasProEdits ? [] : await createRenderWorkers(ENCODE_WORKERS, options, imgs);
      const backgroundRendering = activeRenderWorkers.length > 0;
      const RENDER_LANES = backgroundRendering ? activeRenderWorkers.length : ENCODE_WORKERS;

      // Fewer local HTTP round-trips materially improves long timeline export
      // while the server still honours FFmpeg stdin back-pressure.
      const BATCH_SIZE = 24;
      let currentBatchBlobs = [];
      let batchBytes = 0;
      let uploadPromise = Promise.resolve();
      let uploadError = null;

      const queueBatch = async (blobs) => {
        // One in-flight upload plus one batch being rendered, never an
        // unbounded promise chain retaining all frames of a long movie.
        await uploadPromise;
        if (uploadError) throw uploadError;
        if (cancelled) throw new DOMException('Export cancelled', 'AbortError');
        const batchCombined = new Blob(blobs, { type: 'application/octet-stream' });
        const previousUpload = uploadPromise;
        uploadPromise = (async () => {
          await previousUpload;
          const response = await exportFetch(`/api/stream-render-chunk?jobId=${encodeURIComponent(jobId)}`, {
            method: 'POST', body: batchCombined
          });
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'The local render pipeline stopped accepting frames.');
          }
        })().catch(error => { uploadError = error; });
      };

      for (let frame = 0; frame < totalFrames; frame += RENDER_LANES) {
        if (cancelled) {
          onProgress('Export cancelled.', 0);
          return;
        }

        const work = [];
        for (let slot = 0; slot < RENDER_LANES && frame + slot < totalFrames; slot++) {
          const frameNumber = frame + slot;
          const worker = canvasPool[slot];
          const t = frameNumber / fps;
          if (hasProVideo) await window.ProTimeline.prepareFrame(t);
          // Balanced exports use a compact JPEG source stream. The final H.264
          // file still receives the selected bitrate, while local IPC/data copy
          // falls substantially on long timelines.
          const jpegQuality = options.quality === 'high' ? 0.90 : 0.80;
          if (backgroundRendering) {
            work.push(activeRenderWorkers[slot].frame(t, jpegQuality).catch(async error => {
              // A single unusual image must not abort or downgrade the whole
              // export. Render that frame with the proven main Canvas path.
              console.warn(`[Exporter] Worker lane ${slot + 1} used the safe frame fallback:`, error);
              renderFrameAt(worker.ctx, scenes, imgs, t, audioDuration, width, height, options);
              return worker.canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
            }));
          }
          else {
            renderFrameAt(worker.ctx, scenes, imgs, t, audioDuration, width, height, options);
            work.push(worker.canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality }));
          }
        }
        const blobs = await Promise.all(work);
        for (const blob of blobs) {
          currentBatchBlobs.push(blob);
          batchBytes += blob.size;
          if (currentBatchBlobs.length >= BATCH_SIZE || batchBytes >= 8 * 1024 * 1024) {
            await queueBatch(currentBatchBlobs);
            currentBatchBlobs = [];
            batchBytes = 0;
          }
        }
        const completed = Math.min(totalFrames, frame + RENDER_LANES);
        const pct = Math.round((completed / totalFrames) * 90);
        const speed = completed / Math.max(.001, (performance.now()-started)/1000);
        onProgress(`${backgroundRendering ? 'Parallel render' : 'Rendering'} • ${initData.encoder || 'H.264'} • ${speed.toFixed(1)} fps • ${(speed/fps).toFixed(2)}× realtime (${completed}/${totalFrames})`, pct);
      }
      if (currentBatchBlobs.length) {
        await queueBatch(currentBatchBlobs);
      }

      await uploadPromise;
      if (uploadError) throw uploadError;

      if (cancelled) return;

      // ── 3. Finalize Video Stream ──────────────────────────────
      onProgress('Finalizing MP4 container & audio sync…', 94);

      const finishRes = await exportFetch('/api/stream-render-finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });

      const finishData = await finishRes.json();
      if (!finishRes.ok || !finishData.success) {
        throw new Error(finishData.error || 'Server failed to finalize video');
      }

      onProgress('Video export complete! 🎬', 100);
      activeJobId = null;
      onDone(finishData.downloadUrl, finishData.fileName);

    } catch (err) {
      if (cancelled || err.name === 'AbortError') { onProgress('Export cancelled.', 0); return; }
      console.error('[Export Error]', err);
      onError(err);
    } finally {
      clearInterval(nativeProgressTimer); nativeProgressTimer=null;
      if (activeJobId) await fetch('/api/stream-render-cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:activeJobId})}).catch(()=>{});
      activeJobId = null; activeController = null; exporting = false;
      transitionCanvases.length = 0;
      for (const worker of activeRenderWorkers) worker.stop();
      activeRenderWorkers = [];
    }
  }

  function cancelExport() {
    cancelled = true;
  }

  function getSceneIndexAt(t, scenes, totalDuration) {
    for (let i = 0; i < scenes.length; i++) {
      if (t >= scenes[i].startSec && t < scenes[i].endSec) return i;
    }
    return -1;
  }

  function renderFrameAt(ctx, scenes, imgs, t, duration, w, h, opts) {
    const {
      fadeIn = 0.5,
      fadeOut = 0.6,
      transitionDuration = 0.4,
      motionEnabled = true,
      motionPreset = 'auto',
      motionIntensity = 0.35,
      fxPreset = 'none',
      fxIntensity = 0.75,
      letterbox = false,
      particles = false
    } = opts;

    const sceneIdx = getSceneIndexAt(t, scenes, duration);
    const rawScene = sceneIdx>=0 ? scenes[sceneIdx] : null;
    if(!rawScene){ctx.clearRect(0,0,w,h);ctx.fillStyle='#08090d';ctx.fillRect(0,0,w,h);window.ProTimeline?.renderVisualLayers?.(ctx,t,w,h);drawCaptions(ctx,t,w,h,opts);return;}
    const scene = window.ProTimeline?.resolveLegacyScene?.(rawScene, t) || rawScene;
    const img   = imgs[sceneIdx];
    const tScene = scene.duration > 0 ? (t - scene.startSec) / scene.duration : 0;

    const nextRawScene = scenes[sceneIdx + 1];
    const nextScene = window.ProTimeline?.resolveLegacyScene?.(nextRawScene, t) || nextRawScene;
    const nextImg   = nextScene ? imgs[sceneIdx + 1] : null;
    const timeLeft  = scene.endSec - t;
    const inTr      = nextScene && timeLeft < transitionDuration && transitionDuration > 0;
    const tTr       = inTr ? Math.max(0, Math.min(1, 1 - timeLeft / transitionDuration)) : 0;

    ctx.clearRect(0, 0, w, h);

    if (inTr && nextImg) {
      const fromC = drawMotionToCanvas(scene, img, sceneIdx, tScene, w, h, motionEnabled, motionPreset, motionIntensity, 0);
      const toC   = drawMotionToCanvas(nextScene, nextImg, sceneIdx + 1, 0, w, h, motionEnabled, motionPreset, motionIntensity, 1);
      Transitions.render(ctx, fromC, toC, tTr, scene.transition || 'crossfade', w, h, sceneIdx);
    } else {
      if (motionEnabled && img) {
        drawMotion(ctx, scene, img, sceneIdx, tScene, w, h, motionPreset, motionIntensity);
      } else if (img) {
        drawStaticScene(ctx, scene, img, w, h);
      } else {
        ctx.fillStyle = '#08090d';
        ctx.fillRect(0, 0, w, h);
      }
    }

    // Fades
    if (t < fadeIn && fadeIn > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, 1 - t / fadeIn)})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (t > duration - fadeOut && fadeOut > 0) {
      ctx.fillStyle = `rgba(0,0,0,${Math.min(1, (t - (duration - fadeOut)) / fadeOut)})`;
      ctx.fillRect(0, 0, w, h);
    }

    // Visual Atmosphere & Genre FX
    if (window.VisualEffects) {
      window.VisualEffects.apply(ctx, w, h, t, {
        preset: fxPreset || 'none',
        intensity: fxIntensity !== undefined ? fxIntensity : 0.75,
        letterbox: letterbox || false,
        particles: particles || false
      });
    }

    window.ProTimeline?.renderVisualLayers?.(ctx, t, w, h);

    // Captions
    if (opts.captionsEnabled !== false) {
      drawCaptions(ctx, t, w, h, opts);
    }
  }

  function drawMotion(ctx, scene, img, index, t, w, h, presetKey, intensity) {
    const presets = window.Preview?.getMotionPresets?.() || {};
    const preset  = presets[presetKey] || presets.auto;
    const { scale: motScale, dx: motDx, dy: motDy, rotate: motRot } = preset ? preset.calc(t, index, intensity, w, h) : { scale: 1, dx: 0, dy: 0, rotate: 0 };

    const clipScale = (scene && scene.scale !== undefined && !isNaN(scene.scale)) ? scene.scale : 1.0;
    const clipPosX  = (scene && scene.posX !== undefined && !isNaN(scene.posX)) ? (scene.posX / 100) * w : 0;
    const clipPosY  = (scene && scene.posY !== undefined && !isNaN(scene.posY)) ? (scene.posY / 100) * h : 0;
    const clipRot   = (scene && scene.rotation !== undefined && !isNaN(scene.rotation)) ? (scene.rotation * Math.PI / 180) : 0;

    const scale  = motScale * clipScale;
    const dx     = motDx + clipPosX;
    const dy     = motDy + clipPosY;
    const rotate = motRot + clipRot;
    const clipOpacity = Math.max(0, Math.min(1, Number(scene?.opacity ?? 100) / 100));
    const clipBlur = Math.max(0, Number(scene?.blur) || 0);

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

  function drawStaticScene(ctx, scene, img, w, h) {
    const clipScale = (scene && scene.scale !== undefined && !isNaN(scene.scale)) ? scene.scale : 1.0;
    const clipPosX  = (scene && scene.posX !== undefined && !isNaN(scene.posX)) ? (scene.posX / 100) * w : 0;
    const clipPosY  = (scene && scene.posY !== undefined && !isNaN(scene.posY)) ? (scene.posY / 100) * h : 0;
    const clipRot   = (scene && scene.rotation !== undefined && !isNaN(scene.rotation)) ? (scene.rotation * Math.PI / 180) : 0;
    const clipOpacity = Math.max(0, Math.min(1, Number(scene?.opacity ?? 100) / 100));
    const clipBlur = Math.max(0, Number(scene?.blur) || 0);

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

  function drawMotionToCanvas(scene, img, index, t, w, h, motionEnabled, presetKey, intensity, slot) {
    let off = transitionCanvases[slot];
    if (!off || off.width !== w || off.height !== h) off = transitionCanvases[slot] = new OffscreenCanvas(w, h);
    const oc  = off.getContext('2d');
    oc.clearRect(0, 0, w, h);
    if (motionEnabled && img) {
      drawMotion(oc, scene, img, index, t, w, h, presetKey, intensity);
    } else if (img) {
      drawStaticScene(oc, scene, img, w, h);
    }
    return off;
  }

  function drawCaptions(ctx, time, w, h, opts = {}) {
    const captions = opts.captionCues || window.App?.getCaptions?.() || [];
    const cap = captions.find(c => time >= c.start && time < c.end);
    if (!cap || !cap.text) return;

    const posYPct = opts.captionPosY !== undefined ? opts.captionPosY : 0.83;
    const align   = opts.captionAlign || 'center';
    const targetY = h * posYPct;
    let targetX   = w * 0.5;
    if (align === 'left')  targetX = w * 0.12;
    if (align === 'right') targetX = w * 0.88;

    if (window.CaptionStyles) {
      window.CaptionStyles.render(ctx, cap.text, targetX, targetY, w, h, {
        preset: opts.captionPreset || 'poppins_yellow',
        fontPick: opts.captionFont || 'Poppins',
        userCol: opts.captionColor || '#FFFFFF',
        highlightCol: opts.captionHighlightColor || '#FFDE00',
        strokeCol: opts.captionStrokeColor || '#000000',
        strokeWidth: opts.captionStrokeWidth !== undefined ? opts.captionStrokeWidth : 4,
        glowCol: opts.captionGlowColor || '#FFDE00',
        glowBlur: opts.captionGlowBlur !== undefined ? opts.captionGlowBlur : 8,
        shadowBlur: opts.captionShadowBlur !== undefined ? opts.captionShadowBlur : 6,
        animStyle: opts.captionAnimStyle || 'karaoke_pop',
        lineAnim: opts.captionLineAnim || 'fade_in',
        textCase: opts.captionTextCase || 'uppercase',
        align: align,
        scale: opts.captionScale || 1.0,
        linesCount: opts.captionLinesCount || 'auto',
        wordsPerLine: opts.captionWordsPerLine || 0,
        wordSpacing: opts.captionWordSpacing || 0,
        lineSpacing: opts.captionLineSpacing || 1.30,
        isDragging: false,
        time: time,
        startTime: cap.start,
        endTime: cap.end
      });
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

  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function cancel() {
    cancelled = true;
    activeController?.abort();
    for (const worker of activeRenderWorkers) worker.stop();
    activeRenderWorkers = [];
    if (activeJobId) fetch('/api/stream-render-cancel', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobId:activeJobId})}).catch(()=>{});
  }

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'cipher-video.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return { exportMP4, cancel, download };
})();
