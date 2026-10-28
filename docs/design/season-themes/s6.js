// Offline review gallery. Controls only switch captured images and local styling.
const form = document.querySelector("form");
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("change", () => {
  const data = new FormData(form);
  const image = document.querySelector("#preview");
  const size = data.get("size");
  image.src = `s6/${data.get("version")}${data.get("surface")}${size}-${data.get("theme")}.webp`;
  image.width = size === "desktop" ? 1440 : 390;
  image.height = size === "desktop" ? 1000 : 844;
  const label = [...form.querySelectorAll("select")]
    .map((select) => select.selectedOptions[0].textContent)
    .join(" · ");
  document.documentElement.dataset.previewTheme = data.get("theme");
  image.alt = label;
  document.querySelector("#caption").textContent = label;
});
