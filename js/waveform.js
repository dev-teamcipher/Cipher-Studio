/* ============================================================
   WAVEFORM.JS — Audio decode + Canvas waveform drawing
   ============================================================ */

window.WaveformDrawer = (function () {

  let audioBuffer = null;
  let peakEnvelope = null;
  let waveformDuration = 0;
  let decodeGeneration = 0;
  let canvas, ctx;

  // ── Init ───────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('waveform-canvas');
    ctx    = canvas.getContext('2d');
  }

  // ── Decode audio file → AudioBuffer ───────────────────────
  async function decode(audioFile) {
    const generation = ++decodeGeneration;
    const arrayBuf = await audioFile.file.arrayBuffer();
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await ac.decodeAudioData(arrayBuf);
    ac.close?.().catch?.(() => {});
    if (generation !== decodeGeneration) return null;
    audioBuffer = decoded;
    audioFile.decodedBuffer = audioBuffer;
    audioFile.duration = audioBuffer.duration;
    waveformDuration = audioBuffer.duration;
    peakEnvelope = buildPeakEnvelope(audioBuffer);
    return audioBuffer;
  }

  function buildPeakEnvelope(buffer) {
    const bins = Math.max(512, Math.min(32768, Math.ceil(buffer.duration * 20)));
    const peaks = new Float32Array(bins);
    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const probesPerBin = 48;
    const channelData = Array.from({length:channels}, (_, i) => buffer.getChannelData(i));
    for (let x = 0; x < bins; x++) {
      const from = Math.floor(x * length / bins);
      const to = Math.max(from + 1, Math.floor((x + 1) * length / bins));
      const stride = Math.max(1, Math.floor((to - from) / probesPerBin));
      let peak = 0;
      for (let i = from; i < to; i += stride) {
        let mixed = 0;
        for (let c = 0; c < channels; c++) mixed += Math.abs(channelData[c][i] || 0);
        peak = Math.max(peak, mixed / channels);
      }
      peaks[x] = peak;
    }
    return peaks;
  }

  // ── Draw waveform onto the canvas ─────────────────────────
  // totalWidth: total pixel width of the timeline (px per second * duration)
  function draw(totalWidth, duration) {
    canvas.width  = Math.max(totalWidth, canvas.parentElement?.offsetWidth || 600);
    canvas.height = 54;

    const w = canvas.width;
    const h = canvas.height;
    const mid = h / 2;

    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0,   'rgba(10, 11, 15, 0.95)');
    bg.addColorStop(1,   'rgba(10, 11, 15, 0.95)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (!peakEnvelope?.length) return;

    // Draw waveform bars
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0,   '#4ade80');
    gradient.addColorStop(0.4, '#34d399');
    gradient.addColorStop(0.6, '#34d399');
    gradient.addColorStop(1,   '#4ade80');

    ctx.fillStyle = gradient;

    for (let x = 0; x < w; x++) {
      const peak = peakEnvelope?.length
        ? peakEnvelope[Math.min(peakEnvelope.length - 1, Math.floor(x * peakEnvelope.length / w))]
        : 0;
      const barH = Math.max(1, peak * h * 2.2);

      ctx.fillRect(x, mid - barH / 2, 1, barH);
    }

    // Draw cut lines (vertical marks at image timestamps)
    // Called separately via drawCuts()
  }

  // ── Draw playhead line on waveform ────────────────────────
  function drawPlayhead(currentTime, duration, totalWidth) {
    if (!audioBuffer) return;
    const w = canvas.width;
    const x = (currentTime / duration) * w;

    // We do NOT redraw the whole waveform every frame — instead
    // the playhead is drawn on the timeline overlay div.
    return x;
  }

  // ── Getters ────────────────────────────────────────────────
  function getBuffer()   { return audioBuffer; }
  function getCanvas()   { return canvas; }
  function getDuration() { return waveformDuration || (audioBuffer ? audioBuffer.duration : 0); }
  function getEnvelope(maxBins = 8192) {
    if (!peakEnvelope?.length) return null;
    const count=Math.min(maxBins,peakEnvelope.length),out=new Array(count);
    for(let i=0;i<count;i++)out[i]=Number(peakEnvelope[Math.min(peakEnvelope.length-1,Math.floor(i*peakEnvelope.length/count))].toFixed(4));
    return {duration:getDuration(),peaks:out};
  }
  function restoreEnvelope(data) {
    if(!Array.isArray(data?.peaks)||!data.peaks.length)return false;
    peakEnvelope=Float32Array.from(data.peaks,value=>Math.max(0,Math.min(1,Number(value)||0)));
    waveformDuration=Math.max(0,Number(data.duration)||0);
    return true;
  }
  function clear() {
    audioBuffer=null;peakEnvelope=null;waveformDuration=0;decodeGeneration++;
    if(canvas&&ctx){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#090a0f';ctx.fillRect(0,0,canvas.width,canvas.height);}
  }

  return { init, decode, draw, clear, getBuffer, getCanvas, getDuration, getEnvelope, restoreEnvelope };
})();
