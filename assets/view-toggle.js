(() => {
  // Homepage / collection: switch between the coverflow stage and a plain product grid.
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

  // In grid view the click wheel scrolls the grid; select does nothing.
  const rowStep = () => {
    const card = grid.querySelector(".grid-card");
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

  // Stop the stage's arrow/Enter shortcuts while the grid is showing.
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
})();
