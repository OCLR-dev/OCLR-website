// Offline evidence gallery only. The images were captured from actual Next routes.
const form = document.querySelector("form");
form.addEventListener("submit", (event) => event.preventDefault());
form.addEventListener("change", () => {
  const data = new FormData(form);
  const size = data.get("size");
  const image = document.querySelector("#preview");
  image.src = `s8/${data.get("version")}${data.get("surface")}${size}-${data.get("theme")}.webp`;
  image.width = size === "desktop" ? 1440 : 390;
  image.height = size === "desktop" ? 1000 : 844;
  const label = [...form.querySelectorAll("select")]
    .map((select) => select.selectedOptions[0].textContent)
    .join(" · ");
  image.alt = label;
  document.querySelector("#caption").textContent = label;
});
