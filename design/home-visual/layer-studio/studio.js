'use strict';
const CENTER = document.body.dataset.variant === 'centered';
const MODE = CENTER ? 'centered' : 'homepage';
const KEY = CENTER ? 'oclr-centered-banner-studio-color-v1' : 'oclr-banner-layer-studio-v1';
const names = CENTER ? {city:'星空背景',logo:'OCLR 主标',season:'S11 赛季标',katu:'喝 · 独立元素'} : {city:'封面背景', foreground:'石阶前景', liru:'人物素材', logo:'OCLR 主标',season:'S11 赛季标',katu:'喝 · 独立元素'};
const specs = [
  ['x','水平位置',-100,150,.1,'%'], ['y','垂直位置',-100,150,.1,'%'],
  ['width','图层宽度',1,200,.1,'%'], ['rotate','平面旋转',-45,45,.1,'°'],
  ['rx','上下透视',-60,60,.1,'°'], ['ry','左右透视',-60,60,.1,'°'],
  ['skew','水平斜切',-35,35,.1,'°'], ['opacity','不透明度',0,100,1,'%']
];
const layer = (x,y,width) => ({x,y,width,rotate:0,rx:0,ry:0,skew:0,opacity:100,visible:true});
const initial = CENTER ? {version:1,layout:MODE,perspective:1200,shade:0,reach:78,layers:{city:layer(0,0,100),logo:layer(15.4,25,53),season:layer(70.4,54.75,13)}} : {version:1,layout:MODE,perspective:1200,shade:72,reach:78,layers:{city:layer(0,0,100),foreground:layer(0,9,100),liru:layer(66,4,31),logo:layer(6,24,52),season:layer(6,24,52)}};
const assetOptions = {
  city: CENTER ? {winterhd:['猎户座 · NASA 高清','nasa-orion-6000.jpg'],winter:['冬季星空 · NASA APOD','nasa-orion-snow.jpg'],nebula:['纯紫色星云','nebula-only.png']} : {winterhd:['猎户座 · NASA 高清','nasa-orion-6000.jpg'],winter:['冬季星空 · NASA APOD','nasa-orion-snow.jpg'],osu:['osu! 柔和背景','osu-original.jpg'],original:['osu! 原背景','osu-original.jpg'],beijing:['北京紫色城市','city-beijing-v2.png'],nebula:['纯紫色星云','nebula-only.png']},
  liru:{gandalf:['甘道夫与长杖','gandalf-happy-v2.png'],liru:['Liru · 修正版 PNG','liru-refined-v2.png'],liruSmooth:['Liru · 平滑 SVG 备份','liru-smooth-final.svg'],liruPng:['Liru · 修正版 PNG','liru-refined-v2.png'],liruVector:['Liru · 旧矢量对照','liru-refined-v2.svg'],liruOriginal:['Liru · 旧版','liru.png']}
};
const assetBase=CENTER?'../assets/':'assets/';
function separatedKatu(logo){
  const denominator=CENTER?1000:1200;
  return {...logo,x:logo.x+logo.width*930/denominator,y:logo.y+logo.width*(CENTER?10:70)/denominator*2,width:logo.width*100/denominator};
}
initial.layers.katu=separatedKatu(initial.layers.logo);
initial.choices={city:CENTER?'winterhd':'nebula',liru:'liru'};
if(!CENTER){
  initial.shade=100;initial.reach=100;
  initial.layers={city:layer(-0.701879,-1.89539,102.632),foreground:layer(-29.1,89.2,94.4),liru:{...layer(63,28,53.97609),ry:12},logo:layer(4.3788,14.4727,46.4545),season:layer(-32.0428,-7.97239,90.5268),katu:layer(41.4881,22.0044,4.68417)};
}
let state = structuredClone(initial), selected=CENTER?'logo':'liru', comparison=false, pure=false;
const $=id=>document.getElementById(id);
const status=text=>{$('saveStatus').textContent=text;};
function clamp(value,min,max){return Math.min(max,Math.max(min,value));}
function validate(raw){
  if(!raw || raw.version!==1 || !raw.layers) throw Error('不是此工作台的参数文件');
  if(raw.layout && raw.layout!==MODE)throw Error('请选择对应 Banner 页的参数文件');
  const rawLayers={...raw.layers};
  // Full-size transparent split SVGs keep every previous combined-logo transform intact.
  if(!CENTER && !rawLayers.season && rawLayers.logo)rawLayers.season=rawLayers.logo;
  if(!rawLayers.katu && rawLayers.logo)rawLayers.katu=separatedKatu(rawLayers.logo);
  const clean=structuredClone(initial);
  for(const name of CENTER?['city']:['city','liru']){
    const choice=raw.choices?.[name] ?? (name==='liru'?'liru':initial.choices[name]);
    if(!assetOptions[name][choice])throw Error('未知素材');
    clean.choices[name]=choice;
  }
  for(const [k,min,max] of [['perspective',400,2400],['shade',0,100],['reach',20,100]]){
    if(typeof raw[k]!=='number' || !Number.isFinite(raw[k])) throw Error('全局参数无效');
    clean[k]=clamp(raw[k],min,max);
  }
  for(const name of Object.keys(names)){
    if(!rawLayers[name]) throw Error('缺少图层参数');
    for(const [key,,min,max] of specs){
      const value=rawLayers[name][key];
      if(typeof value!=='number' || !Number.isFinite(value)) throw Error('图层参数无效');
      clean.layers[name][key]=clamp(value,min,max);
    }
    if(typeof rawLayers[name].visible!=='boolean') throw Error('图层显示参数无效');
    clean.layers[name].visible=rawLayers[name].visible;
  }
  return clean;
}
try{const saved=localStorage.getItem(KEY);if(saved) state=validate(JSON.parse(saved));}catch{status('未读取到有效保存数据，已使用初始构图');}
if(!CENTER && !localStorage.getItem(KEY+'-color-aligned') && localStorage.getItem(KEY)){
  const logo=state.layers.logo,season=state.layers.season;
  season.y=logo.y+logo.width*474/1200*2-season.width*392/1200*2;
  localStorage.setItem(KEY+'-color-aligned','1');
  localStorage.setItem(KEY,JSON.stringify(state));
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));status('已保存 · 仅保存在此浏览器');}catch{status('浏览器无法保存，请导出参数备份');}}
function apply(){
  for(const name of CENTER?['city']:['city','liru']){
    const el=document.querySelector(`[data-layer="${name}"]`);
    const source=assetBase+assetOptions[name][state.choices[name]][1];
    if(el.getAttribute('src')!==source)el.setAttribute('src',source);
    el.alt=assetOptions[name][state.choices[name]][0];
    if(name==='city'){el.style.height=['winter','winterhd'].includes(state.choices.city)?'100%':'';el.style.objectFit=['winter','winterhd'].includes(state.choices.city)?'cover':'';el.style.objectPosition='50% 0%';}
    if(name==='city')el.style.filter=state.choices.city==='winterhd'?'url(#nebula-clear-grade)':state.choices.city==='winter'?'grayscale(.85) sepia(.65) hue-rotate(225deg) saturate(1.65) brightness(.85)':state.choices.city==='osu'?'saturate(.75) hue-rotate(12deg)':state.choices.city==='nebula'?(CENTER?'saturate(.78) brightness(1.5)':'saturate(.78) brightness(1.8)'):'none';
    const picker=$(name==='city'?'backgroundAsset':'characterAsset');
    picker.value=state.choices[name];
  }
  if(!CENTER)$('original').src=assetBase+(state.choices.city==='beijing'?'city-reference.png':'osu-original.jpg');
  document.querySelectorAll('[data-layer]').forEach(el=>{
    const p=state.layers[el.dataset.layer];
    Object.assign(el.style,{left:`${p.x}%`,top:`${p.y}%`,width:`${p.width}%`,opacity:p.opacity/100,visibility:p.visible?'visible':'hidden',transform:`perspective(${state.perspective}px) rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotate(${p.rotate}deg) skewX(${p.skew}deg)`});
  });
  $('nebulaQuiet').hidden=state.choices.city!=='winterhd';
  $('gradient').style.background=`linear-gradient(90deg, rgba(12,10,27,${state.shade/100}) 0%,rgba(12,10,27,${state.shade/100*.6}) ${state.reach*.43}%,transparent ${state.reach}%)`;
  for(const key of ['perspective','shade','reach']){$(key).value=state[key];$(key+'Value').value=state[key]+(key==='perspective'?' px':'%');}
  $('visible').checked=state.layers[selected].visible;
  $('zoomLayerName').textContent=names[selected];
  $('layerSize').value=Number(state.layers[selected].width.toFixed(1))+'%';
  $('canvasNote').textContent=comparison?'构图参考':`正在调整 · ${names[selected]}`;
  for(const [key,,,,,unit] of specs){
    const v=state.layers[selected][key];
    const range=$('range-'+key),number=$('number-'+key);
    if(range) range.value=v;
    if(number && document.activeElement!==number) number.value=Number(v.toFixed(1));
    const output=$('value-'+key);if(output) output.value=`${Number(v.toFixed(1))}${unit}`;
  }
}
function select(name){
  selected=name;$('selectedName').textContent=names[name];
  document.querySelectorAll('[data-select]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.select===name)));
  $('controls').replaceChildren();
  for(const [key,label,min,max,step] of specs){
    const row=document.createElement('div');row.className='control';
    const labelEl=document.createElement('label');labelEl.htmlFor='range-'+key;labelEl.textContent=label;
    const output=document.createElement('output');output.id='value-'+key;labelEl.append(output);
    const pair=document.createElement('div');pair.className='numeric';
    for(const type of ['range','number']){
      const input=document.createElement('input');input.type=type;input.id=(type==='range'?'range-':'number-')+key;
      input.min=min;input.max=max;input.step=step;input.value=state.layers[selected][key];input.setAttribute('aria-label',label+(type==='number'?' 数值':''));
      input.addEventListener('input',()=>{const v=input.valueAsNumber;if(!Number.isFinite(v)) return;state.layers[selected][key]=clamp(v,min,max);apply();save();});
      input.addEventListener('change',()=>{input.value=state.layers[selected][key];});pair.append(input);
    }
    row.append(labelEl,pair);$('controls').append(row);
  }
  apply();
}
document.querySelectorAll('[data-select]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.select)));
$('visible').addEventListener('change',e=>{state.layers[selected].visible=e.target.checked;apply();save();});
for(const key of ['perspective','shade','reach']) $(key).addEventListener('input',e=>{state[key]=Number(e.target.value);apply();save();});
$('guides').addEventListener('change',e=>{$('guideLines').hidden=!e.target.checked;});
$('compare').addEventListener('click',()=>{comparison=!comparison;$('original').hidden=!comparison;$('compare').setAttribute('aria-pressed',String(comparison));apply();});
$('desktop').addEventListener('click',()=>setView(false));$('mobile').addEventListener('click',()=>setView(true));
function setView(mobile){$('frame').classList.toggle('mobile',mobile);$('desktop').setAttribute('aria-pressed',String(!mobile));$('mobile').setAttribute('aria-pressed',String(mobile));}
$('preview').addEventListener('click',()=>{pure=!pure;document.body.classList.toggle('preview-only',pure);$('preview').textContent=pure?'返回调整 ↙':'纯预览 ↗';});
$('resetLayer').addEventListener('click',()=>{state.layers[selected]=structuredClone(initial.layers[selected]);select(selected);save();});
$('resetAll').addEventListener('click',()=>{state=structuredClone(initial);select(selected);save();});
$('export').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({...state,assets:Object.fromEntries([...document.querySelectorAll('[data-layer]')].map(el=>[el.dataset.layer,el.dataset.source||el.getAttribute('src')]))},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`oclr-${MODE}-composition.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('参数已导出');
});
$('import').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{if(file.size>100000)throw Error('参数文件过大');state=validate(JSON.parse(await file.text()));select(selected);save();status('参数已导入并保存');}catch(error){status('导入失败：'+error.message);}e.target.value='';
});
let drag=null;
$('stage').addEventListener('pointerdown',e=>{
  if(pure||comparison||e.button!==0)return;
  const hit=e.target.closest('.vector-layer');if(hit)select(hit.dataset.layer);
  if(!state.layers[selected].visible)return;
  const box=$('stage').getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:state.layers[selected].x,startY:state.layers[selected].y,w:box.width,h:box.height};
  $('stage').setPointerCapture(e.pointerId);$('stage').focus({preventScroll:true});
});
$('stage').addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;state.layers[selected].x=clamp(drag.startX+(e.clientX-drag.x)/drag.w*100,-100,150);state.layers[selected].y=clamp(drag.startY+(e.clientY-drag.y)/drag.h*100,-100,150);apply();});
function endDrag(){if(drag){drag=null;save();}}
$('stage').addEventListener('pointerup',endDrag);$('stage').addEventListener('pointercancel',endDrag);$('stage').addEventListener('lostpointercapture',endDrag);
$('stage').addEventListener('keydown',e=>{
  if(pure||comparison||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();const p=state.layers[selected],step=e.shiftKey?2:.2;
  if(e.key==='ArrowLeft')p.x=clamp(p.x-step,-100,150);if(e.key==='ArrowRight')p.x=clamp(p.x+step,-100,150);
  if(e.key==='ArrowUp')p.y=clamp(p.y-step,-100,150);if(e.key==='ArrowDown')p.y=clamp(p.y+step,-100,150);apply();save();
});
for(const name of CENTER?['city']:['city','liru']){
  const picker=$(name==='city'?'backgroundAsset':'characterAsset');
  for(const [value,[label]] of Object.entries(assetOptions[name])){
    const option=document.createElement('option');option.value=value;option.textContent=label;picker.append(option);
  }
  picker.addEventListener('change',()=>{state.choices[name]=picker.value;select(name);save();});
}
$('fitAsset').addEventListener('click',()=>{
  const target=selected==='city' && state.choices.city==='winter' ? layer(-25,0,150) : selected==='liru' ? (state.choices.liru==='gandalf'?layer(52,12,48):layer(66,4,31)) : initial.layers[selected];
  for(const key of ['x','y','width'])state.layers[selected][key]=target[key];
  apply();save();
});
select(selected);

// Layer scaling is separate from viewport magnification; neither changes perspective.
function resizeLayer(factor){
  const p=state.layers[selected];
  const next=clamp(p.width*factor,1,200);
  const image=document.querySelector(`[data-layer="${selected}"]`);
  const aspect=image.viewBox ? image.viewBox.baseVal.width/image.viewBox.baseVal.height : image.naturalWidth/image.naturalHeight || 2;
  // Keep the visual center stationary while scaling the source rectangle.
  const centerX=!CENTER && selected==='season'? .907 : .5;
  const centerY=!CENTER && selected==='season'? .696 : .5;
  p.x=clamp(p.x+(p.width-next)*centerX,-100,150);
  p.y=clamp(p.y+2*(p.width-next)/aspect*centerY,-100,150);
  p.width=next;apply();save();
}
$('layerSmaller').addEventListener('click',()=>resizeLayer(1/1.1));
$('layerLarger').addEventListener('click',()=>resizeLayer(1.1));
let canvasZoom=100;
function zoomCanvas(value){
  canvasZoom=clamp(value,50,200);
  $('frame').style.width=canvasZoom+'%';
  $('frame').style.maxWidth=canvasZoom>100?'none':'';
  $('frame').style.minWidth=canvasZoom>100?canvasZoom+'%':'';
  $('canvasZoomValue').value=canvasZoom+'%';
  $('canvasSmaller').disabled=canvasZoom===50;$('canvasLarger').disabled=canvasZoom===200;
}
$('canvasSmaller').addEventListener('click',()=>zoomCanvas(canvasZoom-25));
$('canvasLarger').addEventListener('click',()=>zoomCanvas(canvasZoom+25));
$('canvasFit').addEventListener('click',()=>zoomCanvas(100));
