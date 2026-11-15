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
   ========================================================== */

const LINEA = "4, 68, 228";    // #0444E4
const PUNTO = "145, 180, 255"; // #91b4ff

const FOV = 55;        // grados, igual que la cámara de antes
const CAMARA_Z = 150;  // distancia de la cámara al centro
const RADIO = 27;      // separación máxima para unir dos puntos
const CAJA = { x: 120, y: 70, z: 60 };

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

  // Proyección de cada punto en pantalla, reusada entre líneas y puntos.
  const sx = new Float32Array(CANT);
  const sy = new Float32Array(CANT);
  const sr = new Float32Array(CANT); // radio en pantalla; 0 = no dibujar

  /* ---------- Medidas ---------- */
  let ancho = 0, alto = 0, foco = 0, escalaPunto = 0, tempo = 0;
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
  const alMover = (e) => {
    destino.x = (e.clientX / innerWidth - .5) * 2;
    destino.y = (e.clientY / innerHeight - .5) * 2;
  };
  addEventListener("pointermove", alMover, { passive: true });

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

    // 1) rotar y proyectar cada punto
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

    ctx.clearRect(0, 0, ancho, alto);

    // 2) las líneas, todas en un trazo: un solo stroke para las ~1.600
    ctx.beginPath();
    for (let k = 0; k < pares.length; k += 2) {
      const a = pares[k], b = pares[k + 1];
      if (!sr[a] || !sr[b]) continue;
      ctx.moveTo(sx[a], sy[a]);
      ctx.lineTo(sx[b], sy[b]);
    }
    ctx.strokeStyle = "rgba(" + LINEA + ", .26)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3) los puntos encima
    ctx.fillStyle = "rgba(" + PUNTO + ", .75)";
    for (let i = 0; i < CANT; i++) {
      const r = sr[i];
      if (!r) continue;
      ctx.beginPath();
      ctx.arc(sx[i], sy[i], r, 0, 6.2832);
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
    ctx.clearRect(0, 0, ancho, alto);
  }

  return { dispose };
}
