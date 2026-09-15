(function () {
  if (document.documentElement.getAttribute("data-slides-host") === "off") return;
  if (window.Reveal || document.querySelector(".reveal .slides")) return;
  if (document.querySelector("#impress") || typeof window.impress === "function") return;
  if (document.getElementById("slide-num") && document.querySelector(".picker-grid")) return;

  const PREVIEW_W = 1280;
  const PREVIEW_H = 800;

  function findSlides() {
    const scoped = document.querySelectorAll("#deck > .slide, .deck > .slide, [data-slides] > .slide");
    if (scoped.length >= 2) {
      return { root: scoped[0].parentElement, slides: Array.from(scoped) };
    }
    const sections = document.querySelectorAll("#deck > section, .deck > section");
    if (sections.length >= 2) {
      return { root: sections[0].parentElement, slides: Array.from(sections) };
    }
    const all = Array.from(document.querySelectorAll(".slide"));
    if (
      all.length >= 2 &&
      all[0].parentElement &&
      all.every((el) => el.parentElement === all[0].parentElement)
    ) {
      return { root: all[0].parentElement, slides: all };
    }
    return null;
  }

  function slideTitle(slide) {
    const heading = slide.querySelector("h1, h2, h3, [data-slide-title]");
    const text = (heading?.textContent || slide.textContent || "Slide").replace(/\s+/g, " ").trim();
    return text.length > 42 ? `${text.slice(0, 40)}…` : text || "Slide";
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, "");
    if (!raw || raw.startsWith("/")) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }

  function boot() {
    const found = findSlides();
    if (!found || !found.root) return;

    const slides = found.slides;
    const root = found.root;
    root.classList.add("slides-host-root");
    document.documentElement.classList.add("slides-host-on");
    slides.forEach((slide) => slide.setAttribute("data-slides-host-slide", ""));

    const nav = document.createElement("nav");
    nav.className = "slides-host-nav";
    nav.setAttribute("aria-label", "Slide controls");
    nav.innerHTML =
      '<button type="button" data-slides-prev aria-label="Previous slide">←</button>' +
      '<button type="button" data-slides-next aria-label="Next slide">→</button>';

    const hint = document.createElement("p");
    hint.className = "slides-host-hint";
    hint.textContent = "← → · space · swipe · #";

    const numBtn = document.createElement("button");
    numBtn.type = "button";
    numBtn.className = "slides-host-num";
    numBtn.setAttribute("aria-label", "Open slide picker");
    numBtn.setAttribute("aria-haspopup", "dialog");

    const picker = document.createElement("div");
    picker.className = "slides-host-picker";
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-modal", "true");
    picker.setAttribute("aria-labelledby", "slides-host-picker-title");
    picker.hidden = true;
    picker.innerHTML =
      '<div class="slides-host-picker-panel">' +
      '<div class="slides-host-picker-header">' +
      '<h2 id="slides-host-picker-title">Jump to slide</h2>' +
      '<button type="button" class="slides-host-picker-close">Esc · Close</button>' +
      "</div>" +
      '<div class="slides-host-picker-grid"></div>' +
      "</div>";

    document.body.append(nav, hint, numBtn, picker);

    const pickerGrid = picker.querySelector(".slides-host-picker-grid");
    const pickerClose = picker.querySelector(".slides-host-picker-close");
    let index = 0;
    let pickerBuilt = false;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function updateHash(i) {
      const next = `#${i + 1}`;
      if (location.hash !== next) {
        history.replaceState(null, "", next);
      }
    }

    function show(nextIndex, fromUser) {
      const next = ((nextIndex % slides.length) + slides.length) % slides.length;
      slides.forEach((slide, n) => {
        slide.classList.toggle("slides-host-active", n === next);
      });
      index = next;
      numBtn.textContent = `${index + 1} / ${slides.length}`;
      if (fromUser !== false) updateHash(index);
    }

    function syncThumbScales() {
      pickerGrid.querySelectorAll(".slides-host-thumb").forEach((thumb) => {
        const scaleWrap = thumb.querySelector(".slides-host-scale");
        if (!scaleWrap) return;
        const width = thumb.clientWidth || 160;
        const height = thumb.clientHeight || (width * PREVIEW_H) / PREVIEW_W;
        const scale = Math.min(width / PREVIEW_W, height / PREVIEW_H);
        scaleWrap.style.transform = `scale(${scale})`;
      });
    }

    function buildPicker() {
      pickerGrid.innerHTML = "";
      slides.forEach((slide, n) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "slides-host-picker-item";
        item.dataset.index = String(n);
        item.setAttribute("aria-label", `Go to slide ${n + 1}: ${slideTitle(slide)}`);

        const label = document.createElement("div");
        label.className = "slides-host-picker-label";
        label.innerHTML = `<span>${n + 1}</span><span class="title"></span>`;
        label.querySelector(".title").textContent = slideTitle(slide);

        const thumb = document.createElement("div");
        thumb.className = "slides-host-thumb";
        const frame = document.createElement("div");
        frame.className = "slides-host-frame";
        const scaleWrap = document.createElement("div");
        scaleWrap.className = "slides-host-scale";
        const clone = slide.cloneNode(true);
        clone.classList.remove("slides-host-active", "active");
        scaleWrap.appendChild(clone);
        frame.appendChild(scaleWrap);
        thumb.appendChild(frame);
        item.append(label, thumb);
        item.addEventListener("click", () => {
          closePicker();
          show(n);
        });
        pickerGrid.appendChild(item);
      });
      pickerBuilt = true;
      syncThumbScales();
    }

    function openPicker() {
      picker.hidden = false;
      picker.classList.add("open");
      if (!pickerBuilt) buildPicker();
      pickerGrid.querySelectorAll(".slides-host-picker-item").forEach((el) => {
        el.classList.toggle("current", Number(el.dataset.index) === index);
      });
      const current = pickerGrid.querySelector(".slides-host-picker-item.current");
      requestAnimationFrame(() => {
        syncThumbScales();
        current?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
      });
      pickerClose.focus();
    }

    function closePicker() {
      picker.classList.remove("open");
      picker.hidden = true;
      numBtn.focus();
    }

    nav.querySelector("[data-slides-prev]").addEventListener("click", () => show(index - 1));
    nav.querySelector("[data-slides-next]").addEventListener("click", () => show(index + 1));
    numBtn.addEventListener("click", openPicker);
    pickerClose.addEventListener("click", closePicker);
    picker.addEventListener("click", (e) => {
      if (e.target === picker) closePicker();
    });

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTarget = null;

    root.addEventListener(
      "touchstart",
      (e) => {
        if (picker.classList.contains("open")) return;
        const t = e.changedTouches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchStartTarget = e.target;
      },
      { passive: true },
    );

    root.addEventListener(
      "touchend",
      (e) => {
        if (picker.classList.contains("open")) return;
        if (touchStartTarget?.closest?.("a, button, input, textarea, select")) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        if (Math.abs(dx) < 50) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
        if (dx < 0) show(index + 1);
        else show(index - 1);
      },
      { passive: true },
    );

    document.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target.isContentEditable) {
          return;
        }
      }
      if (picker.classList.contains("open")) {
        if (e.key === "Escape") {
          e.preventDefault();
          closePicker();
        }
        return;
      }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        show(index + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        show(index - 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        show(0);
      } else if (e.key === "End") {
        e.preventDefault();
        show(slides.length - 1);
      } else if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        openPicker();
      }
    });

    window.addEventListener("hashchange", () => {
      const n = parseHash();
      if (n && n >= 1 && n <= slides.length) show(n - 1, false);
    });

    window.addEventListener("resize", () => {
      if (pickerBuilt) syncThumbScales();
    });

    const fromHash = parseHash();
    if (fromHash && fromHash >= 1 && fromHash <= slides.length) show(fromHash - 1, false);
    else show(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
