let menu;
let owner;

export function closeActionMenu(restoreFocus = false) {
  if (!menu) return;
  menu.hidden = true;
  owner?.setAttribute("aria-expanded", "false");
  if (restoreFocus && owner?.isConnected) owner.focus();
  owner = null;
}

export function openActionMenu(trigger, items) {
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "process-action-menu";
    menu.className = "zui-select-menu select-menu action-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;
    document.body.append(menu);
    document.addEventListener("pointerdown", (event) => {
      if (!menu.contains(event.target) && !owner?.contains(event.target))
        closeActionMenu();
    });
    document.addEventListener("zync-ui:close-menus", () => closeActionMenu());
    window.addEventListener("resize", () => closeActionMenu());
    document.addEventListener(
      "scroll",
      (event) => {
        if (!menu.contains(event.target)) closeActionMenu();
      },
      true,
    );
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeActionMenu(true);
      }
      if (event.key === "Tab") closeActionMenu(true);
      const buttons = [...menu.querySelectorAll("button:not(:disabled)")];
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const index = buttons.indexOf(document.activeElement);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }
    });
  }
  const wasOpen = owner === trigger && !menu.hidden;
  closeActionMenu();
  document.dispatchEvent(new Event("zync-ui:close-menus"));
  if (wasOpen) return;
  owner = trigger;
  trigger.setAttribute("aria-expanded", "true");
  menu.setAttribute("aria-label", trigger.getAttribute("aria-label"));
  menu.replaceChildren(
    ...items.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.tabIndex = -1;
      button.textContent = item.label;
      button.disabled = !!item.disabled;
      if (item.danger) button.className = "danger";
      button.addEventListener("click", () => {
        closeActionMenu(true);
        item.run();
      });
      return button;
    }),
  );
  menu.hidden = false;
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(180, innerWidth - 16);
  menu.style.width = `${width}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.right - width, innerWidth - width - 8))}px`;
  const below = innerHeight - rect.bottom - 8;
  const above = rect.top - 8;
  const down = below >= Math.min(menu.scrollHeight, 260) || below >= above;
  menu.style.maxHeight = `${Math.max(32, Math.min(260, down ? below : above))}px`;
  menu.style.top = down ? `${rect.bottom + 4}px` : "auto";
  menu.style.bottom = down ? "auto" : `${innerHeight - rect.top + 4}px`;
  menu.querySelector("button:not(:disabled)")?.focus();
}
