const tabs = document.querySelectorAll(".tab");
const scheduleRows = document.querySelectorAll(".schedule-row");
const searchInput = document.querySelector("#searchInput");
const markupToggle = document.querySelector("#markupToggle");
const markupButton = document.querySelector("#markupButton");
const note = document.querySelector(".floating-note");
const noteClose = note?.querySelector("button");
const stripClose = document.querySelector(".strip-close");
const launchStrip = document.querySelector(".launch-strip");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
  });
});

searchInput?.addEventListener("input", (event) => {
  const value = event.target.value.trim().toLowerCase();

  scheduleRows.forEach((row) => {
    const haystack = `${row.textContent} ${row.dataset.search}`.toLowerCase();
    row.classList.toggle("is-hidden", value.length > 0 && !haystack.includes(value));
  });
});

markupToggle?.addEventListener("change", () => {
  markupButton.textContent = markupToggle.checked ? "Handoff note enabled" : "Add handoff note";
});

noteClose?.addEventListener("click", () => {
  note.classList.add("is-hidden");
});

stripClose?.addEventListener("click", () => {
  launchStrip.classList.add("is-hidden");
});
