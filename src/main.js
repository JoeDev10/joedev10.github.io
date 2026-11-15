/* ==========================================================
   MJR Digital — punto de entrada
   Acá se cargan los estilos en orden (base → layout →
   componentes → movimiento) y se encienden las piezas.
   ========================================================== */
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/motion.css";

import { initAsistente } from "./features/asistente.js";
import { initHeroPhone, initLineaNoche } from "./features/hero-demo.js";
import {
  initPuntero,
  initRevelados,
  initContadores,
  initScroll,
  initMenu,
  initFaq,
  initWhatsAppFijo,
  initPixelWhatsApp,
} from "./features/ui.js";
import {
  initIntro,
  initScrollSuave,
  initCursor,
  initTitulos,
  initRiel,
  initRedHero,
  initCinta,
  initDemosHorizontal,
  initParallax,
} from "./motion/movimiento.js";

// El módulo se evalúa con el DOM ya armado (defer), pero por si acaso.
function arrancar() {
  document.body.classList.replace("no-js", "js");

  // Movimiento
  initIntro();
  initScrollSuave();
  initCursor();
  initTitulos();
  initRiel();
  initRedHero();
  initCinta();
  initDemosHorizontal();
  initParallax();

  // Interfaz
  initPuntero();
  initRevelados();
  initContadores();
  initScroll();
  initMenu();
  initFaq();
  initWhatsAppFijo();
  initPixelWhatsApp();

  // Demos y asistente
  initHeroPhone();
  initLineaNoche();
  initAsistente();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", arrancar, { once: true });
} else {
  arrancar();
}
