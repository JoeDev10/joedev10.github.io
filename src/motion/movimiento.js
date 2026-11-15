/* ==========================================================
   MJR Digital — capa de movimiento
   Lo que no depende de la posición del scroll: intro de carga,
   cursor propio, riel de secciones, la red de puntos del hero
   y la cinta grande.
   Lo que sí depende del scroll vive en scroll.js, con GSAP.
   Todo se apaga si el visitante pide menos movimiento.
   ========================================================== */

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

/* ---------- 2. CURSOR ---------- */
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

/* ---------- 3. NAV: indicador y riel de secciones ---------- */
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

/* ---------- 4. LIENZO: red de puntos del hero ---------- */
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

/* ---------- 5. CINTA GRANDE: se mueve con el scroll ---------- */
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
