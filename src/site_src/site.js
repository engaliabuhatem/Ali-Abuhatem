(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const DATA = JSON.parse($("#site-data").textContent);
  const root = document.documentElement;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };
  let lenis = null;

  /* ---------------------------------------------------------------- theme */
  if (DATA.persistTheme) {
    const saved = store.get("ah-theme");
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  }
  const theme = () => root.getAttribute("data-theme") ||
    (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  const emitTheme = () => document.dispatchEvent(new CustomEvent("themechange"));
  $("#theme-toggle").addEventListener("click", () => {
    const next = theme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    if (DATA.persistTheme) store.set("ah-theme", next);
    emitTheme();
  });
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", emitTheme);
  new MutationObserver(emitTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  /* ---------------------------------------------------------------- toast */
  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 3200);
  }

  /* ---------------------------------------------------------------- copy email */
  $("#copy-email").addEventListener("click", (e) => {
    const text = e.currentTarget.dataset.copy;
    const fallback = () => {
      const sel = getSelection();
      const range = document.createRange();
      range.selectNodeContents($("#email"));
      sel.removeAllRanges();
      sel.addRange(range);
      toast("Email selected. Press Ctrl+C or Cmd+C to copy.");
    };
    try {
      navigator.clipboard.writeText(text).then(() => toast("Email copied: " + text), fallback);
    } catch (err) { fallback(); }
  });

  /* ---------------------------------------------------------------- downloads */
  // Inside the claude.ai viewer, files are offered through the downloads capability.
  // Anywhere else (self-hosted), the links are ordinary links to the PDFs.
  const inViewer = !!(window.claude && typeof window.claude.use === "function");
  const downloads = inViewer ? window.claude.use("downloads").catch(() => null) : Promise.resolve(null);
  async function offerFile(href, filename) {
    if (!inViewer) { window.open(href, "_blank", "noopener"); return; }
    const dl = await downloads;
    if (!dl) {
      if (window.top === window.self) { location.assign(href); return; }
      toast("Downloads aren't available in this view. Email " + DATA.person.email + " for a copy.");
      return;
    }
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error("missing file");
      await dl.save({ filename, data: await res.blob() });
      toast("Saved " + filename);
    } catch (err) {
      const code = err && err.code;
      if (code === "declined") return;
      if (code === "rate_limited") { toast("A save prompt is already open."); return; }
      toast("Couldn't save " + filename + ". Email " + DATA.person.email + " for a copy.");
    }
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-download]");
    if (!a || !inViewer) return; // self-hosted: let the browser follow the link
    e.preventDefault();
    offerFile(a.getAttribute("href"), a.dataset.download);
  });

  /* ---------------------------------------------------------------- scramble text */
  const GLYPHS = "<>/{}[]=+*_-#01$%&";
  function prepScramble(el) {
    if (el.querySelector(".scr")) return el.querySelector(".scr");
    const text = el.textContent.trim();
    el.textContent = "";
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = text;
    const vis = document.createElement("span");
    vis.className = "scr";
    vis.setAttribute("aria-hidden", "true");
    vis.textContent = text;
    el.append(sr, vis);
    return vis;
  }
  function scramble(vis, duration = 850) {
    if (reduceMotion || vis.dataset.busy) return;
    const original = vis.dataset.text || (vis.dataset.text = vis.textContent);
    vis.dataset.busy = "1";
    const len = original.length;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const settled = Math.floor(p * p * len);
      let out = "";
      for (let i = 0; i < len; i++) {
        const ch = original[i];
        out += i < settled || ch === " " ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      vis.textContent = out;
      if (p < 1) requestAnimationFrame(step);
      else { vis.textContent = original; delete vis.dataset.busy; }
    };
    requestAnimationFrame(step);
  }
  const headObserver = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { scramble(en.target.querySelector(".scr"), 900); headObserver.unobserve(en.target); }
    });
  }, { threshold: 0.6 });
  $$("[data-scramble]").forEach((el) => { prepScramble(el); headObserver.observe(el); });
  if (finePointer) {
    $$("[data-scramble-hover]").forEach((el) => {
      const vis = prepScramble(el);
      el.style.minWidth = el.getBoundingClientRect().width + "px";
      el.addEventListener("mouseenter", () => scramble(vis, 420));
    });
  }

  /* ---------------------------------------------------------------- nav */
  const nav = $(".nav");
  const menuBtn = $("#menu-btn");
  const menu = $("#mobile-menu");
  const setMenu = (open) => {
    menu.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (lenis) open ? lenis.stop() : lenis.start();
  };
  menuBtn.addEventListener("click", () => setMenu(!menu.classList.contains("is-open")));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.classList.contains("is-open")) setMenu(false); });
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (menu.classList.contains("is-open")) setMenu(false);
    if (id.length < 2) { if (lenis) { e.preventDefault(); lenis.scrollTo(0); } return; }
    const target = document.querySelector(id);
    if (!target) return;
    if (lenis) {
      e.preventDefault();
      lenis.scrollTo(target, { offset: -(nav.offsetHeight + 12), duration: 1.2 });
    }
  });
  const crumb = $("[data-crumb]", nav);
  const navLinks = $$(".nav-links a");
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const path = en.target.dataset.crumb || "";
      crumb.textContent = path;
      const id = "#" + en.target.id;
      navLinks.forEach((l) => l.setAttribute("aria-current", String(l.getAttribute("href") === id)));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("section[data-crumb]").forEach((s) => sectionObserver.observe(s));
  const heroSection = $(".hero");
  new IntersectionObserver(([en]) => {
    if (en.isIntersecting) { crumb.textContent = ""; navLinks.forEach((l) => l.setAttribute("aria-current", "false")); }
  }, { rootMargin: "-45% 0px -50% 0px" }).observe(heroSection);
  const onScroll = () => nav.classList.toggle("is-scrolled", scrollY > 8);
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------------------------------------------------------- featured screens */
  $$(".featured").forEach((art) => {
    const screens = $$("[data-screen]", art);
    const showBtns = $$("[data-show]", art);
    showBtns.forEach((b) => b.addEventListener("click", () => {
      const idx = Number(b.dataset.show);
      showBtns.forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      screens.forEach((s) => {
        const front = Number(s.dataset.screen) === idx;
        s.classList.toggle("front", front);
        s.classList.toggle("back", !front);
      });
    }));
  });

  /* ---------------------------------------------------------------- case-study dialogs */
  function openCase(id) {
    const dlg = document.getElementById(id);
    if (!dlg) return false;
    $$("img[data-src]", dlg).forEach((img) => { img.src = img.dataset.src; img.removeAttribute("data-src"); });
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
    if (lenis) lenis.stop();
    return true;
  }
  $$("[data-open]").forEach((btn) => btn.addEventListener("click", () => openCase(btn.dataset.open)));
  $$("dialog.case").forEach((dlg) => {
    dlg.setAttribute("data-lenis-prevent", "");
    dlg.addEventListener("close", () => { if (lenis) lenis.start(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    $("[data-close]", dlg).addEventListener("click", () => dlg.close());
  });

  /* ---------------------------------------------------------------- stack layers <-> plates */
  const plates = $$("[data-plate]");
  const layers = $$(".layer");
  const activate = (i) => {
    plates.forEach((p) => p.classList.toggle("is-active", p.dataset.plate === String(i)));
    layers.forEach((l) => l.classList.toggle("is-active", l.dataset.layer === String(i)));
  };
  layers.forEach((li) => {
    li.addEventListener("mouseenter", () => activate(li.dataset.layer));
    li.addEventListener("focus", () => activate(li.dataset.layer));
  });
  $(".layers").addEventListener("mouseleave", () => activate(-1));

  /* ---------------------------------------------------------------- pointer niceties */
  if (finePointer && !reduceMotion) {
    $$("[data-tilt]").forEach((el) => {
      const max = parseFloat(el.dataset.tilt) || 6;
      const host = el.closest("[data-tilt-wrap]") || el.parentElement;
      let raf = 0, tx = 0, ty = 0;
      host.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const r = host.getBoundingClientRect();
        tx = (e.clientX - r.left) / r.width - 0.5;
        ty = (e.clientY - r.top) / r.height - 0.5;
        if (!raf) raf = requestAnimationFrame(() => {
          raf = 0;
          el.style.transform = `rotateY(${(tx * max).toFixed(2)}deg) rotateX(${(-ty * max).toFixed(2)}deg)`;
          el.style.setProperty("--gx", ((tx + 0.5) * 100).toFixed(1) + "%");
          el.style.setProperty("--gy", ((ty + 0.5) * 100).toFixed(1) + "%");
        });
      });
      host.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });

    $$("[data-magnetic]").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        b.style.transform = `translate(${(x * 0.16).toFixed(1)}px, ${(y * 0.26).toFixed(1)}px)`;
      });
      b.addEventListener("pointerleave", () => { b.style.transform = ""; });
    });

    const cursor = $(".cursor");
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; cursor.classList.add("is-on"); }, { passive: true });
    document.addEventListener("pointerleave", () => cursor.classList.remove("is-on"));
    document.addEventListener("pointerover", (e) => {
      cursor.classList.toggle("is-hover", !!e.target.closest("a, button, input, [data-tilt], .layer, .term"));
    });
    (function follow() {
      cx += (x - cx) * 0.2;
      cy += (y - cy) * 0.2;
      cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      requestAnimationFrame(follow);
    })();
  }

  /* ---------------------------------------------------------------- hero 3D */
  const SCENES = DATA.scenes;
  const sceneTabs = $$("[data-scene]");
  const sceneCaption = $("#scene-caption");
  const hero3d = initHero();

  function initHero() {
    const host = $("#hero-canvas");
    if (!host || !window.THREE) return null;
    const THREE = window.THREE;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: location.search.indexOf("capture") > -1 });
    } catch (e) { return null; }
    if (!renderer || !renderer.getContext()) return null;
    root.classList.add("has-webgl");

    let ready = false;
    const mobile = innerWidth < 760;
    const COUNT = mobile ? 6500 : 14000;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    camera.position.set(0, 0, 9);
    const group = new THREE.Group();
    scene.add(group);

    // deterministic random
    let seed = 1337;
    const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const dust = (o, i, sx, sy, sz) => { o[i] = (rand() - 0.5) * sx; o[i + 1] = (rand() - 0.5) * sy; o[i + 2] = (rand() - 0.5) * sz; };

    // scene 0: network globe with an orbit
    const R = 1.7;
    function network(n) {
      const o = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = rand(), j = i * 3;
        let x, y, z;
        if (r < 0.52) {
          const k = i + 0.5, phi = Math.acos(1 - 2 * k / n), th = Math.PI * (1 + Math.sqrt(5)) * k;
          x = Math.cos(th) * Math.sin(phi) * R; y = Math.cos(phi) * R; z = Math.sin(th) * Math.sin(phi) * R;
        } else if (r < 0.84) {
          let lat, lon;
          if (rand() < 0.5) { lat = (Math.floor(rand() * 9) - 4) * (Math.PI / 10); lon = rand() * Math.PI * 2; }
          else { lon = Math.floor(rand() * 12) * (Math.PI / 6); lat = (rand() - 0.5) * Math.PI; }
          x = Math.cos(lat) * Math.cos(lon) * R; y = Math.sin(lat) * R; z = Math.cos(lat) * Math.sin(lon) * R;
        } else {
          const a = rand() * Math.PI * 2, rr = R * 1.42 + (rand() - 0.5) * 0.05, tilt = 0.45;
          const yy = (rand() - 0.5) * 0.03, zz = Math.sin(a) * rr;
          x = Math.cos(a) * rr; y = yy * Math.cos(tilt) - zz * Math.sin(tilt); z = yy * Math.sin(tilt) + zz * Math.cos(tilt);
        }
        o[j] = x; o[j + 1] = y; o[j + 2] = z;
      }
      return o;
    }

    // scene 1: the code glyph, sampled from text drawn on a 2D canvas
    function glyph(n) {
      const W = 640, H = 320, c = document.createElement("canvas");
      c.width = W; c.height = H;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = '500 220px "JetBrains Mono", "Martian Mono", ui-monospace, monospace';
      g.fillText("</>", W / 2, H / 2 + 8);
      const px = g.getImageData(0, 0, W, H).data, pts = [];
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (px[(y * W + x) * 4 + 3] > 140) pts.push(x, y);
      const o = new Float32Array(n * 3), m = pts.length / 2, s = 4.3 / W;
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        if (rand() < 0.1 || !m) { dust(o, j, 6, 3.6, 2.2); continue; }
        const q = Math.floor(rand() * m) * 2;
        o[j] = (pts[q] - W / 2 + (rand() - 0.5) * 2) * s;
        o[j + 1] = -(pts[q + 1] - H / 2 + (rand() - 0.5) * 2) * s;
        o[j + 2] = (rand() - 0.5) * 0.42;
      }
      return o;
    }

    // scene 2: four stacked layers in an isometric view
    function stack(n) {
      const o = new Float32Array(n * 3), Wd = 2.75, D = 1.8, ys = [-1.08, -0.36, 0.36, 1.08];
      const ry = 0.74, rx = 0.56, cyr = Math.cos(ry), syr = Math.sin(ry), cxr = Math.cos(rx), sxr = Math.sin(rx);
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        if (rand() < 0.08) { dust(o, j, 6, 4, 2.4); continue; }
        let x, z, y = ys[Math.floor(rand() * 4)];
        if (rand() < 0.34) {
          const t = rand() - 0.5, e = Math.floor(rand() * 4);
          if (e === 0) { x = t * Wd; z = -D / 2; } else if (e === 1) { x = t * Wd; z = D / 2; }
          else if (e === 2) { x = -Wd / 2; z = t * D; } else { x = Wd / 2; z = t * D; }
        } else if (rand() < 0.5) { x = Math.round((rand() - 0.5) * 8) / 8 * Wd; z = (rand() - 0.5) * D; }
        else { x = (rand() - 0.5) * Wd; z = Math.round((rand() - 0.5) * 6) / 6 * D; }
        y += (rand() - 0.5) * 0.02;
        const x1 = x * cyr + z * syr, z1 = -x * syr + z * cyr;
        o[j] = x1; o[j + 1] = y * cxr - z1 * sxr; o[j + 2] = y * sxr + z1 * cxr;
      }
      return o;
    }

    // scene 3: a product — browser window plus a phone
    function rectPerimeter(w, h, t) {
      const p = t * 2 * (w + h);
      if (p < w) return [p - w / 2, h / 2];
      if (p < w + h) return [w / 2, h / 2 - (p - w)];
      if (p < 2 * w + h) return [w / 2 - (p - w - h), -h / 2];
      return [-w / 2, -h / 2 + (p - 2 * w - h)];
    }
    function product(n) {
      const o = new Float32Array(n * 3);
      const BW = 3.3, BH = 2.15, bx = -0.38, by = 0.08;
      const PW = 0.95, PH = 1.9, phx = 1.62, phy = -0.28, phz = 0.5;
      const ry = -0.22, cyr = Math.cos(ry), syr = Math.sin(ry);
      const lines = [[0.0, 1.5], [0.0, 1.15], [0.0, 1.32], [0.0, 0.8]];
      for (let i = 0; i < n; i++) {
        const j = i * 3, r = rand();
        let x, y, z = (rand() - 0.5) * 0.04;
        if (r < 0.07) { dust(o, j, 6.4, 4, 2.4); continue; }
        if (r < 0.66) {
          const q = rand(), L = bx - BW / 2, T = by + BH / 2;
          if (q < 0.3) { [x, y] = rectPerimeter(BW, BH, rand()); x += bx; y += by; }
          else if (q < 0.37) { x = L + rand() * BW; y = T - 0.24; }
          else if (q < 0.42) { const d = Math.floor(rand() * 3), a = rand() * Math.PI * 2; x = L + 0.2 + d * 0.16 + Math.cos(a) * 0.045; y = T - 0.12 + Math.sin(a) * 0.045; }
          else if (q < 0.6) { x = L + 0.28 + rand() * 1.5; y = T - 0.5 - rand() * 0.42; }
          else if (q < 0.82) { const li = Math.floor(rand() * lines.length); x = L + 0.28 + rand() * lines[li][1]; y = T - 1.1 - li * 0.17; }
          else { const k = Math.floor(rand() * 3), cw = 0.86, ch = 0.42; [x, y] = rectPerimeter(cw, ch, rand()); x += L + 0.28 + cw / 2 + k * (cw + 0.12); y += by - BH / 2 + 0.36; }
        } else {
          const q = rand();
          if (q < 0.45) { [x, y] = rectPerimeter(PW, PH, rand()); }
          else if (q < 0.55) { x = (rand() - 0.5) * 0.26; y = PH / 2 - 0.1; }
          else if (q < 0.9) { const li = Math.floor(rand() * 7); x = -PW / 2 + 0.12 + rand() * (PW - 0.24) * (li % 3 === 0 ? 1 : 0.62); y = PH / 2 - 0.36 - li * 0.2; }
          else { const a = rand() * Math.PI * 2; x = Math.cos(a) * 0.1; y = -PH / 2 + 0.14 + Math.sin(a) * 0.1; }
          x += phx; y += phy; z += phz;
        }
        o[j] = x * cyr + z * syr; o[j + 1] = y; o[j + 2] = -x * syr + z * cyr;
      }
      return o;
    }

    const targets = [network(COUNT), network(COUNT), stack(COUNT), product(COUNT)];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(targets[0], 3));
    targets.forEach((t, i) => geo.setAttribute("aP" + i, new THREE.BufferAttribute(t, 3)));
    const rnd = new Float32Array(COUNT * 4);
    for (let i = 0; i < rnd.length; i++) rnd[i] = rand();
    geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 4));
    const buildGlyph = () => {
      const g = glyph(COUNT);
      geo.getAttribute("aP1").array.set(g);
      geo.getAttribute("aP1").needsUpdate = true;
      if (reduceMotion) draw();
    };
    if (document.fonts && document.fonts.load) {
      Promise.race([document.fonts.load('500 220px "JetBrains Mono"'), new Promise((r) => setTimeout(r, 1500))]).then(buildGlyph, buildGlyph);
    } else buildGlyph();

    const uniforms = {
      uTime: { value: 0 }, uFrom: { value: 0 }, uTo: { value: 0 }, uT: { value: 0 },
      uScatter: { value: reduceMotion ? 0 : 2.6 }, uSize: { value: mobile ? 2.6 : 3.0 },
      uPR: { value: renderer.getPixelRatio() }, uOpacity: { value: 1 },
      uMouse: { value: new THREE.Vector3(99, 99, 0) }, uMouseK: { value: 0 },
      uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() }, uC4: { value: new THREE.Color() },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        uniform float uTime, uFrom, uTo, uT, uScatter, uSize, uPR, uMouseK;
        uniform vec3 uMouse, uC1, uC2, uC3, uC4;
        attribute vec3 aP0; attribute vec3 aP1; attribute vec3 aP2; attribute vec3 aP3;
        attribute vec4 aRnd;
        varying vec3 vColor; varying float vAlpha;
        vec3 pick(float i) { return i < 0.5 ? aP0 : (i < 1.5 ? aP1 : (i < 2.5 ? aP2 : aP3)); }
        void main() {
          float d = aRnd.x * 0.42;
          float k = smoothstep(d, d + 0.58, uT);
          vec3 p = mix(pick(uFrom), pick(uTo), k);
          vec3 dir = normalize(aRnd.yzw - 0.5 + 1e-4);
          p += dir * (sin(k * 3.14159) * 0.6 + uScatter * (0.5 + aRnd.x));
          float t = uTime * (0.35 + aRnd.y * 0.5);
          p += 0.022 * vec3(sin(t + aRnd.z * 6.283), cos(t * 1.3 + aRnd.w * 6.283), sin(t * 0.7 + aRnd.x * 6.283));
          vec4 world = modelMatrix * vec4(p, 1.0);
          vec2 toM = world.xy - uMouse.xy;
          float dm = length(toM);
          float push = uMouseK * smoothstep(1.1, 0.0, dm);
          world.xy += normalize(toM + 1e-4) * push * 0.42;
          world.z += push * 0.3;
          vec4 mv = viewMatrix * world;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (0.55 + aRnd.y * 0.9) * uPR * (9.0 / -mv.z);
          float h = clamp(p.y * 0.28 + 0.5, 0.0, 1.0);
          vec3 c = mix(uC1, uC2, h);
          c = mix(c, uC3, step(0.8, aRnd.w));
          c = mix(c, uC4, step(0.965, aRnd.z));
          vColor = c;
          vAlpha = (0.5 + 0.5 * aRnd.x) * smoothstep(-13.0, -6.5, mv.z) + push * 0.5;
        }`,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = pow(smoothstep(0.5, 0.0, d), 1.7) * vAlpha * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    group.add(points);

    // network edges, visible in the first scene only
    const nodes = [];
    for (let i = 0; i < 360; i++) {
      const k = i + 0.5, phi = Math.acos(1 - 2 * k / 360), th = Math.PI * (1 + Math.sqrt(5)) * k;
      nodes.push(new THREE.Vector3(Math.cos(th) * Math.sin(phi) * R, Math.cos(phi) * R, Math.sin(th) * Math.sin(phi) * R));
    }
    const seg = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].distanceTo(nodes[j]) < 0.46 && rand() < 0.55) seg.push(nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
    const lineMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    group.add(lines);

    function applyTheme() {
      const cs = getComputedStyle(root);
      const col = (n) => new THREE.Color(cs.getPropertyValue(n).trim() || "#ffffff");
      const light = theme() === "light";
      uniforms.uC1.value.copy(col("--mint"));
      uniforms.uC2.value.copy(col("--sky"));
      uniforms.uC3.value.copy(col("--lilac"));
      uniforms.uC4.value.copy(col("--amber"));
      material.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      material.needsUpdate = true;
      uniforms.uOpacity.value = light ? 0.95 : 0.9;
      lineMat.color.copy(col("--sky"));
      lineMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
      lineMat.needsUpdate = true;
      if (reduceMotion) draw();
    }
    applyTheme();
    document.addEventListener("themechange", applyTheme);

    let w = 1, h = 1, baseScale = 1;
    function resize() {
      const r = host.getBoundingClientRect();
      w = Math.max(1, r.width); h = Math.max(1, r.height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const fitH = 2 * 9 * Math.tan((camera.fov * Math.PI) / 360);
      const fitW = fitH * camera.aspect;
      baseScale = Math.min(1.12, fitW / 5.4, fitH / 4.6);
      if (reduceMotion) draw();
    }
    new ResizeObserver(resize).observe(host);
    resize();

    // pointer, mapped onto the z = 0 plane
    const mouseNDC = new THREE.Vector2(9, 9);
    let mouseOn = 0;
    if (!reduceMotion) {
      addEventListener("pointermove", (e) => {
        const r = renderer.domElement.getBoundingClientRect();
        mouseNDC.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        mouseOn = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom ? 1 : 0;
      }, { passive: true });
    }
    const ray = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();

    // scene switching
    let current = 0, queued = -1, lastSwitch = performance.now();
    const HOLD = 4600, DUR = 1.7;
    const trans = { active: false, t: 0 };
    let auto = !reduceMotion;
    function setTab(i) {
      sceneTabs.forEach((b) => {
        const on = Number(b.dataset.scene) === i;
        b.setAttribute("aria-selected", String(on));
        const bar = b.querySelector(".bar");
        if (bar && bar.getAnimations) bar.getAnimations().forEach((a) => a.cancel());
        if (on && auto && bar && bar.animate) bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: HOLD + DUR * 1000, easing: "linear", fill: "forwards" });
      });
      sceneCaption.textContent = SCENES[i].caption;
    }
    function go(i) {
      if (i === current && !trans.active) return;
      if (trans.active) { queued = i; setTab(i); return; }
      uniforms.uFrom.value = current;
      uniforms.uTo.value = i;
      trans.active = true;
      trans.t = reduceMotion ? 1 : 0;
      current = i;
      lastSwitch = performance.now();
      setTab(i);
      if (reduceMotion) finish();
    }
    function finish() {
      trans.active = false;
      uniforms.uFrom.value = uniforms.uTo.value;
      uniforms.uT.value = 0;
      lastSwitch = performance.now();
      if (queued >= 0 && queued !== current) { const q = queued; queued = -1; go(q); }
      else queued = -1;
      if (reduceMotion) draw();
    }
    sceneTabs.forEach((b) => b.addEventListener("click", () => {
      auto = false;
      go(Number(b.dataset.scene));
      sceneTabs.forEach((x) => { const bar = x.querySelector(".bar"); if (bar && bar.getAnimations) bar.getAnimations().forEach((a) => a.cancel()); });
    }));
    setTab(0);

    // run only while the hero is on screen and the tab is visible
    let visible = true;
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) loop(); }, { threshold: 0 }).observe(heroSection);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) loop(); });

    const clock = new THREE.Clock();
    let elapsed = 0, scatterT = 0, mouseK = 0, rafId = 0, smoothX = 0, smoothY = 0;

    function draw() {
      if (!ready) return;
      const p = Math.min(1, Math.max(0, -heroSection.getBoundingClientRect().top / heroSection.offsetHeight));
      group.scale.setScalar(baseScale * (1 - p * 0.12));
      group.position.y = p * 1.1;
      uniforms.uOpacity.value = (theme() === "light" ? 0.95 : 0.9) * (1 - p * 0.75);
      const nw = (uniforms.uFrom.value === 0 ? 1 - smooth(uniforms.uT.value) : 0) + (uniforms.uTo.value === 0 && trans.active ? smooth(uniforms.uT.value) : 0);
      lineMat.opacity = (theme() === "light" ? 0.28 : 0.2) * Math.min(1, nw) * (1 - smooth(Math.min(1, uniforms.uScatter.value / 1.2))) * (1 - p);
      renderer.render(scene, camera);
    }
    const smooth = (x) => x * x * (3 - 2 * x);

    function loop() {
      if (rafId || reduceMotion) return;
      rafId = requestAnimationFrame(tick);
    }
    function tick() {
      rafId = 0;
      if (!visible || document.hidden) { clock.getDelta(); return; }
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed += dt;
      uniforms.uTime.value = elapsed;
      if (scatterT < 1) {
        scatterT = Math.min(1, scatterT + dt / 2.2);
        uniforms.uScatter.value = 2.6 * Math.pow(1 - scatterT, 3);
      }
      if (trans.active) {
        trans.t = Math.min(1, trans.t + dt / DUR);
        uniforms.uT.value = trans.t;
        if (trans.t >= 1) finish();
      } else if (auto && performance.now() - lastSwitch > HOLD) go((current + 1) % SCENES.length);

      mouseK += ((mouseOn ? 1 : 0) - mouseK) * Math.min(1, dt * 4);
      uniforms.uMouseK.value = mouseK;
      if (mouseOn) {
        ray.setFromCamera(mouseNDC, camera);
        if (ray.ray.intersectPlane(plane, hit)) uniforms.uMouse.value.lerp(hit, Math.min(1, dt * 10));
      }
      smoothX += ((mouseOn ? mouseNDC.x : 0) - smoothX) * Math.min(1, dt * 2.5);
      smoothY += ((mouseOn ? mouseNDC.y : 0) - smoothY) * Math.min(1, dt * 2.5);
      group.rotation.y = Math.sin(elapsed * 0.22) * 0.32 + smoothX * 0.28;
      group.rotation.x = -smoothY * 0.16 + Math.sin(elapsed * 0.17) * 0.05;
      draw();
      loop();
    }

    ready = true;
    if (reduceMotion) { uniforms.uFrom.value = 2; uniforms.uTo.value = 2; current = 2; setTab(2); draw(); }
    else loop();
    return { go };
  }

  /* ---------------------------------------------------------------- terminal */
  const term = { out: $("#term-out"), input: $("#term-input"), form: $("#term-form"), history: [], idx: -1 };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const P = DATA.person;
  function print(html, cls) {
    const row = document.createElement("div");
    row.className = "row" + (cls ? " " + cls : "");
    row.innerHTML = html;
    term.out.appendChild(row);
    term.out.scrollTop = term.out.scrollHeight;
  }
  const promptHTML = '<span class="prompt"><b>guest</b>@ali:~$</span>';
  const pad = (s, n) => (s + " ".repeat(n)).slice(0, Math.max(n, s.length));
  const LOGO = [
    "    _    _   _ ",
    "   / \\  | | | |",
    "  / _ \\ | |_| |",
    " / ___ \\|  _  |",
    "/_/   \\_\\_| |_|",
  ].join("\n");
  const statusLabel = { live: "live", active: "active use", build: "in build", testing: "final testing" };
  const statusClass = { live: "s", active: "k", build: "n", testing: "f" };

  const commands = {
    help: () => [
      '<span class="d">Available commands</span>',
      ...[
        ["neofetch", "system summary of Ali"],
        ["whoami", "who you are talking to"],
        ["projects", `the ${DATA.projects.length} systems, with status`],
        ["open <id>", "open a case study, e.g. open hs-investment"],
        ["skills", "the stack, grouped"],
        ["experience", "roles and dates"],
        ["education", "degree and languages"],
        ["contact", "email, phone, links"],
        ["cv", "download the CV (PDF)"],
        ["theme", "switch light / dark"],
        ["clear", "clear the screen"],
      ].map(([c, d]) => `  <span class="f">${esc(pad(c, 14))}</span>${esc(d)}`),
    ].join("\n"),
    whoami: () => `<span class="s">${esc(P.name)}</span>, ${esc(P.headline)}.\n${esc(P.summary)}`,
    neofetch: () => {
      const info = [
        `<span class="s">ali</span>@<span class="s">abu-hatem</span>`,
        "-------------",
        ["Role", P.headline],
        ["Host", `${P.location} (${P.timezone})`],
        ["Uptime", "7+ years, network engineering to software"],
        ["Shell", "Python, TypeScript, Dart"],
        ["Frameworks", "Django, DRF, Next.js, React, Flutter"],
        ["Data", "PostgreSQL, Firestore, Hive"],
        ["AI", "Ollama (local), Gemini"],
        ["Infra", "Vercel, Windows Server, Active Directory"],
        ["Packages", `${DATA.projects.length} systems shipped or in build`],
        ["Languages", "Arabic (native), English (professional)"],
        ["Status", P.availability],
      ].map((l) => (Array.isArray(l) ? `<span class="k">${esc(l[0])}</span>: ${esc(l[1])}` : l)).join("\n");
      return `<div class="neo"><pre class="logo">${esc(LOGO)}</pre><div>${info}</div></div>`;
    },
    projects: () => [
      `<span class="d">${DATA.projects.length} systems. Type open &lt;id&gt; for a case study.</span>`,
      ...DATA.projects.map((p) => `  <span class="${statusClass[p.status_key]}">${esc(pad("[" + statusLabel[p.status_key] + "]", 16))}</span><span class="f">${esc(pad(p.id, 15))}</span>${esc(p.name)} <span class="d">(${esc(p.stack.slice(0, 3).join(", "))})</span>`),
    ].join("\n"),
    open: (args) => {
      const key = (args[0] || "").toLowerCase();
      const p = DATA.projects.find((x, i) => x.id === key || String(i + 1) === key);
      if (!p) return `<span class="e">open: no project called "${esc(key)}".</span> Try: ${DATA.projects.map((x) => x.id).join(", ")}`;
      setTimeout(() => openCase("case-" + p.id), 120);
      return `Opening <span class="s">${esc(p.name)}</span> ...`;
    },
    skills: () => DATA.skills.map((g) => `<span class="k">${esc(pad(g.group, 15))}</span>${esc(g.items.join(", "))}`).join("\n"),
    experience: () => DATA.experience.map((e) => `<span class="n">${esc(pad(e.dates, 20))}</span><span class="s">${esc(e.role)}</span>, ${esc(e.org)} <span class="d">(${esc(e.place)})</span>`).join("\n"),
    education: () => `<span class="s">${esc(DATA.education.degree)}</span>\n${esc(DATA.education.school)}, ${esc(DATA.education.dates)}. ${esc(DATA.education.note)}.\n\n${DATA.languages.map((l) => `<span class="k">${esc(pad(l.name, 10))}</span>${esc(l.level)}`).join("\n")}`,
    contact: () => [
      `<span class="k">email   </span>${esc(P.email)}`,
      `<span class="k">phone   </span>${esc(P.phone)}`,
      `<span class="k">github  </span><a href="${esc(P.github_url)}" target="_blank" rel="noopener">${esc(P.github)}</a>`,
      `<span class="k">linkedin</span> <a href="${esc(P.linkedin_url)}" target="_blank" rel="noopener">${esc(P.linkedin)}</a>`,
      `<span class="d">${esc(P.availability)}.</span>`,
    ].join("\n"),
    cv: () => {
      const a = document.querySelector('[data-download="' + DATA.files.cv + '"]');
      if (inViewer) offerFile(a.getAttribute("href"), DATA.files.cv);
      else if (a) a.click();
      return `Preparing <span class="s">${esc(DATA.files.cv)}</span> ...`;
    },
    theme: () => { $("#theme-toggle").click(); return `Theme set to <span class="s">${theme()}</span>.`; },
    ls: () => `<span class="k">projects/</span>  readme.md  experience.log  skills.json  contact.sh  ${esc(DATA.files.cv)}`,
    cat: (args) => {
      const f = (args[0] || "").toLowerCase();
      if (f === "readme.md") return esc(P.about_long.join("\n\n"));
      if (f === "skills.json") return esc(JSON.stringify(Object.fromEntries(DATA.skills.map((g) => [g.group, g.items])), null, 2));
      if (f === "experience.log") return commands.experience();
      if (f === "contact.sh") return commands.contact();
      return `<span class="e">cat: ${esc(f || "(missing file)")}: no such file</span>. Try ls.`;
    },
    date: () => esc(new Date().toString()),
    echo: (args) => esc(args.join(" ")),
    history: () => term.history.map((h, i) => `  ${pad(String(i + 1), 4)}${esc(h)}`).join("\n") || '<span class="d">no history yet</span>',
    sudo: (args) => (args.join(" ") === "hire-ali"
      ? `<span class="s">[sudo] permission granted.</span>\nScheduling an interview ... done.\nNext step: email <span class="s">${esc(P.email)}</span> and I'll reply within a day.`
      : '<span class="e">sudo: this incident will be reported.</span> (Try: sudo hire-ali)'),
    exit: () => "There's no exit here, only next steps. Try: contact",
    clear: () => { term.out.innerHTML = ""; return null; },
  };
  const names = Object.keys(commands);

  function run(raw, silent) {
    const line = raw.trim();
    if (!silent) print(`${promptHTML} <span class="cmd">${esc(line)}</span>`);
    if (!line) return;
    term.history.push(line);
    term.idx = term.history.length;
    const [cmd, ...args] = line.split(/\s+/);
    const fn = commands[cmd.toLowerCase()];
    const out = fn ? fn(args) : `<span class="e">command not found: ${esc(cmd)}</span>. Type help.`;
    if (out) print(out);
  }
  term.form.addEventListener("submit", (e) => {
    e.preventDefault();
    run(term.input.value);
    term.input.value = "";
  });
  term.input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!term.history.length) return;
      e.preventDefault();
      term.idx = Math.max(0, Math.min(term.history.length, term.idx + (e.key === "ArrowUp" ? -1 : 1)));
      term.input.value = term.history[term.idx] || "";
    } else if (e.key === "Tab") {
      const v = term.input.value;
      const parts = v.split(/\s+/);
      let pool = names;
      let prefix = parts[0];
      if (parts.length > 1 && parts[0] === "open") { pool = DATA.projects.map((p) => p.id); prefix = parts[1]; }
      if (parts.length > 1 && parts[0] === "cat") { pool = ["readme.md", "skills.json", "experience.log", "contact.sh"]; prefix = parts[1]; }
      const hits = pool.filter((n) => n.startsWith(prefix));
      if (v && hits.length) {
        e.preventDefault();
        if (hits.length === 1) term.input.value = (parts.length > 1 ? parts[0] + " " : "") + hits[0] + (parts.length > 1 ? "" : " ");
        else print(hits.join("   "), "d");
      }
    }
  });
  $("#term").addEventListener("click", (e) => {
    if (getSelection().toString() || e.target.closest("a")) return;
    term.input.focus({ preventScroll: true });
  });
  $$("[data-cmd]").forEach((b) => b.addEventListener("click", () => run(b.dataset.cmd)));
  term.out.setAttribute("data-lenis-prevent", "");
  // open in a working state
  print(`${promptHTML} <span class="cmd">neofetch</span>`);
  run("neofetch", true);
  term.history.length = 0;
  print('<span class="d">Type help to see every command.</span>');

  /* ---------------------------------------------------------------- GSAP motion */
  if (window.gsap && window.ScrollTrigger && !reduceMotion) {
    const gsap = window.gsap;
    gsap.registerPlugin(window.ScrollTrigger);
    const ST = window.ScrollTrigger;

    if (window.Lenis && finePointer) {
      lenis = new window.Lenis({ lerp: 0.12, smoothWheel: true, wheelMultiplier: 0.95 });
      lenis.on("scroll", ST.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    // hero load sequence: the one orchestrated moment
    gsap.from("[data-hero-title] .line > span", { yPercent: 108, duration: 1.15, ease: "expo.out", stagger: 0.12, delay: 0.1 });
    gsap.from(".hello, .hero .lede, .hero-actions, .hero-meta", { y: 16, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.07, delay: 0.3 });
    $$("[data-count]").forEach((el) => {
      const raw = el.dataset.count;
      const num = parseFloat(raw);
      const suffix = raw.replace(/[\d.]/g, "");
      const decimals = (raw.split(".")[1] || "").replace(/\D/g, "").length;
      const o = { v: 0 };
      gsap.to(o, { v: num, duration: 1.8, ease: "power3.out", delay: 0.6, onUpdate: () => { el.textContent = o.v.toFixed(decimals) + suffix; } });
    });

    // featured screens drift in depth while scrolling past
    $$(".featured").forEach((art) => {
      const dir = art.classList.contains("flip") ? 1 : -1;
      gsap.fromTo($("[data-screens]", art), { rotationY: 16 * dir, rotationX: 7 }, {
        rotationY: 3 * dir, rotationX: 0, ease: "none",
        scrollTrigger: { trigger: art, start: "top bottom", end: "bottom 30%", scrub: 0.6 },
      });
    });

    // project media rise in perspective (transform only; content stays visible)
    $$(".tile .media").forEach((m) => gsap.fromTo(m, { rotationX: 14, transformPerspective: 1100, transformOrigin: "50% 100%" }, {
      rotationX: 0, ease: "power2.out",
      scrollTrigger: { trigger: m, start: "top bottom", end: "top 58%", scrub: 0.5 },
    }));

    // exploded architecture view
    gsap.fromTo("[data-iso]", { "--spread": "16px", "--rz": "-44deg" }, {
      "--spread": "52px", "--rz": "-30deg", ease: "none",
      scrollTrigger: { trigger: "#stack", start: "top 85%", end: "center 45%", scrub: 0.7 },
    });

    // git graph draws itself as the history scrolls by
    $$("[data-gitlog] .commit").forEach((row) => {
      const lanes = $$(".lane, .fork", row);
      if (lanes.length) gsap.fromTo(lanes, { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: row, start: "top 88%", end: "bottom 62%", scrub: true } });
      gsap.fromTo($(".dot", row), { scale: 0.25 }, { scale: 1, duration: 0.55, ease: "back.out(3)", scrollTrigger: { trigger: row, start: "top 84%", toggleActions: "play none none reverse" } });
    });

    // one scan line across the portrait when it first comes into view
    ST.create({
      trigger: ".portrait", start: "top 72%", once: true,
      onEnter: () => gsap.fromTo("[data-scan]", { opacity: 1, backgroundPosition: "0% -120%" }, {
        backgroundPosition: "0% 140%", duration: 1.7, ease: "power2.inOut",
        onComplete: () => gsap.to("[data-scan]", { opacity: 0, duration: 0.4 }),
      }),
    });

    addEventListener("load", () => ST.refresh());
  }

  /* ---------------------------------------------------------------- console note */
  try {
    console.log("%c ah/ %c " + P.name + ", " + P.headline, "background:#7dd6bc;color:#0c1016;font-weight:700;padding:3px 6px;border-radius:4px", "color:inherit");
    console.log("Reading the source? It's hand-written: Three.js points with a custom shader, GSAP ScrollTrigger and Lenis, no framework.\nLet's talk: " + P.email);
  } catch (e) { /* console unavailable */ }
})();
