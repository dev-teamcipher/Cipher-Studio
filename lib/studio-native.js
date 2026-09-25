// Shared capability contract: never substitute a visually different effect.
(function(root) {
  function reason(o) {
    if (!o.scenes?.length) return 'No scenes';
    if (o.particles || (o.fxPreset && o.fxPreset !== 'none')) return 'Animated atmosphere';
    const moving = o.motionEnabled !== false && o.motionPreset !== 'static';
    if (moving && !['auto','zoomin','zoomout','pulse','diagonal','panleft','panright','tiltup','tiltdown'].includes(o.motionPreset)) return 'Advanced camera motion';
    const nativeTransitions = new Set(['none','crossfade','wipeleft','wiperight','slideleft','slideright']);
    let expectedStart=0;
    for (let i=0;i<o.scenes.length;i++) {
      const s=o.scenes[i];
      if(Number.isFinite(Number(s.startSec))&&Math.abs(Number(s.startSec)-expectedStart)>.02)return 'Editable timeline gap';
      expectedStart=Number.isFinite(Number(s.endSec))?Number(s.endSec):expectedStart+Number(s.duration||0);
      if (s.deleted || Number(s.rotation) || Number(s.posX) || Number(s.posY) || Number(s.scale ?? 1)<1 || Number(s.opacity ?? 100)!==100 || Number(s.blur || 0)) return 'Image transform';
      if (Object.values(s.keyframes || {}).some(keys=>Array.isArray(keys)&&keys.length)) return 'Image keyframes';
      if (i<o.scenes.length-1 && o.transitionDuration>0 && s.transition!=='none') {
        if (!nativeTransitions.has(s.transition || 'crossfade')) return 'Advanced animated transition';
        if (o.transitionDuration > Math.min(s.duration,o.scenes[i+1].duration)) return 'Short transition scene';
      }
    }
    return '';
  }
  function filter(c) {
    const w=c.width,h=c.height,fps=c.fps,parts=[];
    const durations=c.scenes.map(s=>s.duration);
    c.scenes.forEach((s,i)=>{
      const frames=Math.max(1,Math.round(s.duration*fps));
      const u=`min(on/${s.duration*fps},1)`;
      const ease=`if(lt(${u},0.5),2*(${u})*(${u}),-1+(4-2*(${u}))*(${u}))`;
      const k=Number(c.motionIntensity ?? .35)/.3;
      const motion=c.motionEnabled!==false && c.motionPreset!=='static';
      const preset=c.motionPreset||'auto';let z='1',dx='0',dy='0';
      if(motion&&preset==='zoomin')z=`1+0.16*${k}*${ease}`;
      else if(motion&&preset==='zoomout')z=`1+0.18*${k}*(1-${ease})`;
      else if(motion&&preset==='panleft'){z='1.08';dx=`(-0.06+0.12*${ease})*${w}*${k}`;}
      else if(motion&&preset==='panright'){z='1.08';dx=`(0.06-0.12*${ease})*${w}*${k}`;}
      else if(motion&&preset==='tiltup'){z='1.10';dy=`(0.06-0.12*${ease})*${h}*${k}`;}
      else if(motion&&preset==='tiltdown'){z='1.10';dy=`(-0.06+0.12*${ease})*${h}*${k}`;}
      else if(motion&&preset==='pulse')z=`1.03+abs(sin((${u})*PI*2))*0.08*${k}`;
      else if(motion&&preset==='diagonal'){z='1.12';dx=`(-0.05+0.10*${ease})*${w}*${k}`;dy=`(-0.04+0.08*${ease})*${h}*${k}`;}
      else if(motion&&preset==='auto'){
        const seeds=[{a:1,b:1.10,fx:-.02,fy:-.02,tx:.02,ty:.02},{a:1.12,b:1,fx:.03,fy:-.02,tx:-.02,ty:.01},{a:1,b:1.08,fx:0,fy:.04,tx:0,ty:-.03},{a:1.08,b:1.02,fx:-.04,fy:0,tx:.04,ty:0},{a:1.04,b:1.14,fx:.02,fy:.02,tx:-.03,ty:-.02}],v=seeds[i%seeds.length];
        z=`${v.a}+(${v.b-v.a})*${ease}*${k}`;dx=`(${v.fx}+(${v.tx-v.fx})*${ease})*${w}*${Number(c.motionIntensity??.35)}`;dy=`(${v.fy}+(${v.ty-v.fy})*${ease})*${h}*${Number(c.motionIntensity??.35)}`;
      }
      // Fit source before zooming; zoom's centre matches Canvas drawMotion.
      const zoom=`max(1,(${z})*${Number(s.scale ?? 1)})`;
      const incoming=i>0 && c.transitionDuration>0 && c.scenes[i-1].transition!=='none' ? c.transitionDuration : 0;
      parts.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='${zoom}':x='iw/2-iw/zoom/2-(${dx})/zoom':y='ih/2-ih/zoom/2-(${dy})/zoom':d=${frames}:s=${w}x${h}:fps=${fps},setsar=1,format=yuv420p,settb=AVTB${incoming?`,tpad=start_duration=${incoming}:start_mode=clone`:''}[v${i}]`);
    });
    let current='v0',end=durations[0];
    const transitionName=value=>({crossfade:'fade',wipeleft:'wipeleft',wiperight:'wiperight',slideleft:'slideleft',slideright:'slideright',diagwipe:'diagtl',circleopen:'circleopen',fadeblack:'fadeblack'}[value]||'fade');
    for(let i=1;i<c.scenes.length;i++) {
      const out=`join${i}`,tr=c.transitionDuration>0 && c.scenes[i-1].transition!=='none' ? c.transitionDuration : 0;
      parts.push(tr?`[${current}][v${i}]xfade=transition=${transitionName(c.scenes[i-1].transition||'crossfade')}:duration=${tr}:offset=${Math.max(0,end-tr)}[${out}]`:`[${current}][v${i}]concat=n=2:v=1:a=0[${out}]`);
      current=out;end+=durations[i];
    }
    const finish=[];
    if(c.fadeIn>0)finish.push(`fade=t=in:st=0:d=${c.fadeIn}`);
    if(c.fadeOut>0)finish.push(`fade=t=out:st=${Math.max(0,end-c.fadeOut)}:d=${c.fadeOut}`);
    const bar=Math.round(h*.11);
    if(c.letterbox)finish.push(`drawbox=x=0:y=0:w=iw:h=${bar}:color=black:t=fill`,`drawbox=x=0:y=${h-bar}:w=iw:h=${bar}:color=black:t=fill`);
    finish.push('format=yuv420p');
    parts.push(`[${current}]${finish.join(',')}[outv]`);
    return {graph:parts.join(';'),totalDuration:end};
  }
  const api={reason,filter};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.StudioNative=api;
})(typeof window!=='undefined'?window:globalThis);
