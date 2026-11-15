/* ==========================================================
   MJR Digital — scroll con GSAP
   Lenis maneja el scroll suave y le pasa el control a
   ScrollTrigger, que es el que dispara todo lo que depende de
   la posición: apariciones, títulos, la sección pegada de
   "Cómo trabajo", las demos en horizontal y el parallax.
   Nada de esto arranca si el visitante pide menos movimiento.
   ========================================================== */
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

gsap.registerPlugin(ScrollTrigger);

/* ---------- 1. Lenis + GSAP ---------- */
export function initScrollSuave() {
  let lenis = null;
  try {
    lenis = new Lenis({
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.6,
    });
  } catch {
    return null;
  }

  // Cada vez que Lenis mueve la página, ScrollTrigger recalcula.
  lenis.on("scroll", ScrollTrigger.update);
  // Un solo reloj para los dos: el de GSAP.
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Los anclajes internos pasan por Lenis
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (!id || id === "#") return;
      const dest = document.querySelector(id);
      if (!dest) return;
      e.preventDefault();
      lenis.scrollTo(dest, { offset: -70 });
    });
  });

  // Las imágenes y fuentes cambian las alturas: hay que volver a medir.
  addEventListener("load", () => ScrollTrigger.refresh());
  return lenis;
}

/* ---------- 2. Apariciones en lote ----------
   Lo que vive adentro de una sección pegada (pin) no puede disparar por
   su propia posición, porque mientras está pegada no se mueve: a eso lo
   dispara la sección entera, antes de que empiece el pegado. */
const PEGADAS = [
  { seccion: "#como", pin: "#comoPin" },
  { seccion: ".hscroll", pin: ".hscroll-sticky" },
];
const estaPegado = (el) => PEGADAS.some((x) => el.closest(x.pin));

function revelar(lote) {
  gsap.to(lote, {
    opacity: 1,
    y: 0,
    duration: .9,
    ease: "power3.out",
    stagger: .09,
    overwrite: true,
  });
}

function animarPalabras(linea) {
  const palabras = linea.querySelectorAll(".sp-i");
  if (!palabras.length) return;
  gsap.fromTo(
    palabras,
    { yPercent: 110, opacity: 0 },
    { yPercent: 0, opacity: 1, duration: .95, ease: "expo.out", stagger: .06, overwrite: true }
  );
}

export function initRevelados() {
  // Los grupos marcados con data-stagger reparten el retardo entre sus hijos.
  document.querySelectorAll("[data-stagger]").forEach((g) => {
    Array.from(g.children).forEach((c) => c.setAttribute("data-reveal", ""));
  });

  const items = gsap.utils.toArray("[data-reveal]");
  if (items.length) gsap.set(items, { opacity: 0, y: 26 });

  const sueltos = items.filter((el) => !estaPegado(el));
  if (sueltos.length) {
    ScrollTrigger.batch(sueltos, { start: "top 90%", once: true, onEnter: revelar });
  }

  // Y ahora lo de adentro de las secciones pegadas.
  PEGADAS.forEach(({ seccion, pin }) => {
    const sec = document.querySelector(seccion);
    const caja = sec && sec.querySelector(pin);
    if (!caja) return;
    const dentro = gsap.utils.toArray(caja.querySelectorAll("[data-reveal]"));
    ScrollTrigger.create({
      trigger: sec,
      start: "top 80%",
      once: true,
      onEnter: () => {
        if (dentro.length) revelar(dentro);
        // Los títulos ya están partidos para cuando esto se dispara.
        caja.querySelectorAll(".sp-line").forEach(animarPalabras);
        caja.querySelectorAll(".work").forEach((el) => el.classList.add("in"));
      },
    });
  });
}

/* ---------- 3. Títulos partidos a mano, palabra por palabra ---------- */
function partir(el) {
  if (el.dataset.split === "listo") return;
  const frag = document.createDocumentFragment();
  const piezas = [];

  function enPalabras(texto, molde) {
    texto.split(/(\s+)/).forEach((w) => {
      if (!w) return;
      if (/^\s+$/.test(w)) { piezas.push({ esp: true }); return; }
      piezas.push({ txt: w, molde });
    });
  }

  Array.from(el.childNodes).forEach((n) => {
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

  piezas.forEach((p) => {
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
}

export function initTitulos() {
  document.querySelectorAll("[data-split]").forEach(partir);

  document.querySelectorAll(".sp-line").forEach((linea) => {
    if (estaPegado(linea)) return; // lo dispara initRevelados con la sección
    const palabras = linea.querySelectorAll(".sp-i");
    if (!palabras.length) return;
    gsap.fromTo(
      palabras,
      { yPercent: 110, opacity: 0 },
      {
        yPercent: 0,
        opacity: 1,
        duration: .95,
        ease: "expo.out",
        stagger: .06,
        scrollTrigger: { trigger: linea, start: "top 90%", once: true },
      }
    );
  });

  // La cortina de cada demo
  const demos = gsap.utils.toArray(".work").filter((el) => !estaPegado(el));
  if (demos.length) {
    ScrollTrigger.batch(demos, {
      start: "top 88%",
      once: true,
      onEnter: (lote) => lote.forEach((el) => el.classList.add("in")),
    });
  }
}

/* ---------- 4. Cómo trabajo: la sección se pega y pasan los 4 pasos ---------- */
export function initComoTrabajo() {
  const sec = document.getElementById("como");
  const pin = document.getElementById("comoPin");
  const pasos = document.getElementById("pasos");
  if (!sec || !pin || !pasos) return;
  const nodos = gsap.utils.toArray("#pasos .paso");
  if (!nodos.length) return;

  const encender = (p) => {
    pasos.style.setProperty("--p", p.toFixed(3));
    nodos.forEach((n, k) => n.classList.toggle("on", p >= (k / nodos.length) * .95));
  };

  const mm = gsap.matchMedia();

  // Escritorio: se pega y los pasos avanzan con el scroll.
  mm.add("(min-width: 1025px)", () => {
    const st = ScrollTrigger.create({
      trigger: sec,
      start: "top top",
      end: () => "+=" + Math.round(innerHeight * 1.9),
      pin,
      pinSpacing: true,
      scrub: .5,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => encender(self.progress),
    });
    encender(0);
    return () => {
      st.kill();
      nodos.forEach((n) => n.classList.add("on"));
      pasos.style.setProperty("--p", "1");
    };
  });

  // Celular y tablet: sin pegado, cada paso se enciende al entrar.
  mm.add("(max-width: 1024px)", () => {
    const trs = nodos.map((n, k) =>
      ScrollTrigger.create({
        trigger: n,
        start: "top 82%",
        once: true,
        onEnter: () => {
          n.classList.add("on");
          pasos.style.setProperty("--p", ((k + 1) / nodos.length).toFixed(3));
        },
      })
    );
    return () => trs.forEach((t) => t.kill());
  });
}

/* ---------- 5. Demos en scroll horizontal (solo escritorio) ---------- */
export function initDemosHorizontal() {
  const wrap = document.querySelector(".hscroll");
  if (!wrap) return;
  const sticky = wrap.querySelector(".hscroll-sticky");
  const row = wrap.querySelector(".hscroll-row");
  const hint = wrap.querySelector(".hscroll-hint b");
  if (!sticky || !row) return;

  const mm = gsap.matchMedia();
  mm.add("(min-width: 1025px)", () => {
    const sobra = () => Math.max(0, row.scrollWidth - innerWidth);
    const tween = gsap.to(row, {
      x: () => -sobra(),
      ease: "none",
      scrollTrigger: {
        trigger: wrap,
        start: "top top",
        end: () => "+=" + (sobra() + innerHeight * .2),
        pin: sticky,
        scrub: .4,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          if (hint) hint.style.setProperty("--hp", self.progress.toFixed(3));
        },
      },
    });
    return () => {
      tween.scrollTrigger && tween.scrollTrigger.kill();
      tween.kill();
      gsap.set(row, { clearProps: "x" });
    };
  });
}

/* ---------- 6. Parallax suave ----------
   Usa la propiedad translate (no transform) para no pisar la animación
   de entrada del escenario del hero, que sí usa transform. */
export function initParallax() {
  const items = gsap.utils.toArray("[data-par]");
  if (!items.length) return;

  items.forEach((el) => {
    const k = parseFloat(el.getAttribute("data-par")) || 0.06;
    ScrollTrigger.create({
      trigger: el,
      start: "top bottom",
      end: "bottom top",
      invalidateOnRefresh: true,
      onUpdate: () => {
        const r = el.getBoundingClientRect();
        const centro = r.top + r.height / 2 - innerHeight / 2;
        el.style.translate = "0 " + (-centro * k).toFixed(1) + "px";
      },
    });
  });
}

/* ---------- 7. Contadores ---------- */
export function initContadores() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const destino = Number(el.dataset.count);
    const sufijo = el.dataset.suffix || "";
    const n = { v: 0 };
    ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      once: true,
      onEnter: () =>
        gsap.to(n, {
          v: destino,
          duration: 1.4,
          ease: "power4.out",
          onUpdate: () => { el.textContent = Math.round(n.v) + sufijo; },
        }),
    });
  });
}
