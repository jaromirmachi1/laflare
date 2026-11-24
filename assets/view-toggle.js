(() => {
  // Homepage / collection: coverflow ↔ grid, plus 6pm-style filters in grid only.
  const body = document.body;
  const btn = document.querySelector("[data-view-toggle]");
  const grid = document.querySelector("[data-grid]");
  if (!btn || !grid) return;

  const KEY = "laflare-view";
  const save = (value) => {
    try {
      localStorage.setItem(KEY, value);
    } catch (err) {
      /* private mode */
    }
  };

  const sync = () => {
    const on = body.classList.contains("is-grid");
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? btn.dataset.labelFlow : btn.dataset.labelGrid);
    grid.toggleAttribute("inert", !on);
  };

  btn.addEventListener("click", () => {
    const on = !body.classList.contains("is-grid");
    body.classList.toggle("is-grid", on);
    save(on ? "grid" : "flow");
    window.scrollTo(0, 0);
    sync();
  });
  sync();

  const rowStep = () => {
    const card = grid.querySelector(".grid-card:not([hidden])");
    return card ? card.getBoundingClientRect().height + 24 : window.innerHeight * 0.6;
  };
  const scrollRows = (dir) => window.scrollBy({ top: dir * rowStep(), behavior: "smooth" });

  document.addEventListener(
    "click",
    (event) => {
      if (!body.classList.contains("is-grid")) return;
      const hit = event.target.closest("[data-prev], [data-next], [data-down], [data-select]");
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      if (hit.matches("[data-prev]")) scrollRows(-1);
      else if (hit.matches("[data-next], [data-down]")) scrollRows(1);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (!body.classList.contains("is-grid")) return;
      if (document.querySelector("[data-menu].is-open")) return;
      if (["ArrowLeft", "ArrowRight", "ArrowDown", "Enter"].includes(event.key)) {
        if (event.key === "Enter" && event.target.closest("a, button, input, select, textarea")) return;
        event.stopPropagation();
      }
    },
    true,
  );

  const filtersRoot = grid.querySelector("[data-grid-filters]");
  const emptyEl = grid.querySelector("[data-grid-empty]");
  const cards = [...grid.querySelectorAll("[data-grid-card]")];
  if (!filtersRoot || !cards.length) return;

  const label = (key, fallback) => grid.getAttribute(`data-label-${key}`) || fallback;
  const split = (value) =>
    String(value || "")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);

  const uniqueSorted = (values) => {
    const seen = new Set();
    const out = [];
    values.forEach((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
    return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  };

  const types = uniqueSorted(cards.map((card) => card.dataset.type).filter(Boolean));
  const colors = uniqueSorted(cards.flatMap((card) => split(card.dataset.colors)));
  const sizes = uniqueSorted(cards.flatMap((card) => split(card.dataset.sizes)));

  const selected = { type: new Set(), color: new Set(), size: new Set() };

  const COLOR_HEX = {
    black: "#111111",
    white: "#f4f4f4",
    pink: "#ef9ab8",
    red: "#c43b3b",
    blue: "#2f5fff",
    navy: "#1c2b5a",
    grey: "#9a9a9a",
    gray: "#9a9a9a",
    green: "#3f6b45",
    olive: "#6b6b3a",
    brown: "#6b4a32",
    beige: "#d6c4a8",
    cream: "#efe6d6",
    yellow: "#e2c84b",
    purple: "#6b3f8f",
    orange: "#d7783a",
  };

  const colorStyle = (name) => {
    const key = name.toLowerCase().replace(/\s+/g, " ").trim();
    for (const [token, hex] of Object.entries(COLOR_HEX)) {
      if (key.includes(token)) return hex;
    }
    return "#cfcfcf";
  };

  const makeRow = (kind, title, values, mode) => {
    if (!values.length) return null;
    const row = document.createElement("div");
    row.className = "grid-filters__row";
    row.dataset.filterRow = kind;

    const labelEl = document.createElement("span");
    labelEl.className = "grid-filters__label";
    labelEl.textContent = title;
    row.appendChild(labelEl);

    const track = document.createElement("div");
    track.className = "grid-filters__track";
    track.dataset.filterTrack = kind;

    if (kind === "type") {
      const allBtn = document.createElement("button");
      allBtn.type = "button";
      allBtn.className = "grid-filters__chip is-active";
      allBtn.dataset.filterAll = "type";
      allBtn.textContent = label("all", "All");
      track.appendChild(allBtn);
    }

    values.forEach((value) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.dataset.filterValue = value;
      chip.dataset.filterKind = kind;
      if (mode === "swatch") {
        chip.className = "grid-filters__swatch";
        chip.title = value;
        chip.setAttribute("aria-label", value);
        const hex = colorStyle(value);
        chip.style.setProperty("--swatch", hex);
        if (hex.toLowerCase() === "#f4f4f4" || hex.toLowerCase() === "#efe6d6") {
          chip.classList.add("is-light");
        }
      } else {
        chip.className = "grid-filters__chip";
        chip.textContent = value;
      }
      track.appendChild(chip);
    });

    row.appendChild(track);
    return row;
  };

  const rows = [
    makeRow("type", label("category", "Category"), types, "chip"),
    makeRow("color", label("color", "Color"), colors, "swatch"),
    makeRow("size", label("size", "Size"), sizes, "chip"),
  ].filter(Boolean);

  if (!rows.length) {
    filtersRoot.hidden = true;
  } else {
    filtersRoot.hidden = false;
    rows.forEach((row) => filtersRoot.appendChild(row));
  }

  const apply = () => {
    let visible = 0;
    cards.forEach((card) => {
      const typeOk = !selected.type.size || selected.type.has(card.dataset.type);
      const cardColors = split(card.dataset.colors);
      const cardSizes = split(card.dataset.sizes);
      const colorOk =
        !selected.color.size || cardColors.some((value) => selected.color.has(value));
      const sizeOk =
        !selected.size.size || cardSizes.some((value) => selected.size.has(value));
      const show = typeOk && colorOk && sizeOk;
      card.hidden = !show;
      if (show) visible += 1;
    });
    if (emptyEl) emptyEl.hidden = visible > 0;

    filtersRoot.querySelectorAll("[data-filter-kind]").forEach((chip) => {
      const kind = chip.dataset.filterKind;
      const value = chip.dataset.filterValue;
      chip.classList.toggle("is-active", selected[kind].has(value));
    });
    const allBtn = filtersRoot.querySelector('[data-filter-all="type"]');
    if (allBtn) allBtn.classList.toggle("is-active", selected.type.size === 0);
  };

  filtersRoot.addEventListener("click", (event) => {
    const all = event.target.closest("[data-filter-all]");
    if (all) {
      selected.type.clear();
      apply();
      return;
    }
    const chip = event.target.closest("[data-filter-kind]");
    if (!chip) return;
    const kind = chip.dataset.filterKind;
    const value = chip.dataset.filterValue;
    if (!selected[kind]) return;
    if (selected[kind].has(value)) selected[kind].delete(value);
    else selected[kind].add(value);
    apply();
  });

  apply();
})();
