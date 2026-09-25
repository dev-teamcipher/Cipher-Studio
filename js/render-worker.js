/* Exact Studio frame renderer running away from the UI thread. */
self.window = self;
importScripts('transitions.js', 'effects.js', 'captions.js');

let sources = [], opts = null;
const bitmapCache = new Map();
const MAX_CACHED_IMAGES = 4;
let blends = [];
const clamp = value => Math.max(0, Math.min(1, value));
const ease = t => t < .5 ? 2*t*t : -1+(4-2*t)*t;

async function loadFont(name) {
  const files = {
    Poppins:'caption-poppins.ttf', Montserrat:'caption-montserrat.ttf', Inter:'caption-inter.ttf',
    Oswald:'caption-oswald.ttf', Merriweather:'caption-merriweather.ttf', Amiri:'caption-amiri.ttf',
    'Aref Ruqaa':'caption-arefruqaa.ttf', Gulzar:'caption-gulzar.ttf', Lateef:'caption-lateef.ttf',
    'Markazi Text':'caption-markazitext.ttf', Mirza:'caption-mirza.ttf',
    'Scheherazade New':'caption-scheherazadenew.ttf', 'Noto Nastaliq Urdu':'NotoNastaliqUrdu-Regular.ttf',
    'Noto Naskh Arabic':'NotoNaskhArabic-Regular.ttf', 'Noto Sans Arabic':'NotoSansArabic-Regular.ttf'
  };
  if (!files[name] || typeof FontFace === 'undefined' || !self.fonts) return;
  const font = await new FontFace(name, `url('../assets/fonts/${files[name]}')`, {weight:'800'}).load();
  self.fonts.add(font);
}
async function getFrame(index) {
  if (bitmapCache.has(index)) {
    const bitmap = bitmapCache.get(index);
    bitmapCache.delete(index);
    bitmapCache.set(index, bitmap);
    return bitmap;
  }
  const response = await fetch(sources[index]);
  if (!response.ok && response.status) throw new Error(`Could not load scene image ${index + 1}.`);
  const bitmap = await createImageBitmap(await response.blob());
  bitmapCache.set(index, bitmap);
  while (bitmapCache.size > MAX_CACHED_IMAGES) {
    const oldest = bitmapCache.keys().next().value;
    const removed = bitmapCache.get(oldest);
    bitmapCache.delete(oldest);
    removed?.close?.();
  }
  return bitmap;
}
function motion(t,index,key,intensity,w,h) {
  const e=ease(t), k=intensity/.3;
  if (key==='static') return {scale:1,dx:0,dy:0,rotate:0};
  if (key==='zoomin') return {scale:1+.16*e*k,dx:0,dy:0,rotate:0};
  if (key==='zoomout') return {scale:1+.18*(1-e)*k,dx:0,dy:0,rotate:0};
  if (key==='panleft') return {scale:1.08,dx:(-.06+e*.12)*w*k,dy:0,rotate:0};
  if (key==='panright') return {scale:1.08,dx:(.06-e*.12)*w*k,dy:0,rotate:0};
  if (key==='tiltup') return {scale:1.10,dx:0,dy:(.06-e*.12)*h*k,rotate:0};
  if (key==='tiltdown') return {scale:1.10,dx:0,dy:(-.06+e*.12)*h*k,rotate:0};
  if (key==='handheld') { const s=t*10; return {scale:1.05+Math.sin(s*1.5)*.02*k,dx:Math.sin(s*3.7)*Math.cos(s*2.1)*16*intensity,dy:Math.cos(s*4.3)*Math.sin(s*1.8)*12*intensity,rotate:Math.sin(s*2.5)*.008*intensity}; }
  if (key==='pulse') return {scale:1.03+Math.abs(Math.sin(t*Math.PI*2))*.08*k,dx:0,dy:0,rotate:0};
  if (key==='diagonal') return {scale:1.12,dx:(-.05+e*.10)*w*k,dy:(-.04+e*.08)*h*k,rotate:0};
  const seeds=[{a:1,b:1.10,fx:-.02,fy:-.02,tx:.02,ty:.02},{a:1.12,b:1,fx:.03,fy:-.02,tx:-.02,ty:.01},{a:1,b:1.08,fx:0,fy:.04,tx:0,ty:-.03},{a:1.08,b:1.02,fx:-.04,fy:0,tx:.04,ty:0},{a:1.04,b:1.14,fx:.02,fy:.02,tx:-.03,ty:-.02}],s=seeds[index%seeds.length];
  return {scale:s.a+(s.b-s.a)*e*k,dx:(s.fx+(s.tx-s.fx)*e)*w*intensity,dy:(s.fy+(s.ty-s.fy)*e)*h*intensity,rotate:0};
}
function drawScene(ctx,scene,img,index,t,w,h) {
  const m=opts.motionEnabled===false ? {scale:1,dx:0,dy:0,rotate:0} : motion(t,index,opts.motionPreset||'auto',Number(opts.motionIntensity??.35),w,h);
  const clipScale=Number(scene.scale??1), px=(Number(scene.posX)||0)/100*w, py=(Number(scene.posY)||0)/100*h, rot=(Number(scene.rotation)||0)*Math.PI/180;
  const iw=img.width||w,ih=img.height||h,scale=Math.max(w/iw,h/ih)*m.scale*clipScale,sw=iw*scale,sh=ih*scale,x=(w-sw)/2+m.dx+px,y=(h-sh)/2+m.dy+py;
  ctx.save(); if (rot+m.rotate) {ctx.translate(w/2+px,h/2+py);ctx.rotate(rot+m.rotate);ctx.translate(-(w/2+px),-(h/2+py));} ctx.drawImage(img,x,y,sw,sh);ctx.restore();
}
function sceneAt(t) { for(let i=0;i<opts.scenes.length;i++)if(t>=opts.scenes[i].startSec&&t<opts.scenes[i].endSec)return i;return opts.scenes.length-1; }
function caption(ctx,t,w,h) {
  if(opts.captionsEnabled===false)return;const cue=(opts.captionCues||[]).find(c=>t>=c.start&&t<c.end);if(!cue?.text)return;
  const align=opts.captionAlign||'center',x=align==='left'?w*.12:align==='right'?w*.88:w*.5;
  CaptionStyles.render(ctx,cue.text,x,h*Number(opts.captionPosY??.83),w,h,{preset:opts.captionPreset||'poppins_yellow',fontPick:opts.captionFont||'Poppins',userCol:opts.captionColor||'#fff',highlightCol:opts.captionHighlightColor||'#FFE600',strokeCol:opts.captionStrokeColor||'#000',strokeWidth:Number(opts.captionStrokeWidth??4),glowCol:opts.captionGlowColor||'#FFE600',glowBlur:Number(opts.captionGlowBlur??8),shadowBlur:Number(opts.captionShadowBlur??6),animStyle:opts.captionAnimStyle||'karaoke_pop',lineAnim:opts.captionLineAnim||'fade_in',textCase:opts.captionTextCase||'uppercase',align,scale:Number(opts.captionScale??1),linesCount:opts.captionLinesCount||'auto',wordsPerLine:Number(opts.captionWordsPerLine)||0,wordSpacing:Number(opts.captionWordSpacing)||0,lineSpacing:Number(opts.captionLineSpacing??1.3),words:cue.words,direction:/[\u0590-\u08FF]/.test(cue.text)?'rtl':'ltr',time:t,startTime:cue.start,endTime:cue.end});
}
async function render(t) {
  const w=opts.width,h=opts.height,c=new OffscreenCanvas(w,h),ctx=c.getContext('2d'),i=sceneAt(t),s=opts.scenes[i],p=clamp((t-s.startSec)/Math.max(.001,s.duration)),next=opts.scenes[i+1],left=s.endSec-t,tr=next&&opts.transitionDuration>0&&left<opts.transitionDuration;
  const currentFrame=await getFrame(i);
  ctx.clearRect(0,0,w,h);
  if(tr){
    for(let slot=0;slot<2;slot++)if(!blends[slot]||blends[slot].width!==w||blends[slot].height!==h)blends[slot]=new OffscreenCanvas(w,h);
    const a=blends[0],b=blends[1],ac=a.getContext('2d'),bc=b.getContext('2d');ac.clearRect(0,0,w,h);bc.clearRect(0,0,w,h);
    const nextFrame=await getFrame(i+1);
    drawScene(ac,s,currentFrame,i,p,w,h);drawScene(bc,next,nextFrame,i+1,0,w,h);Transitions.render(ctx,a,b,clamp(1-left/opts.transitionDuration),s.transition||'crossfade',w,h,i);
  }else drawScene(ctx,s,currentFrame,i,p,w,h);
  if(t<opts.fadeIn){ctx.fillStyle=`rgba(0,0,0,${clamp(1-t/opts.fadeIn)})`;ctx.fillRect(0,0,w,h);}if(t>opts.duration-opts.fadeOut){ctx.fillStyle=`rgba(0,0,0,${clamp((t-(opts.duration-opts.fadeOut))/opts.fadeOut)})`;ctx.fillRect(0,0,w,h);}
  VisualEffects.apply(ctx,w,h,t,{preset:opts.fxPreset||'none',intensity:Number(opts.fxIntensity??.75),letterbox:!!opts.letterbox,particles:!!opts.particles});caption(ctx,t,w,h);return c;
}
self.onmessage=async event=>{const m=event.data;try{
  if(m.type==='init'){opts=m.options;sources=m.sources;try{await loadFont(opts.captionFont);}catch(error){console.warn('[Render worker] Font preload skipped:',error);}postMessage({type:'ready'});return;}
  const canvas=await render(m.time),blob=await canvas.convertToBlob({type:'image/jpeg',quality:m.quality}),buffer=await blob.arrayBuffer();postMessage({type:'frame',id:m.id,buffer},[buffer]);
}catch(error){postMessage({type:'error',id:m.id,message:error.message||String(error)});}};
