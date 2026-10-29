// Standalone design specimen. No network writes or persisted preferences.
const root = document.documentElement;
function setMode(mode) {
  root.dataset.theme = mode;
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === mode)));
}
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
setMode(new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light');
const tabs = [...document.querySelectorAll('[role="tab"]')];
function openTab(name, focus = false) {
  tabs.forEach(tab => {
    const active = tab.id === `tab-${name}`;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
    if (active && focus) tab.focus();
  });
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => openTab(tab.id.slice(4)));
  tab.addEventListener('keydown', event => {
    const next = {ArrowRight:(i+1)%tabs.length,ArrowLeft:(i+tabs.length-1)%tabs.length,Home:0,End:tabs.length-1}[event.key];
    if (next !== undefined) {event.preventDefault();openTab(tabs[next].id.slice(4), true);}
  });
});
document.querySelector('[data-open]').addEventListener('click', event => openTab(event.currentTarget.dataset.open, true));
const form = document.querySelector('form');
const nameInput = form.elements.namedItem('name');
const error = document.getElementById('name-error');
form.addEventListener('submit', event => {
  event.preventDefault();
  const invalid = !nameInput.value.trim();
  nameInput.setAttribute('aria-invalid', String(invalid));
  error.hidden = !invalid;
  form.querySelector('output').textContent = invalid ? '' : '預覽完成；沒有儲存任何設定。';
  if (invalid) nameInput.focus();
});
form.addEventListener('reset', () => {
  nameInput.removeAttribute('aria-invalid');error.hidden = true;
  form.querySelector('output').textContent = '';
});
