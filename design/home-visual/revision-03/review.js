const SVG_NS = 'http://www.w3.org/2000/svg';
const motionButton = document.querySelector('#motion');
let motionOn = false;
let svgReady = false;
const animations = [];
const markers = [];
function stopMotion() {
  motionOn = false;
  motionButton.setAttribute('aria-pressed', 'false');
  motionButton.textContent = '演示 C / R 滑条走向';
  for (const item of animations) item.endElement();
  for (const marker of markers) marker.setAttribute('visibility', 'hidden');
}
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => {
  stopMotion();
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b === button));
  for (const stage of document.querySelectorAll('.stage')) stage.classList.toggle('hidden', stage.id !== button.dataset.mode);
  motionButton.disabled = button.dataset.mode !== 'wordmark' || !svgReady;
});
motionButton.addEventListener('click', () => {
  if (motionOn) { stopMotion(); return; }
  motionOn = true;
  motionButton.setAttribute('aria-pressed', 'true');
  motionButton.textContent = '停止走向演示';
  for (const marker of markers) marker.setAttribute('visibility', 'visible');
  for (const item of animations) item.beginElement();
});
async function loadArt() {
  const response = await fetch('oclr-s11-rhythm.svg');
  if (!response.ok) throw new Error('SVG 加载失败');
  const doc = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true);
  for (const [id, duration, repeat] of [['c-slider-path', '6s', true], ['r-slider-path', '5s', false]]) {
    const marker = document.createElementNS(SVG_NS, 'g');
    marker.setAttribute('visibility', 'hidden');
    marker.setAttribute('aria-hidden', 'true');
    const halo = document.createElementNS(SVG_NS, 'circle');
    for (const [key, value] of Object.entries({r:'13',fill:'none',stroke:'#77deef','stroke-width':'2'})) halo.setAttribute(key,value);
    const circle = document.createElementNS(SVG_NS, 'circle');
    for (const [key, value] of Object.entries({r:'8',fill:'#eaffff',stroke:'#42b7d3','stroke-width':'2'})) circle.setAttribute(key,value);
    const animation = document.createElementNS(SVG_NS, 'animateMotion');
    animation.setAttribute('path', svg.querySelector(`#${id}`).getAttribute('d'));
    animation.setAttribute('dur', duration);
    animation.setAttribute('begin', 'indefinite');
    animation.setAttribute('repeatCount', 'indefinite');
    animation.setAttribute('calcMode', 'linear');
    if (repeat) {
      animation.setAttribute('keyPoints', '0;1;0');
      animation.setAttribute('keyTimes', '0;0.5;1');
    }
    marker.append(halo, circle, animation);
    svg.querySelector(`#${id}`).parentElement.append(marker);
    markers.push(marker);
    animations.push(animation);
  }
  document.querySelector('#wordmark').replaceChildren(svg);
  svgReady = true;
  motionButton.disabled = document.querySelector('[data-mode="wordmark"]').getAttribute('aria-pressed') !== 'true';
}
loadArt().catch(() => {
  // The static img remains available when interactive loading fails.
  document.querySelector('#motion-note').textContent += ' 当前显示静态图。';
});
