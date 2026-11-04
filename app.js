'use strict';
const $=s=>document.querySelector(s);
const cv=$('#canvas'),cx=cv.getContext('2d');let W=cv.width,H=cv.height;
function setAspect(a){if(a==='9:16'){cv.width=720;cv.height=1280}else{cv.width=1280;cv.height=720}W=cv.width;H=cv.height;cv.style.aspectRatio=a.replace(':','/');drawFrame()}
const S={media:[],clips:[],texts:[],music:null,t:0,playing:false,sel:null,selText:null,pps:60,exporting:false};
let uid=1,actx=null,master=null,exportDest=null;
const fmt=s=>{s=Math.max(0,s);const m=Math.floor(s/60);return String(m).padStart(2,'0')+':'+(s%60).toFixed(1).padStart(4,'0')};
const clipDur=c=>c.out-c.in;
const total=()=>S.clips.reduce((a,c)=>a+clipDur(c),0);
const getM=id=>S.media.find(m=>m.id===id);
function clipStarts(){let a=0;return S.clips.map(c=>{const s=a;a+=clipDur(c);return s})}
function clipAt(t){const st=clipStarts();for(let i=0;i<S.clips.length;i++){if(t>=st[i]&&t<st[i]+clipDur(S.clips[i]))return{i,c:S.clips[i],s:st[i]}}return null}

// ---------- audio ----------
function ensureAudio(){if(actx)return;actx=new (window.AudioContext||window.webkitAudioContext)();master=actx.createGain();master.connect(actx.destination);exportDest=actx.createMediaStreamDestination();master.connect(exportDest);
  S.media.forEach(hookAudio);}
function hookAudio(m){if(!actx||m.src||m.type==='image')return;m.src=actx.createMediaElementSource(m.el);m.gain=actx.createGain();m.src.connect(m.gain);m.gain.connect(master);}

// ---------- import ----------
function importFiles(files){[...files].forEach(f=>{const type=f.type.split('/')[0];if(!['video','audio','image'].includes(type))return;
  const m={id:uid++,name:f.name,type,url:URL.createObjectURL(f),duration:type==='image'?3:0,ready:false};
  if(type==='image'){m.el=new Image();m.el.onload=()=>{m.ready=true;renderLib()};m.el.src=m.url}
  else{m.el=document.createElement(type);m.el.preload='auto';m.el.playsInline=true;m.el.setAttribute('playsinline','');m.el.setAttribute('webkit-playsinline','');m.el.src=m.url;
    m.el.onloadedmetadata=()=>{m.duration=isFinite(m.el.duration)?m.el.duration:5;m.ready=true;renderLib()};}
  S.media.push(m);hookAudio(m);});renderLib();}
$('#fileInput').onchange=e=>{ensureAudio();importFiles(e.target.files);e.target.value=''};
const drop=$('#drop');
['dragover','dragenter'].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over')}));
document.addEventListener('dragleave',e=>{if(!e.relatedTarget)drop.classList.remove('over')});
document.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('over');if(e.dataTransfer.files.length){ensureAudio();importFiles(e.dataTransfer.files)}});

function renderLib(){const ul=$('#mediaList');ul.innerHTML='';S.media.forEach(m=>{const li=document.createElement('li');
  const ic={video:'🎬',audio:'🎵',image:'🖼'}[m.type];
  li.innerHTML=`<div class="n">${ic} ${esc(m.name)}</div><div class="muted">${m.ready?fmt(m.duration):'載入中…'}</div><div class="a"></div>`;
  const a=li.querySelector('.a');
  if(m.type!=='audio')a.append(btn('加入時間軸',()=>addClip(m)));
  if(m.type!=='image')a.append(btn('設為音樂',()=>setMusic(m)));
  ul.append(li)})}
const btn=(t,f)=>{const b=document.createElement('button');b.className='btn small';b.textContent=t;b.onclick=f;return b};
const esc=s=>s.replace(/[&<>"]/g,c=>({'&':'&','<':'<','>':'>','"':'"'}[c]));
function addClip(m){if(!m.ready)return alert('媒體尚未載入完成');S.clips.push({id:uid++,mid:m.id,in:0,out:m.duration,fi:0,fo:0});renderAll()}
function setMusic(m){if(!m.ready)return alert('媒體尚未載入完成');S.music={mid:m.id,vol:0.6,offset:0};renderAll()}

// ---------- timeline ----------
function renderAll(){renderTimeline();renderProps();renderTextProps();renderMusicProps();drawFrame()}
function renderTimeline(){const pps=S.pps,T=Math.max(total(),...S.texts.map(x=>x.end),10)+5;
  $('#timeline').style.width=(50+T*pps)+'px';
  const r=$('#ruler');r.innerHTML='';const step=pps<25?10:pps<60?5:1;for(let s=0;s<T;s+=step){const sp=document.createElement('span');sp.style.left=s*pps+'px';sp.textContent=fmt(s).replace('.0','');r.append(sp)}
  const vt=$('#videoTrack');vt.innerHTML='';const st=clipStarts();
  S.clips.forEach((c,i)=>{const m=getM(c.mid);const d=mkClip(vt,st[i],clipDur(c),m.type==='image'?'img':'',m.name,c===S.sel);
    bindClip(d,{kind:'v',c,i})});
  const tt=$('#textTrack');tt.innerHTML='';S.texts.forEach(x=>{const d=mkClip(tt,x.start,x.end-x.start,'txt',x.text,x===S.selText);bindClip(d,{kind:'t',x})});
  const mt=$('#musicTrack');mt.innerHTML='';if(S.music){const m=getM(S.music.mid);const d=mkClip(mt,S.music.offset,m.duration,'mus','♪ '+m.name,false);bindClip(d,{kind:'m'})}
  updPlayhead()}
function mkClip(lane,start,dur,cls,label,sel){const d=document.createElement('div');d.className='clip '+cls+(sel?' sel':'');d.style.left=start*S.pps+'px';d.style.width=Math.max(4,dur*S.pps)+'px';
  d.innerHTML=`<div class="h l"></div>${esc(label)}<br><small>${fmt(dur)}</small><div class="h r"></div>`;lane.append(d);return d}
function bindClip(d,o){d.onpointerdown=e=>{d.setPointerCapture&&d.setPointerCapture(e.pointerId);e.stopPropagation();e.preventDefault();const x0=e.clientX,hl=e.target.classList.contains('l'),hr=e.target.classList.contains('r');
  if(o.kind==='v'){S.sel=o.c;S.selText=null;if(innerWidth<=820&&document.body.dataset.tab!=='clip')showTab('clip')}else if(o.kind==='t'){S.selText=o.x;S.sel=null;if(innerWidth<=820)showTab('text')}
  const snap=o.kind==='v'?{...o.c}:o.kind==='t'?{...o.x}:{...S.music};let moved=false;
  d.classList.add('sel');renderProps();renderTextProps();
  const mv=ev=>{const dt=(ev.clientX-x0)/S.pps;if(Math.abs(ev.clientX-x0)>3)moved=true;if(!moved)return;
    if(o.kind==='v'){const c=o.c,m=getM(c.mid),maxD=m.type==='image'?3600:m.duration;
      if(hl){c.in=Math.min(Math.max(0,snap.in+dt),c.out-0.1);if(m.type==='image')c.in=0,c.out=Math.max(0.1,snap.out-dt)}
      else if(hr){c.out=Math.max(c.in+0.1,Math.min(maxD,snap.out+dt))}
      else{d.classList.add('dragging');d.style.transform=`translateX(${ev.clientX-x0}px)`;return}
    }else if(o.kind==='t'){const x=o.x;if(hl)x.start=Math.min(Math.max(0,snap.start+dt),x.end-0.1);else if(hr)x.end=Math.max(x.start+0.1,snap.end+dt);else{const len=snap.end-snap.start;x.start=Math.max(0,snap.start+dt);x.end=x.start+len}}
    else{S.music.offset=Math.max(0,snap.offset+dt)}
    renderTimeline();renderProps();renderTextProps();drawFrame();};
  const up=ev=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);removeEventListener('pointercancel',up);
    if(o.kind==='v'&&moved&&!hl&&!hr){const st=clipStarts();const center=st[o.i]+clipDur(o.c)/2+(ev.clientX-x0)/S.pps;
      S.clips.splice(o.i,1);let ni=0;const st2=clipStarts();S.clips.forEach((c,j)=>{if(center>st2[j]+clipDur(c)/2)ni=j+1});S.clips.splice(ni,0,o.c)}
    renderAll()};
  addEventListener('pointermove',mv);addEventListener('pointerup',up);addEventListener('pointercancel',up);}}
function seekFromEvent(e,el){const r=el.getBoundingClientRect();seek((e.clientX-r.left)/S.pps)}
$('#ruler').onpointerdown=e=>{seekFromEvent(e,$('#ruler'));const mv=ev=>seekFromEvent(ev,$('#ruler'));addEventListener('pointermove',mv);addEventListener('pointerup',()=>removeEventListener('pointermove',mv),{once:true})};
document.querySelectorAll('.lane').forEach(l=>l.onclick=e=>{if(e.target===l){S.sel=null;S.selText=null;seekFromEvent(e,l);renderAll()}});
function setZoom(v){S.pps=Math.max(10,Math.min(200,v));$('#zoom').value=S.pps;renderTimeline()}
$('#zoom').oninput=e=>setZoom(+e.target.value);$('#zoomIn').onclick=()=>setZoom(S.pps*1.3);$('#zoomOut').onclick=()=>setZoom(S.pps/1.3);
(()=>{const tw=$('#timelineWrap');let d0=0,z0=0;const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
 tw.addEventListener('touchstart',e=>{if(e.touches.length===2){d0=dist(e.touches);z0=S.pps}},{passive:true});
 tw.addEventListener('touchmove',e=>{if(e.touches.length===2&&d0){e.preventDefault();setZoom(z0*dist(e.touches)/d0)}},{passive:false});
 tw.addEventListener('touchend',()=>d0=0);
 tw.addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();setZoom(S.pps*(e.deltaY<0?1.1:0.9))}},{passive:false});})();
document.querySelectorAll('#tabbar button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
function showTab(t){document.body.dataset.tab=t;document.querySelectorAll('#tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.tab===t))}
document.body.dataset.tab='media';
$('#aspect').onchange=e=>setAspect(e.target.value);
// iOS/Android: unlock audio + media elements on first gesture
let unlocked=false;function unlock(){ensureAudio();actx.resume();if(unlocked)return;unlocked=true;
 const b=actx.createBuffer(1,1,22050),src=actx.createBufferSource();src.buffer=b;src.connect(actx.destination);src.start(0)}
['pointerdown','touchend','keydown'].forEach(ev=>document.addEventListener(ev,unlock,{capture:true}));
function primeMedia(){S.media.forEach(m=>{if(m.type==='image'||m.primed)return;m.primed=true;const t=m.el.currentTime;const p=m.el.play();p&&p.then(()=>{if(!S.playing||m.el!==curEl())m.el.pause()}).catch(()=>{m.primed=false})})}
function curEl(){const h=clipAt(S.t);return h?getM(h.c.mid).el:null}
function updPlayhead(){$('#playhead').style.left=(50+S.t*S.pps)+'px';$('#timeLabel').textContent=fmt(S.t)+' / '+fmt(total())}

// ---------- edit ops ----------
function split(){const h=clipAt(S.t);if(!h)return;const off=S.t-h.s;if(off<0.05||clipDur(h.c)-off<0.05)return;
  const a=h.c,b={...a,id:uid++,in:a.in+off,fi:0};a.out=a.in+off;a.fo=0;S.clips.splice(h.i+1,0,b);S.sel=b;renderAll()}
function del(){if(S.sel){S.clips=S.clips.filter(c=>c!==S.sel);S.sel=null}else if(S.selText){S.texts=S.texts.filter(x=>x!==S.selText);S.selText=null}else return;
  S.t=Math.min(S.t,total());renderAll()}
$('#splitBtn').onclick=split;$('#delBtn').onclick=del;

// ---------- inspector ----------
function field(lbl,val,cb,attrs='type="number" step="0.1"'){const l=document.createElement('label');l.innerHTML=`${lbl} <input ${attrs}>`;const i=l.querySelector('input');i.value=val;i.oninput=()=>cb(i.type==='number'?+i.value:i.value);return l}
function renderProps(){const p=$('#clipProps');p.innerHTML='';const c=S.sel;if(!c){p.innerHTML='<p class="muted">選取時間軸上的片段</p>';return}
  const m=getM(c.mid);p.innerHTML=`<p class="muted">${esc(m.name)}</p>`;
  const upd=()=>{renderTimeline();drawFrame()};
  if(m.type==='image')p.append(field('顯示長度 (秒)',clipDur(c).toFixed(2),v=>{c.out=Math.max(0.1,v);upd()}));
  else{p.append(field('入點 In (秒)',c.in.toFixed(2),v=>{c.in=Math.min(Math.max(0,v),c.out-0.1);upd()}));
       p.append(field('出點 Out (秒)',c.out.toFixed(2),v=>{c.out=Math.max(c.in+0.1,Math.min(m.duration,v));upd()}));}
  p.append(field('片段淡入 (秒)',c.fi,v=>c.fi=Math.max(0,v)));p.append(field('片段淡出 (秒)',c.fo,v=>c.fo=Math.max(0,v)));
  if(m.type==='video'){c.vol=c.vol??1;p.append(field('原聲音量 (0–1)',c.vol,v=>c.vol=v,'type="range" min="0" max="1" step="0.05"'))}}
$('#addText').onclick=()=>{const x={id:uid++,text:'標題文字',x:50,y:50,color:'#f5c542',size:Math.round(Math.min(W,H)/10),start:S.t,end:S.t+3,shadow:true};S.texts.push(x);S.selText=x;S.sel=null;renderAll()};
function renderTextProps(){const p=$('#textProps');p.innerHTML='';S.texts.forEach(x=>{const d=document.createElement('div');d.className='titem'+(x===S.selText?' sel':'');
  const u=()=>{renderTimeline();drawFrame()};
  d.append(field('文字',x.text,v=>{x.text=v;u()},'type="text"'));
  const r1=document.createElement('div');r1.className='row';r1.append(field('X %',x.x,v=>{x.x=v;u()}),field('Y %',x.y,v=>{x.y=v;u()}));d.append(r1);
  const r2=document.createElement('div');r2.className='row';r2.append(field('大小',x.size,v=>{x.size=v;u()},'type="number" step="2"'),field('顏色',x.color,v=>{x.color=v;u()},'type="color"'));d.append(r2);
  const r3=document.createElement('div');r3.className='row';r3.append(field('開始',x.start.toFixed(1),v=>{x.start=Math.max(0,v);u()}),field('結束',x.end.toFixed(1),v=>{x.end=Math.max(x.start+0.1,v);u()}));d.append(r3);
  d.append(btn('刪除',()=>{S.texts=S.texts.filter(y=>y!==x);renderAll()}));d.onclick=()=>{if(S.selText!==x){S.selText=x;S.sel=null;renderTimeline();d.parentNode&&[...p.children].forEach(c=>c.classList.toggle('sel',c===d))}};p.append(d)})}
function renderMusicProps(){const p=$('#musicProps');p.innerHTML='';if(!S.music){p.innerHTML='<p class="muted">在媒體庫點「設為音樂」</p>';return}
  p.innerHTML=`<p class="muted">♪ ${esc(getM(S.music.mid).name)}</p>`;
  p.append(field('音量',S.music.vol,v=>S.music.vol=v,'type="range" min="0" max="1" step="0.05"'));
  p.append(field('起始位置 (秒)',S.music.offset,v=>{S.music.offset=Math.max(0,v);renderTimeline()}));
  p.append(btn('移除音樂',()=>{pauseAll();S.music=null;renderAll()}))}

// ---------- render & playback ----------
function fadeAlpha(t){const T=total(),fi=+$('#fadeIn').value||0,fo=+$('#fadeOut').value||0;let a=1;if(fi>0)a=Math.min(a,t/fi);if(fo>0)a=Math.min(a,(T-t)/fo);return Math.max(0,Math.min(1,a))}
function drawFit(el,w,h){const s=($('#fitCover')?.checked?Math.max:Math.min)(W/w,H/h),dw=w*s,dh=h*s;cx.drawImage(el,(W-dw)/2,(H-dh)/2,dw,dh)}
function drawFrame(){cx.fillStyle='#000';cx.fillRect(0,0,W,H);const h=clipAt(S.t);let ca=1;
  if(h){const m=getM(h.c.mid),off=S.t-h.s;
    if(h.c.fi>0)ca=Math.min(ca,off/h.c.fi);if(h.c.fo>0)ca=Math.min(ca,(clipDur(h.c)-off)/h.c.fo);ca=Math.max(0,Math.min(1,ca));
    cx.globalAlpha=ca;
    try{if(m.type==='image'&&m.ready)drawFit(m.el,m.el.naturalWidth,m.el.naturalHeight);else if(m.type==='video'&&m.el.readyState>=2)drawFit(m.el,m.el.videoWidth,m.el.videoHeight)}catch(e){}
    cx.globalAlpha=1}
  else if(!S.clips.length){cx.fillStyle='#8a84b0';cx.font='32px sans-serif';cx.textAlign='center';cx.fillText('匯入媒體並加入時間軸開始剪輯',W/2,H/2)}
  S.texts.forEach(x=>{if(S.t>=x.start&&S.t<x.end){cx.font=`bold ${x.size}px "Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`;cx.textAlign='center';cx.textBaseline='middle';
    cx.shadowColor='rgba(0,0,0,.8)';cx.shadowBlur=8;cx.fillStyle=x.color;x.text.split('\n').forEach((ln,k)=>cx.fillText(ln,W*x.x/100,H*x.y/100+k*x.size*1.2));cx.shadowBlur=0}});
  const fa=fadeAlpha(S.t);if(fa<1){cx.fillStyle=`rgba(0,0,0,${1-fa})`;cx.fillRect(0,0,W,H)}
  return fa*ca}
function pauseAll(){S.media.forEach(m=>{if(m.type!=='image')m.el.pause()})}
let curMid=null,startWall=0,startT=0;
function syncMedia(){const h=clipAt(S.t);const fa=fadeAlpha(S.t);
  S.media.forEach(m=>{if(m.type==='image')return;const isCur=h&&h.c.mid===m.id,isMus=S.music&&S.music.mid===m.id;
    if(isCur){const want=h.c.in+(S.t-h.s);if(Math.abs(m.el.currentTime-want)>0.25)m.el.currentTime=want;if(m.gain)m.gain.gain.value=(h.c.vol??1)*fa;else m.el.volume=Math.min(1,(h.c.vol??1)*fa);if(m.el.paused)m.el.play().catch(()=>{})}
    else if(isMus){const want=S.t-S.music.offset;if(want<0||want>=m.duration){m.el.pause()}else{if(Math.abs(m.el.currentTime-want)>0.3)m.el.currentTime=want;const v=S.music.vol*fa;if(m.gain)m.gain.gain.value=v;else m.el.volume=v;if(m.el.paused)m.el.play().catch(()=>{})}}
    else if(!m.el.paused)m.el.pause()})}
function play(){if(!S.clips.length)return;ensureAudio();actx.resume();primeMedia();if(S.t>=total()-0.05)S.t=0;S.playing=true;startWall=performance.now();startT=S.t;$('#playBtn').textContent='⏸ 暫停';
  // prime: seek current clip
  const h=clipAt(S.t);if(h){const m=getM(h.c.mid);if(m.type==='video')m.el.currentTime=h.c.in+(S.t-h.s)}}
function pause(){S.playing=false;pauseAll();$('#playBtn').textContent='▶ 播放';if(S.exporting)finishExport()}
function seek(t){S.t=Math.max(0,Math.min(t,total()));startWall=performance.now();startT=S.t;
  const h=clipAt(S.t);if(h){const m=getM(h.c.mid);if(m.type==='video'){m.el.currentTime=h.c.in+(S.t-h.s);m.el.addEventListener('seeked',drawFrame,{once:true})}}
  updPlayhead();drawFrame()}
$('#playBtn').onclick=()=>S.playing?pause():play();
function loop(){if(S.playing){S.t=startT+(performance.now()-startWall)/1000;if(S.t>=total()){S.t=total();pause()}else syncMedia();updPlayhead();
  const wrap=$('#timelineWrap'),px=50+S.t*S.pps;if(px>wrap.scrollLeft+wrap.clientWidth-40||px<wrap.scrollLeft)wrap.scrollLeft=px-60;}
  drawFrame();requestAnimationFrame(loop)}
requestAnimationFrame(loop);

// ---------- export ----------
let rec=null,chunks=[],cancelled=false,wc=null;
const MP4_TYPES=['video/mp4;codecs=avc1.640028,mp4a.40.2','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4;codecs=avc1,opus'];
const FORCE_WC=/forceWebCodecs/.test(location.search);
function download(blob,ext){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='星域剪輯_'+Date.now()+'.'+ext;document.body.append(a);a.click();a.remove()}
function startExport(fmt){if(!S.clips.length)return alert('時間軸是空的');
  ensureAudio();actx.resume();pause();cancelled=false;
  const vs=cv.captureStream(30);const vt=vs.getVideoTracks()[0],at=exportDest.stream.getAudioTracks()[0];
  let mode='mr',mime='';
  if(fmt==='mp4'){mime=(!FORCE_WC&&typeof MediaRecorder!=='undefined')?MP4_TYPES.find(t=>MediaRecorder.isTypeSupported(t))||'':'';
    if(!mime){if(typeof VideoEncoder!=='undefined'&&typeof MediaStreamTrackProcessor!=='undefined'&&window.Mp4Muxer)mode='wc';else return alert('此瀏覽器不支援 MP4 匯出，請改用 WebM 匯出（或使用新版 Chrome / Edge / Safari）')}}
  else{if(typeof MediaRecorder==='undefined')return alert('此瀏覽器不支援 MediaRecorder');mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||''}
  S.exportPath=mode==='wc'?'webcodecs':'mediarecorder:'+mime;
  $('#overlay').hidden=false;$('#overlayMsg').textContent=`匯出 ${fmt.toUpperCase()} 中（${mode==='wc'?'WebCodecs 編碼':'MediaRecorder'}，即時錄製，請保持此分頁在前景）…`;
  S.exporting=true;seek(0);
  if(mode==='mr'){rec=new MediaRecorder(new MediaStream([vt,at]),mime?{mimeType:mime,videoBitsPerSecond:6e6}:{});chunks=[];
    rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
    rec.onstop=()=>{vt.stop();$('#overlay').hidden=true;S.exporting=false;if(!cancelled)download(new Blob(chunks,{type:fmt==='mp4'?'video/mp4':'video/webm'}),fmt)};
    setTimeout(()=>{rec.start(250);play()},300)}
  else startWebCodecs(vt,at).then(()=>play()).catch(e=>{S.exporting=false;$('#overlay').hidden=true;alert('MP4 編碼失敗：'+e.message)})}
async function startWebCodecs(vt,at){const sr=actx.sampleRate;
  const vcfg={codec:'avc1.640028',width:W,height:H,bitrate:6e6,framerate:30};
  if(!(await VideoEncoder.isConfigSupported(vcfg)).supported)vcfg.codec='avc1.42E01F';
  const acfg={codec:'mp4a.40.2',sampleRate:sr,numberOfChannels:2,bitrate:160000};
  let hasAAC=false,acodec='aac';if(typeof AudioEncoder!=='undefined'){if((await AudioEncoder.isConfigSupported(acfg)).supported)hasAAC=true;else{acfg.codec='opus';acodec='opus';hasAAC=(await AudioEncoder.isConfigSupported(acfg)).supported}}
  const muxer=new Mp4Muxer.Muxer({target:new Mp4Muxer.ArrayBufferTarget(),video:{codec:'avc',width:W,height:H},
    audio:hasAAC?{codec:acodec,sampleRate:sr,numberOfChannels:2}:undefined,fastStart:'in-memory',firstTimestampBehavior:'offset'});
  const ve=new VideoEncoder({output:(c,m)=>muxer.addVideoChunk(c,m),error:e=>console.error(e)});ve.configure(vcfg);
  let ae=null;if(hasAAC){ae=new AudioEncoder({output:(c,m)=>muxer.addAudioChunk(c,m),error:e=>console.error(e)});ae.configure(acfg)}
  const ctl=wc={stop:false,muxer,ve,ae};let n=0;S.exportPath+=' (h264+'+(hasAAC?acodec:'無音訊')+')';
  const pump=async(track,fn)=>{const r=new MediaStreamTrackProcessor({track}).readable.getReader();while(true){const{value,done}=await r.read();if(done)break;if(ctl.stop){value.close();track.stop();break}fn(value)}};
  wc.vp=pump(vt,f=>{if(ve.encodeQueueSize<30)ve.encode(f,{keyFrame:n++%60===0});f.close()});
  wc.ap=ae?pump(at.clone(),d=>{ae.encode(d);d.close()}):Promise.resolve();}
async function finishWebCodecs(){const w=wc;wc=null;w.stop=true;await new Promise(r=>setTimeout(r,300));
  try{await w.ve.flush();if(w.ae)await w.ae.flush();w.muxer.finalize();$('#overlay').hidden=true;S.exporting=false;
    if(!cancelled)download(new Blob([w.muxer.target.buffer],{type:'video/mp4'}),'mp4')}catch(e){$('#overlay').hidden=true;S.exporting=false;alert('MP4 封裝失敗：'+e.message)}}
function finishExport(){if(wc)return finishWebCodecs();if(rec&&rec.state!=='inactive')setTimeout(()=>rec.stop(),200)}
$('#exportBtn').onclick=()=>startExport('webm');$('#exportMp4Btn').onclick=()=>startExport('mp4');
$('#cancelExport').onclick=()=>{cancelled=true;pause()};
setInterval(()=>{if(S.exporting)$('#prog').value=total()?S.t/total():0},200);

// ---------- keyboard ----------
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName)||S.exporting)return;
  if(e.code==='Space'){e.preventDefault();S.playing?pause():play()}
  else if(e.key==='s'||e.key==='S'){split()}
  else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();del()}
  else if(e.key==='ArrowLeft')seek(S.t-0.1);else if(e.key==='ArrowRight')seek(S.t+0.1)});
['fadeIn','fadeOut'].forEach(id=>$('#'+id).oninput=drawFrame);
window.__S=S;window.__api={importFiles,addClip,split,del,seek,play,pause,total,setMusic};
renderAll();
if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
window.__api.setAspect=setAspect;
