(() => {
  // Same slide motion as the homepage intro gate (shop.js), without the enter/close logic.
  const intro = document.querySelector("[data-intro]");
  if (!intro) return;
  const left = intro.querySelector('[data-intro-track="left"]');
  const right = intro.querySelector('[data-intro-track="right"]');
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SLIDE_MS = 1600;
  const HOLD_MS = 1600;
  let step = 0;

  const shuffle = (list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const srcs = (() => {
    const imgs = [...(left?.querySelectorAll(".intro__shot img") || [])];
    return imgs.slice(0, Math.max(1, Math.floor(imgs.length / 2))).map((img) => img.currentSrc || img.src);
  })();

  const fill = (track, list) => {
    if (!track || !list.length) return;
    const frag = document.createDocumentFragment();
    for (let pass = 0; pass < 2; pass += 1) {
      list.forEach((src) => {
        const fig = document.createElement("figure");
        fig.className = "intro__shot";
        const img = document.createElement("img");
        Object.assign(img, { src, alt: "", width: 1800, height: 1800, decoding: "async", loading: "eager" });
        fig.appendChild(img);
        frag.appendChild(fig);
      });
    }
    track.replaceChildren(frag);
  };

  const leftOrder = shuffle(srcs);
  let rightOrder = shuffle(srcs);
  const n = leftOrder.length;
  for (let pass = 0; pass < 12 && leftOrder.some((s, k) => s === rightOrder[(n - k) % n]); pass += 1) {
    rightOrder = shuffle(srcs);
  }
  fill(left, leftOrder);
  fill(right, rightOrder);

  const metrics = () => {
    const width = left?.querySelector(".intro__shot")?.getBoundingClientRect().width || 0;
    return { width, span: width * ((left?.children.length || 0) / 2) };
  };

  const place = (px) => {
    const { span } = metrics();
    if (!span) return;
    const offset = ((px % span) + span) % span;
    left.style.transform = `translate3d(${-offset}px,0,0)`;
    if (right) right.style.transform = `translate3d(${-(span - offset)}px,0,0)`;
  };

  const easeOut = (t) => 1 - (1 - t) ** 5;

  const slideNext = () => {
    const { width, span } = metrics();
    if (!width || !span) return;
    const from = step * width;
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      place(from + width * easeOut(t));
      if (t < 1) return requestAnimationFrame(frame);
      step += 1;
      if (step * width >= span - 0.5) {
        step = 0;
        place(0);
      }
      setTimeout(slideNext, HOLD_MS);
    };
    requestAnimationFrame(frame);
  };

  place(0);
  if (!reduce) setTimeout(slideNext, HOLD_MS);
  window.addEventListener("resize", () => place(step * metrics().width));

  // Wrong password: shake the pill and focus the field.
  const pill = document.querySelector("[data-lock-pill]");
  if (pill?.dataset.error === "true") {
    pill.classList.add("is-shake");
    pill.querySelector("input[type=password]")?.focus({ preventScroll: true });
  }
})();
