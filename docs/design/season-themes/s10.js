// S10 review artifact only. No application imports, network writes or persistence.
const sample = JSON.parse(document.querySelector("#sample-data").textContent);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const matchRows = sample.matches
  .map(
    (match) => `
    <article class="match-row" aria-label="Match ${escape(match.label)}">
      <div class="match-time">${escape(match.date)}<strong>${escape(match.time)}</strong>UTC+8</div>
      <div class="teams">${match.teams.map((name, i) => `<div class="team-row ${match.score[i] > match.score[1 - i] ? "winner" : ""}"><span>${escape(name)}</span><strong class="score">${match.score[i]}</strong></div>`).join("")}</div>
      <a class="match-link" href="${escape(match.url)}" target="_blank" rel="noreferrer" aria-label="View match ${escape(match.label)} on osu!">MP ↗</a>
    </article>`,
  )
  .join("");
const mapRows = sample.maps
  .map(
    (map) => `
    <div class="map-row">
      <span class="slot">${escape(map.slot)}</span>
      <div><a class="map-title" href="https://osu.ppy.sh/beatmaps/${map.beatmapId}" target="_blank" rel="noreferrer">${escape(map.title)}</a><div class="mapper">${escape(map.mapper)}</div></div>
      <span class="stars">${Number(map.stars).toFixed(2)} ★</span>
    </div>`,
  )
  .join("");
const tabs = [
  ["overview", "Overview"],
  ["schedule", "Schedule"],
  ["mappools", "Mappools"],
  ["settings", "Admin sample"],
];

document.querySelector("#sample-root").innerHTML = `
  <a class="skip button primary" href="#content">Skip to content</a>
  <div class="review-bar"><div class="wrap"><span>DESIGN SAMPLE · Offline archive excerpt</span><nav class="season-links" aria-label="Design samples">${["s10", "s9", "s8", "s7"].map((s) => `<a href="${s}.html" ${s === sample.season ? 'aria-current="page"' : ""}>${s.toUpperCase()}</a>`).join("")}</nav></div></div>
  <header class="site-header"><div class="wrap header-inner">
    <a class="brand" href="s10.html" aria-label="osu! Chinese League Rookie — S10 design sample"><img class="logo-light" src="../../../public/branding/oclr-wordmark-light.svg" width="132" height="39" alt="OCLR"><img class="logo-dark" src="../../../public/branding/oclr-wordmark-dark.svg" width="132" height="39" alt="OCLR"><span class="brand-caption">osu! Chinese League Rookie</span></a>
    <div class="mode-switch" role="group" aria-label="Theme"><button type="button" data-mode="light" aria-pressed="true">Light</button><button type="button" data-mode="dark" aria-pressed="false">Dark</button></div>
  </div></header>
  <main id="content">
    <div class="event-context"><div class="wrap event-context-inner"><div class="event-identity"><span>Historical seasons</span><span aria-hidden="true">/</span><strong>OCLR S10</strong></div><div class="page-tabs" role="tablist" aria-label="Sample surfaces">${tabs.map(([key, label], i) => `<button id="tab-${key}" role="tab" aria-selected="${i === 0}" aria-controls="panel-${key}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join("")}</div></div></div>
    <section class="hero" aria-labelledby="season-title"><div class="wrap hero-inner">
      <div class="hero-copy"><div class="eyebrow">${escape(sample.period)} / Season archive</div><h1 id="season-title">OCLR<span>Season 10</span></h1><p class="hero-description">osu! Chinese League Rookie</p><p class="hero-meta">Historical matches. Original mappools.<br>A season to revisit.</p><div class="hero-actions"><button class="primary" type="button" data-open="schedule">View matches <span aria-hidden="true">↗</span></button><button class="text-action" type="button" data-open="mappools">Explore mappools →</button></div><div class="hero-facts"><span><strong>${sample.teams}</strong> teams</span><span><strong>${sample.pools}</strong> mappools</span><span class="status">Completed</span></div></div>
      <figure class="artwork"><img src="../../../public/archive/${sample.art}" width="${sample.width}" height="${sample.height}" alt="OCLR Season 10 original artwork"><figcaption>Original S10 artwork · Full composition</figcaption></figure>
    </div></section>
    <div class="wrap page-body" id="competition">
      <div class="workspace-title" hidden><div class="eyebrow">OCLR Season 10</div><h1 id="workspace-title"></h1></div>
      <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" tabindex="0">
        <div class="content-grid"><div><section class="results-section"><div class="section-heading"><div><div class="eyebrow">01 / Competition</div><h2>Match results</h2></div><span class="status">${escape(sample.matches[0].stage)}</span></div><div class="data-sheet">${matchRows}</div></section><section class="pool-section"><div class="section-heading"><div><div class="eyebrow">02 / Beatmaps</div><h2>Mappools</h2></div><a href="#panel-mappools" data-open="mappools">View mappool →</a></div><div class="data-sheet">${mapRows}</div></section></div>
        <aside class="season-detail"><div class="eyebrow">The archive</div><h2>Season 10</h2><dl><div><dt>Year</dt><dd>${escape(sample.period)}</dd></div><div><dt>Teams</dt><dd>${sample.teams}</dd></div><div><dt>Mappools</dt><dd>${sample.pools}</dd></div><div><dt>Time zone</dt><dd>UTC+8</dd></div></dl><p class="source-note">Offline archive excerpt. Team names, scores and beatmap metadata retain their original wording.</p><a class="archive-source" href="s10/DESIGN.md">Design &amp; source notes ↗</a></aside></div>
      </div>
      <div id="panel-schedule" role="tabpanel" aria-labelledby="tab-schedule" tabindex="0" hidden><div class="section-heading"><h2>Match results</h2><span class="status">Completed</span></div><div class="data-sheet">${matchRows}</div><p class="source-note">Excerpt from s10-archive.json · Original UTC+8 schedule · Two recorded matches</p></div>
      <div id="panel-mappools" role="tabpanel" aria-labelledby="tab-mappools" tabindex="0" hidden><div class="section-heading"><h2>${escape(sample.poolName)}</h2><span class="muted">3-map excerpt</span></div><div class="data-sheet">${mapRows}</div><p class="source-note">Original beatmap titles and historical star ratings. No live API lookup.</p></div>
      <div id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" tabindex="0" hidden><div class="admin-layout"><form class="settings-form"><div class="section-heading"><h2>Tournament settings</h2><span class="status">Preview only</span></div><p>Preview this appearance on the existing settings controls.</p><label class="field">Tournament name<input name="name" value="OCLR Season 10" required maxlength="120"></label><label class="field">Default appearance<select name="appearance"><option>Skyline Pop — sample</option><option>Use site default</option></select></label><div class="actions"><button class="primary" type="submit">Preview changes</button><button type="reset">Reset</button><button type="button" disabled>Unavailable</button><output aria-live="polite"></output></div></form><aside class="admin-note"><div class="eyebrow">Component specimen</div><h2>One shared system</h2><p>Solid surfaces, visible input edges and the same sky-blue action used on public pages.</p><p>This sample saves no settings. It grants no access to tournament administration.</p></aside></div><section class="state-specimens" aria-labelledby="states-title"><h2 id="states-title">State specimens</h2><p class="source-note">Visual examples, independent of tournament status.</p><div class="state-grid"><p class="state-success"><strong>Success</strong>Preview is ready.</p><p class="state-warning"><strong>Warning</strong>Review before applying.</p><p class="state-danger"><strong>Error</strong>Check the required field.</p></div></section></div>
      <p class="source-note review-disclosure">Design sample · Not a live tournament page · No settings are saved</p>
    </div>
    <section class="design-notes" aria-labelledby="design-title"><div class="wrap design-grid"><div><div class="eyebrow">S10 / Skyline Pop</div><h2 id="design-title">${escape(sample.chineseName)}</h2><p lang="zh-Hant">${escape(sample.thesis)}</p><div class="palette">${sample.swatches.map(([name, color]) => `<div><div class="swatch" style="background:${color}"></div><div class="swatch-label">${escape(name)}<br>${color.toUpperCase()}</div></div>`).join("")}</div><p class="source-note">Artwork palette · Semantic interface tokens change with Light / Dark.</p></div><div><div class="eyebrow">MainSheet / Type &amp; rhythm</div><div class="type-sample" lang="zh-Hant">清晰閱讀，保留賽季個性。<span>osu! Chinese League Rookie — Season 10</span></div><p lang="zh-Hant">${escape(sample.geometry)}</p><div class="specs"><span>Space 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64</span><span>Body 16px · 1.65</span><span>Touch ≥ 44px</span></div></div></div></section>
  </main><footer><div class="wrap"><span>osu! Chinese League Rookie (OCLR)</span><span>Skyline Pop · Revised 2026-10-26 · Awaiting design review</span></div></footer>`;

function setMode(mode) {
  document.documentElement.dataset.theme = mode;
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
}
document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});
setMode(
  new URLSearchParams(location.search).get("theme") === "dark"
    ? "dark"
    : "light",
);

const tabButtons = [...document.querySelectorAll('[role="tab"]')];
function openTab(name, focus = false) {
  tabButtons.forEach((tab) => {
    const selected = tab.id === `tab-${name}`;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden =
      !selected;
    if (selected && focus) tab.focus({ preventScroll: true });
  });
  document.querySelector(".hero").hidden = name !== "overview";
  document.querySelector(".workspace-title").hidden = name === "overview";
  document.querySelector("#workspace-title").textContent = tabs.find(
    ([key]) => key === name,
  )[1];
}
tabButtons.forEach((tab, i) => {
  tab.addEventListener("click", () => openTab(tab.id.slice(4)));
  tab.addEventListener("keydown", (event) => {
    const index =
      event.key === "ArrowRight"
        ? (i + 1) % tabButtons.length
        : event.key === "ArrowLeft"
          ? (i + tabButtons.length - 1) % tabButtons.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabButtons.length - 1
              : -1;
    if (index >= 0) {
      event.preventDefault();
      openTab(tabButtons[index].id.slice(4), true);
    }
  });
});
document.querySelectorAll("[data-open]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openTab(link.dataset.open, true);
    document.querySelector(".event-context").scrollIntoView({ block: "start" });
  });
});
const form = document.querySelector("form");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  form.querySelector("output").textContent = "樣式預覽完成；沒有儲存任何設定。";
});
form.addEventListener("reset", () => {
  form.querySelector("output").textContent = "";
});
