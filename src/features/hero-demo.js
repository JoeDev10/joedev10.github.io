/* ==========================================================
   MJR Digital — demo del agente
   Dos piezas que se mueven solas y se pausan cuando no están
   en pantalla:
     1. el celular del hero, donde el agente atiende en vivo
        (se puede tocar un horario; si nadie toca, elige solo)
     2. la línea de tiempo de la noche a la mañana
   ========================================================== */

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- 1. El agente atendiendo en el celular del hero ---------- */
export function initHeroPhone() {
  const stage = document.getElementById("stage");
  const heroPhone = document.getElementById("heroPhone");
  const chat = document.getElementById("heroChat");
  const clock = document.getElementById("heroClock");
  const tap = document.getElementById("heroTap");
  const notifTurno = document.getElementById("notifTurno");
  if (!stage || !heroPhone || !chat || !clock) return;

  const notifs = stage.querySelectorAll(".notif");
  let timers = [], visible = true, esperando = false, slotsEl = null;

  const later = (ms, fn) => timers.push(setTimeout(fn, ms));

  const msg = (cls, text, label) => {
    const el = document.createElement("div");
    el.className = "pm " + cls;
    if (label) { const s = document.createElement("small"); s.textContent = label; el.appendChild(s); }
    el.appendChild(document.createTextNode(text));
    chat.appendChild(el);
    return el;
  };

  const typing = () => {
    const el = document.createElement("div");
    el.className = "pm bot typing";
    el.innerHTML = "<i></i><i></i><i></i>";
    chat.appendChild(el);
    return el;
  };

  function elegir(boton) {
    if (!slotsEl || slotsEl.classList.contains("done")) return;
    timers.forEach(clearTimeout); timers = [];
    const hora = boton.textContent;
    boton.classList.add("picked");
    slotsEl.classList.add("done");
    slotsEl.querySelectorAll("button").forEach(b => { b.disabled = true; });
    if (notifTurno) notifTurno.textContent = "Jueves " + hora;
    later(500, () => msg("user", hora + " me viene bien"));
    later(1200, () => { clock.textContent = "23:42"; });
    let t;
    later(1300, () => { t = typing(); });
    later(2300, () => { t.remove(); msg("bot", "Listo ✓ Te agendé el jueves a las " + hora + ". El día antes te mando un recordatorio.", "agente · agendado"); });
    later(2700, () => notifs[0] && notifs[0].classList.add("show"));
    later(3500, () => notifs[1] && notifs[1].classList.add("show"));
    later(4300, () => notifs[2] && notifs[2].classList.add("show"));
    later(10000, () => { if (visible) play(); else esperando = true; });
  }

  function play() {
    timers.forEach(clearTimeout); timers = [];
    esperando = false;
    chat.textContent = ""; slotsEl = null;
    clock.textContent = "23:40";
    notifs.forEach(n => n.classList.remove("show"));
    let t;
    later(500, () => msg("user", "Hola! ¿Tenés turno el jueves?"));
    later(1300, () => { t = typing(); });
    later(2400, () => {
      t.remove();
      const b = msg("bot", "¡Hola! El jueves tengo estos horarios:", "agente · al instante");
      slotsEl = document.createElement("div");
      slotsEl.className = "slots";
      ["10:00", "11:30", "16:00"].forEach(h => {
        const btn = document.createElement("button");
        btn.type = "button"; btn.className = "slot"; btn.textContent = h;
        btn.setAttribute("aria-label", "Elegir el jueves a las " + h);
        btn.addEventListener("click", () => elegir(btn));
        slotsEl.appendChild(btn);
      });
      b.appendChild(slotsEl);
    });
    // Si nadie toca, el "paciente" elige el de las 11:30
    later(5600, () => {
      const btn = slotsEl && slotsEl.children[1];
      if (!btn || !tap) return;
      const pr = heroPhone.getBoundingClientRect(), br = btn.getBoundingClientRect();
      tap.style.left = (br.left - pr.left + br.width / 2) + "px";
      tap.style.top = (br.top - pr.top + br.height / 2) + "px";
      tap.classList.remove("go"); void tap.offsetWidth; tap.classList.add("go");
      setTimeout(() => elegir(btn), 350);
    });
  }

  new IntersectionObserver(entries => {
    entries.forEach(e => {
      visible = e.isIntersecting;
      if (visible && esperando) play();
    });
  }, { threshold: .2 }).observe(heroPhone);

  play();
}

/* ---------- 2. Noche → mañana: la línea de tiempo avanza sola ---------- */
export function initLineaNoche() {
  const night = document.getElementById("night");
  if (!night) return;
  const steps = night.querySelectorAll(".tstep");
  if (!steps.length) return;

  let visible = false, t0 = 0, raf = 0;
  const DUR = 7000, PAUSA = 2600;

  function set(p) {
    night.style.setProperty("--p", p.toFixed(3));
    steps.forEach((s, k) => s.classList.toggle("on", p >= k / (steps.length - 1) - .001));
  }

  function frame(t) {
    if (!t0) t0 = t;
    const e = (t - t0) % (DUR + PAUSA);
    set(Math.min(1, e / DUR));
    raf = visible ? requestAnimationFrame(frame) : 0;
  }

  if (reduceMotion) { set(1); return; }

  new IntersectionObserver(entries => {
    entries.forEach(e => {
      visible = e.isIntersecting;
      if (visible && !raf) { t0 = 0; raf = requestAnimationFrame(frame); }
    });
  }, { threshold: .3 }).observe(night);
}
