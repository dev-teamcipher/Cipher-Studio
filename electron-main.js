const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { once } = require('events');

let localServer;

// Last-resort protection for Windows pipe-close races. Export streams handle
// these errors at their source; this guard ensures an unexpected native stream
// closure can never display Electron's fatal main-process JavaScript dialog.
process.on('uncaughtException', (error) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error || '');
  if (['EPIPE', 'EOV', 'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END'].includes(code) || /write\s+(?:EPIPE|EOV)/i.test(message)) {
    console.error('[Recovered native stream closure]', error);
    return;
  }
  console.error('[Fatal main-process error]', error);
  app.exit(1);
});

async function createMainWindow() {
  const dataRoot = path.join(app.getPath('userData'), 'Cipher Studio Data');
  process.env.AUTOCUT_DATA_DIR = dataRoot;
  // A stable origin is required for Chromium localStorage. Using an ephemeral
  // port made a saved API key appear to disappear after every app restart.
  process.env.AUTOCUT_PORT = process.env.AUTOCUT_PORT || '51973';
  // Native executables/models must live outside app.asar in installed builds.
  const nativeRoot = app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : __dirname;
  // ffmpeg-static resolves to app.asar after packaging, but Windows cannot
  // execute a binary inside that archive. Electron Builder extracts the module
  // to app.asar.unpacked, so the installed app must use that real EXE path.
  process.env.AUTOCUT_FFMPEG_PATH = app.isPackaged
    ? path.join(nativeRoot, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
    : require('ffmpeg-static');
  process.env.AUTOCUT_FFPROBE_PATH = path.join(nativeRoot, 'bin', 'ffprobe.exe');
  process.env.AUTOCUT_WHISPER_BIN = path.join(nativeRoot, 'bin', 'whisper', 'Release', 'whisper-cli.exe');
  process.env.AUTOCUT_WHISPER_MODEL = path.join(nativeRoot, 'assets', 'whisper', 'models', 'ggml-small-q5_1.bin');
  // FFmpeg/libass cannot read fonts from app.asar.  Urdu caption fonts are
  // unpacked alongside the native binaries and passed explicitly at export.
  process.env.AUTOCUT_FONTS_DIR = path.join(nativeRoot, 'assets', 'fonts');

  // server.js reads these environment variables during module loading.
  // Require it only after the writable paths have been defined.
  const { createServer } = require('./server');
  const { renderCaptionVideo } = require('./lib/caption-local-export');
  localServer = createServer(Number(process.env.AUTOCUT_PORT), { launchBrowser: false, captionRenderer: renderCaptionVideo });
  await once(localServer, 'listening');
  const address = localServer.address();
  const appUrl = `http://127.0.0.1:${address.port}`;

  const window = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1100,
    minHeight: 700,
    title: 'Cipher Studio',
    icon: path.join(__dirname, 'assets', 'cipher-studio-icon.png'),
    backgroundColor: '#070c14',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.loadURL(appUrl);
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(createMainWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => localServer?.close());
