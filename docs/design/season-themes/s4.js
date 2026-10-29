// Offline review gallery. Controls only switch captured images and local styling.
const form = document.querySelector("#gallery-form");
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("change", () => {
  const data = new FormData(form);
  const image = document.querySelector("#preview");
  const size = data.get("size");
  image.src = `s4/${data.get("version")}${data.get("surface")}${size}-${data.get("theme")}.webp`;
  image.width = size === "desktop" ? 1440 : 390;
  image.height = size === "desktop" ? 1000 : 844;
  const label = [...form.querySelectorAll("select")]
    .map((select) => select.selectedOptions[0].textContent)
    .join(" · ");
  document.documentElement.dataset.previewTheme = data.get("theme");
  image.alt = label;
  document.querySelector("#caption").textContent = label;
});

const tabs = [...document.querySelectorAll('[role="tab"]')];
function activateTab(tab, focus = true) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute("aria-controls")).hidden =
      !selected;
  }
  if (focus) tab.focus();
}
for (const tab of tabs) {
  tab.addEventListener("click", () => activateTab(tab));
  tab.addEventListener("keydown", (event) => {
    const index = tabs.indexOf(tab);
    const target = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index + tabs.length - 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];
    if (target !== undefined) {
      event.preventDefault();
      activateTab(tabs[target]);
    }
  });
}
const components = document.querySelector("#component-form");
const input = document.querySelector("#sample-name");
const error = document.querySelector("#sample-error");
const result = document.querySelector("#sample-result");
components.addEventListener("submit", (event) => {
  event.preventDefault();
  const valid = input.value.trim().length >= 3;
  input.setAttribute("aria-invalid", String(!valid));
  error.hidden = valid;
  if (valid) result.textContent = `本機預覽：${input.value.trim()}`;
  else {
    result.textContent = "尚未預覽。";
    input.focus();
  }
});
components.addEventListener("reset", () => {
  input.removeAttribute("aria-invalid");
  error.hidden = true;
  result.textContent = "尚未預覽。";
});
