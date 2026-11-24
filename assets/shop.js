(() => {
  let unlockStage = () => {};
  const stageReady = new Promise((resolve) => {
    unlockStage = resolve;
  });

  const intro = document.querySelector("[data-intro]");
  if (intro) {
    try {
      if (sessionStorage.getItem("laflare-entered") === "1") intro.remove();
    } catch (err) {
      /* private mode */
    }
  }

  if (intro?.isConnected) {
    document.body.classList.add("is-intro", "is-wheel-held");
    const left = intro.querySelector('[data-intro-track="left"]');
    const right = intro.querySelector('[data-intro-track="right"]');
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SLIDE_MS = 1100;
    const HOLD_MS = 900;
    let step = 0;
    let raf = 0;
    let holdTimer = 0;

    function shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    }

    function shotSrcs(track) {
      const imgs = [...(track?.querySelectorAll(".intro__shot img") || [])];
      const seen = new Set();
      const out = [];
      imgs.forEach((img) => {
        const src = img.currentSrc || img.src;
        if (!src || seen.has(src)) return;
        seen.add(src);
        out.push(src);
      });
      return out;
    }

    function fillTrack(track, srcs) {
      if (!track || !srcs.length) return;
      const frag = document.createDocumentFragment();
      let slot = 0;
      for (let pass = 0; pass < 2; pass += 1) {
        srcs.forEach((src) => {
          const fig = document.createElement("figure");
          fig.className = "intro__shot";
          const img = document.createElement("img");
          img.src = src;
          img.alt = "";
          img.width = 1024;
          img.height = 1280;
          img.decoding = "async";
          img.loading = slot < 3 ? "eager" : "lazy";
          if (slot === 0) img.fetchPriority = "high";
          slot += 1;
          fig.appendChild(img);
          frag.appendChild(fig);
        });
      }
      track.replaceChildren(frag);
    }

    // Opposite scroll shows L[k] beside R[(n-k)%n]. Build two independent
    // orders and keep those visible pairs from matching.
    function pairOrders(srcs) {
      const leftOrder = shuffle(srcs);
      const n = leftOrder.length;
      const clashes = (right) => {
        let count = 0;
        for (let k = 0; k < n; k += 1) {
          if (leftOrder[k] === right[(n - k) % n]) count += 1;
        }
        return count;
      };
      let rightOrder = shuffle(srcs);
      for (let pass = 0; pass < 12; pass += 1) {
        if (clashes(rightOrder) === 0) break;
        rightOrder = shuffle(srcs);
      }
      for (let k = 0; k < n; k += 1) {
        const ri = (n - k) % n;
        if (rightOrder[ri] !== leftOrder[k]) continue;
        for (let trySwap = 0; trySwap < n; trySwap += 1) {
          const sj = (ri + 1 + trySwap) % n;
          const sk = (n - sj) % n;
          if (rightOrder[sj] === leftOrder[k]) continue;
          if (rightOrder[ri] === leftOrder[sk]) continue;
          const tmp = rightOrder[ri];
          rightOrder[ri] = rightOrder[sj];
          rightOrder[sj] = tmp;
          break;
        }
      }
      return { leftOrder, rightOrder };
    }

    const pool = shotSrcs(left);
    const { leftOrder, rightOrder } = pairOrders(pool);
    fillTrack(left, leftOrder);
    fillTrack(right, rightOrder);

    function metrics() {
      const shot = left?.querySelector(".intro__shot");
      const width = shot?.getBoundingClientRect().width || 0;
      const span = width * ((left?.children.length || 0) / 2);
      return { width, span };
    }

    function place(px) {
      const { span } = metrics();
      if (!span) return;
      const offset = ((px % span) + span) % span;
      left.style.transform = `translate3d(${-offset}px,0,0)`;
      if (right) right.style.transform = `translate3d(${-(span - offset)}px,0,0)`;
    }

    function easeOut(t) {
      return 1 - (1 - t) ** 5;
    }

    function slideNext() {
      const { width, span } = metrics();
      if (!width || !span) return;
      const from = step * width;
      const dest = (step + 1) * width;
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - start) / SLIDE_MS);
        place(from + (dest - from) * easeOut(t));
        if (t < 1) {
          raf = requestAnimationFrame(frame);
          return;
        }
        step += 1;
        if (step * width >= span - 0.5) {
          step = 0;
          place(0);
        }
        holdTimer = window.setTimeout(slideNext, HOLD_MS);
      };
      raf = requestAnimationFrame(frame);
    }

    place(0);
    if (!reduce) holdTimer = window.setTimeout(slideNext, HOLD_MS);
    window.addEventListener("resize", () => place(step * (metrics().width || 0)));

    let closed = false;
    const closeIntro = () => {
      if (closed) return;
      closed = true;
      try {
        sessionStorage.setItem("laflare-entered", "1");
      } catch (err) {
        /* private mode */
      }
      cancelAnimationFrame(raf);
      window.clearTimeout(holdTimer);
      intro.classList.add("is-leaving");
      document.body.classList.remove("is-intro");
      if (selectBtn) {
        if (priorLabel == null) selectBtn.removeAttribute("aria-label");
        else selectBtn.setAttribute("aria-label", priorLabel);
      }
      if (menuLabel) menuLabel.textContent = priorMenu;
      unlockStage();
      window.setTimeout(() => intro.remove(), 640);
    };

    const selectBtn = document.querySelector("[data-select]");
    const priorLabel = selectBtn?.getAttribute("aria-label") ?? null;
    const menuLabel = document.querySelector("[data-wheel-menu-label]");
    const priorMenu = menuLabel?.textContent ?? "";
    const enterLabel = intro.getAttribute("data-enter-label") || "Enter";
    if (menuLabel) menuLabel.textContent = enterLabel;
    if (selectBtn) {
      selectBtn.setAttribute("aria-label", enterLabel);
      selectBtn.addEventListener(
        "click",
        (event) => {
          if (closed || !document.body.classList.contains("is-intro")) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          closeIntro();
        },
        true,
      );
      selectBtn.focus({ preventScroll: true });
    }
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !document.body.classList.contains("is-intro")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeIntro();
    });
  } else {
    unlockStage();
  }

  const root = document.body;
  const dataEl = document.getElementById("StageData");
  if (!dataEl) return;

  const data = JSON.parse(dataEl.textContent);
  const products = data.products || [];
  const decodeEntities = (value) => {
    if (typeof value !== "string" || !value.includes("&")) return value;
    const el = document.createElement("textarea");
    el.innerHTML = value;
    return el.value;
  };
  const i18n = Object.fromEntries(
    Object.entries(data.i18n || {}).map(([key, value]) => [
      key,
      decodeEntities(value),
    ]),
  );
  const isPreview = data.preview === true;

  const titleEl = document.querySelector(
    "h2.product-title[data-product-title], .stage > [data-product-title]",
  );
  const track = document.querySelector("[data-track]");
  const productItems = [...document.querySelectorAll("[data-item]")];
  const detailBar = document.querySelector("[data-detail]");
  const sizeSelect = document.querySelector("[data-size]");
  const priceEl = document.querySelector("[data-price]");
  const atcBtn = document.querySelector("[data-atc]");
  const stickyAtcBtn = document.querySelector("[data-atc-sticky]");
  const stickyAtc = document.querySelector("[data-sticky-atc]");
  const detailBack = document.querySelector("[data-detail-back]");
  const moreBtn = document.querySelector("[data-more]");
  const copyEl = document.querySelector("[data-copy]");
  const infoOverlay = document.querySelector("[data-info]");
  const infoTitle = document.querySelector("[data-info-title]");
  const infoCopy = document.querySelector("[data-info-copy]");
  const menu = document.querySelector("[data-menu]");
  const cartOverlay = document.querySelector("[data-cart]");
  const legalsOverlay = document.querySelector("[data-legals]");
  const cartCountEls = [...document.querySelectorAll("[data-cart-count]")];
  const cartLines = document.querySelector("[data-cart-lines]");
  const cartEmpty = document.querySelector("[data-cart-empty]");
  const cartTotal = document.querySelector("[data-cart-total]");
  const cartTotalValue = document.querySelector("[data-cart-total-value]");
  const cartShip = document.querySelector("[data-cart-ship]");
  const cartShipMsg = document.querySelector("[data-cart-ship-msg]");
  const cartShipFill = document.querySelector("[data-cart-ship-fill]");
  const cartUpsell = document.querySelector("[data-cart-upsell]");
  const cartUpsellLabel = document.querySelector("[data-cart-upsell-label]");
  const cartUpsellList = document.querySelector("[data-cart-upsell-list]");
  const checkoutBtn = document.querySelector("[data-checkout]");
  const FREE_SHIPPING = {
    CZK: Number(data.freeShipping?.CZK) || 3000,
    EUR: Number(data.freeShipping?.EUR) || 123,
  };

  let index = Math.max(
    0,
    products.findIndex((p) => p.handle === data.initialHandle),
  );
  if (index < 0) index = 0;
  let detail = Boolean(data.openDetail);
  const startedAsProduct = Boolean(data.openDetail);
  let detailHistoryPushed = false;
  let ignoreDetailPop = false;
  let imageIndex = 0;
  let galleryItems = [];
  let copyOpen = false;
  let dragX = 0;
  let startX = 0;
  let startY = 0;
  let dragArmed = false;
  let dragging = false;
  let dragAxis = null;
  let ignoreClick = false;
  let unitCache = 0;

  const MOVE_EASE = "cubic-bezier(0.16, 1.08, 0.38, 0.98)";
  const MOVE_MS = 800;
  const DRAG_START = 8;
  const DRAG_STEP = 48;

  const product = () => products[index];
  const productImages = () => product()?.images || [];
  const activeItems = () => (detail ? galleryItems : productItems);

  function stripMoneyHtml(value) {
    return String(value || "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s*Kč/g, " CZK")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatMoney(centsOrString) {
    if (product()?.price_formatted)
      return stripMoneyHtml(product().price_formatted);
    const n = Number(centsOrString);
    if (Number.isNaN(n)) return stripMoneyHtml(centsOrString);
    return `${Math.round(n).toLocaleString("cs-CZ")} CZK`;
  }

  function cartCurrency(cart) {
    const raw =
      cart?.currency?.iso_code ||
      cart?.currency ||
      data.currency ||
      "CZK";
    return String(raw).toUpperCase();
  }

  function freeShippingThreshold(cart) {
    const code = cartCurrency(cart);
    return FREE_SHIPPING[code] || FREE_SHIPPING.CZK;
  }

  function formatMajor(amount, currency) {
    const n = Math.round(Number(amount) || 0);
    const code = String(currency || "CZK").toUpperCase();
    if (code === "EUR") return `${n.toLocaleString("cs-CZ")} EUR`;
    return `${n.toLocaleString("cs-CZ")} CZK`;
  }

  function formatCrowns(crowns) {
    return formatMajor(crowns, "CZK");
  }

  function crownsFromFormatted(value) {
    return Number(String(value || "").replace(/[^\d]/g, "")) || 0;
  }

  function productMajorPrice(item) {
    if (typeof item?.price === "number") return item.price / 100;
    return crownsFromFormatted(item?.price_formatted);
  }

  function cartTotalCrowns(cart) {
    if (typeof cart.total_price === "number") {
      return cart.total_price / 100;
    }
    return (cart.items || []).reduce((sum, line) => {
      const qty = Number(line.quantity) || 1;
      if (typeof line.final_line_price === "number") {
        return sum + line.final_line_price / 100;
      }
      if (typeof line.line_price === "number") {
        return sum + line.line_price / 100;
      }
      if (typeof line.final_price === "number") {
        return sum + (line.final_price / 100) * qty;
      }
      if (typeof line.price === "number") {
        return sum + (line.price / 100) * qty;
      }
      return sum + crownsFromFormatted(line.price_formatted) * qty;
    }, 0);
  }

  function loopOffset(i, center, max) {
    let offset = i - center;
    const half = max / 2;
    if (offset > half) offset -= max;
    else if (offset < -half) offset += max;
    return offset;
  }

  function reduceMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function unit() {
    if (unitCache) return unitCache;
    const size = track?.offsetWidth || 300;
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;width:var(--item-gap)";
    document.documentElement.appendChild(probe);
    unitCache = size + probe.offsetWidth;
    probe.remove();
    return unitCache;
  }

  function itemScale(current) {
    if (current) return detail ? 1 : 1.08;
    return detail ? 0.86 : 0.7;
  }

  function refreshUnit() {
    unitCache = 0;
  }

  function pose(el) {
    const t = getComputedStyle(el).transform;
    if (!t || t === "none") return { x: 0, scale: 1 };
    const m = new DOMMatrixReadOnly(t);
    return { x: m.m41, scale: m.m11 };
  }

  function writePose(el, x, scale) {
    el.style.transform = `translate3d(${x}px, 0, 0) scale(${scale})`;
  }

  function cancelMove(el) {
    el.getAnimations().forEach((anim) => {
      if (anim.id === "cover-move") anim.cancel();
    });
  }

  function bloom(el, x, scale, delay) {
    cancelMove(el);
    writePose(el, 0, 0.86);
    el.style.opacity = "0";
    el.style.willChange = "transform, opacity";
    const anim = el.animate(
      [
        { transform: "translate3d(0px, 0, 0) scale(0.86)", opacity: 0 },
        { transform: `translate3d(${x}px, 0, 0) scale(${scale})`, opacity: 1 },
      ],
      {
        duration: 760,
        delay,
        easing: MOVE_EASE,
        fill: "forwards",
        id: "cover-move",
      },
    );
    anim.finished
      .then(() => {
        writePose(el, x, scale);
        el.style.opacity = "1";
        anim.cancel();
        el.style.willChange = "";
      })
      .catch(() => {
        el.style.opacity = "1";
        el.style.willChange = "";
      });
  }

  function whenImagesReady(imgs) {
    const pending = imgs.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      });
    });
    return Promise.race([
      Promise.all(pending),
      new Promise((resolve) => window.setTimeout(resolve, 4500)),
    ]);
  }

  function playIntro() {
    const current = product();
    if (titleEl) titleEl.textContent = current ? current.title : "";
    syncDetail();
    if (!productItems.length || reduceMotion()) {
      productItems.forEach((el) => {
        el.style.opacity = "1";
      });
      setIndex(index, true);
      root.classList.add("is-stage-in");
      return;
    }
    const max = productItems.length;
    productItems.forEach((el, i) => {
      const offset = loopOffset(i, index, max);
      el.dataset.offset = String(offset);
      el.style.zIndex = String(20 - Math.abs(offset));
      el.classList.toggle("is-current", i === index);
      el.tabIndex = i === index ? 0 : -1;
      el.setAttribute("aria-hidden", i === index ? "false" : "true");
      bloom(el, offset * unit(), itemScale(i === index), Math.min(Math.abs(offset), 3) * 70);
    });
    root.classList.add("is-stage-in");
  }

  function moveTo(el, x, scale, instant) {
    const from = pose(el);
    cancelMove(el);
    writePose(el, from.x, from.scale);
    if (
      instant ||
      reduceMotion() ||
      (Math.abs(from.x - x) < 0.5 && Math.abs(from.scale - scale) < 0.002)
    ) {
      writePose(el, x, scale);
      el.style.willChange = "";
      return;
    }
    el.style.willChange = "transform";
    const anim = el.animate(
      [
        { transform: `translate3d(${from.x}px, 0, 0) scale(${from.scale})` },
        { transform: `translate3d(${x}px, 0, 0) scale(${scale})` },
      ],
      {
        duration: MOVE_MS,
        easing: MOVE_EASE,
        fill: "forwards",
        id: "cover-move",
      },
    );
    anim.finished
      .then(() => {
        writePose(el, x, scale);
        anim.cancel();
        el.style.willChange = "";
      })
      .catch(() => {
        el.style.willChange = "";
      });
  }

  function markGallerySliding(active) {
    if (!track) return;
    track.classList.toggle("is-sliding", Boolean(active));
    if (active) {
      window.clearTimeout(markGallerySliding.timer);
      markGallerySliding.timer = window.setTimeout(() => {
        track.classList.remove("is-sliding");
      }, MOVE_MS + 40);
    }
  }

  function positionItems(list, center, instant) {
    const max = list.length;
    if (!max) return;
    if (copyOpen && detail && list === galleryItems) {
      if (!isMobileInfo()) {
        list.forEach((el, i) => {
          cancelMove(el);
          el.dataset.offset = "0";
          el.style.zIndex = "";
          el.style.willChange = "";
          writePose(el, 0, 1);
          el.classList.toggle("is-current", i === center);
          el.tabIndex = i === center ? 0 : -1;
          el.setAttribute("aria-hidden", i === center ? "false" : "true");
        });
        list[center]?.scrollIntoView({
          behavior: reduceMotion() ? "auto" : "smooth",
          block: "nearest",
        });
        return;
      }
    }
    const gallerySlide =
      detail && list === galleryItems && isMobileInfo() && !instant;
    if (gallerySlide) markGallerySliding(true);
    list.forEach((el, i) => {
      const offset = loopOffset(i, center, max);
      const hadPrev = el.dataset.offset != null;
      const prev = hadPrev ? Number(el.dataset.offset) : offset;
      const jumped = hadPrev && Math.abs(offset - prev) > 1.5;
      el.dataset.offset = String(offset);
      el.style.zIndex = String(20 - Math.abs(offset));
      el.classList.toggle("is-current", i === center);
      el.tabIndex = i === center ? 0 : -1;
      el.setAttribute("aria-hidden", i === center ? "false" : "true");
      const x = offset * unit();
      const scale = itemScale(i === center);
      if (instant || jumped) moveTo(el, x, scale, true);
      else moveTo(el, x, scale, false);
    });
  }

  function setIndex(next, fromDrag) {
    if (!products.length) return;
    const max = products.length;
    index = ((next % max) + max) % max;
    const current = product();
    positionItems(productItems, index, fromDrag);
    if (titleEl) titleEl.textContent = current ? current.title : "";
    syncDetail();
    if (detail && current && !isPreview) {
      history.replaceState(
        { laflareDetail: true },
        "",
        current.url,
      );
    }
  }

  function setImageIndex(next, fromDrag) {
    const imgs = productImages();
    if (!imgs.length) return;
    const max = imgs.length;
    imageIndex = ((next % max) + max) % max;
    if (isMobileInfo()) refreshUnit();
    positionItems(galleryItems, imageIndex, fromDrag);
  }

  function clearGallery() {
    galleryItems.forEach((el) => el.remove());
    galleryItems = [];
    productItems.forEach((el) => {
      el.classList.remove("is-away");
      el.hidden = false;
    });
  }

  function buildGallery() {
    clearGallery();
    const current = product();
    const imgs = productImages();
    imageIndex = 0;
    if (!track || !current || !imgs.length) return;

    imgs.forEach((src, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cover-item";
      btn.dataset.shot = String(i);
      btn.setAttribute(
        "aria-label",
        `${current.title} ${i + 1}/${imgs.length}`,
      );
      writePose(btn, 0, 1);
      btn.style.opacity = "";
      if (i === 0) btn.classList.add("is-current");
      const img = document.createElement("img");
      img.src = /[?&]width=/.test(src)
        ? src
        : `${src}${src.includes("?") ? "&" : "?"}width=1200`;
      img.alt = current.title;
      img.width = 700;
      img.height = 700;
      img.decoding = "async";
      img.loading = "eager";
      if (i === 0) img.fetchPriority = "high";
      btn.appendChild(img);
      btn.addEventListener("click", () => {
        if (ignoreClick) {
          ignoreClick = false;
          return;
        }
        if (i !== imageIndex) setImageIndex(i);
      });
      track.appendChild(btn);
      galleryItems.push(btn);
    });

    productItems.forEach((el) => {
      el.classList.add("is-away");
      el.hidden = true;
    });
    requestAnimationFrame(() => setImageIndex(0));
  }

  function isMobileInfo() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function setInfoOverlay(open) {
    if (!infoOverlay) return;
    const next = Boolean(open);
    infoOverlay.classList.toggle("is-open", next);
    infoOverlay.setAttribute("aria-hidden", next ? "false" : "true");
    if (next) {
      menu?.classList.remove("is-open");
      menu?.setAttribute("aria-hidden", "true");
    }
  }

  function syncWheelNavLabel() {
    const menuLabel = document.querySelector("[data-wheel-menu-label]");
    const backLabel = document.querySelector("[data-wheel-back-label]");
    const menuBtn = document.querySelector("[data-menu-btn]");
    if (menuLabel) menuLabel.hidden = detail;
    if (backLabel) backLabel.hidden = !detail;
    if (menuBtn) {
      const text = detail
        ? menuBtn.getAttribute("data-label-back") || i18n.back || "Back"
        : menuBtn.getAttribute("data-label-menu") || i18n.menu || "Menu";
      menuBtn.textContent = text;
    }
  }

  function syncMobileDetailChrome() {
    const show = detail && isMobileInfo();
    if (stickyAtc) stickyAtc.hidden = !show;
  }

  function syncDetail() {
    const current = product();
    root.classList.toggle("is-detail", detail);
    root.classList.toggle("is-info", detail);
    syncWheelNavLabel();
    syncMobileDetailChrome();
    if (!current || !detailBar) return;
    const html = current.description_html || current.description || "";
    if (copyEl) {
      copyEl.innerHTML = html;
      copyEl.classList.toggle("is-open", detail);
    }
    if (infoTitle) infoTitle.textContent = current.title || "";
    if (infoCopy) infoCopy.innerHTML = html;
    setInfoOverlay(false);
    if (moreBtn) moreBtn.hidden = true;
    if (sizeSelect) {
      sizeSelect.innerHTML = "";
      (current.variants || []).forEach((variant) => {
        const opt = document.createElement("option");
        opt.value = String(variant.id);
        opt.textContent = variant.title;
        opt.disabled = !variant.available;
        sizeSelect.appendChild(opt);
      });
      const first =
        (current.variants || []).find((v) => v.available) ||
        current.variants?.[0];
      if (first) sizeSelect.value = String(first.id);
    }
    updateAtc();
  }

  function selectedVariant() {
    const current = product();
    if (!current) return null;
    const id = sizeSelect?.value;
    return (
      (current.variants || []).find((v) => String(v.id) === String(id)) ||
      current.variants?.[0]
    );
  }

  function updateAtc() {
    const variant = selectedVariant();
    const current = product();
    const available = Boolean(variant?.available);
    if (priceEl)
      priceEl.textContent = stripMoneyHtml(
        variant?.price_formatted || current?.price_formatted || "",
      );
    const label = available
      ? i18n.add || "Add to cart"
      : i18n.sold_out || "Sold out";
    [atcBtn, stickyAtcBtn].forEach((btn) => {
      if (!btn) return;
      btn.disabled = !available;
      btn.textContent = label;
    });
  }

  function openDetail() {
    detail = true;
    copyOpen = true;
    const current = product();
    if (titleEl) {
      titleEl.hidden = false;
      titleEl.removeAttribute("hidden");
      titleEl.setAttribute("aria-hidden", "false");
      titleEl.style.opacity = "";
      titleEl.style.visibility = "";
      titleEl.textContent = current ? current.title : "";
    }
    refreshUnit();
    buildGallery();
    syncDetail();
    if (!isPreview && current) {
      if (startedAsProduct) {
        history.replaceState({ laflareDetail: true }, "", current.url);
      } else {
        history.pushState({ laflareDetail: true }, "", current.url);
        detailHistoryPushed = true;
      }
    }
  }

  function restoreChrome() {
    root.classList.add("is-stage-in");
    [".logo", ".chrome-actions", ".wheel-dock"].forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.opacity = "";
        el.style.transform = "";
        el.style.pointerEvents = "";
      });
    });
  }

  function closeDetail(opts = {}) {
    const fromPop = Boolean(opts.fromPop);
    // Real product pages have no grid toggle — go home fully.
    if (!isPreview && startedAsProduct) {
      window.location.assign(data.shopUrl || "/");
      return;
    }
    detail = false;
    copyOpen = false;
    stepToken += 1;
    releaseStageMotion();
    clearGallery();
    refreshUnit();
    setIndex(index);
    syncDetail();
    restoreChrome();
    if (!isPreview && !fromPop) {
      if (detailHistoryPushed && history.state?.laflareDetail) {
        detailHistoryPushed = false;
        ignoreDetailPop = true;
        history.back();
      } else {
        detailHistoryPushed = false;
        history.replaceState(null, "", data.shopUrl || "/");
      }
    } else if (fromPop) {
      detailHistoryPushed = false;
    }
  }

  function step(delta, instant) {
    if (detail) setImageIndex(imageIndex + delta, instant);
    else setIndex(index + delta, instant);
  }

  let productStepping = false;
  let stepToken = 0;

  function releaseStageMotion() {
    productStepping = false;
    [track, titleEl, detailBar].filter(Boolean).forEach((el) => {
      el.getAnimations().forEach((anim) => anim.cancel());
      el.style.opacity = "";
      if (el === track) el.style.transform = "";
    });
  }

  function stepProduct(delta) {
    if (!products.length || productStepping) return;
    const token = ++stepToken;
    const swap = () => {
      setIndex(index + delta);
      if (!detail) return;
      refreshUnit();
      buildGallery();
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      const scroller = mobile
        ? document.querySelector(".stage")
        : document.querySelector(".coverflow");
      scroller?.scrollTo({ top: 0 });
    };
    if (!detail || reduceMotion() || !track) {
      swap();
      return;
    }
    productStepping = true;
    const easeOut = "cubic-bezier(0.23, 1, 0.32, 1)";
    const copy = [titleEl, detailBar].filter(Boolean);
    const alive = () => token === stepToken && detail;
    const leave = track.animate(
      [
        { opacity: 1, transform: "translateY(0px)" },
        { opacity: 0, transform: "translateY(-28px)" },
      ],
      { duration: 280, easing: easeOut, fill: "forwards" },
    );
    copy.forEach((el) => {
      el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 200,
        easing: easeOut,
        fill: "forwards",
      });
    });
    leave.finished
      .then(() => {
        if (!alive()) return;
        swap();
        const enter = track.animate(
          [
            { opacity: 0, transform: "translateY(32px)" },
            { opacity: 1, transform: "translateY(0px)" },
          ],
          { duration: 520, easing: MOVE_EASE, fill: "forwards" },
        );
        copy.forEach((el) => {
          el.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 420,
            delay: 70,
            easing: MOVE_EASE,
            fill: "forwards",
          });
        });
        return enter.finished.then(() => {
          if (!alive()) return;
          releaseStageMotion();
        });
      })
      .catch(() => {})
      .finally(() => {
        if (token === stepToken) productStepping = false;
      });
  }

  function toggleMenu(open) {
    if (!menu) return;
    const next = open ?? !menu.classList.contains("is-open");
    menu.classList.toggle("is-open", next);
    menu.setAttribute("aria-hidden", next ? "false" : "true");
    if (next) {
      cartOverlay?.classList.remove("is-open");
      cartOverlay?.setAttribute("aria-hidden", "true");
      legalsOverlay?.classList.remove("is-open");
      legalsOverlay?.setAttribute("aria-hidden", "true");
      syncMenuFocus();
    }
  }

  function menuItems() {
    return menu ? [...menu.querySelectorAll("[data-menu-item]")] : [];
  }

  function activeMenuIndex() {
    const items = menuItems();
    const i = items.findIndex((el) => el.classList.contains("is-active"));
    return i < 0 ? 0 : i;
  }

  function setMenuIndex(next) {
    const items = menuItems();
    if (!items.length) return;
    const max = items.length;
    const index = ((next % max) + max) % max;
    items.forEach((el, i) => {
      el.classList.toggle("is-active", i === index);
      if (i === index) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
    });
  }

  function syncMenuFocus() {
    const items = menuItems();
    if (!items.length) return;
    if (!items.some((el) => el.classList.contains("is-active"))) {
      items[0].classList.add("is-active");
    }
  }

  function activateMenuItem() {
    const items = menuItems();
    const current = items[activeMenuIndex()];
    if (!current) return;
    if (current.hasAttribute("data-open-cart")) {
      toggleMenu(false);
      toggleCart(true);
      return;
    }
    if (current.hasAttribute("data-open-legals")) {
      toggleMenu(false);
      toggleLegals(true);
      return;
    }
    if (current.tagName === "A" && current.href) {
      window.location.href = current.href;
    }
  }

  function toggleCart(open) {
    if (!cartOverlay) return;
    const next = open ?? !cartOverlay.classList.contains("is-open");
    cartOverlay.classList.toggle("is-open", next);
    cartOverlay.setAttribute("aria-hidden", next ? "false" : "true");
    root.classList.toggle("is-cart-open", next);
    if (next) {
      menu?.classList.remove("is-open");
      menu?.setAttribute("aria-hidden", "true");
      toggleLegals(false);
      if (infoOverlay?.classList.contains("is-open")) {
        copyOpen = false;
        setInfoOverlay(false);
      }
      renderCart();
    }
  }

  function getLegalsScope() {
    if (legalsOverlay?.classList.contains("is-open")) return legalsOverlay;
    return document.querySelector("[data-legals-page]");
  }

  function showLegalsHub() {
    const scope = getLegalsScope() || legalsOverlay;
    if (!scope) return;
    const hub = scope.querySelector("[data-legals-hub]");
    const back = scope.querySelector("[data-legals-back]");
    hub?.removeAttribute("hidden");
    back?.setAttribute("hidden", "");
    scope.querySelectorAll("[data-legals-article]").forEach((el) => {
      el.setAttribute("hidden", "");
    });
  }

  function openLegalsDoc(id) {
    if (!id) return;
    const scope = getLegalsScope() || legalsOverlay;
    if (!scope) return;
    const article = scope.querySelector(`[data-legals-article="${id}"]`);
    if (!article) return;
    const hub = scope.querySelector("[data-legals-hub]");
    const back = scope.querySelector("[data-legals-back]");
    hub?.setAttribute("hidden", "");
    back?.removeAttribute("hidden");
    scope.querySelectorAll("[data-legals-article]").forEach((el) => {
      el.setAttribute("hidden", "");
    });
    article.removeAttribute("hidden");
    if (scope === legalsOverlay) legalsOverlay.scrollTop = 0;
    else window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function scrollLegals(dir) {
    const stepPx = Math.max(160, Math.round(window.innerHeight * 0.55)) * dir;
    if (legalsOverlay?.classList.contains("is-open")) {
      legalsOverlay.scrollBy({ top: stepPx, behavior: "smooth" });
      return;
    }
    if (document.querySelector("[data-legals-page]")) {
      window.scrollBy({ top: stepPx, behavior: "smooth" });
    }
  }

  function scrollInfo(dir) {
    if (!root.classList.contains("is-info")) return;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const scroller = mobile
      ? document.querySelector(".stage")
      : document.querySelector(".coverflow");
    if (!scroller) return;
    const stepPx = Math.max(160, Math.round(scroller.clientHeight * 0.42)) * dir;
    scroller.scrollBy({ top: stepPx, behavior: "smooth" });
  }

  function toggleLegals(open) {
    if (!legalsOverlay) return;
    const next = open ?? !legalsOverlay.classList.contains("is-open");
    legalsOverlay.classList.toggle("is-open", next);
    legalsOverlay.setAttribute("aria-hidden", next ? "false" : "true");
    root.classList.toggle("is-legals", next);
    if (next) {
      menu?.classList.remove("is-open");
      menu?.setAttribute("aria-hidden", "true");
      cartOverlay?.classList.remove("is-open");
      cartOverlay?.setAttribute("aria-hidden", "true");
      showLegalsHub();
      legalsOverlay.scrollTop = 0;
    } else {
      showLegalsHub();
    }
  }

  async function getCart() {
    if (isPreview) {
      const raw = localStorage.getItem("laflare-preview-cart");
      return raw ? JSON.parse(raw) : { item_count: 0, items: [] };
    }
    const res = await fetch("/cart.js");
    return res.json();
  }

  function savePreviewCart(cart) {
    localStorage.setItem("laflare-preview-cart", JSON.stringify(cart));
  }

  async function renderCart() {
    const cart = await getCart();
    const count = Number(cart.item_count) || 0;
    cartCountEls.forEach((el) => {
      el.textContent = String(count);
      if (el.classList.contains("chrome-icon__count")) {
        el.hidden = count === 0;
      }
    });
    if (!cartLines) return;
    cartLines.innerHTML = "";
    const itemsList = cart.items || [];
    const hasItems = itemsList.length > 0;
    const currency = cartCurrency(cart);
    const threshold = freeShippingThreshold(cart);
    if (cartEmpty) cartEmpty.hidden = hasItems;
    if (checkoutBtn) checkoutBtn.hidden = !hasItems;
    if (cartTotal) cartTotal.hidden = !hasItems;
    const totalMajor = cartTotalCrowns(cart);
    if (cartTotalValue && hasItems) {
      cartTotalValue.textContent = formatMajor(totalMajor, currency);
    }
    if (cartShip) {
      cartShip.hidden = !hasItems;
      const unlocked = hasItems && totalMajor >= threshold;
      cartShip.classList.toggle("is-unlocked", unlocked);
      if (hasItems && cartShipMsg) {
        if (unlocked) {
          cartShipMsg.textContent =
            i18n.shipping_unlocked || "You unlocked free shipping";
        } else {
          const remain = Math.max(0, threshold - totalMajor);
          const template =
            i18n.shipping_remain || "Add {{ amount }} more for free shipping";
          cartShipMsg.textContent = template.replace(
            "{{ amount }}",
            formatMajor(remain, currency),
          );
        }
      }
      if (cartShipFill) {
        const pct = hasItems
          ? Math.min(100, Math.round((totalMajor / threshold) * 100))
          : 0;
        cartShipFill.style.width = `${pct}%`;
      }
    }
    itemsList.forEach((line) => {
      const qty = Number(line.quantity) || 1;
      const priceLabel = stripMoneyHtml(
        line.price_formatted ||
          formatMajor((line.final_price || line.price || 0) / 100, currency),
      );
      const row = document.createElement("div");
      row.className = "cart-line";
      row.innerHTML = `
        <img src="${line.image || ""}" alt="">
        <div class="cart-line__info">
          <p>${line.title}</p>
          <div class="cart-line__meta">
            <div class="cart-qty">
              <button type="button" class="cart-qty__btn" data-qty-dec aria-label="${i18n.qty_down || "Decrease quantity"}">−</button>
              <span class="cart-qty__value" aria-label="${i18n.quantity || "Quantity"}">${qty}</span>
              <button type="button" class="cart-qty__btn" data-qty-inc aria-label="${i18n.qty_up || "Increase quantity"}">+</button>
            </div>
            <span class="cart-line__price">${priceLabel}</span>
          </div>
        </div>
      `;
      row.querySelector("[data-qty-dec]")?.addEventListener("click", () => {
        changeLine(line, qty - 1);
      });
      row.querySelector("[data-qty-inc]")?.addEventListener("click", () => {
        changeLine(line, qty + 1);
      });
      const remove = document.createElement("button");
      remove.className = "icon-btn";
      remove.type = "button";
      remove.textContent = i18n.remove || "Remove";
      remove.addEventListener("click", () => changeLine(line, 0));
      row.appendChild(remove);
      cartLines.appendChild(row);
    });
    renderCartUpsell(cart, Math.max(0, threshold - totalMajor), currency);
  }

  function lineInProduct(line, product) {
    const productId = String(product.id);
    if (line.product_id != null && String(line.product_id) === productId) {
      return true;
    }
    const variantIds = new Set(
      (product.variants || []).map((variant) => String(variant.id)),
    );
    return (
      variantIds.has(String(line.id)) ||
      variantIds.has(String(line.variant_id))
    );
  }

  function isTeeProduct(item) {
    const type = String(item?.type || item?.product_type || "").toLowerCase();
    const title = String(item?.title || "").toLowerCase();
    const handle = String(item?.handle || "").toLowerCase();
    return (
      /t-?shirts?|tee|triko|tričk/.test(type) ||
      /\btee\b|t-shirt|triko|tričk/.test(title) ||
      /tee|t-shirt|triko/.test(handle)
    );
  }

  function fillTemplate(template, vars) {
    return Object.entries(vars).reduce(
      (text, [key, value]) => text.split(`{{ ${key} }}`).join(String(value)),
      String(template || ""),
    );
  }

  function coversGap(price, remainMajor) {
    return price > 0 && price + 0.01 >= remainMajor;
  }

  function upsellCopy(remainMajor, picks) {
    if (remainMajor <= 0) {
      const lines = [
        i18n.upsell_more_1,
        i18n.upsell_more_2,
        i18n.upsell_more_3,
      ].filter(Boolean);
      const seed = Number(picks[0]?.id) || 0;
      return lines.length
        ? lines[seed % lines.length]
        : "Complete the look with a tee";
    }

    const prices = picks
      .map((item) => productMajorPrice(item))
      .filter((price) => price > 0);
    if (!prices.length) return "";

    if (prices.some((price) => coversGap(price, remainMajor))) {
      return i18n.upsell_ship_one || "One more tee unlocks free shipping";
    }

    const sum = prices.reduce((total, price) => total + price, 0);
    if (picks.length >= 2 && coversGap(sum, remainMajor)) {
      return i18n.upsell_ship_two || "Two tees unlock free shipping";
    }

    const unit = Math.min(...prices);
    const count = Math.max(2, Math.ceil(remainMajor / unit));
    return fillTemplate(
      i18n.upsell_ship_count || "Add {{ count }} tees to unlock free shipping",
      { count },
    );
  }

  function pickCartUpsells(cart, remainMajor) {
    const available = products.filter((item) => {
      if (!item?.available) return false;
      if ((cart.items || []).some((line) => lineInProduct(line, item))) {
        return false;
      }
      return (item.variants || []).some((variant) => variant.available !== false);
    });
    if (!available.length) return [];

    const tees = available.filter(isTeeProduct);
    const pool = tees.length ? tees : available;
    const ranked = pool
      .map((item) => ({
        item,
        price: productMajorPrice(item),
        tee: isTeeProduct(item),
      }))
      .filter((entry) => entry.price > 0);

    if (!ranked.length) return [];

    if (remainMajor <= 0) {
      return ranked
        .sort((a, b) => Number(b.tee) - Number(a.tee) || a.price - b.price)
        .slice(0, 1)
        .map((entry) => entry.item);
    }

    const closing = ranked
      .filter((entry) => coversGap(entry.price, remainMajor))
      .sort((a, b) => a.price - b.price);
    if (closing.length) return [closing[0].item];

    const byPrice = ranked.slice().sort((a, b) => a.price - b.price);
    for (let i = 0; i < byPrice.length; i += 1) {
      for (let j = i + 1; j < byPrice.length; j += 1) {
        if (coversGap(byPrice[i].price + byPrice[j].price, remainMajor)) {
          return [byPrice[i].item, byPrice[j].item];
        }
      }
    }

    return [byPrice[0].item];
  }

  function bindUpsellCard(card, pick) {
    const variants = (pick.variants || []).filter(
      (variant) => variant.available !== false,
    );
    if (!variants.length) return;

    const sizeEl = card.querySelector("[data-upsell-size]");
    const priceElLocal = card.querySelector("[data-upsell-price]");
    const image = pick.images?.[0] || "";

    sizeEl?.addEventListener?.("change", () => {
      if (!priceElLocal || sizeEl.tagName !== "SELECT") return;
      const opt = sizeEl.selectedOptions?.[0];
      if (opt?.dataset.price) {
        priceElLocal.textContent = stripMoneyHtml(opt.dataset.price);
      }
    });

    card.querySelector("[data-upsell-add]")?.addEventListener("click", () => {
      const variantId =
        sizeEl?.tagName === "SELECT"
          ? sizeEl.value
          : sizeEl?.value || variants[0].id;
      const variant =
        variants.find((entry) => String(entry.id) === String(variantId)) ||
        variants[0];
      addVariantToCart(variant, {
        title: pick.title,
        image,
        price_formatted: variant.price_formatted || pick.price_formatted,
        variantTitle: variant.title,
      });
    });
  }

  function renderCartUpsell(cart, remainMajor, currency) {
    if (!cartUpsell || !cartUpsellList) return;
    const hasItems = (cart.items || []).length > 0;
    const picks = hasItems ? pickCartUpsells(cart, remainMajor) : [];
    if (!picks.length) {
      cartUpsell.hidden = true;
      cartUpsellList.innerHTML = "";
      return;
    }

    cartUpsell.hidden = false;
    if (cartUpsellLabel) {
      cartUpsellLabel.textContent = upsellCopy(remainMajor, picks);
    }

    cartUpsellList.innerHTML = "";
    picks.forEach((pick) => {
      const variants = (pick.variants || []).filter(
        (variant) => variant.available !== false,
      );
      if (!variants.length) return;

      const priceLabel = stripMoneyHtml(
        pick.price_formatted || formatMajor(productMajorPrice(pick), currency),
      );
      const image = pick.images?.[0] || "";
      const sizeOptions = variants
        .map(
          (variant, i) =>
            `<option value="${variant.id}" data-price="${variant.price_formatted || priceLabel}"${i === 0 ? " selected" : ""}>${variant.title}</option>`,
        )
        .join("");

      const card = document.createElement("div");
      card.className = "cart-upsell__card";
      card.innerHTML = `
        <img class="cart-upsell__img" src="${image}" alt="">
        <div class="cart-upsell__info">
          <p class="cart-upsell__title">${pick.title}</p>
          <p class="cart-upsell__price" data-upsell-price>${priceLabel}</p>
          ${
            variants.length > 1
              ? `<label class="cart-upsell__size"><span>${i18n.size || "Size"}</span><select data-upsell-size>${sizeOptions}</select></label>`
              : `<input type="hidden" data-upsell-size value="${variants[0].id}">`
          }
        </div>
        <button type="button" class="cart-upsell__add" data-upsell-add>${i18n.upsell_add || "Add"}</button>
      `;
      bindUpsellCard(card, pick);
      cartUpsellList.appendChild(card);
    });

    if (!cartUpsellList.children.length) {
      cartUpsell.hidden = true;
    }
  }

  async function changeLine(line, quantity) {
    const nextQty = Math.max(0, Number(quantity) || 0);
    if (isPreview) {
      const cart = await getCart();
      if (nextQty <= 0) {
        cart.items = (cart.items || []).filter((item) => item.key !== line.key);
      } else {
        const item = (cart.items || []).find((item) => item.key === line.key);
        if (item) item.quantity = nextQty;
      }
      cart.item_count = (cart.items || []).reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      cart.currency = cart.currency || data.currency || "CZK";
      cart.total_price = (cart.items || []).reduce((sum, item) => {
        const unit =
          typeof item.price === "number"
            ? item.price
            : crownsFromFormatted(item.price_formatted) * 100;
        return sum + unit * (Number(item.quantity) || 1);
      }, 0);
      savePreviewCart(cart);
      renderCart();
      return;
    }
    await fetch("/cart/change.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: line.key, quantity: nextQty }),
    });
    renderCart();
  }

  async function addVariantToCart(variant, meta = {}) {
    if (!variant?.id || variant.available === false) return;
    const title = meta.title || product()?.title || "";
    const image = meta.image || product()?.images?.[0] || "";
    const price =
      variant.price_formatted ||
      meta.price_formatted ||
      product()?.price_formatted ||
      "";
    const sizeLabel = variant.title || meta.variantTitle || "";
    if (isPreview) {
      const cart = await getCart();
      const existing = (cart.items || []).find(
        (item) => String(item.id) === String(variant.id),
      );
      if (existing) existing.quantity += 1;
      else {
        const owner =
          products.find((item) =>
            (item.variants || []).some(
              (entry) => String(entry.id) === String(variant.id),
            ),
          ) || null;
        const unitCents =
          typeof variant.price === "number"
            ? variant.price
            : crownsFromFormatted(price) * 100;
        cart.items.push({
          key: String(variant.id),
          id: variant.id,
          variant_id: variant.id,
          product_id: owner?.id,
          title: sizeLabel ? `${title} / ${sizeLabel}` : title,
          quantity: 1,
          image,
          price: unitCents,
          price_formatted: price,
        });
      }
      cart.item_count = cart.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      cart.currency = cart.currency || data.currency || "CZK";
      cart.total_price = (cart.items || []).reduce((sum, item) => {
        const unit =
          typeof item.price === "number"
            ? item.price
            : crownsFromFormatted(item.price_formatted) * 100;
        return sum + unit * (Number(item.quantity) || 1);
      }, 0);
      savePreviewCart(cart);
      toggleCart(true);
      return;
    }
    await fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: Number(variant.id), quantity: 1 }),
    });
    toggleCart(true);
  }

  async function addToCart() {
    const variant = selectedVariant();
    if (!variant?.available) return;
    await addVariantToCart(variant, { title: product()?.title });
  }

  document.addEventListener("click", (event) => {
    const sizeBtn = event.target.closest("[data-grid-add]");
    if (!sizeBtn || sizeBtn.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const card = sizeBtn.closest("[data-grid-card]");
    addVariantToCart(
      {
        id: sizeBtn.dataset.variantId,
        title: sizeBtn.dataset.variantTitle || sizeBtn.textContent.trim(),
        available: true,
        price_formatted: sizeBtn.dataset.variantPrice || "",
      },
      {
        title: card?.dataset.gridTitle || "",
        image: card?.dataset.gridImage || "",
        price_formatted: sizeBtn.dataset.variantPrice || "",
        variantTitle: sizeBtn.dataset.variantTitle || sizeBtn.textContent.trim(),
      },
    );
  });

  const wheel = document.querySelector(".wheel");
  const clearWheelPress = () => {
    wheel
      ?.querySelectorAll(".is-pressed")
      .forEach((el) => el.classList.remove("is-pressed"));
  };
  wheel?.addEventListener("pointerdown", (event) => {
    const btn = event.target.closest("button");
    if (!btn || !wheel.contains(btn)) return;
    clearWheelPress();
    btn.classList.add("is-pressed");
  });
  window.addEventListener("pointerup", clearWheelPress);
  window.addEventListener("pointercancel", clearWheelPress);

  let wheelLocked = false;
  let wheelUnlockTimer = 0;
  const WHEEL_LOCK_MS = 620;

  function stageBlocksWheel() {
    return (
      cartOverlay?.classList.contains("is-open") ||
      menu?.classList.contains("is-open") ||
      legalsOverlay?.classList.contains("is-open") ||
      root.classList.contains("is-info")
    );
  }

  window.addEventListener(
    "wheel",
    (event) => {
      if (root.classList.contains("is-intro")) return;
      if (stageBlocksWheel()) return;
      if (!products.length) return;
      const dx = event.deltaX;
      const dy = event.deltaY;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      event.preventDefault();
      if (wheelLocked) return;
      wheelLocked = true;
      window.clearTimeout(wheelUnlockTimer);
      wheelUnlockTimer = window.setTimeout(() => {
        wheelLocked = false;
      }, WHEEL_LOCK_MS);
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      step(delta > 0 ? 1 : -1);
    },
    { passive: false },
  );

  document.querySelector("[data-prev]")?.addEventListener("click", () => {
    if (root.classList.contains("is-intro")) return;
    if (cartOverlay?.classList.contains("is-open")) return;
    if (menu?.classList.contains("is-open")) {
      setMenuIndex(activeMenuIndex() - 1);
      return;
    }
    if (legalsOverlay?.classList.contains("is-open")) return scrollLegals(-1);
    if (detail) return step(-1);
    step(-1);
  });
  document.querySelector("[data-next]")?.addEventListener("click", () => {
    if (root.classList.contains("is-intro")) return;
    if (cartOverlay?.classList.contains("is-open")) return;
    if (menu?.classList.contains("is-open")) {
      setMenuIndex(activeMenuIndex() + 1);
      return;
    }
    if (legalsOverlay?.classList.contains("is-open")) return scrollLegals(1);
    if (detail) return step(1);
    step(1);
  });
  document.querySelector("[data-down]")?.addEventListener("click", () => {
    if (root.classList.contains("is-intro")) return;
    if (cartOverlay?.classList.contains("is-open")) return;
    if (menu?.classList.contains("is-open")) {
      setMenuIndex(activeMenuIndex() + 1);
      return;
    }
    if (legalsOverlay?.classList.contains("is-open")) return scrollLegals(1);
    if (!detail) return;
    stepProduct(1);
  });
  document.querySelector("[data-select]")?.addEventListener("click", () => {
    if (root.classList.contains("is-intro")) return;
    if (menu?.classList.contains("is-open")) return activateMenuItem();
    if (cartOverlay?.classList.contains("is-open")) return toggleCart(false);
    if (infoOverlay?.classList.contains("is-open")) {
      copyOpen = false;
      syncDetail();
      return;
    }
    if (legalsOverlay?.classList.contains("is-open")) {
      const back = legalsOverlay.querySelector("[data-legals-back]");
      if (back && !back.hasAttribute("hidden")) {
        showLegalsHub();
        legalsOverlay.scrollTop = 0;
        return;
      }
      return toggleLegals(false);
    }
    const pageScope = document.querySelector("[data-legals-page]");
    if (pageScope) {
      const back = pageScope.querySelector("[data-legals-back]");
      if (back && !back.hasAttribute("hidden")) {
        showLegalsHub();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }
    if (detail) return;
    openDetail();
  });
  document.querySelector("[data-menu-btn]")?.addEventListener("click", () => {
    if (root.classList.contains("is-intro")) return;
    if (cartOverlay?.classList.contains("is-open")) return toggleCart(false);
    if (infoOverlay?.classList.contains("is-open")) {
      copyOpen = false;
      syncDetail();
      return;
    }
    if (legalsOverlay?.classList.contains("is-open")) {
      toggleMenu();
      return;
    }
    if (detail) return closeDetail();
    toggleMenu();
  });
  document.querySelectorAll("[data-open-cart]").forEach((el) => {
    el.addEventListener("click", () => toggleCart(true));
  });
  document
    .querySelector("[data-close-cart]")
    ?.addEventListener("click", () => toggleCart(false));
  cartOverlay?.addEventListener("click", (event) => {
    if (event.target === cartOverlay) toggleCart(false);
  });
  document.querySelectorAll("[data-open-legals]").forEach((el) => {
    el.addEventListener("click", () => toggleLegals(true));
  });
  document
    .querySelector("[data-close-legals]")
    ?.addEventListener("click", () => toggleLegals(false));
  document.querySelectorAll("[data-legals-back]").forEach((el) => {
    el.addEventListener("click", () => {
      showLegalsHub();
      if (legalsOverlay?.classList.contains("is-open")) {
        legalsOverlay.scrollTop = 0;
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
  document.querySelectorAll("[data-legals-open]").forEach((el) => {
    el.addEventListener("click", () => {
      openLegalsDoc(el.getAttribute("data-legals-open"));
    });
  });

  menuItems().forEach((el, i) => {
    el.addEventListener("pointerenter", () => {
      if (!menu?.classList.contains("is-open")) return;
      setMenuIndex(i);
    });
  });

  productItems.forEach((el, i) => {
    el.addEventListener("click", () => {
      if (detail) return;
      if (ignoreClick) {
        ignoreClick = false;
        return;
      }
      if (i !== index) {
        setIndex(i);
        return;
      }
      openDetail();
    });
  });

  sizeSelect?.addEventListener("change", updateAtc);
  atcBtn?.addEventListener("click", addToCart);
  stickyAtcBtn?.addEventListener("click", addToCart);
  detailBack?.addEventListener("click", () => {
    if (detail) closeDetail();
  });
  moreBtn?.addEventListener("click", () => {
    copyOpen = !copyOpen;
    syncDetail();
    if (isMobileInfo()) return;
    refreshUnit();
    if (detail) setImageIndex(imageIndex, true);
    document.querySelector(".coverflow")?.scrollTo({ top: 0 });
  });
  document
    .querySelector("[data-close-info]")
    ?.addEventListener("click", () => {
      copyOpen = false;
      syncDetail();
    });
  infoOverlay?.addEventListener("click", (event) => {
    if (event.target === infoOverlay) {
      copyOpen = false;
      syncDetail();
    }
  });
  checkoutBtn?.addEventListener("click", () => {
    if (isPreview) {
      checkoutBtn.textContent =
        i18n.preview_checkout || "Upload this theme to Shopify to checkout.";
      return;
    }
    window.location.href = "/checkout";
  });

  function settleFromDrag() {
    track.classList.remove("is-dragging");
    if (dragAxis !== "y" && Math.abs(dragX) > DRAG_STEP) step(dragX < 0 ? 1 : -1);
    else if (detail) setImageIndex(imageIndex);
    else setIndex(index);
    dragX = 0;
    dragging = false;
    dragAxis = null;
  }

  track?.addEventListener(
    "click",
    (event) => {
      if (!ignoreClick) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
  track?.addEventListener("pointerdown", (event) => {
    if (event.button && event.button !== 0) return;
    if (root.classList.contains("is-info") && !isMobileInfo()) return;
    if (detail && productImages().length < 2) return;
    dragArmed = true;
    dragging = false;
    dragAxis = null;
    startX = event.clientX;
    startY = event.clientY;
    dragX = 0;
    if (!(detail && isMobileInfo())) {
      track.setPointerCapture(event.pointerId);
    }
  });
  track?.addEventListener("pointermove", (event) => {
    if (!dragArmed || dragAxis === "y") return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (detail && isMobileInfo() && !dragAxis) {
      if (Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        dragAxis = "y";
        dragArmed = false;
        dragging = false;
        dragX = 0;
        return;
      }
      dragAxis = "x";
      try {
        track.setPointerCapture(event.pointerId);
      } catch (_) {
        /* ignore */
      }
    }

    dragX = dx;
    if (!dragging && Math.abs(dragX) < DRAG_START) return;
    dragging = true;
    track.classList.add("is-dragging");
    const list = activeItems();
    const center = detail ? imageIndex : index;
    list.forEach((el, i) => {
      cancelMove(el);
      writePose(
        el,
        loopOffset(i, center, list.length) * unit() + dragX,
        itemScale(i === center),
      );
    });
  });
  track?.addEventListener("pointerup", () => {
    if (!dragArmed && dragAxis !== "x") {
      dragAxis = null;
      return;
    }
    dragArmed = false;
    if (dragging) {
      ignoreClick = true;
      settleFromDrag();
      window.setTimeout(() => {
        ignoreClick = false;
      }, 400);
      return;
    }
    dragging = false;
    dragX = 0;
    dragAxis = null;
  });
  track?.addEventListener("pointercancel", () => {
    if (!dragArmed && dragAxis !== "x") {
      dragAxis = null;
      return;
    }
    dragArmed = false;
    if (dragging) settleFromDrag();
    else {
      dragging = false;
      dragX = 0;
      dragAxis = null;
    }
  });

  window.addEventListener("popstate", () => {
    if (ignoreDetailPop) {
      ignoreDetailPop = false;
      return;
    }
    if (detail) closeDetail({ fromPop: true });
  });

  window.addEventListener("keydown", (event) => {
    if (root.classList.contains("is-intro")) return;
    if (menu?.classList.contains("is-open")) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setMenuIndex(activeMenuIndex() - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setMenuIndex(activeMenuIndex() + 1);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        activateMenuItem();
      }
      if (event.key === "Escape") toggleMenu(false);
      return;
    }
    if (event.key === "ArrowLeft") step(-1, true);
    if (event.key === "ArrowRight") step(1, true);
    if (event.key === "ArrowDown") {
      if (!detail) return;
      event.preventDefault();
      stepProduct(1);
    }
    if (event.key === "Enter" && !detail) openDetail();
    if (event.key === "Escape") {
      toggleCart(false);
      toggleLegals(false);
      toggleMenu(false);
      if (infoOverlay?.classList.contains("is-open")) {
        copyOpen = false;
        syncDetail();
        return;
      }
      if (detail) closeDetail();
    }
  });

  window.addEventListener("resize", () => {
    refreshUnit();
    syncMobileDetailChrome();
    if (copyOpen) syncDetail();
    if (detail) setImageIndex(imageIndex, true);
    else setIndex(index, true);
  });

  if (detail) {
    productItems.forEach((el) => {
      el.style.opacity = "1";
    });
    setIndex(index, true);
    openDetail();
    root.classList.add("is-stage-in");
  } else {
    const visible = productItems.filter((el, i) => {
      return Math.abs(loopOffset(i, index, productItems.length)) <= 1;
    });
    visible.forEach((el) => {
      const img = el.querySelector("img");
      if (!img) return;
      img.loading = "eager";
      img.decoding = "async";
    });
    const hero = productItems[index]?.querySelector("img");
    if (hero) hero.fetchPriority = "high";
    const imgs = visible.map((el) => el.querySelector("img")).filter(Boolean);
    Promise.all([whenImagesReady(imgs), stageReady]).then(() => {
      refreshUnit();
      playIntro();
    });
  }
  renderCart();
})();
