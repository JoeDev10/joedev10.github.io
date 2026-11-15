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

/* ---------- Apariciones al hacer scroll, escalonadas por grupo ---------- */
export function initRevelados() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
    });
  }, { threshold: .12, rootMargin: "0px 0px -6% 0px" });

  document.querySelectorAll("[data-stagger]").forEach(g => {
    Array.from(g.children).forEach((c, i) => {
      c.style.setProperty("--d", (i * 90) + "ms");
      c.setAttribute("data-reveal", "");
    });
  });
  document.querySelectorAll("[data-reveal]").forEach(el => obs.observe(el));
}

/* ---------- Contadores ---------- */
export function initContadores() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target, target = Number(el.dataset.count), suffix = el.dataset.suffix || "";
      obs.unobserve(el);
      if (reduceMotion) { el.textContent = target + suffix; return; }
      let inicio = null;
      const paso = ts => {
        if (!inicio) inicio = ts;
        const p = Math.min((ts - inicio) / 1400, 1);
        el.textContent = Math.round((1 - Math.pow(1 - p, 4)) * target) + suffix;
        if (p < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });
  }, { threshold: .5 });
  document.querySelectorAll("[data-count]").forEach(el => obs.observe(el));
}

/* ---------- Scroll: barra de progreso, header y línea del proceso ---------- */
export function initScroll() {
  const bar = document.getElementById("progress");
  const header = document.getElementById("siteHeader");
  const mobileMenu = document.getElementById("mobileMenu");
  const pasos = document.getElementById("pasos");
  const nodos = pasos ? pasos.querySelectorAll(".paso") : [];
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
    if (pasos) {
      const r = pasos.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * .8 - r.top) / (r.height + innerHeight * .25)));
      pasos.style.setProperty("--p", p.toFixed(3));
      nodos.forEach((n, k) => n.classList.toggle("on", p >= k / (nodos.length - 1) * .92));
    }
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

/* ---------- Botón fijo de WhatsApp (celular) ---------- */
export function initWhatsAppFijo() {
  const stickyWa = document.getElementById("stickyWa");
  const heroActions = document.getElementById("heroActions");
  if (!stickyWa || !heroActions) return;
  new IntersectionObserver(entries => {
    entries.forEach(e => stickyWa.classList.toggle("visible", !e.isIntersecting && e.boundingClientRect.top < 0));
  }).observe(heroActions);
}

/* ---------- Meta Pixel: cuenta los clics a WhatsApp como Lead ---------- */
export function initPixelWhatsApp() {
  document.querySelectorAll('a[href*="wa.me"]').forEach(link => {
    link.addEventListener("click", () => {
      if (typeof window.fbq !== "function") return;
      window.fbq("track", "Lead", {
        content_name: "WhatsApp Click",
        content_category: link.closest("#precios")   ? "Pricing" :
                          link.closest(".hero")      ? "Hero" :
                          link.closest(".cta-final") ? "CTA Final" :
                          link.closest(".portfolio") ? "Demos" : "Other"
      });
    });
  });
}
