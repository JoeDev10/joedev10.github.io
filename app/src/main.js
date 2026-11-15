/* ==========================================================
   MJR Digital — punto de entrada
   Acá se cargan los estilos en orden (base → layout →
   componentes → movimiento) y se encienden las piezas.

   Si el visitante pide menos movimiento, no se cargan ni
   Lenis ni GSAP: la página queda quieta y usable.
   ========================================================== */
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/motion.css";

import { initAsistente } from "./features/asistente.js";
import { initHeroPhone, initLineaNoche } from "./features/hero-demo.js";
import {
  initPuntero,
  initScroll,
  initMenu,
  initFaq,
  initPixelWhatsApp,
} from "./features/ui.js";
import {
  initIntro,
  initCursor,
  initRiel,
  initRedHero,
  initCinta,
} from "./motion/movimiento.js";

const menosMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;

async function arrancar() {
  document.body.classList.replace("no-js", "js");

  // Lo que anda siempre
  initIntro();
  initRiel();
  initCinta();
  // Decide solo si baja el 3D o deja el degradado quieto.
  initRedHero();
  initPuntero();
  initScroll();
  initMenu();
  initFaq();
  initPixelWhatsApp();
  initHeroPhone();
  initLineaNoche();
  initAsistente();

  if (menosMovimiento) return;

  // Movimiento que no depende del scroll
  initCursor();

  // Scroll suave y todo lo que dispara ScrollTrigger
  const scroll = await import("./motion/scroll.js");
  scroll.initScrollSuave();
  // Primero las secciones que se pegan y el partido de títulos, así los
  // revelados miden sobre la página ya armada.
  scroll.initComoTrabajo();
  scroll.initDemosHorizontal();
  scroll.initTitulos();
  scroll.initRevelados();
  scroll.initParallax();
  scroll.initContadores();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", arrancar, { once: true });
} else {
  arrancar();
}
