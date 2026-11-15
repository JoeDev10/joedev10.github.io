/* ==========================================================
   MJR Digital — capa "zarpado" (movimiento)
   Todo lo nuevo vive acá para no tocar la lógica del chat.
   Se apaga solo si el visitante pide menos movimiento.
   ========================================================== */
(function () {
  "use strict";

  var body = document.body;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = matchMedia("(pointer: fine)").matches;
  var raf = requestAnimationFrame;

  /* ---------- 1. INTRO ---------- */
  (function boot() {
    var el = document.getElementById("boot");
    if (!el) { body.classList.add("ready"); return; }
    if (reduce) {
      el.remove();
      body.classList.remove("booting");
      body.classList.add("ready");
      return;
    }
    var bar = el.querySelector(".boot-bar i");
    var num = el.querySelector(".boot-num");
    var p = 0, done = false;

    // si ya la vio en esta visita, no le repetimos la intro entera
    var yaVino = false;
    try { yaVino = sessionStorage.getItem("mjr-boot") === "1"; } catch (e) {}
    if (yaVino) {
      done = true;
      setTimeout(abrir, 90);
      return;
    }
    try { sessionStorage.setItem("mjr-boot", "1"); } catch (e) {}

    var cargado = false;
    addEventListener("load", function () { cargado = true; }, { once: true });

    var t = setInterval(function () {
      // avanza rápido hasta 90 y espera a que termine de cargar
      var techo = cargado ? 100 : 92;
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
    setTimeout(function () { if (!done) { done = true; clearInterval(t); abrir(); } }, 4500);

    function abrir() {
      bar.style.setProperty("--p", "1");
      num.textContent = "100";
      body.classList.add("booted");
      body.classList.remove("booting");
      setTimeout(function () { body.classList.add("ready"); }, 180);
      setTimeout(function () { body.classList.add("boot-done"); }, 1500);
    }
  })();

  /* ---------- 2. SCROLL SUAVE (Lenis) ---------- */
  var lenis = null;
  if (!reduce && window.Lenis) {
    try {
      lenis = new window.Lenis({
        duration: 1.1,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
        smoothWheel: true,
        touchMultiplier: 1.6
      });
      (function loop(time) { lenis.raf(time); raf(loop); })(0);

      // los anclajes internos pasan por Lenis
      document.querySelectorAll('a[href^="#"]').forEach(function (a) {
        a.addEventListener("click", function (e) {
          var id = a.getAttribute("href");
          if (!id || id === "#") return;
          var dest = document.querySelector(id);
          if (!dest) return;
          e.preventDefault();
          lenis.scrollTo(dest, { offset: -70 });
        });
      });
    } catch (err) { lenis = null; }
  }

  /* ---------- 3. CURSOR ---------- */
  if (fine && !reduce) {
    var dot = document.getElementById("cur");
    var ring = document.getElementById("cur-ring");
    if (dot && ring) {
      body.classList.add("cursor-on");
      var rotulo = ring.querySelector("b");
      var mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
      addEventListener("pointermove", function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
      addEventListener("pointerdown", function () { body.classList.add("cur-down"); });
      addEventListener("pointerup", function () { body.classList.remove("cur-down"); });
      (function tick() {
        rx += (mx - rx) * 0.16;
        ry += (my - ry) * 0.16;
        dot.style.transform = "translate3d(" + mx + "px," + my + "px,0)";
        ring.style.transform = "translate3d(" + rx + "px," + ry + "px,0)";
        raf(tick);
      })();

      var hot = "a, button, .chip, .slot, input, textarea, [data-magnet]";
      document.addEventListener("pointerover", function (e) {
        var t = e.target.closest("[data-cursor]");
        if (t) {
          rotulo.textContent = t.getAttribute("data-cursor");
          body.classList.add("cur-label");
          body.classList.remove("cur-hot");
          return;
        }
        if (e.target.closest(hot)) { body.classList.add("cur-hot"); }
      });
      document.addEventListener("pointerout", function (e) {
        if (e.target.closest("[data-cursor]")) body.classList.remove("cur-label");
        if (e.target.closest(hot)) body.classList.remove("cur-hot");
      });
    }
  }

  /* ---------- 4. TEXTO PARTIDO EN LÍNEAS ---------- */
  function partir(el) {
    if (el.dataset.split === "listo") return;
    var frag = document.createDocumentFragment();
    var nodos = Array.prototype.slice.call(el.childNodes);
    var piezas = [];

    function enPalabras(texto, molde) {
      texto.split(/(\s+)/).forEach(function (w) {
        if (!w) return;
        if (/^\s+$/.test(w)) { piezas.push({ esp: true }); return; }
        piezas.push({ txt: w, molde: molde });
      });
    }

    nodos.forEach(function (n) {
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

    piezas.forEach(function (p) {
      if (p.esp) { frag.appendChild(document.createTextNode(" ")); return; }
      var w = document.createElement("span");
      w.className = "sp-word";
      var inner = document.createElement("span");
      inner.className = "sp-i";
      if (p.nodo) {
        inner.appendChild(p.nodo);
      } else if (p.molde) {
        var env = p.molde.cloneNode(false);
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
    Array.prototype.forEach.call(el.querySelectorAll(":scope > .sp-word"), function (w, i) {
      w.style.setProperty("--wd", (i * 60) + "ms");
    });
  }

  if (!reduce) {
    document.querySelectorAll("[data-split]").forEach(partir);
  }

  /* ---------- 5. APARICIONES (líneas, demos) ---------- */
  var obs = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      obs.unobserve(e.target);
    });
  }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
  document.querySelectorAll(".sp-line, .work").forEach(function (el) { obs.observe(el); });

  /* ---------- 6. NAV: indicador y sección activa ---------- */
  (function nav() {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var links = Array.prototype.slice.call(nav.querySelectorAll("a"));
    var rail = document.querySelector(".rail");
    var railLinks = rail ? Array.prototype.slice.call(rail.querySelectorAll("a")) : [];

    function marcar(el) {
      if (!el) { nav.style.setProperty("--io", "0"); return; }
      nav.style.setProperty("--ix", el.offsetLeft + "px");
      nav.style.setProperty("--iw", el.offsetWidth + "px");
      nav.style.setProperty("--io", "1");
    }

    links.forEach(function (a) {
      a.addEventListener("pointerenter", function () { marcar(a); });
    });
    nav.addEventListener("pointerleave", function () { marcar(nav.querySelector("a.on")); });

    var secciones = ["servicios", "noche", "demos", "precios", "faq"]
      .map(function (id) { return document.getElementById(id); })
      .filter(Boolean);

    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = e.target.id;
        links.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + id); });
        railLinks.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + id); });
        marcar(nav.querySelector("a.on"));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    secciones.forEach(function (s) { spy.observe(s); });
  })();

  /* ---------- 7. LIENZO: red de puntos del hero ---------- */
  (function red() {
    var c = document.getElementById("net");
    if (!c || reduce) return;
    var ctx = c.getContext("2d", { alpha: true });
    if (!ctx) return;

    var dpr = Math.min(devicePixelRatio || 1, 2);
    var W = 0, H = 0, pts = [], on = true;
    var pm = { x: -9999, y: -9999 };

    function medir() {
      var r = c.getBoundingClientRect();
      W = r.width; H = r.height;
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(90, Math.max(34, (W * H) / 16000)));
      pts = [];
      for (var i = 0; i < n; i++) {
        pts.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.6 + 0.6
        });
      }
    }

    addEventListener("pointermove", function (e) {
      var r = c.getBoundingClientRect();
      pm.x = e.clientX - r.left; pm.y = e.clientY - r.top;
    }, { passive: true });

    function pintar() {
      if (!on) { raf(pintar); return; }
      ctx.clearRect(0, 0, W, H);
      var i, j, a, b, dx, dy, d;

      for (i = 0; i < pts.length; i++) {
        a = pts[i];
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > W) a.vx *= -1;
        if (a.y < 0 || a.y > H) a.vy *= -1;
        // se apartan del mouse
        dx = a.x - pm.x; dy = a.y - pm.y; d = Math.hypot(dx, dy);
        if (d < 130 && d > 0.1) { a.x += (dx / d) * 0.9; a.y += (dy / d) * 0.9; }
      }

      for (i = 0; i < pts.length; i++) {
        a = pts[i];
        for (j = i + 1; j < pts.length; j++) {
          b = pts[j];
          dx = a.x - b.x; dy = a.y - b.y; d = dx * dx + dy * dy;
          if (d < 20000) {
            var op = (1 - d / 20000) * 0.3;
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
    addEventListener("resize", function () { clearTimeout(red._t); red._t = setTimeout(medir, 180); });
    new IntersectionObserver(function (es) { on = es[0].isIntersecting; }, { threshold: 0 }).observe(c);
    raf(pintar);
  })();

  /* ---------- 8. CINTA GRANDE: se mueve con el scroll ---------- */
  (function banda() {
    var track = document.getElementById("bandTrack");
    var band = document.getElementById("band");
    if (!track) return;
    // se clona para que el loop no corte
    var base = Array.prototype.slice.call(track.children);
    base.forEach(function (n) { track.appendChild(n.cloneNode(true)); });

    if (reduce) return;
    var ancho = 0, off = 0, last = scrollY, vel = 0, skew = 0;

    function medir() { ancho = track.scrollWidth / 2; }
    medir();
    addEventListener("resize", function () { clearTimeout(banda._t); banda._t = setTimeout(medir, 200); });

    (function tick() {
      var y = scrollY;
      var dv = y - last; last = y;
      vel += (dv - vel) * 0.18;
      off = (off + 0.9 + vel * 0.55) % (ancho || 1);
      if (off < 0) off += ancho || 1;
      track.style.transform = "translate3d(" + (-off) + "px,0,0)";
      skew += (Math.max(-5, Math.min(5, vel * 0.12)) - skew) * 0.12;
      if (band) band.style.setProperty("--skew", skew.toFixed(2) + "deg");
      raf(tick);
    })();
  })();

  /* ---------- 9. DEMOS: scroll horizontal pegado ---------- */
  (function horizontal() {
    var wrap = document.querySelector(".hscroll");
    if (!wrap) return;
    var row = wrap.querySelector(".hscroll-row");
    var hint = wrap.querySelector(".hscroll-hint b");
    var activo = false, extra = 0;

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

    function mover() {
      if (!activo) return;
      var r = wrap.getBoundingClientRect();
      var p = Math.min(1, Math.max(0, -r.top / (extra || 1)));
      row.style.transform = "translate3d(" + (-p * extra) + "px,0,0)";
      if (hint) hint.style.setProperty("--hp", p.toFixed(3));
    }

    medir();
    addEventListener("resize", function () { clearTimeout(horizontal._t); horizontal._t = setTimeout(medir, 200); });
    addEventListener("scroll", mover, { passive: true });
    setTimeout(medir, 900);
    addEventListener("load", medir);
  })();

  /* ---------- 10. PARALLAX suave ---------- */
  (function parallax() {
    if (reduce) return;
    var items = Array.prototype.slice.call(document.querySelectorAll("[data-par]"));
    if (!items.length) return;
    var pendiente = false;

    function pintar() {
      pendiente = false;
      var vh = innerHeight;
      items.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var centro = r.top + r.height / 2 - vh / 2;
        var k = parseFloat(el.getAttribute("data-par")) || 0.06;
        el.style.translate = "0 " + (-centro * k).toFixed(1) + "px";
      });
    }
    addEventListener("scroll", function () {
      if (pendiente) return;
      pendiente = true; raf(pintar);
    }, { passive: true });
    addEventListener("resize", pintar);
    pintar();
  })();
})();
