/* ==========================================================
   MJR Digital — red de puntos del hero (WebGL)
   Puntos y líneas en el azul intenso de la marca (#0444E4)
   sobre el azul noche (#0A193A). Se importan solo las clases
   que se usan, así el bundle no se lleva todo three.
   La topología se calcula una sola vez: después solo se gira
   el grupo, que es barato.
   ========================================================== */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from "three";

const AZUL_LINEA = new Color("#0444E4");
const AZUL_PUNTO = new Color("#91b4ff");

/**
 * Enciende la red sobre el canvas que se le pasa.
 * Devuelve { dispose } para soltar todo cuando no se usa más.
 */
export function crearRedHero(canvas) {
  const esChico = innerWidth < 768;
  const CANT = esChico ? 60 : 140;
  const RADIO = 27;          // separación máxima para unir dos puntos
  const CAJA = { x: 120, y: 70, z: 60 };

  const escena = new Scene();
  const camara = new PerspectiveCamera(55, 1, 1, 600);
  camara.position.set(0, 0, 150);

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: !esChico,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0a193a, 0);

  /* ---------- Puntos ---------- */
  const pos = new Float32Array(CANT * 3);
  for (let i = 0; i < CANT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * CAJA.x;
    pos[i * 3 + 1] = (Math.random() - 0.5) * CAJA.y;
    pos[i * 3 + 2] = (Math.random() - 0.5) * CAJA.z;
  }

  const geoPuntos = new BufferGeometry();
  geoPuntos.setAttribute("position", new BufferAttribute(pos, 3));
  const matPuntos = new PointsMaterial({
    color: AZUL_PUNTO,
    size: esChico ? 1.5 : 1.3,
    sizeAttenuation: true,
    transparent: true,
    opacity: .75,
    depthWrite: false,
  });
  const puntos = new Points(geoPuntos, matPuntos);

  /* ---------- Líneas (una sola vez) ---------- */
  const pares = [];
  for (let i = 0; i < CANT; i++) {
    for (let j = i + 1; j < CANT; j++) {
      const dx = pos[i * 3] - pos[j * 3];
      const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
      const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < RADIO * RADIO) pares.push(i, j);
    }
  }
  const posLineas = new Float32Array(pares.length * 3);
  for (let k = 0; k < pares.length; k++) {
    const i = pares[k];
    posLineas[k * 3] = pos[i * 3];
    posLineas[k * 3 + 1] = pos[i * 3 + 1];
    posLineas[k * 3 + 2] = pos[i * 3 + 2];
  }
  const geoLineas = new BufferGeometry();
  geoLineas.setAttribute("position", new BufferAttribute(posLineas, 3));
  const matLineas = new LineBasicMaterial({
    color: AZUL_LINEA,
    transparent: true,
    opacity: .26,
    depthWrite: false,
  });
  const lineas = new LineSegments(geoLineas, matLineas);

  const grupo = new Group();
  grupo.add(puntos);
  grupo.add(lineas);
  escena.add(grupo);

  /* ---------- Medidas ---------- */
  let ancho = 0, alto = 0, tempo = 0;
  function medir() {
    const r = canvas.getBoundingClientRect();
    ancho = Math.max(1, Math.round(r.width));
    alto = Math.max(1, Math.round(r.height));
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
    renderer.setSize(ancho, alto, false);
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

    grupo.rotation.y = t + actual.x * .34 + scrollY * 0.00035;
    grupo.rotation.x = Math.sin(t * 1.6) * .06 + actual.y * .2;

    renderer.render(escena, camara);
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
    geoPuntos.dispose();
    geoLineas.dispose();
    matPuntos.dispose();
    matLineas.dispose();
    escena.clear();
    renderer.dispose();
  }

  return { dispose };
}
