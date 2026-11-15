(() => {
  "use strict";

  const buttons = Array.from(document.querySelectorAll(".receipt-mode-button"));
  const panels = Array.from(document.querySelectorAll("[data-receipt-panel]"));
  if (!buttons.length || !panels.length) return;

  function activate(mode) {
    if (!panels.some(panel => panel.dataset.receiptPanel === mode)) mode = "primary";

    buttons.forEach(button => {
      const active = button.dataset.receiptMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    panels.forEach(panel => {
      const active = panel.dataset.receiptPanel === mode;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
  }

  buttons.forEach(button => {
    button.addEventListener("click", () => activate(button.dataset.receiptMode));
  });

  activate("primary");
})();
