(() => {
  "use strict";

  const buttons = Array.from(document.querySelectorAll(".tab-button"));
  const panels = Array.from(document.querySelectorAll("[data-view-panel]"));
  const landing = document.getElementById("landingScreen");
  const experience = document.getElementById("experienceShell");
  const enterButton = document.getElementById("enterExperience");
  const homeButton = document.getElementById("homeButton");

  function activate(name, updateHash = true) {
    const exists = panels.some(panel => panel.dataset.viewPanel === name);
    if (!exists) name = "listen";

    buttons.forEach(button => {
      const active = button.dataset.view === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    panels.forEach(panel => {
      panel.classList.toggle("active", panel.dataset.viewPanel === name);
    });

    document.body.dataset.currentView = name;

    if (updateHash) {
      history.replaceState(null, "", `#${name}`);
    }

    window.dispatchEvent(new CustomEvent("echo-proof:viewchange", { detail: { view: name } }));
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function showExperience(name = "listen", updateHash = true) {
    if (landing) landing.hidden = true;
    if (experience) experience.hidden = false;
    activate(name, updateHash);
  }

  function showLanding(updateHash = true) {
    if (!landing || !experience) return false;
    landing.hidden = false;
    experience.hidden = true;
    document.body.dataset.currentView = "landing";

    if (updateHash) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
    }

    window.dispatchEvent(new CustomEvent("echo-proof:viewchange", { detail: { view: "landing" } }));
    window.scrollTo({ top: 0, behavior: "instant" });
    return true;
  }

  buttons.forEach(button => {
    button.addEventListener("click", () => showExperience(button.dataset.view));
  });

  if (enterButton) {
    enterButton.addEventListener("click", () => showExperience("listen", true));
  }

  if (homeButton) {
    homeButton.addEventListener("click", () => showLanding(true));
  }

  const initial = location.hash.replace("#", "");
  if (initial) {
    showExperience(initial, false);
  } else if (!showLanding(false)) {
    activate("listen", false);
  }

  window.addEventListener("hashchange", () => {
    const name = location.hash.replace("#", "");
    if (name) showExperience(name, false);
    else if (!showLanding(false)) activate("listen", false);
  });
})();
