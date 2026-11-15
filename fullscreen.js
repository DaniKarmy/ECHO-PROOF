(() => {
  "use strict";

  const buttons = Array.from(document.querySelectorAll("#fullscreenToggle, #landingFullscreenToggle"));
  if (!buttons.length) return;

  function updateButtons() {
    const active = Boolean(document.fullscreenElement);
    buttons.forEach(button => {
      button.textContent = active ? "Exit full screen" : "Full screen";
      button.setAttribute("aria-pressed", String(active));
    });
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.error("Fullscreen unavailable:", error);
      buttons.forEach(button => {
        button.textContent = "Full screen unavailable";
        button.disabled = true;
      });
    }
  }

  buttons.forEach(button => button.addEventListener("click", toggleFullscreen));
  document.addEventListener("fullscreenchange", updateButtons);
  updateButtons();
})();
