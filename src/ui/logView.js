export function renderLogSnapshot(text, query, target) {
  const scrollTop = target.scrollTop;
  const atBottom = target.scrollHeight - scrollTop - target.clientHeight < 24;
  const lines = text ? text.split("\n") : [];
  const visible = lines
    .map((text, index) => ({ text, index }))
    .filter((line) => line.text.toLowerCase().includes(query.toLowerCase()));
  const fragment = document.createDocumentFragment();
  for (const [index, line] of visible.entries()) {
    const row = document.createElement("span");
    row.className = "log-line";
    row.dataset.line = String(line.index + 1);
    if (/\b(error|fatal|exception)\b/i.test(line.text))
      row.dataset.level = "error";
    else if (/\bwarn(?:ing)?\b/i.test(line.text)) row.dataset.level = "warning";
    row.textContent = line.text;
    fragment.append(row);
    if (index !== visible.length - 1)
      fragment.append(document.createTextNode("\n"));
  }
  if (!visible.length)
    fragment.append(
      document.createTextNode(
        query ? "No matching log lines." : "No log output loaded.",
      ),
    );
  target.replaceChildren(fragment);
  target.scrollTop = atBottom ? target.scrollHeight : scrollTop;
  document.getElementById("log-count").textContent =
    `${visible.length} of ${lines.length} lines`;
}

export function installLogIcons() {
  const icons = {
    "load-logs": ["M20 7v5h-5", "M20 12a8 8 0 1 0-2 5"],
    "copy-logs": ["M9 9h11v11H9z", "M15 5V3H3v12h2"],
    "export-logs": ["M12 3v12", "m7 10 5 5 5-5", "M4 17v4h16v-4"],
    "clear-logs": ["m3 14 9-10 9 8-8 9H9z", "m8 9 9 8", "M13 21h8"],
    "expand-logs": ["M8 3H3v5", "M16 3h5v5", "M3 16v5h5", "M21 16v5h-5"],
    "jump-logs": ["m7 5 5 5 5-5", "m7 12 5 5 5-5"],
  };
  for (const [id, paths] of Object.entries(icons)) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [name, value] of Object.entries({
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.7",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    }))
      svg.setAttribute(name, value);
    for (const d of paths) {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", d);
      svg.append(path);
    }
    document.getElementById(id).replaceChildren(svg);
  }
}
