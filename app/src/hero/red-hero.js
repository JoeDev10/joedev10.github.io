/* ==========================================================
   MJR Digital — red de puntos del hero (canvas 2D)
   Puntos y líneas en el azul intenso de la marca (#0444E4)
   sobre el azul noche (#0A193A).

   Antes esto era three.js: 536 kB (131 kB comprimidos) para
   dibujar puntos y rayas. La misma escena hecha a mano sobre
   canvas 2D pesa unos pocos kB, así que ahora también se
   enciende en celular, donde el 3D quedaba apagado.

   La topología se calcula una sola vez. En cada cuadro solo
   se rotan los puntos y se proyectan, que es barato.

   Al pasar el puntero por encima, los nodos que quedan cerca
   se encienden, sus líneas se avivan y se enganchan al cursor:
   la red parece conectarse donde mirás.
   ========================================================== */

const LINEA = "4, 68, 228";    // #0444E4
const PUNTO = "145, 180, 255"; // #91b4ff

const FOV = 55;        // grados, igual que la cámara de antes
const CAMARA_Z = 150;  // distancia de la cámara al centro
const RADIO = 27;      // separación máxima para unir dos puntos
const CAJA = { x: 120, y: 70, z: 60 };

/* ---------- El puntero ---------- */
const ALCANCE = 220;   // px de pantalla: hasta dónde llega el cursor
const ENGANCHES = 7;   // cuántos nodos se atan al cursor a la vez
const NIVELES = 4;     // escalones de brillo (un trazo por escalón)

// Colores y grosores de las líneas encendidas, del azul de marca
// al azul claro. Se calculan una vez, no por cuadro.
const BRILLO = [];
const GROSOR = [];
for (let n = 1; n <= NIVELES; n++) {
  const f = n / NIVELES;
  const r = Math.round(4 + (145 - 4) * f);
  const g = Math.round(68 + (180 - 68) * f);
  const b = Math.round(228 + (255 - 228) * f);
  BRILLO.push("rgba(" + r + "," + g + "," + b + "," + (0.3 + f * 0.45).toFixed(3) + ")");
  GROSOR.push(1 + f * 0.35);
}

/**
 * Enciende la red sobre el canvas que se le pasa.
 * Devuelve { dispose } para soltar todo cuando no se usa más.
 */
export function crearRedHero(canvas) {
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return { dispose() {} };

  const esChico = innerWidth < 768;
  const CANT = esChico ? 60 : 140;
  const TAM_PUNTO = esChico ? 1.5 : 1.3;
  // en una pantalla táctil no existe "pasar por arriba": ahí no se enciende
  const hayHover = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---------- Puntos ---------- */
  const px = new Float32Array(CANT);
  const py = new Float32Array(CANT);
  const pz = new Float32Array(CANT);
  for (let i = 0; i < CANT; i++) {
    px[i] = (Math.random() - 0.5) * CAJA.x;
    py[i] = (Math.random() - 0.5) * CAJA.y;
    pz[i] = (Math.random() - 0.5) * CAJA.z;
  }

  /* ---------- Líneas: qué par se une, una sola vez ---------- */
  const pares = [];
  for (let i = 0; i < CANT; i++) {
    for (let j = i + 1; j < CANT; j++) {
      const dx = px[i] - px[j];
      const dy = py[i] - py[j];
      const dz = pz[i] - pz[j];
      if (dx * dx + dy * dy + dz * dz < RADIO * RADIO) pares.push(i, j);
    }
  }
  // en qué escalón de brillo cae cada línea este cuadro (255 = no se dibuja)
  const nivel = new Uint8Array(pares.length / 2);

  // Proyección de cada punto en pantalla, reusada entre líneas y puntos.
  const sx = new Float32Array(CANT);
  const sy = new Float32Array(CANT);
  const sr = new Float32Array(CANT);  // radio en pantalla; 0 = no dibujar
  const enc = new Float32Array(CANT); // 0..1, cuánto lo encendió el puntero
  const enganchados = [];             // los nodos atados al cursor

  /* ---------- Medidas ---------- */
  let ancho = 0, alto = 0, foco = 0, escalaPunto = 0, tempo = 0;
  let izq = 0, arriba = 0, scrollVisto = -1;

  // Dónde está el canvas en la ventana. Se recalcula cuando hace falta,
  // no en cada cuadro: pedir el rect obliga al navegador a medir.
  function ubicar() {
    const r = canvas.getBoundingClientRect();
    izq = r.left;
    arriba = r.top;
    scrollVisto = scrollY;
  }

  function medir() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    ancho = Math.max(1, Math.round(r.width));
    alto = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(ancho * dpr);
    canvas.height = Math.round(alto * dpr);
    // se dibuja en píxeles CSS; el dpr lo aplica la matriz
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // mismo encuadre que daba la cámara de three
    foco = (alto / 2) / Math.tan((FOV * Math.PI) / 360);
    // el tamaño del punto se escala aparte: three lo saca de la altura del
    // canvas, no del foco, y si se usa el foco los puntos salen al doble
    escalaPunto = alto / 2;
    izq = r.left;
    arriba = r.top;
    scrollVisto = scrollY;
  }
  medir();

  const alRedimensionar = () => {
    clearTimeout(tempo);
    tempo = setTimeout(medir, 180);
  };
  addEventListener("resize", alRedimensionar);

  /* ---------- Mouse y scroll ---------- */
  const destino = { x: 0, y: 0 };
  const actual = { x: 0, y: 0 };
  let clienteX = 0, clienteY = 0, punteroVivo = false;

  const alMover = (e) => {
    destino.x = (e.clientX / innerWidth - .5) * 2;
    destino.y = (e.clientY / innerHeight - .5) * 2;
    if (!hayHover) return;
    clienteX = e.clientX;
    clienteY = e.clientY;
    punteroVivo = true;
  };
  addEventListener("pointermove", alMover, { passive: true });

  // si el cursor se va de la ventana, la red se apaga sola
  const alSalir = () => { punteroVivo = false; };
  addEventListener("blur", alSalir);
  document.addEventListener("pointerleave", alSalir);

  /* ---------- Bucle ---------- */
  let visible = true, pedido = 0, t = 0;
  const observador = new IntersectionObserver(
    (es) => {
      visible = es[0].isIntersecting;
      if (visible && !pedido) pedido = requestAnimationFrame(pintar);
    },
    { threshold: 0 }
  );
  observador.observe(canvas);

  function pintar() {
    pedido = visible ? requestAnimationFrame(pintar) : 0;
    if (!visible) return;

    t += 0.0012;
    // el mouse llega de a poco (lerp), no de golpe
    actual.x += (destino.x - actual.x) * .05;
    actual.y += (destino.y - actual.y) * .05;

    const rotY = t + actual.x * .34 + scrollY * 0.00035;
    const rotX = Math.sin(t * 1.6) * .06 + actual.y * .2;
    const cosY = Math.cos(rotY), senY = Math.sin(rotY);
    const cosX = Math.cos(rotX), senX = Math.sin(rotX);
    const cx = ancho / 2, cy = alto / 2;

    /* 1) rotar y proyectar cada punto */
    for (let i = 0; i < CANT; i++) {
      const x0 = px[i], y0 = py[i], z0 = pz[i];
      // giro en Y
      const x1 = x0 * cosY + z0 * senY;
      const z1 = z0 * cosY - x0 * senY;
      // giro en X
      const y2 = y0 * cosX - z1 * senX;
      const z2 = z1 * cosX + y0 * senX;

      const dist = CAMARA_Z - z2;
      if (dist <= 1) { sr[i] = 0; continue; } // detrás de la cámara
      const k = foco / dist;
      sx[i] = cx + x1 * k;
      sy[i] = cy - y2 * k;
      sr[i] = Math.max(.35, TAM_PUNTO * (escalaPunto / dist) * .5);
    }

    /* 2) dónde cae el puntero sobre el canvas */
    if (scrollY !== scrollVisto) ubicar(); // el hero se corrió con el scroll
    const mx = clienteX - izq;
    const my = clienteY - arriba;
    const dentro = punteroVivo &&
      mx > -ALCANCE && mx < ancho + ALCANCE &&
      my > -ALCANCE && my < alto + ALCANCE;

    /* 3) cuánto está encendido cada nodo: prende rápido, se apaga lento */
    for (let i = 0; i < CANT; i++) {
      let meta = 0;
      if (dentro && sr[i]) {
        const dx = sx[i] - mx, dy = sy[i] - my;
        const d2 = dx * dx + dy * dy;
        if (d2 < ALCANCE * ALCANCE) {
          const f = 1 - Math.sqrt(d2) / ALCANCE;
          meta = f * f; // cae suave hacia el borde del alcance
        }
      }
      enc[i] += (meta - enc[i]) * (meta > enc[i] ? .22 : .08);
    }

    /* 4) en qué escalón de brillo queda cada línea */
    for (let k = 0, p = 0; k < pares.length; k += 2, p++) {
      const a = pares[k], b = pares[k + 1];
      if (!sr[a] || !sr[b]) { nivel[p] = 255; continue; }
      // manda el extremo más apagado: la línea se aviva cuando los dos lo están
      const m = enc[a] < enc[b] ? enc[a] : enc[b];
      nivel[p] = m < .04 ? 0 : Math.min(NIVELES, 1 + Math.floor(m * NIVELES));
    }

    ctx.clearRect(0, 0, ancho, alto);

    /* 5) las líneas en reposo, todas en un trazo */
    ctx.beginPath();
    for (let k = 0, p = 0; k < pares.length; k += 2, p++) {
      if (nivel[p] !== 0) continue;
      const a = pares[k], b = pares[k + 1];
      ctx.moveTo(sx[a], sy[a]);
      ctx.lineTo(sx[b], sy[b]);
    }
    ctx.strokeStyle = "rgba(" + LINEA + ", .26)";
    ctx.lineWidth = 1;
    ctx.stroke();

    /* 6) las encendidas: un trazo por escalón, no uno por línea */
    for (let n = 1; n <= NIVELES; n++) {
      let hay = false;
      ctx.beginPath();
      for (let k = 0, p = 0; k < pares.length; k += 2, p++) {
        if (nivel[p] !== n) continue;
        const a = pares[k], b = pares[k + 1];
        ctx.moveTo(sx[a], sy[a]);
        ctx.lineTo(sx[b], sy[b]);
        hay = true;
      }
      if (!hay) continue;
      ctx.strokeStyle = BRILLO[n - 1];
      ctx.lineWidth = GROSOR[n - 1];
      ctx.stroke();
    }

    /* 7) los nodos más encendidos se atan al cursor */
    enganchados.length = 0;
    if (dentro) {
      for (let i = 0; i < CANT; i++) if (sr[i] && enc[i] > .05) enganchados.push(i);
      enganchados.sort((a, b) => enc[b] - enc[a]);
      if (enganchados.length > ENGANCHES) enganchados.length = ENGANCHES;

      ctx.lineWidth = 1;
      for (let k = 0; k < enganchados.length; k++) {
        const i = enganchados[k];
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(sx[i], sy[i]);
        ctx.strokeStyle = "rgba(" + PUNTO + "," + (enc[i] * .45).toFixed(3) + ")";
        ctx.stroke();
      }
    }

    /* 8) los puntos apagados, en un solo relleno */
    ctx.fillStyle = "rgba(" + PUNTO + ", .75)";
    ctx.beginPath();
    for (let i = 0; i < CANT; i++) {
      const r = sr[i];
      if (!r || enc[i] > .04) continue;
      ctx.moveTo(sx[i] + r, sy[i]);
      ctx.arc(sx[i], sy[i], r, 0, 6.2832);
    }
    ctx.fill();

    /* 9) y los encendidos: halo en dos capas para que no quede un anillo */
    for (let i = 0; i < CANT; i++) {
      const r = sr[i], e = enc[i];
      if (!r || e <= .04) continue;
      ctx.fillStyle = "rgba(" + PUNTO + "," + (e * .07).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], r + 3.4 * e, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = "rgba(" + PUNTO + "," + (e * .13).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], r + 1.7 * e, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255," + (.6 + e * .35).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], r * (1 + e * .45), 0, 6.2832);
      ctx.fill();
    }

    /* 10) el cursor también es un nodo */
    if (dentro && enganchados.length) {
      const e = enc[enganchados[0]];
      ctx.fillStyle = "rgba(" + PUNTO + "," + (e * .5).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(mx, my, 1.6 + e, 0, 6.2832);
      ctx.fill();
    }
  }
  pedido = requestAnimationFrame(pintar);

  /* ---------- Soltar todo ---------- */
  function dispose() {
    visible = false;
    if (pedido) cancelAnimationFrame(pedido);
    pedido = 0;
    clearTimeout(tempo);
    observador.disconnect();
    removeEventListener("resize", alRedimensionar);
    removeEventListener("pointermove", alMover);
    removeEventListener("blur", alSalir);
    document.removeEventListener("pointerleave", alSalir);
    ctx.clearRect(0, 0, ancho, alto);
  }

  return { dispose };
}
