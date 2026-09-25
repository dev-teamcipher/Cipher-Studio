/* ============================================================
   PRO-TIMELINE.JS — additive multi-track editing + keyframes
   Keeps the legacy V1/A1 timeline intact and only composites optional
   tracks when the user creates them.
   ============================================================ */

window.ProTimeline = (function () {
  const EPS = 0.04;
  const MAX_HISTORY = 80;
  const VISUAL_TYPES = new Set(['video', 'image', 'text', 'overlay']);
  const DEFAULTS = Object.freeze({ x:0, y:0, scale:1, rotation:0, opacity:100, blur:0, volume:100 });
  let tracks = [];
  let mediaLibrary = [];
  let duration = 0;
  let selectedTrackId = null;
  let selectedClipId = null;
  let legacySceneIndex = -1;
  let legacyAudioSelected = false;
  let snapping = true;
  let undoStack = [];
  let redoStack = [];
  let restoring = false;
  let dragState = null;
  let idCounter = 0;
  let lastInspectorUpdate = 0;
  let mainAudioAutomation = { transform:{...DEFAULTS}, keyframes:{} };
  let clipAudioContext = null;
  let commonTransformEdit = '';
  let legacyResizeActive = false;

  const id = prefix => `${prefix}_${Date.now().toString(36)}_${(++idCounter).toString(36)}`;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const cloneData = value => JSON.parse(JSON.stringify(value));
  const getTime = () => window.Preview?.getCurrentTime?.() || 0;
  const getZoom = () => window.Timeline?.getPxPerSec?.() || 80;
  const selectedTrack = () => tracks.find(t => t.id === selectedTrackId) || null;
  const selectedClip = () => selectedTrack()?.clips.find(c => c.id === selectedClipId) || null;

  function normalizeTransform(input = {}) {
    input = input || {};
    return {
      x: clamp(input.x ?? input.posX ?? DEFAULTS.x, -200, 200),
      y: clamp(input.y ?? input.posY ?? DEFAULTS.y, -200, 200),
      scale: clamp(input.scale ?? DEFAULTS.scale, .05, 10),
      rotation: clamp(input.rotation ?? DEFAULTS.rotation, -360, 360),
      opacity: clamp(input.opacity ?? DEFAULTS.opacity, 0, 100),
      blur: clamp(input.blur ?? DEFAULTS.blur, 0, 100),
      volume: clamp(input.volume ?? DEFAULTS.volume, 0, 200)
    };
  }

  function normalizedKeyframes(input = {}) {
    input = input || {};
    const out = {};
    Object.keys(DEFAULTS).forEach(prop => {
      out[prop] = (Array.isArray(input[prop]) ? input[prop] : [])
        .map(k => ({ time:Math.max(0, Number(k.time) || 0), value:Number(k.value) }))
        .filter(k => Number.isFinite(k.value))
        .sort((a,b) => a.time-b.time);
    });
    return out;
  }

  function valueAt(base, keys, time) {
    if (!keys?.length) return base;
    if (time <= keys[0].time) return keys[0].value;
    const last = keys[keys.length - 1];
    if (time >= last.time) return last.value;
    for (let i=1; i<keys.length; i++) {
      if (time <= keys[i].time) {
        const a=keys[i-1], b=keys[i], span=Math.max(.0001,b.time-a.time);
        const p=(time-a.time)/span;
        return a.value+(b.value-a.value)*p;
      }
    }
    return base;
  }

  function resolvedTransform(target, localTime) {
    const base = normalizeTransform(target?.transform || target || {});
    const keys = normalizedKeyframes(target?.keyframes || {});
    const out = {};
    Object.keys(DEFAULTS).forEach(prop => { out[prop] = valueAt(base[prop], keys[prop], Math.max(0,localTime)); });
    return out;
  }

  function snapshot() {
    return {
      legacyScenes:(window.App?.getScenes?.() || []).map(scene => ({...scene, transform:scene.transform?cloneData(scene.transform):null, keyframes:scene.keyframes?cloneData(scene.keyframes):null})),
      tracks: tracks.map(t => ({
        ...t,
        clips:t.clips.map(c => ({...c, media:null, element:null, audioSource:null, gainNode:null, blob:c.blob || null}))
      })),
      mediaLibrary:mediaLibrary.map(asset=>({...asset,url:'',element:null,blob:asset.blob||null})),
      mainAudioAutomation:cloneData(mainAudioAutomation),
      selectedTrackId, selectedClipId, legacySceneIndex, legacyAudioSelected, snapping, duration
    };
  }

  async function applySnapshot(state) {
    restoring = true;
    try {
      // Set the project duration before normalizeClip() runs. Older projects do
      // not carry this field, so use the duration already restored into App.
      // Otherwise every V2/V3 clip start can be clamped to 0 on reopen.
      const stateDuration = Number(state?.duration);
      const appDuration = Number(window.App?.getDuration?.());
      const restoredDuration = stateDuration > 0
        ? stateDuration
        : appDuration > 0
          ? appDuration
          : Math.max(0, Number(duration) || 0);
      if (restoredDuration > 0) duration = restoredDuration;
      if (Array.isArray(state?.legacyScenes) && window.App?.setScenes) {
        window.App.setScenes(state.legacyScenes.map(scene => ({...scene, transform:scene.transform?cloneData(scene.transform):null, keyframes:scene.keyframes?cloneData(scene.keyframes):null})), {preserveTimelineView:true,duration:restoredDuration});
        duration=restoredDuration;
      }
      releaseMedia();
      tracks = (state?.tracks || []).map(t => ({...t, clips:(t.clips || []).map(c => normalizeClip({...c, blob:c.blob instanceof Blob ? c.blob : null}))}));
      mediaLibrary=(state?.mediaLibrary||[]).map(asset=>normalizeAsset({...asset,blob:asset.blob instanceof Blob?asset.blob:null}));
      await Promise.all(mediaLibrary.map(hydrateAsset));
      const clips=tracks.flatMap(track=>track.clips);
      await Promise.all(clips.map(async clip=>{
        const shared=(clip.type==='image'||clip.type==='overlay')&&mediaLibrary.find(asset=>asset.type==='image'&&asset.name===clip.name&&asset.blob?.size===clip.blob?.size);
        if(shared?.element){clip.url=shared.url;clip.element=shared.element;return;}
        await hydrateClip(clip);
      }));
      mainAudioAutomation={transform:normalizeTransform(state?.mainAudioAutomation?.transform||{volume:Number(document.getElementById('sl-audio-volume')?.value)||100}),keyframes:normalizedKeyframes(state?.mainAudioAutomation?.keyframes)};
      selectedTrackId = tracks.some(track => track.id === state?.selectedTrackId) ? state.selectedTrackId : null;
      selectedClipId = selectedTrackId && tracks.find(track => track.id === selectedTrackId)?.clips.some(clip => clip.id === state?.selectedClipId) ? state.selectedClipId : null;
      legacySceneIndex = Number.isInteger(state?.legacySceneIndex) ? state.legacySceneIndex : -1;
      legacyAudioSelected=state?.legacyAudioSelected===true;
      snapping = state?.snapping !== false;
      if(tracks.some(track=>track.v1ReplacementTrack&&track.clips.length))window.Timeline?.build?.(window.App?.getScenes?.()||[],duration,{preserveView:true});
      window.Timeline?.selectClip?.(legacySceneIndex);
      renderMediaLibrary();renderTracks(); updateInspector(); updateButtons(); refreshPreview();
    } finally { restoring = false; }
  }

  function commit(label) {
    if (restoring) return;
    undoStack.push({ label, state:snapshot() });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    updateButtons();
    window.Projects?.scheduleAutoSave?.();
  }

  async function undo() {
    if (!undoStack.length) return;
    const item=undoStack.pop();
    redoStack.push({label:item.label,state:snapshot()});
    await applySnapshot(item.state); updateButtons(); toast(`↶ ${item.label}`);
  }

  async function redo() {
    if (!redoStack.length) return;
    const item=redoStack.pop();
    undoStack.push({label:item.label,state:snapshot()});
    await applySnapshot(item.state); updateButtons(); toast(`↷ ${item.label}`);
  }

  function normalizeClip(c = {}) {
    return {
      id:c.id || id('clip'), type:c.type || 'image', name:c.name || 'Clip', text:c.text || '',
      start:clamp(c.start,0,Math.max(0,duration)), duration:Math.max(.1,Number(c.duration)||3),
      sourceOffset:Math.max(0,Number(c.sourceOffset)||0), sourceDuration:Math.max(0,Number(c.sourceDuration)||0),
      linkedLegacyIndex:Number.isInteger(c.linkedLegacyIndex)?c.linkedLegacyIndex:null,
      stockId:c.stockId||'',provider:c.provider||'',creator:c.creator||'',creatorUrl:c.creatorUrl||'',pageUrl:c.pageUrl||'',attribution:c.attribution||'',
      transform:normalizeTransform(c.transform), keyframes:normalizedKeyframes(c.keyframes),
      blob:c.blob instanceof Blob ? c.blob : null, url:c.url || '', media:null, element:null, audioSource:null, gainNode:null
    };
  }

  function normalizeAsset(asset={}){
    return {id:asset.id||id('media'),name:asset.name||'Media',type:asset.type||'image',duration:Math.max(0,Number(asset.duration)||0),blob:asset.blob instanceof Blob?asset.blob:null,url:asset.url||'',element:null,thumbnail:typeof asset.thumbnail==='string'?asset.thumbnail:'',stockId:asset.stockId||'',provider:asset.provider||'',creator:asset.creator||'',creatorUrl:asset.creatorUrl||'',pageUrl:asset.pageUrl||'',attribution:asset.attribution||''};
  }

  async function captureVideoThumbnail(asset,video){
    if(asset.thumbnail||!(video instanceof HTMLVideoElement))return;
    try{
      if(video.readyState<2)await new Promise(resolve=>{const done=()=>resolve();video.addEventListener('loadeddata',done,{once:true});video.addEventListener('error',done,{once:true});setTimeout(done,1800);});
      if(!video.videoWidth||!video.videoHeight)return;
      const target=Math.min(Math.max(.08,(video.duration||1)*.08),Math.max(.08,(video.duration||1)-.05));
      if(Math.abs((video.currentTime||0)-target)>.03)await new Promise(resolve=>{const done=()=>resolve();video.addEventListener('seeked',done,{once:true});video.currentTime=target;setTimeout(done,1000);});
      const canvas=document.createElement('canvas'),ratio=video.videoWidth/video.videoHeight;if(ratio>=1){canvas.width=320;canvas.height=Math.max(120,Math.round(320/ratio));}else{canvas.height=320;canvas.width=Math.max(120,Math.round(320*ratio));}const context=canvas.getContext('2d',{alpha:false});context.drawImage(video,0,0,canvas.width,canvas.height);asset.thumbnail=canvas.toDataURL('image/jpeg',.76);
      video.currentTime=0;
    }catch(error){console.warn('[Media Thumbnail]',asset.name,error);}
  }

  async function hydrateAsset(asset){
    if(!asset.blob&&!asset.url)return;
    if(asset.blob&&(!asset.url||asset.url.startsWith('blob:')))asset.url=URL.createObjectURL(asset.blob);
    if(asset.type==='image'){const img=new Image();img.src=asset.url;asset.element=img;await new Promise(resolve=>{if(img.complete)return resolve();img.onload=resolve;img.onerror=resolve;});return;}
    const el=document.createElement(asset.type==='video'?'video':'audio');el.preload=asset.type==='video'?'auto':'metadata';if(asset.type==='video'){el.muted=true;el.playsInline=true;}el.src=asset.url;asset.element=el;
    await new Promise(resolve=>{const done=()=>resolve();el.addEventListener('loadedmetadata',done,{once:true});el.addEventListener('error',done,{once:true});setTimeout(done,1800);});
    if(Number.isFinite(el.duration)&&el.duration>0)asset.duration=el.duration;
    if(asset.type==='video')await captureVideoThumbnail(asset,el);
  }

  async function hydrateClip(clip) {
    if (!clip.blob && !clip.url) return;
    if (clip.blob && (!clip.url || clip.url.startsWith('blob:'))) clip.url=URL.createObjectURL(clip.blob);
    if (clip.type === 'audio') {
      const el=new Audio(); el.preload='auto'; el.src=clip.url; clip.element=el;
      await new Promise(resolve=>{const done=()=>resolve();el.addEventListener('loadedmetadata',done,{once:true});el.addEventListener('error',done,{once:true});setTimeout(done,1800);});
      return;
    }
    const isVideo = clip.type === 'video' && (clip.blob?.type?.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(clip.name));
    if (isVideo) {
      const el=document.createElement('video'); el.preload='auto'; el.muted=true; el.playsInline=true; el.src=clip.url; clip.element=el;
      await new Promise(resolve => { const done=()=>resolve(); el.addEventListener('loadeddata',done,{once:true}); el.addEventListener('error',done,{once:true}); setTimeout(done,2500); });
    } else {
      const el=new Image(); el.src=clip.url; clip.element=el;
      await new Promise(resolve => { if(el.complete)return resolve(); el.onload=resolve;el.onerror=resolve; });
    }
  }

  function releaseMedia() {
    for (const track of tracks) for (const clip of track.clips) {
      clip.element?.pause?.();
      clip.audioSource?.disconnect?.();clip.gainNode?.disconnect?.();
      if (clip.url?.startsWith('blob:')) URL.revokeObjectURL(clip.url);
    }
    for(const asset of mediaLibrary){asset.element?.pause?.();if(asset.url?.startsWith('blob:'))URL.revokeObjectURL(asset.url);}
  }

  function init() {
    const addTrackButton=document.getElementById('btn-pro-add-track'),trackMenu=document.getElementById('pro-track-type-menu');
    addTrackButton?.addEventListener('click',e=>{e.stopPropagation();const opening=trackMenu?.classList.contains('hidden');trackMenu?.classList.toggle('hidden',!opening);addTrackButton.setAttribute('aria-expanded',String(!!opening));});
    document.querySelectorAll('[data-new-track]').forEach(button=>button.addEventListener('click',e=>{e.stopPropagation();const select=document.getElementById('pro-track-type');if(select)select.value=button.dataset.newTrack;trackMenu?.classList.add('hidden');addTrackButton?.setAttribute('aria-expanded','false');addSelectedTrackType();}));
    document.addEventListener('click',()=>{trackMenu?.classList.add('hidden');addTrackButton?.setAttribute('aria-expanded','false');});
    document.getElementById('btn-pro-import-library')?.addEventListener('click', () => document.getElementById('pro-media-input')?.click());
    document.getElementById('pro-media-input')?.addEventListener('change', importFiles);
    document.getElementById('btn-pro-import-audio')?.addEventListener('click',()=>document.getElementById('pro-audio-input')?.click());
    document.getElementById('pro-audio-input')?.addEventListener('change',importFiles);
    document.getElementById('btn-pro-add-text')?.addEventListener('click', addText);
    document.getElementById('btn-pro-split')?.addEventListener('click', splitSelected);
    document.getElementById('btn-pro-ripple-delete')?.addEventListener('click', rippleDelete);
    document.getElementById('btn-pro-delete-left')?.addEventListener('click',()=>deleteSide('left'));
    document.getElementById('btn-pro-delete-right')?.addEventListener('click',()=>deleteSide('right'));
    document.getElementById('btn-pro-duplicate')?.addEventListener('click', duplicateSelected);
    document.getElementById('btn-pro-slip-left')?.addEventListener('click', () => slipSelected(-.25));
    document.getElementById('btn-pro-slip-right')?.addEventListener('click', () => slipSelected(.25));
    document.getElementById('btn-pro-snap')?.addEventListener('click', toggleSnap);
    document.getElementById('btn-pro-undo')?.addEventListener('click', undo);
    document.getElementById('btn-pro-redo')?.addEventListener('click', redo);
    document.getElementById('btn-v1-apply-duration')?.addEventListener('click',()=>{const value=Number(document.getElementById('inp-v1-duration')?.value);if(legacySceneIndex>=0&&Number.isFinite(value)){beginLegacyResize('Change V1 duration');resizeLegacyClip(legacySceneIndex,value,'right',document.getElementById('sel-v1-edit-mode')?.value||'gap');endLegacyResize();}});
    document.getElementById('btn-v1-replace')?.addEventListener('click',()=>{if(legacySceneIndex<0){toast('Select a V1 media slot first.');return;}document.getElementById('inp-v1-replace')?.click();});
    document.getElementById('inp-v1-replace')?.addEventListener('change',async event=>{const files=Array.from(event.target.files||[]);event.target.value='';if(files.length)await replaceLegacyFiles(legacySceneIndex,files);});
    document.getElementById('btn-replace-main-audio')?.addEventListener('click',()=>document.getElementById('inp-replace-main-audio')?.click());
    document.getElementById('inp-replace-main-audio')?.addEventListener('change',async event=>{const file=Array.from(event.target.files||[]).find(item=>fileMediaType(item)==='audio');event.target.value='';if(file)await replaceMainAudio(file);else toast('Choose a supported audio file.');});
    document.querySelectorAll('[data-kf]').forEach(btn => btn.addEventListener('click', () => toggleKeyframe(btn.dataset.kf)));
    Object.keys(DEFAULTS).forEach(prop => document.getElementById(`pro-kf-${prop}`)?.addEventListener('change', () => setProperty(prop)));
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize',fitWorkspaceLayout);
    document.getElementById('sel-aspect')?.addEventListener('change',()=>requestAnimationFrame(()=>{fitWorkspaceLayout();window.Preview?.resize?.();window.Preview?.renderFrame?.();}));
    wireMainAudioVolume();
    wireMainAudioDrop();
    initTimelineResize();
    renderMediaLibrary();
    updateButtons();
    requestAnimationFrame(fitWorkspaceLayout);
  }

  function wireMainAudioVolume(){
    const menu=document.getElementById('sl-main-audio-volume-menu'),menuLabel=document.getElementById('lbl-main-audio-volume-menu'),main=document.getElementById('sl-audio-volume');if(!menu||!main)return;
    const syncMenu=()=>{if(selectedClip()?.type==='audio')return;menu.value=main.value;if(menuLabel)menuLabel.textContent=`${main.value}%`;mainAudioAutomation.transform.volume=clamp(main.value,0,200);};syncMenu();main.addEventListener('input',syncMenu);
    menu.addEventListener('input',()=>{
      const clip=selectedClip();
      if(clip?.type==='audio'){
        const value=clamp(menu.value,0,200),local=clamp(getTime()-clip.start,0,clip.duration);clip.transform=normalizeTransform(clip.transform);clip.keyframes=normalizedKeyframes(clip.keyframes);const active=clip.keyframes.volume.find(k=>Math.abs(k.time-local)<=EPS);if(active)active.value=value;else clip.transform.volume=value;
        const inspector=document.getElementById('pro-kf-volume');if(inspector)inspector.value=value;if(menuLabel)menuLabel.textContent=`${value}%`;applyClipVolume(clip,value);window.Projects?.scheduleAutoSave?.();return;
      }
      main.value=menu.value;if(menuLabel)menuLabel.textContent=`${menu.value}%`;main.dispatchEvent(new Event('input',{bubbles:true}));
    });
    menu.addEventListener('change',()=>{if(selectedClip()?.type==='audio'){renderTracks();updateInspector();window.Projects?.scheduleAutoSave?.();}else main.dispatchEvent(new Event('change',{bubbles:true}));});
  }

  function syncAudioMenu(){
    const menu=document.getElementById('sl-main-audio-volume-menu'),label=document.getElementById('lbl-main-audio-volume-menu'),title=document.getElementById('pro-audio-volume-title'),hint=document.getElementById('pro-audio-volume-hint');if(!menu)return;
    const clip=selectedClip();const added=clip?.type==='audio';const value=added?resolvedTransform(clip,clamp(getTime()-clip.start,0,clip.duration)).volume:(legacyAudioSelected?resolvedTransform(mainAudioAutomation,clamp(getTime(),0,duration)).volume:Number(document.getElementById('sl-audio-volume')?.value)||100);
    if(document.activeElement!==menu)menu.value=value;if(label)label.textContent=`${Math.round(value)}%`;if(title)title.textContent=added?`${clip.name} — Clip Volume`:'A1 Main Voiceover';if(hint)hint.textContent=added?'This control now changes only the selected timeline audio clip.':'Select an added audio clip to control its own volume.';
  }

  async function replaceMainAudio(file){
    if(!(file instanceof Blob)||fileMediaType(file)!=='audio'){toast('Choose a supported audio file.');return false;}
    commit('Replace A1 voiceover');
    const previous=window.Uploader?.getAudio?.();
    try{
      const name=file.name||'voiceover.mp3',url=URL.createObjectURL(file),audioObject={file,blob:file,url,name,duration:0};
      await window.WaveformDrawer?.decode?.(audioObject);
      await window.Preview?.setAudio?.(url);
      window.Preview?.seek?.(Math.min(getTime(),Math.max(0,duration-.01)));
      window.Uploader?.setAudioObject?.(audioObject);
      if(previous?.url?.startsWith?.('blob:')&&previous.url!==url)URL.revokeObjectURL(previous.url);
      window.Timeline?.build?.(window.App?.getScenes?.()||[],duration,{preserveView:true});
      selectLegacyAudio();
      window.Projects?.scheduleAutoSave?.();
      toast(`A1 voiceover replaced with ${name}. Timeline timing was preserved.`);
      return true;
    }catch(error){
      console.error('[A1 Voiceover Replace]',error);
      if(previous?.url)await window.Preview?.setAudio?.(previous.url);
      toast('Could not decode this audio file. The previous A1 voiceover was kept.');
      return false;
    }
  }

  function wireMainAudioDrop(){
    const lane=document.getElementById('waveform-canvas');if(!lane)return;
    const accepts=e=>Array.from(e.dataTransfer?.types||[]).includes('application/x-cipher-media')||!!e.dataTransfer?.files?.length;
    lane.addEventListener('dragover',e=>{if(!accepts(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy';lane.classList.add('media-drag-over');});
    lane.addEventListener('dragleave',()=>lane.classList.remove('media-drag-over'));
    lane.addEventListener('drop',async e=>{if(!accepts(e))return;e.preventDefault();e.stopPropagation();lane.classList.remove('media-drag-over');const at=clamp((e.clientX-lane.getBoundingClientRect().left)/getZoom(),0,duration);let asset=mediaLibrary.find(item=>item.id===(e.dataTransfer.getData('application/x-cipher-media')||e.dataTransfer.getData('text/plain')));if(!asset&&e.dataTransfer.files?.length){const added=await importMediaFiles(Array.from(e.dataTransfer.files));asset=added.find(item=>item.type==='audio');}if(!asset||asset.type!=='audio'){toast('Drop an audio file on A1 to create an added audio track.');return;}const select=document.getElementById('pro-track-type');if(select)select.value='audio';addSelectedTrackType();const track=selectedTrack();await addMediaAsset(asset.id,track.id,at);});
  }

  function fitWorkspaceLayout(){
    const row=document.querySelector('#screen-editor .editor-top-row'),center=document.getElementById('editor-center-stage'),right=document.getElementById('right-settings-panel'),preview=center?.querySelector('.preview-wrap'),header=center?.querySelector('.player-header-bar'),playbar=center?.querySelector('.playbar');
    if(!row||!center||!right||!preview||row.clientWidth<1||row.clientHeight<1)return;
    const parts=(document.getElementById('sel-aspect')?.value||'16:9').split(':').map(Number),aspect=parts[0]>0&&parts[1]>0?parts[0]/parts[1]:16/9,style=getComputedStyle(preview),padX=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight),padY=parseFloat(style.paddingTop)+parseFloat(style.paddingBottom),canvasHeight=Math.max(180,row.clientHeight-(header?.offsetHeight||0)-(playbar?.offsetHeight||0)-padY-4),desired=canvasHeight*aspect+padX+4,rightWidth=right.getBoundingClientRect().width||300,gaps=24,minLeft=row.clientWidth<=1220?286:320,minCenter=row.clientWidth<=1220?380:430,maxCenter=Math.max(minCenter,row.clientWidth-rightWidth-gaps-minLeft),centerWidth=clamp(desired,minCenter,maxCenter);
    row.style.setProperty('--cipher-player-width',`${Math.round(centerWidth)}px`);
  }

  function initTimelineResize(){
    const handle=document.getElementById('timeline-resize-handle'),panel=handle?.closest('.editor-bottom-timeline'),workspace=panel?.parentElement;if(!handle||!panel||!workspace)return;
    const stored=Number(localStorage.getItem('cipher_timeline_height'));if(Number.isFinite(stored)&&stored>0)panel.style.height=`${clamp(stored,220,Math.max(260,workspace.clientHeight*.58))}px`;
    let drag=null;
    const finish=()=>{if(!drag)return;drag=null;document.body.classList.remove('timeline-resizing');localStorage.setItem('cipher_timeline_height',String(Math.round(panel.getBoundingClientRect().height)));window.removeEventListener('pointermove',move);fitWorkspaceLayout();window.Preview?.resize?.();window.Preview?.renderFrame?.();};
    const move=e=>{if(!drag)return;const delta=drag.startY-e.clientY,max=Math.max(260,workspace.clientHeight*.58),height=clamp(drag.startHeight+delta,220,max);panel.style.height=`${height}px`;fitWorkspaceLayout();window.Preview?.resize?.();window.Preview?.renderFrame?.();};
    handle.addEventListener('pointerdown',e=>{e.preventDefault();drag={startY:e.clientY,startHeight:panel.getBoundingClientRect().height};document.body.classList.add('timeline-resizing');window.addEventListener('pointermove',move);window.addEventListener('pointerup',finish,{once:true});});
    handle.addEventListener('dblclick',()=>{panel.style.height='';localStorage.removeItem('cipher_timeline_height');fitWorkspaceLayout();window.Preview?.resize?.();window.Preview?.renderFrame?.();});
  }

  function attachLegacy(sceneList, totalDuration, options={}) {
    duration=Math.max(0,Number(totalDuration)||0);
    if (options.reset) { releaseMedia(); tracks=[];mediaLibrary=[];selectedTrackId=null;selectedClipId=null;legacySceneIndex=-1;legacyAudioSelected=false;undoStack=[];redoStack=[];mainAudioAutomation={transform:normalizeTransform({volume:Number(document.getElementById('sl-audio-volume')?.value)||100}),keyframes:normalizedKeyframes()};renderMediaLibrary(); }
    renderTracks(); updateInspector(); updateButtons();requestAnimationFrame(()=>{fitWorkspaceLayout();window.Preview?.resize?.();window.Preview?.renderFrame?.();});
  }

  function addSelectedTrackType() {
    const type=document.getElementById('pro-track-type')?.value || 'video';
    commit(`Add ${type} track`);
    const visualCount=tracks.filter(t=>VISUAL_TYPES.has(t.type)).length;
    const audioCount=tracks.filter(t=>t.type==='audio').length;
    const number=type==='audio'?audioCount+2:visualCount+2;
    const track={id:id('track'),type,name:`${type==='audio'?'A':'V'}${number}`,muted:false,locked:false,clips:[]};
    tracks.push(track); selectedTrackId=track.id;selectedClipId=null;legacySceneIndex=-1;renderTracks();updateInspector();
  }

  function fileMediaType(file){const mime=String(file?.type||'').toLowerCase(),name=String(file?.name||'').toLowerCase();if(mime.startsWith('audio/')||/\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i.test(name))return'audio';if(mime.startsWith('video/')||/\.(mp4|mov|mkv|avi|webm|m4v)$/i.test(name))return'video';if(mime.startsWith('image/')||/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name))return'image';return'';}

  async function importMediaFiles(files) {
    const accepted=files.filter(file=>fileMediaType(file));
    if(!accepted.length){toast('Select video, audio or image files.');return [];}
    commit(`Import ${accepted.length} project media item${accepted.length===1?'':'s'}`);
    const added=[];for(const file of accepted){const type=fileMediaType(file),name=String(file.name||''),fallbackMime=/\.wav$/i.test(name)?'audio/wav':/\.(m4a|aac)$/i.test(name)?'audio/mp4':/\.ogg$/i.test(name)?'audio/ogg':type==='audio'?'audio/mpeg':/\.webm$/i.test(name)?'video/webm':type==='video'?'video/mp4':/\.png$/i.test(name)?'image/png':/\.webp$/i.test(name)?'image/webp':'image/jpeg',storedFile=file.type?file:new File([file],file.name,{type:fallbackMime,lastModified:file.lastModified||Date.now()});const asset=normalizeAsset({name:file.name,type,blob:storedFile,duration:type==='image'?5:0});await hydrateAsset(asset);mediaLibrary.push(asset);added.push(asset);}
    renderMediaLibrary();window.Projects?.scheduleAutoSave?.();toast(`${accepted.length} media item${accepted.length===1?'':'s'} added to Project Media.`);
    return added;
  }

  async function importExternalMediaFile(file,metadata={}){const added=await importMediaFiles([file]);const asset=added[0];if(!asset)return null;Object.assign(asset,{stockId:metadata.stockId||metadata.id||'',provider:metadata.provider||'',creator:metadata.creator||'',creatorUrl:metadata.creatorUrl||'',pageUrl:metadata.pageUrl||'',attribution:metadata.attribution||''});renderMediaLibrary();window.Projects?.scheduleAutoSave?.();return asset;}

  async function importFiles(event) {
    const files=Array.from(event.target.files || []); event.target.value=''; if(!files.length)return;
    await importMediaFiles(files);
  }

  function compatible(asset,track){return track.type==='audio'?(asset.type==='audio'||asset.type==='video'):VISUAL_TYPES.has(track.type)&&track.type!=='text'?(asset.type==='video'||asset.type==='image'):false;}

  async function addMediaAsset(assetId,trackId,start=getTime()){
    const asset=mediaLibrary.find(item=>item.id===assetId),track=tracks.find(item=>item.id===trackId);if(!asset||!track)return false;
    if(track.locked){toast(`${track.name} is locked.`);return false;}if(!compatible(asset,track)){toast(`${asset.type} media cannot be placed on a ${track.type} track.`);return false;}
    const at=clamp(start,0,Math.max(0,duration-.1));commit(`Add ${asset.name} to ${track.name}`);
    const natural=asset.duration>0?asset.duration:5,clipType=track.type==='audio'?'audio':asset.type,clip=normalizeClip({type:clipType,name:asset.name,start:at,duration:Math.min(natural,Math.max(.1,duration-at)),sourceDuration:asset.duration,blob:asset.blob,stockId:asset.stockId,provider:asset.provider,creator:asset.creator,creatorUrl:asset.creatorUrl,pageUrl:asset.pageUrl,attribution:asset.attribution,transform:{scale:track.type==='video'?1:.42}});
    await hydrateClip(clip);track.clips.push(clip);selectedTrackId=track.id;selectedClipId=clip.id;legacySceneIndex=-1;renderTracks();updateInspector();refreshPreview();window.Projects?.scheduleAutoSave?.();return true;
  }

  async function addAssetAtPlayhead(asset){
    let track=selectedTrack();if(!track||!compatible(asset,track)){const type=asset.type==='audio'?'audio':asset.type==='video'?'video':'image',select=document.getElementById('pro-track-type');if(select)select.value=type;addSelectedTrackType();track=selectedTrack();}
    return addMediaAsset(asset.id,track.id,getTime());
  }

  async function addAssetToSelectedTrack(asset){
    if(legacySceneIndex>=0&&['image','video'].includes(asset?.type))return replaceLegacyScene(legacySceneIndex,asset.id);
    return addAssetAtPlayhead(asset);
  }

  function openMediaLibrary(){
    const button=document.querySelector('#capcut-nav-bar .nav-tab-btn[data-tab="tab-media"]');button?.click();
  }

  function renderMediaLibrary(){
    renderAudioLibrary();const root=document.getElementById('pro-media-library'),count=document.getElementById('pro-media-count');if(count)count.textContent=`${mediaLibrary.length} item${mediaLibrary.length===1?'':'s'}`;if(!root)return;
    root.innerHTML='';if(!mediaLibrary.length){root.innerHTML='<div class="pro-media-empty"><span>▧</span><strong>No media imported</strong><small>Video, audio and image files will appear here.</small></div>';return;}
    for(const asset of mediaLibrary){const card=document.createElement('div');card.className='pro-media-card';card.draggable=true;card.tabIndex=0;card.setAttribute('role','button');card.title='Drag to a timeline track; double-click replaces a selected V1 slot or adds to the selected overlay track';
      const thumb=createLibraryThumbnail(asset);
      const info=document.createElement('span');info.className='pro-media-info';info.innerHTML=`<strong>${escapeHtml(asset.name)}</strong><small>${escapeHtml(asset.type)}${asset.duration?` · ${format(asset.duration)}`:''}</small>`;
      const remove=document.createElement('button');remove.type='button';remove.className='pro-media-remove';remove.title='Remove from media library';remove.textContent='×';remove.addEventListener('click',e=>{e.stopPropagation();commit('Remove project media');asset.element?.pause?.();if(asset.url?.startsWith('blob:'))URL.revokeObjectURL(asset.url);mediaLibrary=mediaLibrary.filter(item=>item.id!==asset.id);renderMediaLibrary();window.Projects?.scheduleAutoSave?.();});
      card.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-cipher-media',asset.id);e.dataTransfer.setData('text/plain',asset.id);});card.addEventListener('dblclick',()=>addAssetToSelectedTrack(asset));card.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addAssetToSelectedTrack(asset);}});card.append(thumb,info,remove);root.appendChild(card);
    }
  }

  function createLibraryThumbnail(asset){
    const thumb=document.createElement('span');thumb.className=`pro-media-thumb pro-media-thumb-${asset.type}`;
    if(asset.type==='image'&&asset.url){const img=document.createElement('img');img.src=asset.url;img.alt=`Preview of ${asset.name}`;thumb.appendChild(img);}
    else if(asset.type==='video'&&asset.thumbnail){const img=document.createElement('img');img.src=asset.thumbnail;img.alt=`Video preview of ${asset.name}`;thumb.appendChild(img);}
    else if(asset.type==='audio'){const wave=document.createElement('span');wave.className='pro-audio-wave';wave.innerHTML='<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';thumb.appendChild(wave);}
    else{const fallback=document.createElement('span');fallback.className='pro-media-fallback';fallback.textContent=asset.type==='video'?'🎬':'🖼';thumb.appendChild(fallback);}
    const badge=document.createElement('span');badge.className=`pro-media-type-badge ${asset.type}`;badge.textContent=asset.type==='video'?'VIDEO':asset.type==='audio'?'AUDIO':'IMAGE';thumb.appendChild(badge);
    if(asset.type==='video'){const play=document.createElement('span');play.className='pro-media-play';play.textContent='▶';thumb.appendChild(play);}
    return thumb;
  }

  function renderAudioLibrary(){
    const root=document.getElementById('pro-audio-library'),items=mediaLibrary.filter(asset=>asset.type==='audio'),count=document.getElementById('pro-audio-count');if(count)count.textContent=`${items.length} item${items.length===1?'':'s'}`;if(!root)return;root.innerHTML='';
    if(!items.length){root.innerHTML='<div class="pro-media-empty"><span>♫</span><strong>No audio imported</strong><small>Import background music or sound effects above.</small></div>';return;}
    for(const asset of items){const card=document.createElement('div');card.className='pro-media-card audio-media-card';card.draggable=true;card.tabIndex=0;card.setAttribute('role','button');card.title='Drag to an audio track, or double-click to add at the playhead';card.innerHTML=`<span class="pro-media-thumb">🎵</span><span class="pro-media-info"><strong>${escapeHtml(asset.name)}</strong><small>AUDIO${asset.duration?` · ${format(asset.duration)}`:''}</small></span>`;const remove=document.createElement('button');remove.type='button';remove.className='pro-media-remove';remove.title='Remove from audio library';remove.textContent='×';remove.addEventListener('click',e=>{e.stopPropagation();commit('Remove project audio');asset.element?.pause?.();if(asset.url?.startsWith('blob:'))URL.revokeObjectURL(asset.url);mediaLibrary=mediaLibrary.filter(item=>item.id!==asset.id);renderMediaLibrary();window.Projects?.scheduleAutoSave?.();});card.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-cipher-media',asset.id);e.dataTransfer.setData('text/plain',asset.id);});card.addEventListener('dblclick',()=>addAssetToSelectedTrack(asset));card.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addAssetToSelectedTrack(asset);}});card.appendChild(remove);root.appendChild(card);}
  }

  function addText() {
    let track=selectedTrack();
    if(!track||track.type!=='text'){const el=document.getElementById('pro-track-type');if(el)el.value='text';addSelectedTrackType();track=selectedTrack();}
    if(track.locked){toast(`${track.name} is locked.`);return;}
    const value=prompt('Enter overlay text:','Your title'); if(value===null)return;
    commit('Add text clip');
    const clip=normalizeClip({type:'text',name:value.slice(0,32)||'Text',text:value,start:getTime(),duration:Math.min(4,Math.max(.1,duration-getTime())),transform:{scale:1}});
    track.clips.push(clip);selectedClipId=clip.id;legacySceneIndex=-1;renderTracks();updateInspector();refreshPreview();
  }

  function selectLegacyClip(index) {
    commonTransformEdit='';
    legacySceneIndex=index;legacyAudioSelected=false;const replacement=getLegacyReplacement(index),replacementTrack=replacement?tracks.find(track=>track.clips.includes(replacement)):null;selectedClipId=replacement?.id||null;selectedTrackId=replacementTrack?.id||null;window.Timeline?.selectClip?.(index);renderTracks();updateInspector();syncAudioMenu();syncV1Controls();syncCommonTransformControls();
  }

  function selectLegacyAudio(){commonTransformEdit='';legacySceneIndex=-1;legacyAudioSelected=true;selectedClipId=null;selectedTrackId=null;window.Timeline?.selectClip?.(-1);if(!normalizedKeyframes(mainAudioAutomation.keyframes).volume.length)mainAudioAutomation.transform.volume=clamp(document.getElementById('sl-audio-volume')?.value||100,0,200);renderTracks();updateInspector();syncV1Controls();document.querySelector('#capcut-nav-bar [data-tab="tab-audio"]')?.click();syncAudioMenu();document.getElementById('sl-main-audio-volume-menu')?.focus();}
  function selectTrack(trackId) { commonTransformEdit='';selectedTrackId=trackId;selectedClipId=null;legacySceneIndex=-1;legacyAudioSelected=false;window.Timeline?.selectClip?.(-1);renderTracks();updateInspector();syncV1Controls();syncAudioMenu(); }
  function selectClip(trackId,clipId){commonTransformEdit='';selectedTrackId=trackId;selectedClipId=clipId;legacySceneIndex=-1;legacyAudioSelected=false;window.Timeline?.selectClip?.(-1);renderTracks();updateInspector();syncV1Controls();syncCommonTransformControls();if(selectedClip()?.type==='audio')document.querySelector('#capcut-nav-bar [data-tab="tab-audio"]')?.click();syncAudioMenu();refreshPreview();}
  function clearSelection(){commonTransformEdit='';selectedTrackId=null;selectedClipId=null;legacySceneIndex=-1;legacyAudioSelected=false;window.Timeline?.clearSelection?.();renderTracks();updateInspector();syncV1Controls();syncAudioMenu();}

  function syncV1Controls(){const controls=document.getElementById('v1-edit-controls'),input=document.getElementById('inp-v1-duration'),scene=(window.App?.getScenes?.()||[])[legacySceneIndex];controls?.classList.toggle('active',!!scene);if(input&&scene&&document.activeElement!==input)input.value=Number(scene.duration).toFixed(2);}
  function beginLegacyResize(label='Resize V1 clip'){if(legacyResizeActive)return;legacyResizeActive=true;commit(label);}
  function endLegacyResize(){if(!legacyResizeActive)return;legacyResizeActive=false;window.Projects?.scheduleAutoSave?.();syncV1Controls();}
  function resizeLegacyClip(index,nextDuration,edge='right',mode='gap'){
    const scenes=window.App?.getScenes?.()||[],scene=scenes[index];if(!scene)return false;const wanted=Math.max(.1,Number(nextDuration)||.1),oldDuration=scene.duration;
    if(edge==='left'){
      const oldStart=scene.startSec,end=scene.endSec,previous=scenes[index-1],earliest=previous?.endSec||0;scene.startSec=Math.max(earliest,end-wanted);scene.duration=Math.max(.1,end-scene.startSec);shiftLegacyReplacementSource(index,scene.startSec-oldStart);
    }else if(mode==='ripple'){
      const delta=wanted-oldDuration;scene.duration=wanted;scene.endSec=scene.startSec+wanted;for(let i=index+1;i<scenes.length;i++){scenes[i].startSec+=delta;scenes[i].endSec+=delta;}duration=Math.max(.1,duration+delta);
    }else{
      const limit=scenes[index+1]?.startSec??duration;scene.endSec=Math.min(limit,scene.startSec+wanted);scene.duration=Math.max(.1,scene.endSec-scene.startSec);
    }
    scenes.forEach((item,i)=>{item.index=i;item.duration=Math.max(.1,item.endSec-item.startSec);});syncLegacyReplacementClips(scenes);window.App.setScenes(scenes,{preserveTimelineView:true,duration});window.App?.selectClip?.(index);syncV1Controls();return true;
  }

  function syncCommonTransformControls(){
    const clip=selectedClip();if(!clip||clip.type==='audio')return;
    const values=resolvedTransform(clip,clamp(getTime()-clip.start,0,clip.duration));
    const fields={scale:['sl-clip-scale','lbl-clip-scale',v=>`${Math.round(v*100)}%`],x:['sl-clip-x','lbl-clip-x',v=>`${v>0?'+':''}${Number(v.toFixed(1))}%`],y:['sl-clip-y','lbl-clip-y',v=>`${v>0?'+':''}${Number(v.toFixed(1))}%`],rotation:['sl-clip-rot','lbl-clip-rot',v=>`${v>0?'+':''}${Number(v.toFixed(1))}°`]};
    Object.entries(fields).forEach(([prop,[inputId,labelId,format]])=>{const input=document.getElementById(inputId),label=document.getElementById(labelId);if(input&&document.activeElement!==input)input.value=values[prop];if(label)label.textContent=format(values[prop]);});
    const badge=document.getElementById('badge-selected-clip'),hint=document.getElementById('lbl-clip-transform-hint');
    if(badge)badge.textContent=`${selectedTrack()?.name||'Overlay'} • ${clip.name}`;
    if(hint)hint.textContent=`Adjusting selected ${selectedTrack()?.name||'overlay'} clip (${clip.name})`;
  }

  function setSelectedVisualProperty(prop,raw,phase='input'){
    const clip=selectedClip(),track=selectedTrack();if(!clip||clip.type==='audio'||!['x','y','scale','rotation'].includes(prop))return false;
    if(track?.locked){toast(`${track.name} is locked.`);return true;}
    if(commonTransformEdit!==prop){commit(`Change ${clip.name} ${prop}`);commonTransformEdit=prop;}
    clip.transform=normalizeTransform(clip.transform);clip.keyframes=normalizedKeyframes(clip.keyframes);
    const value=normalizeTransform({[prop]:Number(raw)})[prop],local=clamp(getTime()-clip.start,0,clip.duration),active=clip.keyframes[prop].find(k=>Math.abs(k.time-local)<=EPS);
    if(active)active.value=value;else clip.transform[prop]=value;
    const inspector=document.getElementById(`pro-kf-${prop}`);if(inspector&&document.activeElement!==inspector)inspector.value=value;
    if(phase==='change'){commonTransformEdit='';renderTracks();window.Projects?.scheduleAutoSave?.();}
    updateInspector();refreshPreview();return true;
  }

  function resetSelectedVisualTransform(){
    const clip=selectedClip(),track=selectedTrack();if(!clip||clip.type==='audio')return false;if(track?.locked){toast(`${track.name} is locked.`);return true;}
    commit(`Reset ${clip.name} transform`);clip.transform=normalizeTransform({...clip.transform,x:0,y:0,scale:1,rotation:0});['x','y','scale','rotation'].forEach(prop=>clip.keyframes[prop]=[]);commonTransformEdit='';updateInspector();syncCommonTransformControls();renderTracks();refreshPreview();return true;
  }

  function syncLegacyTargetToPlayhead(){
    if(legacySceneIndex<0)return;
    const scenes=window.App?.getScenes?.()||[],idx=window.Preview?.getCurrentSceneIndex?.();
    if(Number.isInteger(idx)&&idx>=0&&idx<scenes.length&&idx!==legacySceneIndex){
      legacySceneIndex=idx;
      window.App?.selectClip?.(idx);
    }
  }

  function getTarget() {
    if(legacySceneIndex>=0){const scene=window.App?.getScenes?.()[legacySceneIndex];return scene?{target:scene,localTime:clamp(getTime()-scene.startSec,0,scene.duration),type:'legacy',name:scene.name||`V1 Clip ${legacySceneIndex+1}`} : null;}
    if(legacyAudioSelected)return {target:mainAudioAutomation,localTime:clamp(getTime(),0,duration),type:'audio',name:'A1 Main Audio'};
    const clip=selectedClip(); return clip?{target:clip,localTime:clamp(getTime()-clip.start,0,clip.duration),type:clip.type,name:clip.name}:null;
  }

  function setProperty(prop) {
    const ref=getTarget(); if(!ref)return;
    if(ref.type!=='legacy'&&selectedTrack()?.locked){toast(`${selectedTrack().name} is locked.`);return;}
    const input=document.getElementById(`pro-kf-${prop}`);if(!input)return;
    const raw=Number(input.value);if(!Number.isFinite(raw))return;
    commit(`Change ${prop}`);
    ref.target.transform=normalizeTransform(ref.target.transform || ref.target);
    ref.target.keyframes=normalizedKeyframes(ref.target.keyframes);
    const normalizedValue=normalizeTransform({[prop]:raw})[prop];
    const activeKey=ref.target.keyframes[prop].find(k=>Math.abs(k.time-ref.localTime)<=EPS);
    if(activeKey)activeKey.value=normalizedValue;
    else ref.target.transform[prop]=normalizedValue;
    if(ref.type==='legacy'){
      if(prop==='x')ref.target.posX=ref.target.transform.x;if(prop==='y')ref.target.posY=ref.target.transform.y;
      if(['scale','rotation','opacity','blur'].includes(prop))ref.target[prop]=ref.target.transform[prop];
    }
    if(ref.target===mainAudioAutomation&&prop==='volume'){
      const slider=document.getElementById('sl-audio-volume'),label=document.getElementById('lbl-audio-volume');
      if(slider)slider.value=normalizedValue;if(label)label.textContent=`${Math.round(normalizedValue)}%`;
      window.Preview?.setAutomationVolume?.(normalizedValue/100);
    }
    // Keep the typed value visible until the user presses the diamond. Calling
    // updateInspector here would immediately replace it with the interpolated
    // value from existing keyframes.
    if(ref.type==='audio')applyClipVolume(ref.target,normalizedValue);
    syncAudioMenu();syncCommonTransformControls();refreshPreview();
  }

  function toggleKeyframe(prop) {
    const ref=getTarget();if(!ref)return;
    if(ref.type!=='legacy'&&selectedTrack()?.locked){toast(`${selectedTrack().name} is locked.`);return;}
    const input=document.getElementById(`pro-kf-${prop}`);const value=Number(input?.value);if(!Number.isFinite(value))return;
    commit(`Toggle ${prop} keyframe`);
    ref.target.keyframes=normalizedKeyframes(ref.target.keyframes);
    const list=ref.target.keyframes[prop];const at=list.findIndex(k=>Math.abs(k.time-ref.localTime)<=EPS);
    if(at>=0)list.splice(at,1);else list.push({time:ref.localTime,value});
    list.sort((a,b)=>a.time-b.time);updateInspector();syncCommonTransformControls();renderTracks();refreshPreview();
  }

  function updateInspector(timeDriven=false) {
    if(timeDriven){const now=performance.now();if(now-lastInspectorUpdate<80)return;lastInspectorUpdate=now;}
    const ref=getTarget(),label=document.getElementById('pro-selected-clip-label');if(label)label.textContent=ref?ref.name:'Select a clip';
    const values=ref?resolvedTransform(ref.target,ref.localTime):DEFAULTS;
    Object.keys(DEFAULTS).forEach(prop=>{
      const input=document.getElementById(`pro-kf-${prop}`),btn=document.querySelector(`[data-kf="${prop}"]`);
      const allowed=!!ref&&(ref.type==='audio'?prop==='volume':prop!=='volume');
      if(input){input.disabled=!allowed;if(document.activeElement!==input)input.value=Number(values[prop].toFixed(prop==='scale'?2:1));}
      const active=!!ref&&normalizedKeyframes(ref.target.keyframes)[prop].some(k=>Math.abs(k.time-ref.localTime)<=EPS);
      btn?.classList.toggle('active',active);if(btn)btn.disabled=!allowed;if(btn)btn.textContent=active?'◆':'◇';
    });
    syncAudioMenu();syncCommonTransformControls();
  }

  async function splitSelected() {
    syncLegacyTargetToPlayhead();
    if(legacySceneIndex>=0){splitLegacy();return;}
    const track=selectedTrack(),clip=selectedClip();if(!track||!clip){toast('Select a clip to split.');return;}
    if(track.locked){toast(`${track.name} is locked.`);return;}
    const cut=getTime();if(cut<=clip.start+.1||cut>=clip.start+clip.duration-.1){toast('Move playhead inside the selected clip.');return;}
    commit('Split clip');const leftDuration=cut-clip.start,right=normalizeClip({...clip,id:id('clip'),start:cut,duration:clip.duration-leftDuration,sourceOffset:clip.sourceOffset+leftDuration,blob:clip.blob,url:clip.url});await hydrateClip(right);
    Object.keys(right.keyframes).forEach(prop=>{right.keyframes[prop]=right.keyframes[prop].filter(k=>k.time>=leftDuration).map(k=>({...k,time:k.time-leftDuration}));clip.keyframes[prop]=clip.keyframes[prop].filter(k=>k.time<=leftDuration);});
    clip.duration=leftDuration;track.clips.push(right);selectedClipId=right.id;renderTracks();updateInspector();refreshPreview();
  }

  function rippleDelete() {
    syncLegacyTargetToPlayhead();
    if(legacySceneIndex>=0){rippleDeleteLegacy();return;}
    const track=selectedTrack(),clip=selectedClip();if(!track||!clip){toast('Select a clip to ripple delete.');return;}
    if(track.locked){toast(`${track.name} is locked.`);return;}
    commit('Ripple delete');const end=clip.start+clip.duration,delta=clip.duration;track.clips=track.clips.filter(c=>c.id!==clip.id);track.clips.forEach(c=>{if(c.start>=end-EPS)c.start=Math.max(0,c.start-delta);});clip.element?.pause?.();selectedClipId=null;renderTracks();updateInspector();refreshPreview();
  }

  function deleteSide(side){
    syncLegacyTargetToPlayhead();
    if(legacySceneIndex>=0){deleteSideLegacy(side);return;}
    const track=selectedTrack(),clip=selectedClip(),cut=getTime();if(!track||!clip){toast('Select a clip first.');return;}if(track.locked){toast(`${track.name} is locked.`);return;}const end=clip.start+clip.duration;if(cut<=clip.start+.1||cut>=end-.1){toast('Move the playhead inside the selected clip.');return;}
    commit(`Delete ${side} of clip`);const removed=side==='left'?cut-clip.start:end-cut;if(side==='left'){clip.start=cut;clip.sourceOffset+=removed;clip.duration=end-cut;Object.keys(clip.keyframes||{}).forEach(prop=>clip.keyframes[prop]=clip.keyframes[prop].filter(key=>key.time>=removed-EPS).map(key=>({...key,time:Math.max(0,key.time-removed)})));}else{clip.duration=cut-clip.start;Object.keys(clip.keyframes||{}).forEach(prop=>clip.keyframes[prop]=clip.keyframes[prop].filter(key=>key.time<=clip.duration+EPS));}renderTracks();updateInspector();refreshPreview();window.Projects?.scheduleAutoSave?.();
  }

  function deleteSideLegacy(side){
    const scenes=window.App?.getScenes?.()||[],scene=scenes[legacySceneIndex],cut=getTime();if(!scene||cut<=scene.startSec+.1||cut>=scene.endSec-.1){toast('Move the playhead inside the selected V1 clip.');return;}const mode=document.getElementById('sel-v1-edit-mode')?.value||'gap';commit(`Delete ${side} of V1 clip`);const oldStart=scene.startSec,oldEnd=scene.endSec,removed=side==='left'?cut-oldStart:oldEnd-cut;
    if(side==='left'){scene.startSec=cut;scene.duration=oldEnd-cut;shiftLegacyReplacementSource(legacySceneIndex,cut-oldStart);}else{scene.endSec=cut;scene.duration=cut-oldStart;}
    if(mode==='ripple'){if(side==='left')scene.startSec=oldStart;scene.endSec=scene.startSec+scene.duration;for(let i=legacySceneIndex+1;i<scenes.length;i++){scenes[i].startSec-=removed;scenes[i].endSec-=removed;}duration=Math.max(.1,duration-removed);}
    scenes.forEach((item,index)=>{item.index=index;item.duration=Math.max(.1,item.endSec-item.startSec);});syncLegacyReplacementClips(scenes);window.App.setScenes(scenes,{preserveTimelineView:true,duration});selectLegacyClip(legacySceneIndex);window.Preview?.seek?.(Math.max(scene.startSec,Math.min(scene.endSec-.05,cut)));
  }

  async function replaceLegacyScene(index,assetId){
    const scenes=window.App?.getScenes?.()||[],scene=scenes[index],asset=mediaLibrary.find(item=>item.id===assetId);if(!scene||!asset||!['image','video'].includes(asset.type)){toast('Drop an imported image or video on a V1 clip.');return false;}if(asset.type==='video')return replaceLegacyWithVideo(index,asset);commit(`Replace V1 clip ${index+1}`);removeLegacyReplacement(index);const url=asset.blob?URL.createObjectURL(asset.blob):asset.url,img=new Image();img.src=url;await new Promise(resolve=>{if(img.complete)return resolve();img.onload=resolve;img.onerror=resolve;});scene.img=img;scene.url=url;scene.blob=asset.blob||null;scene.file=asset.blob||null;scene.name=asset.name;scene.stockId=asset.stockId;scene.provider=asset.provider;scene.creator=asset.creator;scene.creatorUrl=asset.creatorUrl;scene.pageUrl=asset.pageUrl;scene.attribution=asset.attribution;scene.deleted=false;window.App.setScenes(scenes,{preserveTimelineView:true});selectLegacyClip(index);window.Preview?.seek?.(scene.startSec);window.Projects?.scheduleAutoSave?.();toast(`V1 clip replaced with ${asset.name}.`);return true;
  }
  function getLegacyReplacement(index){for(const track of tracks)for(const clip of track.clips)if(track.v1ReplacementTrack&&clip.linkedLegacyIndex===index)return clip;return null;}
  function removeLegacyReplacement(index){for(const track of tracks){for(const clip of track.clips.filter(item=>item.linkedLegacyIndex===index))clip.element?.pause?.();track.clips=track.clips.filter(item=>item.linkedLegacyIndex!==index);}tracks=tracks.filter(track=>!track.v1ReplacementTrack||track.clips.length);}
  function shiftLegacyReplacementSource(index,delta){if(delta<=0)return;for(const track of tracks)for(const clip of track.clips)if(clip.linkedLegacyIndex===index)clip.sourceOffset=Math.min(Math.max(0,clip.sourceOffset+delta),Math.max(0,clip.sourceDuration-.05));}
  function syncLegacyReplacementClips(scenes=window.App?.getScenes?.()||[]){for(const track of tracks)for(const clip of track.clips){if(clip.linkedLegacyIndex===null)continue;const scene=scenes[clip.linkedLegacyIndex];if(scene){clip.start=scene.startSec;clip.duration=scene.duration;}}renderTracks();}
  async function replaceLegacyWithVideo(index,asset){const scenes=window.App?.getScenes?.()||[],scene=scenes[index];if(!scene)return false;commit(`Replace V1 clip ${index+1} with video`);removeLegacyReplacement(index);let track=tracks.find(item=>item.v1ReplacementTrack);if(!track){track={id:id('track'),type:'video',name:'V1 Replacements',muted:false,locked:false,v1ReplacementTrack:true,clips:[]};tracks.push(track);}const clip=normalizeClip({type:'video',name:asset.name,start:scene.startSec,duration:scene.duration,sourceDuration:asset.duration,sourceOffset:0,blob:asset.blob,linkedLegacyIndex:index,stockId:asset.stockId,provider:asset.provider,creator:asset.creator,creatorUrl:asset.creatorUrl,pageUrl:asset.pageUrl,attribution:asset.attribution,transform:{scale:1}});await hydrateClip(clip);track.clips.push(clip);scene.deleted=true;scene.img=null;scene.url='';scene.file=null;scene.blob=null;scene.name=asset.name;window.App.setScenes(scenes,{preserveTimelineView:true});selectLegacyClip(index);window.Preview?.seek?.(scene.startSec);window.Projects?.scheduleAutoSave?.();toast(`${asset.name} fitted inside the ${scene.duration.toFixed(2)}s V1 slot.`);return true;}
  async function replaceLegacyFiles(index,files){const added=await importMediaFiles(files);const asset=added.find(item=>item.type==='image'||item.type==='video');if(!asset){toast('Choose an image or video file for this V1 slot.');return false;}return replaceLegacyScene(index,asset.id);}

  async function duplicateSelected() {
    syncLegacyTargetToPlayhead();
    if(legacySceneIndex>=0){duplicateLegacy();return;}
    const track=selectedTrack(),clip=selectedClip();if(!track||!clip){toast('Select a clip to duplicate.');return;}
    if(track.locked){toast(`${track.name} is locked.`);return;}
    commit('Duplicate clip');const copy=normalizeClip({...clip,id:id('clip'),name:`${clip.name} Copy`,start:Math.min(Math.max(0,duration-.1),clip.start+clip.duration),blob:clip.blob,url:clip.url});
    // Every audio/video clip needs its own media element. Sharing one element
    // makes the inactive copy pause/mute/seek the active original.
    await hydrateClip(copy);track.clips.push(copy);selectedClipId=copy.id;renderTracks();updateInspector();syncCommonTransformControls();refreshPreview();window.Projects?.scheduleAutoSave?.();
  }

  function slipSelected(delta) {
    const clip=selectedClip(),track=selectedTrack();if(!clip||!clip.sourceDuration){toast('Slip is available for audio/video media clips.');return;}
    if(track?.locked){toast(`${track.name} is locked.`);return;}
    commit('Slip clip source');clip.sourceOffset=clamp(clip.sourceOffset+delta,0,Math.max(0,clip.sourceDuration-clip.duration));renderTracks();refreshPreview();
  }

  function splitLegacy(){const scenes=window.App?.getScenes?.()||[],scene=scenes[legacySceneIndex],cut=getTime();if(tracks.some(track=>track.clips.some(clip=>clip.linkedLegacyIndex===legacySceneIndex))){toast('Select the replacement video clip on V2 to split it safely.');return;}if(!scene||cut<=scene.startSec+.1||cut>=scene.endSec-.1){toast('Move playhead inside the selected V1 clip.');return;}commit('Split V1 clip');const left={...scene,endSec:cut,duration:cut-scene.startSec},right={...scene,startSec:cut,duration:scene.endSec-cut,keyframes:normalizedKeyframes(scene.keyframes)};right.keyframes=normalizedKeyframes(right.keyframes);Object.keys(right.keyframes).forEach(prop=>{right.keyframes[prop]=right.keyframes[prop].filter(k=>k.time>=left.duration).map(k=>({...k,time:k.time-left.duration}));left.keyframes=normalizedKeyframes(left.keyframes);left.keyframes[prop]=left.keyframes[prop].filter(k=>k.time<=left.duration);});scenes.splice(legacySceneIndex,1,left,right);for(const track of tracks)for(const clip of track.clips)if(clip.linkedLegacyIndex>legacySceneIndex)clip.linkedLegacyIndex++;scenes.forEach((s,i)=>s.index=i);window.App.setScenes(scenes,{preserveTimelineView:true});legacySceneIndex++;selectLegacyClip(legacySceneIndex);}
  function rippleDeleteLegacy(){const scenes=window.App?.getScenes?.()||[],scene=scenes[legacySceneIndex];if(!scene){toast('Select a V1 media slot first.');return;}commit('Clear V1 media slot');const current=getTime();removeLegacyReplacement(legacySceneIndex);scene.deleted=true;scene.img=null;scene.url='';scene.file=null;scene.blob=null;scene.name='Empty Slot';window.App.setScenes(scenes,{preserveTimelineView:true});window.App?.selectClip?.(legacySceneIndex);window.Preview?.seek?.(current);window.Projects?.scheduleAutoSave?.();toast('Media removed. Its empty timeline slot was preserved.');}
  function duplicateLegacy(){const scenes=window.App?.getScenes?.()||[],scene=scenes[legacySceneIndex];if(!scene)return;if(tracks.some(track=>track.clips.some(clip=>clip.linkedLegacyIndex===legacySceneIndex))){toast('Select the replacement video clip on V2 to duplicate it safely.');return;}commit('Duplicate V1 clip');const current=getTime(),sourceIndex=legacySceneIndex,copy={...scene,keyframes:cloneData(scene.keyframes||{}),name:`${scene.name||'Clip'} Copy`,deleted:scene.deleted===true},insertAt=scene.endSec,shift=scene.duration;copy.startSec=insertAt;copy.endSec=insertAt+shift;for(let i=sourceIndex+1;i<scenes.length;i++){scenes[i].startSec+=shift;scenes[i].endSec+=shift;}for(const track of tracks)for(const clip of track.clips)if(clip.linkedLegacyIndex>sourceIndex)clip.linkedLegacyIndex++;scenes.splice(sourceIndex+1,0,copy);scenes.forEach((s,i)=>{s.index=i;s.duration=Math.max(.1,s.endSec-s.startSec);});syncLegacyReplacementClips(scenes);const nextDuration=duration+shift;window.App.setScenes(scenes,{preserveTimelineView:true,duration:nextDuration});window.App?.selectClip?.(sourceIndex);window.Preview?.seek?.(current);window.Projects?.scheduleAutoSave?.();toast(`Duplicated ${scene.name||`V1 clip ${sourceIndex+1}`}.`);}

  function toggleSnap(){snapping=!snapping;document.getElementById('btn-pro-snap')?.classList.toggle('active',snapping);toast(snapping?'Snapping on':'Snapping off');}
  function snapTime(value,ignoreClipId){if(!snapping)return clamp(value,0,duration);const points=[0,duration,getTime()];for(const t of tracks)for(const c of t.clips)if(c.id!==ignoreClipId)points.push(c.start,c.start+c.duration);let best=value,dist=.14;for(const p of points){const d=Math.abs(value-p);if(d<dist){dist=d;best=p;}}return clamp(best,0,duration);}

  function renderTracks() {
    const visualRoot=document.getElementById('pro-video-tracks'),audioRoot=document.getElementById('pro-audio-tracks');if(!visualRoot||!audioRoot)return;
    visualRoot.innerHTML='';audioRoot.innerHTML='';document.querySelector('.main-video-row')?.classList.remove('selected');document.querySelector('.main-audio-row')?.classList.toggle('selected',legacyAudioSelected);const zoom=getZoom(),width=Math.max(duration*zoom,document.getElementById('timeline-wrap')?.clientWidth||800);
    const ordered=[...tracks.filter(t=>VISUAL_TYPES.has(t.type)&&!t.v1ReplacementTrack).reverse(),...tracks.filter(t=>t.type==='audio')];
    ordered.forEach(track=>{
      const row=document.createElement('div');row.className='pro-track-row';
      const label=document.createElement('div');label.className=`pro-track-label${track.id===selectedTrackId?' selected':''}`;label.title=`${track.type} track — click to select`;
      const kind={video:'Video',audio:'Audio',image:'Image',text:'Text',overlay:'Overlay'}[track.type]||'Track';
      label.innerHTML=`<span class="pro-track-identity"><b>${escapeHtml(track.name)}</b><small>${kind} Track</small></span><span class="pro-track-controls"><button type="button" data-action="mute" title="${track.muted?'Enable track':'Disable track'}">${track.muted?'○':'●'}</button><button type="button" data-action="lock" title="${track.locked?'Unlock track':'Lock track'}">${track.locked?'🔒':'🔓'}</button><button type="button" data-action="delete" title="Delete track">×</button></span>`;
      label.addEventListener('click',()=>selectTrack(track.id));
      label.querySelector('[data-action="mute"]').addEventListener('click',e=>{e.stopPropagation();commit('Toggle track visibility');track.muted=!track.muted;renderTracks();syncMedia(getTime(),window.Preview?.getIsPlaying?.());refreshPreview();});
      label.querySelector('[data-action="lock"]').addEventListener('click',e=>{e.stopPropagation();commit('Toggle track lock');track.locked=!track.locked;renderTracks();updateButtons();});
      label.querySelector('[data-action="delete"]').addEventListener('click',e=>{e.stopPropagation();if(confirm(`Delete ${track.name} and all clips on it?`)){commit('Delete track');track.clips.forEach(c=>c.element?.pause?.());tracks=tracks.filter(t=>t.id!==track.id);selectedTrackId=null;selectedClipId=null;renderTracks();updateInspector();refreshPreview();}});
      const lane=document.createElement('div');lane.className='pro-track-lane';lane.style.width=`${width}px`;lane.dataset.trackId=track.id;lane.addEventListener('pointerdown',e=>{if(e.target===lane){const rect=lane.getBoundingClientRect(),at=clamp((e.clientX-rect.left)/zoom,0,duration);clearSelection();window.Preview?.seek?.(at);}});
      lane.addEventListener('dragover',e=>{if(Array.from(e.dataTransfer.types||[]).includes('application/x-cipher-media')||Array.from(e.dataTransfer.types||[]).includes('application/x-cipher-stock')||e.dataTransfer.files?.length){e.preventDefault();e.dataTransfer.dropEffect='copy';lane.classList.add('media-drag-over');}});
      lane.addEventListener('dragleave',()=>lane.classList.remove('media-drag-over'));
      lane.addEventListener('drop',async e=>{e.preventDefault();lane.classList.remove('media-drag-over');let assetId=e.dataTransfer.getData('application/x-cipher-media')||e.dataTransfer.getData('text/plain');const stockId=e.dataTransfer.getData('application/x-cipher-stock');if(stockId){const asset=await window.StockMedia?.ensureImported?.(stockId);assetId=asset?.id||'';}if(!assetId&&e.dataTransfer.files?.length){const added=await importMediaFiles(Array.from(e.dataTransfer.files));assetId=added.find(asset=>compatible(asset,track))?.id||'';}const rect=lane.getBoundingClientRect(),at=clamp((e.clientX-rect.left)/zoom,0,duration);if(assetId)await addMediaAsset(assetId,track.id,at);});
      track.clips.sort((a,b)=>a.start-b.start).forEach(clip=>lane.appendChild(clipElement(track,clip,zoom)));
      row.append(label,lane);(track.type==='audio'?audioRoot:visualRoot).appendChild(row);
    });
    updateButtons();
  }

  function clipElement(track,clip,zoom){
    const el=document.createElement('div');el.className=`pro-clip${clip.id===selectedClipId?' selected':''}`;el.dataset.type=clip.type;el.style.left=`${clip.start*zoom}px`;el.style.width=`${Math.max(8,clip.duration*zoom-2)}px`;el.title=`${clip.name} • ${format(clip.start)}–${format(clip.start+clip.duration)}`;
    el.innerHTML=`<span class="pro-clip-name">${escapeHtml(clip.name)}</span><span class="pro-clip-time">${format(clip.start)} · ${clip.duration.toFixed(2)}s</span><i class="pro-trim-handle left"></i><i class="pro-trim-handle right"></i>`;
    const markers=new Set();Object.values(clip.keyframes||{}).flat().forEach(k=>markers.add(Number(k.time).toFixed(3)));for(const time of markers){const m=document.createElement('b');m.className='pro-keyframe-marker';m.style.left=`${(Number(time)/clip.duration)*100}%`;el.appendChild(m);}
    // Selection must never move the CTI. Keeping the playhead in place is
    // essential when the user selects a clip to add a keyframe at that time.
    el.addEventListener('click',e=>{e.stopPropagation();selectClip(track.id,clip.id);});
    el.addEventListener('dblclick',e=>{e.stopPropagation();if(clip.type==='text'){const value=prompt('Edit text:',clip.text);if(value!==null){commit('Edit text');clip.text=value;clip.name=value.slice(0,32)||'Text';renderTracks();refreshPreview();}}});
    el.addEventListener('pointerdown',e=>beginDrag(e,track,clip,e.target.classList.contains('left')?'trim-left':e.target.classList.contains('right')?'trim-right':'move'));
    return el;
  }

  function beginDrag(e,track,clip,mode){e.preventDefault();e.stopPropagation();selectClip(track.id,clip.id);if(track.locked){toast(`${track.name} is locked.`);return;}const before=snapshot();dragState={track,clip,mode,startX:e.clientX,origStart:clip.start,origDuration:clip.duration,origOffset:clip.sourceOffset,before};window.addEventListener('pointermove',dragMove);window.addEventListener('pointerup',dragEnd,{once:true});}
  function dragMove(e){if(!dragState)return;const {clip,mode,startX,origStart,origDuration,origOffset}=dragState,delta=(e.clientX-startX)/getZoom();
    if(mode==='move')clip.start=snapTime(clamp(origStart+delta,0,Math.max(0,duration-clip.duration)),clip.id);
    if(mode==='trim-right')clip.duration=Math.max(.1,Math.min(duration-clip.start,origDuration+delta));
    if(mode==='trim-left'){const next=snapTime(clamp(origStart+delta,0,origStart+origDuration-.1),clip.id),change=next-origStart;clip.start=next;clip.duration=origDuration-change;clip.sourceOffset=Math.max(0,origOffset+change);}
    renderTracks();updateInspector();refreshPreview();}
  function dragEnd(){if(!dragState)return;undoStack.push({label:dragState.mode==='move'?'Move clip':'Trim clip',state:dragState.before});if(undoStack.length>MAX_HISTORY)undoStack.shift();redoStack.length=0;dragState=null;window.removeEventListener('pointermove',dragMove);updateButtons();window.Projects?.scheduleAutoSave?.();}

  function resolveLegacyScene(scene,absoluteTime){if(!scene)return scene;const local=clamp(absoluteTime-Number(scene.startSec||0),0,Number(scene.duration)||0);const base={...(scene.transform||{}),x:scene.posX??scene.transform?.x??0,y:scene.posY??scene.transform?.y??0,scale:scene.scale??scene.transform?.scale??1,rotation:scene.rotation??scene.transform?.rotation??0,opacity:scene.opacity??scene.transform?.opacity??100,blur:scene.blur??scene.transform?.blur??0,volume:100};const p=resolvedTransform({transform:base,keyframes:scene.keyframes},local);return {...scene,scale:p.scale,posX:p.x,posY:p.y,rotation:p.rotation,opacity:p.opacity,blur:p.blur};}

  function renderVisualLayers(ctx,time,w,h){
    for(const track of tracks){if(track.muted||!VISUAL_TYPES.has(track.type))continue;for(const clip of track.clips){if(time<clip.start||time>=clip.start+clip.duration)continue;const p=resolvedTransform(clip,time-clip.start);ctx.save();ctx.globalAlpha=clamp(p.opacity,0,100)/100;ctx.filter=p.blur>0?`blur(${p.blur}px)`:'none';ctx.translate(w/2+(p.x/100)*w,h/2+(p.y/100)*h);ctx.rotate(p.rotation*Math.PI/180);
      if(clip.type==='text'){const size=Math.max(12,Math.round(Math.min(w,h)*.075*p.scale));ctx.font=`800 ${size}px Poppins, Arial, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=Math.max(2,size*.06);ctx.strokeStyle='rgba(0,0,0,.85)';ctx.fillStyle='#fff';ctx.strokeText(clip.text||clip.name,0,0,w*.92);ctx.fillText(clip.text||clip.name,0,0,w*.92);}
      else if(clip.element){const media=clip.element,iw=media.videoWidth||media.naturalWidth||media.width||w,ih=media.videoHeight||media.naturalHeight||media.height||h;if(iw&&ih){const cover=track.type==='video';const base=cover?Math.max(w/iw,h/ih):Math.min(w/iw,h/ih)*.55;const sw=iw*base*p.scale,sh=ih*base*p.scale;try{ctx.drawImage(media,-sw/2,-sh/2,sw,sh);}catch{}}}
      ctx.restore();}}
  }

  async function prepareFrame(time){const waits=[];for(const track of tracks){if(track.muted)continue;for(const clip of track.clips){const el=clip.element;if(!(el instanceof HTMLVideoElement)||time<clip.start||time>=clip.start+clip.duration)continue;const target=clamp(clip.sourceOffset+time-clip.start,0,Math.max(0,(el.duration||1)-.001));if(Math.abs((el.currentTime||0)-target)<.018&&el.readyState>=2)continue;waits.push(new Promise(resolve=>{const done=()=>{el.removeEventListener('seeked',done);resolve();};el.addEventListener('seeked',done,{once:true});el.currentTime=target;setTimeout(done,1200);}));}}
    await Promise.all(waits);
  }

  function applyClipVolume(clip,percent){const el=clip?.element;if(!(el instanceof HTMLAudioElement))return;const value=clamp(percent,0,200)/100;if(value<=1){el.volume=value;if(clip.gainNode)clip.gainNode.gain.value=1;return;}el.volume=1;try{if(!clipAudioContext)clipAudioContext=new (window.AudioContext||window.webkitAudioContext)();if(!clip.audioSource){clip.audioSource=clipAudioContext.createMediaElementSource(el);clip.gainNode=clipAudioContext.createGain();clip.audioSource.connect(clip.gainNode);clip.gainNode.connect(clipAudioContext.destination);}if(clipAudioContext.state==='suspended')clipAudioContext.resume().catch(()=>{});clip.gainNode.gain.value=value;}catch(error){console.warn('[Audio Clip Gain]',error);}}

  function syncMedia(time,playing){for(const track of tracks){for(const clip of track.clips){const el=clip.element;if(!el||!(el instanceof HTMLMediaElement))continue;const active=!track.muted&&time>=clip.start&&time<clip.start+clip.duration;if(!active){el.pause();continue;}const local=clip.sourceOffset+time-clip.start;if(Math.abs((el.currentTime||0)-local)>.16)el.currentTime=clamp(local,0,Math.max(0,(el.duration||local+1)-.01));const p=resolvedTransform(clip,time-clip.start);if(clip.type==='audio'){el.muted=false;applyClipVolume(clip,p.volume);}if(playing)el.play().catch(()=>{});else el.pause();}}const mainKeys=normalizedKeyframes(mainAudioAutomation.keyframes).volume;if(mainKeys.length)window.Preview?.setAutomationVolume?.(valueAt(mainAudioAutomation.transform.volume,mainKeys,clamp(time,0,duration))/100);updateInspector(true);}

  function hasVisualClips(){return tracks.some(t=>!t.muted&&VISUAL_TYPES.has(t.type)&&t.clips.length);}
  function hasVideoClips(){return tracks.some(t=>!t.muted&&t.clips.some(c=>c.element instanceof HTMLVideoElement));}
  function hasAnyClips(){return normalizedKeyframes(mainAudioAutomation.keyframes).volume.length>0||tracks.some(t=>t.clips.length)||window.App?.getScenes?.().some(s=>s.deleted===true||!!s.transform||Number(s.opacity??100)!==100||Number(s.blur||0)!==0||Object.values(s.keyframes||{}).some(a=>a?.length));}
  function getAudioClips(){const out=[];for(const track of tracks){if(track.muted||track.type!=='audio')continue;for(const c of track.clips)if(c.blob)out.push({blob:c.blob,name:c.name,start:c.start,duration:c.duration,sourceOffset:c.sourceOffset,volume:c.transform.volume,keyframes:c.keyframes.volume||[]});}return out;}
  function getMainAudioAutomation(){const keys=normalizedKeyframes(mainAudioAutomation.keyframes).volume;return {volume:mainAudioAutomation.transform.volume,keyframes:keys.map(k=>({...k}))};}

  async function serialize(){return {version:4,duration,snapping,mainAudioAutomation:cloneData(mainAudioAutomation),mediaLibrary:mediaLibrary.map(asset=>({id:asset.id,name:asset.name,type:asset.type,duration:asset.duration,blob:asset.blob||null,thumbnail:asset.thumbnail||'',stockId:asset.stockId,provider:asset.provider,creator:asset.creator,creatorUrl:asset.creatorUrl,pageUrl:asset.pageUrl,attribution:asset.attribution})),tracks:tracks.map(t=>({...t,clips:t.clips.map(c=>({id:c.id,type:c.type,name:c.name,text:c.text,start:c.start,duration:c.duration,sourceOffset:c.sourceOffset,sourceDuration:c.sourceDuration,linkedLegacyIndex:c.linkedLegacyIndex,transform:c.transform,keyframes:c.keyframes,blob:c.blob||null,stockId:c.stockId,provider:c.provider,creator:c.creator,creatorUrl:c.creatorUrl,pageUrl:c.pageUrl,attribution:c.attribution}))}))};}
  async function restore(data){if(!data){releaseMedia();tracks=[];mediaLibrary=[];mainAudioAutomation={transform:normalizeTransform({volume:Number(document.getElementById('sl-audio-volume')?.value)||100}),keyframes:normalizedKeyframes()};renderMediaLibrary();renderTracks();return;}await applySnapshot({duration:data.duration,tracks:data.tracks||[],mediaLibrary:data.mediaLibrary||[],mainAudioAutomation:data.mainAudioAutomation,snapping:data.snapping!==false,selectedTrackId:null,selectedClipId:null,legacySceneIndex:-1});}
  function refreshPreview(){window.Preview?.renderFrame?.();}
  function refresh(){renderTracks();updateInspector();}
  function updateButtons(){const clip=!!selectedClip(),editable=clip||legacySceneIndex>=0,set=(id,v)=>{const el=document.getElementById(id);if(el)el.disabled=!v;};['btn-pro-split','btn-pro-ripple-delete','btn-pro-delete-left','btn-pro-delete-right','btn-pro-duplicate'].forEach(x=>set(x,editable));set('btn-pro-slip-left',clip&&!!selectedClip().sourceDuration);set('btn-pro-slip-right',clip&&!!selectedClip().sourceDuration);set('btn-pro-undo',undoStack.length);set('btn-pro-redo',redoStack.length);document.getElementById('btn-pro-snap')?.classList.toggle('active',snapping);}
  function onKeyDown(e){const tag=document.activeElement?.tagName?.toLowerCase();if(tag==='input'||tag==='textarea'||tag==='select')return;const mod=e.ctrlKey||e.metaKey;if(mod&&e.key.toLowerCase()==='i'){e.preventDefault();e.stopImmediatePropagation();openMediaLibrary();document.getElementById('pro-media-input')?.click();return;}if(!getTarget()&&!selectedClip())return;
    if(mod&&e.key.toLowerCase()==='z'&&(e.shiftKey?redoStack.length:undoStack.length)){e.preventDefault();e.stopImmediatePropagation();e.shiftKey?redo():undo();}else if(mod&&e.key.toLowerCase()==='d'){e.preventDefault();e.stopImmediatePropagation();duplicateSelected();}else if(e.shiftKey&&e.key==='Delete'){e.preventDefault();e.stopImmediatePropagation();rippleDelete();}else if(e.altKey&&e.key==='ArrowLeft'){e.preventDefault();slipSelected(-.25);}else if(e.altKey&&e.key==='ArrowRight'){e.preventDefault();slipSelected(.25);}else if(!mod&&!e.altKey&&e.key.toLowerCase()==='s'){e.preventDefault();splitSelected();}else if(!mod&&!e.altKey&&e.key.toLowerCase()==='n'){e.preventDefault();toggleSnap();}}
  function toast(message){window.History?.showToast?.(message);if(!window.History?.showToast)console.log('[Pro Timeline]',message);}
  function format(sec){const m=Math.floor(sec/60),s=Math.floor(sec%60),f=Math.floor((sec%1)*10);return `${m}:${String(s).padStart(2,'0')}.${f}`;}
  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}

  return {init,attachLegacy,selectLegacyClip,selectLegacyAudio,clearSelection,replaceLegacyScene,replaceLegacyFiles,replaceMainAudio,importExternalMediaFile,addAssetAtPlayhead,beginLegacyResize,resizeLegacyClip,endLegacyResize,resolveLegacyScene,resolvedTransform,renderVisualLayers,prepareFrame,syncMedia,hasVisualClips,hasVideoClips,hasAnyClips,getAudioClips,getMainAudioAutomation,serialize,restore,refresh,openMediaLibrary,addMediaAsset,setSelectedVisualProperty,resetSelectedVisualTransform,getSelectedClip:()=>selectedClip(),getSelectedLegacyIndex:()=>legacySceneIndex,getLegacyReplacement,getMediaLibrary:()=>mediaLibrary,getTracks:()=>tracks,getSnapshot:snapshot};
})();
