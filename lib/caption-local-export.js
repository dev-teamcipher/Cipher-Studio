const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');

let busy = false;

// Draw only the transparent caption layer in local Electron. FFmpeg decodes
// the video once and composites/encodes it natively; there are no video seeks,
// remote browsers, media uploads to a cloud, or unbounded frame queues.
async function renderCaptionVideo({ sourcePath, outputPath, snapshot, duration, fps, ffmpeg, encodingArgs, signal, onProgress }) {
  if (busy) throw new Error('An Auto Caption export is already running. Wait for it to finish.');
  busy = true;
  let worker, proc;
  try {
    const { BrowserWindow } = require('electron');
    worker = new BrowserWindow({ show: false, webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false
    }});
    worker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await worker.loadFile(path.join(__dirname, '..', 'assets', 'caption-worker.html'));
    await worker.webContents.executeJavaScript(`window.captionSnapshot = ${JSON.stringify(snapshot)}; CaptionDocument.loadFont(window.captionSnapshot.settings.fontPick)`);
    const width = snapshot.width, height = snapshot.height;
    const graph = `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[video];[1:v]scale=${width}:${height},format=rgba[caption];[video][caption]overlay=shortest=1:format=auto,format=yuv420p[out]`;
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
      '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', 'pipe:0',
      '-filter_complex_threads', '2', '-filter_complex', graph, '-map', '[out]', '-map', '0:a?',
      ...encodingArgs, '-r', String(fps), '-c:a', 'aac', '-b:a', '192k',
      '-af', `volume=${snapshot.volume / 100}`, '-t', String(duration), '-movflags', '+faststart', outputPath];
    proc = spawn(ffmpeg, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let failure = null, stderr = '';
    proc.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-6000); });
    proc.stdin.on('error', error => { failure = error; });
    const closed = new Promise(resolve => {
      proc.once('error', error => { failure = error; resolve(-1); });
      proc.once('close', code => { if (code) failure = new Error(stderr || `FFmpeg exited with ${code}`); resolve(code); });
    });
    const abort = () => { failure = new Error('Export cancelled.'); proc.kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const frames = Math.ceil(duration * fps);
      for (let frame = 0; frame < frames; frame++) {
        if (signal?.aborted || failure) throw failure || new Error('Export cancelled.');
        const png = await worker.webContents.executeJavaScript(`CaptionDocument.draw(document.getElementById('caption-frame'), window.captionSnapshot, ${frame / fps}); document.getElementById('caption-frame').toDataURL('image/png').split(',')[1]`);
        if (failure) throw failure;
        if (!proc.stdin.write(Buffer.from(png, 'base64'))) {
          await Promise.race([once(proc.stdin, 'drain'), closed.then(() => { throw failure || new Error('Encoder stopped.'); })]);
        }
        if (frame % fps === 0) onProgress?.(frame / frames);
      }
      proc.stdin.end();
      const code = await closed;
      if (code !== 0 || failure) throw failure || new Error(stderr);
    } finally { signal?.removeEventListener('abort', abort); }
  } finally {
    if (proc && proc.exitCode === null) proc.kill();
    if (worker && !worker.isDestroyed()) worker.destroy();
    busy = false;
  }
}
module.exports = { renderCaptionVideo };
