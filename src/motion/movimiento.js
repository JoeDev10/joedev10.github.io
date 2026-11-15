/* ==========================================================
   MJR Digital — capa de movimiento
   Intro de carga, scroll suave, cursor propio, títulos que
   entran por máscara, riel de secciones, red de puntos del
   hero, cinta grande, demos en scroll horizontal y parallax.
   Todo se apaga si el visitante pide menos movimiento.
   ========================================================== */
import Lenis from "lenis";

const body = document.body;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(pointer: fine)").matches;
const raf = requestAnimationFrame;

/* ---------- 1. INTRO ---------- */
export function initIntro() {
  const el = document.getElementById("boot");
  if (!el) { body.classList.add("ready"); return; }
  if (reduce) {
    el.remove();
    body.classList.remove("booting");
    body.classList.add("ready");
    return;
  }

  const bar = el.querySelector(".boot-bar i");
  const num = el.querySelector(".boot-num");
  let p = 0, done = false;

  function abrir() {
    bar.style.setProperty("--p", "1");
    num.textContent = "100";
    body.classList.add("booted");
    body.classList.remove("booting");
    setTimeout(() => body.classList.add("ready"), 180);
    setTimeout(() => body.classList.add("boot-done"), 1500);
  }

  // si ya la vio en esta visita, no le repetimos la intro entera
  let yaVino = false;
  try { yaVino = sessionStorage.getItem("mjr-boot") === "1"; } catch { /* sin sessionStorage */ }
  if (yaVino) {
    done = true;
    setTimeout(abrir, 90);
    return;
  }
  try { sessionStorage.setItem("mjr-boot", "1"); } catch { /* sin sessionStorage */ }

  let cargado = false;
  addEventListener("load", () => { cargado = true; }, { once: true });

  const t = setInterval(() => {
    // avanza rápido hasta 90 y espera a que termine de cargar
    const techo = cargado ? 100 : 92;
    p = Math.min(techo, p + Math.random() * 11 + 4);
    bar.style.setProperty("--p", (p / 100).toFixed(3));
    num.textContent = String(Math.round(p)).padStart(3, "0");
    if (p >= 100 && !done) {
      done = true;
      clearInterval(t);
      setTimeout(abrir, 320);
    }
  }, 110);

  // red de seguridad: pase lo que pase, a los 4,5 s se abre
  setTimeout(() => { if (!done) { done = true; clearInterval(t); abrir(); } }, 4500);
}

/* ---------- 2. SCROLL SUAVE (Lenis) ---------- */
export function initScrollSuave() {
  if (reduce) return null;
  let lenis = null;
  try {
    lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
    (function loop(time) { lenis.raf(time); raf(loop); })(0);

    // los anclajes internos pasan por Lenis
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener("click", (e) => {
        const id = a.getAttribute("href");
        if (!id || id === "#") return;
        const dest = document.querySelector(id);
        if (!dest) return;
        e.preventDefault();
        lenis.scrollTo(dest, { offset: -70 });
      });
    });
  } catch { lenis = null; }
  return lenis;
}

/* ---------- 3. CURSOR ---------- */
export function initCursor() {
  if (!fine || reduce) return;
  const dot = document.getElementById("cur");
  const ring = document.getElementById("cur-ring");
  if (!dot || !ring) return;

  body.classList.add("cursor-on");
  const rotulo = ring.querySelector("b");
  let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;

  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  addEventListener("pointerdown", () => body.classList.add("cur-down"));
  addEventListener("pointerup", () => body.classList.remove("cur-down"));

  (function tick() {
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
    ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
    raf(tick);
  })();

  const hot = "a, button, .chip, .slot, input, textarea, [data-magnet]";
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest("[data-cursor]");
    if (t) {
      rotulo.textContent = t.getAttribute("data-cursor");
      body.classList.add("cur-label");
      body.classList.remove("cur-hot");
      return;
    }
    if (e.target.closest(hot)) body.classList.add("cur-hot");
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest("[data-cursor]")) body.classList.remove("cur-label");
    if (e.target.closest(hot)) body.classList.remove("cur-hot");
  });
}

/* ---------- 4. TÍTULOS: partidos en palabras y revelados por máscara ---------- */
function partir(el) {
  if (el.dataset.split === "listo") return;
  const frag = document.createDocumentFragment();
  const nodos = Array.from(el.childNodes);
  const piezas = [];

  function enPalabras(texto, molde) {
    texto.split(/(\s+)/).forEach(w => {
      if (!w) return;
      if (/^\s+$/.test(w)) { piezas.push({ esp: true }); return; }
      piezas.push({ txt: w, molde });
    });
  }

  nodos.forEach(n => {
    if (n.nodeType === 3) {
      enPalabras(n.textContent, null);
    } else if (n.nodeType === 1) {
      // un <span class="hl"> se parte igual, clonando el envoltorio
      if (n.children.length === 0 && n.textContent.trim()) {
        enPalabras(n.textContent, n);
      } else {
        piezas.push({ nodo: n });
      }
    }
  });

  piezas.forEach(p => {
    if (p.esp) { frag.appendChild(document.createTextNode(" ")); return; }
    const w = document.createElement("span");
    w.className = "sp-word";
    const inner = document.createElement("span");
    inner.className = "sp-i";
    if (p.nodo) {
      inner.appendChild(p.nodo);
    } else if (p.molde) {
      const env = p.molde.cloneNode(false);
      env.textContent = p.txt;
      inner.appendChild(env);
    } else {
      inner.textContent = p.txt;
    }
    w.appendChild(inner);
    frag.appendChild(w);
  });

  el.textContent = "";
  el.appendChild(frag);
  el.classList.add("sp-line");
  el.dataset.split = "listo";
  el.querySelectorAll(":scope > .sp-word").forEach((w, i) => {
    w.style.setProperty("--wd", (i * 60) + "ms");
  });
}

export function initTitulos() {
  if (reduce) return;
  document.querySelectorAll("[data-split]").forEach(partir);

  const obs = new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      obs.unobserve(e.target);
    });
  }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".sp-line, .work").forEach(el => obs.observe(el));
}

/* ---------- 5. NAV: indicador y riel de secciones ---------- */
export function initRiel() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  const links = Array.from(nav.querySelectorAll("a"));
  const rail = document.querySelector(".rail");
  const railLinks = rail ? Array.from(rail.querySelectorAll("a")) : [];

  function marcar(el) {
    if (!el) { nav.style.setProperty("--io", "0"); return; }
    nav.style.setProperty("--ix", el.offsetLeft + "px");
    nav.style.setProperty("--iw", el.offsetWidth + "px");
    nav.style.setProperty("--io", "1");
  }

  links.forEach(a => a.addEventListener("pointerenter", () => marcar(a)));
  nav.addEventListener("pointerleave", () => marcar(nav.querySelector("a.on")));

  const secciones = ["servicios", "noche", "demos", "precios", "faq"]
    .map(id => document.getElementById(id))
    .filter(Boolean);

  const spy = new IntersectionObserver(es => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      const id = e.target.id;
      links.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + id));
      railLinks.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + id));
      marcar(nav.querySelector("a.on"));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  secciones.forEach(s => spy.observe(s));
}

/* ---------- 6. LIENZO: red de puntos del hero ---------- */
export function initRedHero() {
  const c = document.getElementById("net");
  if (!c || reduce) return;
  const ctx = c.getContext("2d", { alpha: true });
  if (!ctx) return;

  const dpr = Math.min(devicePixelRatio || 1, 2);
  let W = 0, H = 0, pts = [], on = true, timer = 0;
  const pm = { x: -9999, y: -9999 };

  function medir() {
    const r = c.getBoundingClientRect();
    W = r.width; H = r.height;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(90, Math.max(34, (W * H) / 16000)));
    pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.6 + 0.6,
      });
    }
  }

  addEventListener("pointermove", (e) => {
    const r = c.getBoundingClientRect();
    pm.x = e.clientX - r.left; pm.y = e.clientY - r.top;
  }, { passive: true });

  function pintar() {
    if (!on) { raf(pintar); return; }
    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0 || a.x > W) a.vx *= -1;
      if (a.y < 0 || a.y > H) a.vy *= -1;
      // se apartan del mouse
      const dx = a.x - pm.x, dy = a.y - pm.y, d = Math.hypot(dx, dy);
      if (d < 130 && d > 0.1) { a.x += (dx / d) * 0.9; a.y += (dy / d) * 0.9; }
    }

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j];
        const dx = a.x - b.x, dy = a.y - b.y, d = dx * dx + dy * dy;
        if (d < 20000) {
          const op = (1 - d / 20000) * 0.3;
          ctx.strokeStyle = "rgba(91,140,255," + op.toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(145,180,255,.55)";
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, 6.2832); ctx.fill();
    }
    raf(pintar);
  }

  medir();
  addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(medir, 180); });
  new IntersectionObserver(es => { on = es[0].isIntersecting; }, { threshold: 0 }).observe(c);
  raf(pintar);
}

/* ---------- 7. CINTA GRANDE: se mueve con el scroll ---------- */
export function initCinta() {
  const track = document.getElementById("bandTrack");
  const band = document.getElementById("band");
  if (!track) return;

  // se clona para que el loop no corte
  Array.from(track.children).forEach(n => track.appendChild(n.cloneNode(true)));
  if (reduce) return;

  let ancho = 0, off = 0, last = scrollY, vel = 0, skew = 0, timer = 0;
  const medir = () => { ancho = track.scrollWidth / 2; };
  medir();
  addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(medir, 200); });

  (function tick() {
    const y = scrollY;
    const dv = y - last; last = y;
    vel += (dv - vel) * 0.18;
    off = (off + 0.9 + vel * 0.55) % (ancho || 1);
    if (off < 0) off += ancho || 1;
    track.style.transform = "translate3d(" + (-off) + "px,0,0)";
    skew += (Math.max(-5, Math.min(5, vel * 0.12)) - skew) * 0.12;
    if (band) band.style.setProperty("--skew", skew.toFixed(2) + "deg");
    raf(tick);
  })();
}

/* ---------- 8. DEMOS: scroll horizontal pegado ---------- */
export function initDemosHorizontal() {
  const wrap = document.querySelector(".hscroll");
  if (!wrap) return;
  const row = wrap.querySelector(".hscroll-row");
  const hint = wrap.querySelector(".hscroll-hint b");
  if (!row) return;
  let activo = false, extra = 0, timer = 0;

  function mover() {
    if (!activo) return;
    const r = wrap.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -r.top / (extra || 1)));
    row.style.transform = "translate3d(" + (-p * extra) + "px,0,0)";
    if (hint) hint.style.setProperty("--hp", p.toFixed(3));
  }

  function medir() {
    activo = innerWidth >= 1025 && !reduce;
    if (!activo) {
      wrap.style.height = "";
      row.style.transform = "";
      return;
    }
    extra = Math.max(0, row.scrollWidth - innerWidth);
    wrap.style.height = (innerHeight + extra) + "px";
    mover();
  }

  medir();
  addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(medir, 200); });
  addEventListener("scroll", mover, { passive: true });
  setTimeout(medir, 900);
  addEventListener("load", medir);
}

/* ---------- 9. PARALLAX suave ---------- */
export function initParallax() {
  if (reduce) return;
  const items = Array.from(document.querySelectorAll("[data-par]"));
  if (!items.length) return;
  let pendiente = false;

  function pintar() {
    pendiente = false;
    const vh = innerHeight;
    items.forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      const centro = r.top + r.height / 2 - vh / 2;
      const k = parseFloat(el.getAttribute("data-par")) || 0.06;
      el.style.translate = "0 " + (-centro * k).toFixed(1) + "px";
    });
  }

  addEventListener("scroll", () => {
    if (pendiente) return;
    pendiente = true; raf(pintar);
  }, { passive: true });
  addEventListener("resize", pintar);
  pintar();
}
