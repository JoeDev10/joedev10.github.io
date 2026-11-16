/* ==========================================================
   MJR Digital — interfaz
   Lo que responde al mouse y al scroll: luz que sigue al
   cursor, tarjetas que se inclinan, botones magnéticos,
   apariciones, contadores, barra de progreso, header, menú
   de celular, preguntas y el botón fijo de WhatsApp.
   ========================================================== */

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const root = document.documentElement;

/* ---------- Mouse: luz de fondo, celular inclinado, tarjetas y botones ---------- */
export function initPuntero() {
  // El brillo dentro de cada tarjeta no molesta a nadie, va siempre.
  document.querySelectorAll(".spot").forEach(el => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--x", (e.clientX - r.left) + "px");
      el.style.setProperty("--y", (e.clientY - r.top) + "px");
    });
  });

  if (!finePointer || reduceMotion) return;

  const stage = document.getElementById("stage");
  const heroPhone = document.getElementById("heroPhone");

  let raf = 0, mx = 0, my = 0;
  addEventListener("pointermove", (e) => {
    mx = e.clientX; my = e.clientY;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      root.style.setProperty("--mx", mx + "px");
      root.style.setProperty("--my", my + "px");
      if (!stage || !heroPhone) return;
      const r = stage.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) {
        const x = (mx - (r.left + r.width / 2)) / innerWidth;
        const y = (my - (r.top + r.height / 2)) / innerHeight;
        heroPhone.style.setProperty("--ry", (x * 12).toFixed(2) + "deg");
        heroPhone.style.setProperty("--rx", (-y * 8).toFixed(2) + "deg");
      }
    });
  }, { passive: true });

  // Tarjetas de demos que se inclinan
  document.querySelectorAll("[data-tilt]").forEach(el => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--rx", (-((e.clientY - r.top) / r.height - .5) * 6).toFixed(2) + "deg");
      el.style.setProperty("--ry", (((e.clientX - r.left) / r.width - .5) * 8).toFixed(2) + "deg");
    });
    el.addEventListener("pointerleave", () => {
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    });
  });

  // Botones magnéticos
  document.querySelectorAll("[data-magnet]").forEach(el => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.translate = `${((e.clientX - r.left - r.width / 2) * .2).toFixed(1)}px ${((e.clientY - r.top - r.height / 2) * .3).toFixed(1)}px`;
    });
    el.addEventListener("pointerleave", () => { el.style.translate = ""; });
  });
}

/* ---------- Scroll: barra de progreso y header ----------
   Va sin GSAP a propósito: es un cálculo barato y tiene que seguir
   andando también cuando el visitante pide menos movimiento, que es
   cuando no arranca ni Lenis ni ScrollTrigger. */
export function initScroll() {
  const bar = document.getElementById("progress");
  const header = document.getElementById("siteHeader");
  const mobileMenu = document.getElementById("mobileMenu");
  let ultimoY = scrollY, pendiente = false;

  function update() {
    pendiente = false;
    const y = scrollY, max = root.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    if (header) {
      header.classList.toggle("solid", y > 40);
      const menuAbierto = mobileMenu ? mobileMenu.classList.contains("open") : false;
      header.classList.toggle("hide", !menuAbierto && y > 600 && y > ultimoY);
    }
    ultimoY = y;
  }

  addEventListener("scroll", () => { if (!pendiente) { pendiente = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  update();
}

/* ---------- Menú de celular ---------- */
export function initMenu() {
  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");
  const header = document.getElementById("siteHeader");
  if (!menuBtn || !mobileMenu) return;

  function cerrar() {
    menuBtn.classList.remove("open");
    mobileMenu.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
    mobileMenu.setAttribute("aria-hidden", "true");
    mobileMenu.inert = true;
    document.body.style.overflow = "";
  }

  menuBtn.addEventListener("click", () => {
    if (mobileMenu.classList.contains("open")) return cerrar();
    menuBtn.classList.add("open");
    mobileMenu.classList.add("open");
    menuBtn.setAttribute("aria-expanded", "true");
    mobileMenu.setAttribute("aria-hidden", "false");
    mobileMenu.inert = false;
    document.body.style.overflow = "hidden";
    if (header) header.classList.add("solid");
  });

  mobileMenu.querySelectorAll("a").forEach(a => a.addEventListener("click", cerrar));
  document.addEventListener("keydown", e => { if (e.key === "Escape") cerrar(); });
}

/* ---------- Preguntas ---------- */
export function initFaq() {
  document.querySelectorAll(".faq-item").forEach(item => {
    const boton = item.querySelector(".faq-q");
    if (!boton) return;
    boton.addEventListener("click", () => {
      const abierto = item.classList.toggle("open");
      boton.setAttribute("aria-expanded", String(abierto));
    });
  });
}

/* ---------- Clics a WhatsApp: los contamos en los tres lados ----------
   Clarity ya está puesto en el index, así que eso funciona desde hoy:
   en el panel de Clarity, filtrá por el evento "wa_click" para ver
   cuántos clics hubo, y por la etiqueta "cta" para saber de qué botón.
   El Pixel de Meta y GA4 quedan enganchados para cuando tengas los IDs:
   si no están, estas tres líneas no hacen nada y no rompen nada. */
export function initPixelWhatsApp() {
  document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
    link.addEventListener("click", () => {
      const donde = link.closest("#precios")      ? "precios" :
                    link.closest(".hero")         ? "hero" :
                    link.closest(".cta-final")    ? "cierre" :
                    link.closest(".portfolio")    ? "demos" :
                    link.closest(".site-header")  ? "header" :
                    link.closest(".sticky-wa")    ? "barra" :
                    link.closest(".mobile-menu")  ? "menu" :
                    link.closest(".footer")       ? "footer" : "otro";

      // Clarity: anda ya, sin configurar nada más.
      if (typeof window.clarity === "function") {
        window.clarity("event", "wa_click");
        window.clarity("set", "cta", donde);
      }

      // Meta Pixel: se enciende solo cuando pegues el código con tu ID.
      if (typeof window.fbq === "function") {
        window.fbq("track", "Lead", { content_name: "WhatsApp Click", content_category: donde });
      }

      // GA4: ídem, cuando pegues el gtag con tu ID de medición.
      if (typeof window.gtag === "function") {
        window.gtag("event", "generate_lead", { method: "whatsapp", cta: donde });
      }
    });
  });
}
