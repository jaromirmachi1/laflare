(() => {
  const root = document.body;
  const dataEl = document.getElementById("StageData");
  if (!dataEl) return;

  const data = JSON.parse(dataEl.textContent);
  const products = data.products || [];
  const i18n = data.i18n || {};
  const isPreview = data.preview === true;

  const titleEl = document.querySelector("[data-product-title]");
  const track = document.querySelector("[data-track]");
  const productItems = [...document.querySelectorAll("[data-item]")];
  const detailBar = document.querySelector("[data-detail]");
  const sizeSelect = document.querySelector("[data-size]");
  const priceEl = document.querySelector("[data-price]");
  const atcBtn = document.querySelector("[data-atc]");
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
  const checkoutBtn = document.querySelector("[data-checkout]");

  let index = Math.max(
    0,
    products.findIndex((p) => p.handle === data.initialHandle),
  );
  if (index < 0) index = 0;
  let detail = Boolean(data.openDetail);
  let imageIndex = 0;
  let galleryItems = [];
  let copyOpen = false;
  let dragX = 0;
  let startX = 0;
  let dragArmed = false;
  let dragging = false;
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
      .trim();
  }

  function formatMoney(centsOrString) {
    if (product()?.price_formatted)
      return stripMoneyHtml(product().price_formatted);
    const n = Number(centsOrString);
    if (Number.isNaN(n)) return stripMoneyHtml(centsOrString);
    return `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
  }

  function formatCrowns(crowns) {
    return `${Math.round(Number(crowns) || 0).toLocaleString("cs-CZ")} Kč`;
  }

  function crownsFromFormatted(value) {
    return Number(String(value || "").replace(/[^\d]/g, "")) || 0;
  }

  function cartTotalCrowns(cart) {
    if (typeof cart.total_price === "number") {
      return Math.round(cart.total_price / 100);
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

  function positionItems(list, center, instant) {
    const max = list.length;
    if (!max) return;
    if (copyOpen && detail && list === galleryItems) {
      list.forEach((el, i) => {
        cancelMove(el);
        el.dataset.offset = "0";
        el.style.zIndex = "";
        el.style.willChange = "";
        writePose(el, 0, 1);
        el.classList.toggle("is-current", i === 0);
        el.tabIndex = 0;
        el.setAttribute("aria-hidden", "false");
      });
      return;
    }
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
      history.replaceState(null, "", current.url);
    }
  }

  function setImageIndex(next, fromDrag) {
    const imgs = productImages();
    if (!imgs.length) return;
    const max = imgs.length;
    imageIndex = ((next % max) + max) % max;
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
      btn.style.opacity = "1";
      const img = document.createElement("img");
      img.src = /[?&]width=/.test(src)
        ? src
        : `${src}${src.includes("?") ? "&" : "?"}width=1200`;
      img.alt = current.title;
      img.width = 700;
      img.height = 700;
      if (i === 0) img.fetchPriority = "high";
      else img.loading = "lazy";
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

  function syncDetail() {
    const current = product();
    root.classList.toggle("is-detail", detail);
    root.classList.toggle("is-info", detail);
    syncWheelNavLabel();
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
    if (!atcBtn) return;
    atcBtn.disabled = !available;
    atcBtn.textContent = available
      ? i18n.add || "Add to cart"
      : i18n.sold_out || "Sold out";
  }

  function openDetail() {
    detail = true;
    copyOpen = true;
    refreshUnit();
    buildGallery();
    syncDetail();
    if (!isPreview && product()) {
      history.replaceState(null, "", product().url);
    }
  }

  function closeDetail() {
    detail = false;
    copyOpen = false;
    stepToken += 1;
    releaseStageMotion();
    clearGallery();
    refreshUnit();
    setIndex(index);
    syncDetail();
    if (!isPreview) history.replaceState(null, "", data.shopUrl || "/");
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
    if (cartEmpty) cartEmpty.hidden = itemsList.length > 0;
    if (checkoutBtn) checkoutBtn.hidden = itemsList.length === 0;
    if (cartTotal) cartTotal.hidden = itemsList.length === 0;
    if (cartTotalValue && itemsList.length > 0) {
      cartTotalValue.textContent = formatCrowns(cartTotalCrowns(cart));
    }
    itemsList.forEach((line) => {
      const qty = Number(line.quantity) || 1;
      const priceLabel = stripMoneyHtml(
        line.price_formatted ||
          formatMoney((line.final_price || line.price || 0) / 100),
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

  async function addToCart() {
    const variant = selectedVariant();
    if (!variant?.available) return;
    const current = product();
    if (isPreview) {
      const cart = await getCart();
      const existing = (cart.items || []).find(
        (item) => item.id === variant.id,
      );
      if (existing) existing.quantity += 1;
      else {
        cart.items.push({
          key: String(variant.id),
          id: variant.id,
          title: `${current.title} / ${variant.title}`,
          quantity: 1,
          image: current.images?.[0] || "",
          price_formatted: variant.price_formatted || current.price_formatted,
        });
      }
      cart.item_count = cart.items.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
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
    if (cartOverlay?.classList.contains("is-open")) return;
    if (menu?.classList.contains("is-open")) {
      setMenuIndex(activeMenuIndex() - 1);
      return;
    }
    if (legalsOverlay?.classList.contains("is-open")) return scrollLegals(-1);
    if (root.classList.contains("is-info")) return scrollInfo(-1);
    step(-1);
  });
  document.querySelector("[data-next]")?.addEventListener("click", () => {
    if (cartOverlay?.classList.contains("is-open")) return;
    if (menu?.classList.contains("is-open")) {
      setMenuIndex(activeMenuIndex() + 1);
      return;
    }
    if (legalsOverlay?.classList.contains("is-open")) return scrollLegals(1);
    if (root.classList.contains("is-info")) return scrollInfo(1);
    step(1);
  });
  document.querySelector("[data-down]")?.addEventListener("click", () => {
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
    if (Math.abs(dragX) > DRAG_STEP) step(dragX < 0 ? 1 : -1);
    else if (detail) setImageIndex(imageIndex);
    else setIndex(index);
    dragX = 0;
    dragging = false;
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
    if (root.classList.contains("is-info")) return;
    if (detail && productImages().length < 2) return;
    dragArmed = true;
    dragging = false;
    startX = event.clientX;
    dragX = 0;
    track.setPointerCapture(event.pointerId);
  });
  track?.addEventListener("pointermove", (event) => {
    if (!dragArmed) return;
    dragX = event.clientX - startX;
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
    if (!dragArmed) return;
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
  });
  track?.addEventListener("pointercancel", () => {
    if (!dragArmed) return;
    dragArmed = false;
    if (dragging) settleFromDrag();
    else {
      dragging = false;
      dragX = 0;
    }
  });

  window.addEventListener("keydown", (event) => {
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
    whenImagesReady(imgs).then(playIntro);
  }
  renderCart();
})();
