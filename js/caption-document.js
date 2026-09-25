/* One caption document for the Auto Caption preview and local export worker. */
window.CaptionDocument = (() => {
  const families = {
    'Poppins': 'caption-poppins.ttf', 'Montserrat': 'caption-montserrat.ttf',
    'Inter': 'caption-inter.ttf', 'Oswald': 'caption-oswald.ttf',
    'Merriweather': 'caption-merriweather.ttf', 'Amiri': 'caption-amiri.ttf',
    'Aref Ruqaa': 'caption-arefruqaa.ttf', 'Gulzar': 'caption-gulzar.ttf',
    'Lateef': 'caption-lateef.ttf', 'Markazi Text': 'caption-markazitext.ttf',
    'Mirza': 'caption-mirza.ttf', 'Scheherazade New': 'caption-scheherazadenew.ttf',
    'Noto Nastaliq Urdu': 'NotoNastaliqUrdu-Regular.ttf',
    'Noto Naskh Arabic': 'NotoNaskhArabic-Regular.ttf',
    'Noto Sans Arabic': 'NotoSansArabic-Regular.ttf'
  };
  const base = new URL('../assets/fonts/', document.currentScript.src);
  const loaded = new Map();
  const fontName = name => families[name] ? `Cipher Local ${name}` : name;
  function loadFont(name) {
    if (!families[name]) return Promise.resolve();
    if (!loaded.has(name)) {
      const face = new FontFace(fontName(name), `url("${new URL(families[name], base).href}")`, { weight: '800' });
      loaded.set(name, face.load().then(font => { document.fonts.add(font); }).catch(error => {
        loaded.delete(name);
        throw new Error(`Caption font ${name} could not be loaded: ${error.message}`);
      }));
    }
    return loaded.get(name);
  }
  function dimensions(spec) {
    const scale = Math.min(1, 1280 / spec.width, 1280 / spec.height);
    return { width: Math.round(spec.width * scale), height: Math.round(spec.height * scale) };
  }
  function draw(canvas, snapshot, time) {
    const size = dimensions(snapshot);
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size.width, size.height);
    const cue = snapshot.cues.find(c => time >= c.start && time < c.end);
    if (!cue) return null;
    const s = snapshot.settings;
    const x = s.align === 'left' ? size.width * 0.09 : s.align === 'right' ? size.width * 0.91 : size.width / 2;
    return window.CaptionStyles.render(ctx, cue.text, x, size.height * s.position / 100, size.width, size.height, {
      ...s, strictControls: true, fontPick: fontName(s.fontPick),
      direction: /[\u0590-\u08FF]/.test(cue.text) ? 'rtl' : 'ltr',
      words: cue.words, time, startTime: cue.start, endTime: cue.end
    });
  }
  return { draw, dimensions, loadFont, fontName, families };
})();
