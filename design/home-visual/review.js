const schemes = {
  a: {name: '斜轴构成', tag: '01 / DIAGONAL CONSTRUCT', note: '最接近参考图。夕景保留在右侧，斜轴、圆环与三色字块形成主视觉；用整块明暗建立层次。'},
  b: {name: '留白海报', tag: '02 / OPEN EDITORIAL', note: '奶白底与平直字标，远山变成两层剪影。人物、字标和入口各自留白，整体最轻盈。'},
  c: {name: '夜景视窗', tag: '03 / NIGHT APERTURE', note: '城市只出现在一个景窗里。人物跨出画框，轮廓字与实心字交替，保留夜景气氛和清晰焦点。'},
  d: {name: '节奏网格', tag: '04 / RHYTHM GRID', note: '字形采用几何模块，背景回归浅紫色块。六个节拍节点呼应音游与 LR 娘手链，少量红蓝点缀。'},
};
const gallery = document.querySelector('#gallery');
let view = 'all';
let format = 'desktop';
let renderVersion = 0;
const cache = new Map();
async function getArt(key) {
  const file = `art-${key}${format === 'mobile' ? '-mobile' : ''}.svg`;
  if (!cache.has(file)) cache.set(file, fetch(file).then(response => {
    if (!response.ok) throw new Error(`无法读取 ${file}`);
    return response.text();
  }));
  return cache.get(file);
}
function applyLayers() {
  for (const input of document.querySelectorAll('[data-layer]')) {
    for (const frame of document.querySelectorAll('.frame')) frame.classList.toggle(`hide-${input.dataset.layer}`, !input.checked);
  }
}
async function render() {
  const version = ++renderVersion;
  const keys = view === 'all' ? Object.keys(schemes) : [view];
  const sources = await Promise.all(keys.map(getArt));
  if (version !== renderVersion) return;
  gallery.className = `gallery${view === 'all' ? '' : ' single'}${format === 'mobile' ? ' mobile' : ''}`;
  gallery.replaceChildren();
  keys.forEach((key, i) => {
    const scheme = schemes[key];
    const card = document.createElement('article');
    card.className = 'card';
    const frame = document.createElement('div');
    frame.className = 'frame';
    // SVGs are local authored files. Prefix all IDs because several scenes share one document.
    const doc = new DOMParser().parseFromString(sources[i], 'image/svg+xml');
    const svg = doc.documentElement;
    for (const node of svg.querySelectorAll('[id]')) {
      const id = node.id;
      if (id.startsWith('layer-')) {
        node.setAttribute('data-art-layer', id.slice(6));
        node.removeAttribute('id');
      } else node.id = `${key}-${id}`;
    }
    for (const node of svg.querySelectorAll('*')) for (const attr of [...node.attributes]) {
      let value = attr.value.replace(/url\(#([^)]*)\)/g, (_, id) => `url(#${key}-${id})`);
      if (attr.name === 'href' && value.startsWith('#')) value = `#${key}-${value.slice(1)}`;
      if (attr.name === 'aria-labelledby') value = value.split(' ').map(id => `${key}-${id}`).join(' ');
      node.setAttribute(attr.name, value);
    }
    if (svg.hasAttribute('aria-labelledby')) svg.setAttribute('aria-labelledby', `${key}-scene-title`);
    frame.append(document.importNode(svg, true));
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    meta.innerHTML = `<div><span class="badge">${scheme.tag}</span><h2>${key.toUpperCase()} · ${scheme.name}</h2><p>${scheme.note}</p></div><div class="assets"><a href="assets/wordmark-${key}.svg" download>字标 SVG ↗</a><a href="previews/${key}${format === 'mobile' ? '-mobile' : ''}.png" download>大图 PNG ↗</a></div>`;
    card.append(frame, meta);
    gallery.append(card);
  });
  applyLayers();
}
function handleError(error) { gallery.textContent = error.message; gallery.className = 'error'; }
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => {
  view = button.dataset.view;
  for (const item of document.querySelectorAll('[data-view]')) item.setAttribute('aria-pressed', String(item === button));
  render().catch(handleError);
});
document.querySelector('#format').addEventListener('change', event => {format = event.target.value; render().catch(handleError);});
for (const input of document.querySelectorAll('[data-layer]')) input.addEventListener('change', applyLayers);
render().catch(handleError);
