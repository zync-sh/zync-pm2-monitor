export function installKeyboardNavigation({ closeDetails, openLogs }) {
  document.addEventListener("keydown", (event) => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const target = event.target;
    if (target.closest("[role='menu'], [role='listbox']")) return;
    const editing = target.closest(
      "input, textarea, select, [contenteditable='true']",
    );
    if (event.key === "/" && !editing) {
      event.preventDefault();
      document.getElementById("search").focus();
      return;
    }
    if (editing) return;
    const name = target.closest(".process-name");
    if (name && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      const names = [...document.querySelectorAll("#rows .process-name")];
      const index = names.indexOf(name);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? names.length - 1
            : Math.max(
                0,
                Math.min(
                  names.length - 1,
                  index + (event.key === "ArrowDown" ? 1 : -1),
                ),
              );
      event.preventDefault();
      names[next]?.focus();
    } else if (
      event.key === "Escape" &&
      !document.getElementById("details").hidden
    ) {
      event.preventDefault();
      closeDetails();
    } else if (event.key.toLowerCase() === "l" && name) {
      event.preventDefault();
      name.click();
      openLogs();
    }
    const tab = target.closest(".detail-tab");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const tabs = [...document.querySelectorAll(".detail-tab")];
      const index = tabs.indexOf(tab);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      event.preventDefault();
      tabs[next].click();
      tabs[next].focus();
    }
  });
}
