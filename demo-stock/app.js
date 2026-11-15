// Demo con datos ficticios del sistema de stock para heladerías. No habla con ningún servidor:
// todo pasa en la memoria de la página (demo-servidor.js) y se borra al recargar.
import * as V from "./vista.js";
import { servidorDemo } from "./demo-servidor.js";

const API = "demo";
const $ = (id) => document.getElementById(id);
// En la demo hay un solo local, ficticio.
const LOCAL = "centro";

// Demo: nada se guarda en el navegador. Todo vive en memoria y se borra al recargar.
const memoria = new Map();
const guardado = {
  leer(k) {
    return memoria.has(k) ? memoria.get(k) : null;
  },
  poner(k, v) {
    if (v == null) memoria.delete(k);
    else memoria.set(k, String(v));
  },
  /** Las [resto de la clave, valor] que empiezan con el prefijo. */
  claves(prefijo) {
    return [...memoria.entries()].filter(([k]) => k.startsWith(prefijo)).map(([k, v]) => [k.slice(prefijo.length), v]);
  },
};

// Un número al azar de este aparato (no dice nada de la persona): en la lista de aparatos de cada local se ve
// cuántas tablets o celulares lo usan. Sin almacenamiento cambia cada vez; da igual, la página anda.
const APARATO = (() => {
  const k = guardado.leer("stock_aparato");
  if (k) return k;
  const nuevo = crypto.randomUUID?.() ?? null; // un navegador muy viejo no lo tiene: no se anota y listo
  guardado.poner("stock_aparato", nuevo);
  return nuevo;
})();

const st = {
  sesion: LOCAL ? guardado.leer(`stock_sesion:${LOCAL}`) : null, // cada local, su sesión
  localNombre: LOCAL ? guardado.leer(`stock_nombre:${LOCAL}`) : null,
  sabores: [], // todos: helados y panificados (cada sección muestra los suyos)
  frecuentes: [], // lo más abierto de los últimos 14 días: [{ sabor_id, n }]
  frecuentesTraidos: 0,
  hoy: { abiertos: 0 },
  hoyPan: { abiertos: 0 },
  seccion: guardado.leer("stock_seccion") === "panificados" ? "panificados" : "helados",
  vista: null,
  carga: null, // { tipo: "pedido" | "conteo" | "armar", borrador: { [sabor_id]: número }, texto? }
  whatsapp: "", // a quién se manda el pedido armado (solo dígitos), o ""
  enCamino: { helados: null, panificados: null }, // lo pasado a WhatsApp que todavía no llegó: { items, creado_en }
  hist: { fecha: null, hoy: null },
  pendientes: {}, // toques de "abrir" esperando respuesta, por sabor
  filtro: false, // true = solo "Poco stock" (0 o 1 balde)
  busqueda: { stock: null, carga: null }, // null = sin buscar; texto = lo que se está buscando
  version: 0, // sube con cada cambio local: una recarga que empezó antes se descarta
  mutando: 0, // cambios en fila o en curso
  fotoEn: null, // cuándo se trajeron los números que se ven (ISO)
  sinRed: false,
};

// ---------- Servidor ----------

class SinSesion extends Error {}
let enVuelo = 0;
let timerCargando = 0;

function cargando(delta) {
  enVuelo += delta;
  clearTimeout(timerCargando);
  if (enVuelo > 0) timerCargando = setTimeout(() => ($("cargando").hidden = false), 350);
  else $("cargando").hidden = true;
}

async function api(accion, datos = {}) {
  cargando(+1);
  try {
    let r;
    try {
      r = await servidorDemo(API, {
        method: "POST",
        headers: { "content-type": "application/json", ...(st.sesion ? { "x-stock-sesion": st.sesion } : {}) },
        body: JSON.stringify({ accion, ...datos, ...(APARATO && (accion === "entrar" || accion === "estado") ? { aparato: APARATO } : {}) }),
      });
    } catch {
      marcarRed(false);
      throw Object.assign(new Error("Sin conexión. No se guardó."), { estado: 0 });
    }
    marcarRed(true);
    let cuerpo = {};
    try {
      cuerpo = await r.json();
    } catch { /* respuesta vacía */ }
    if (r.status === 401 && cuerpo.error === "sesion") {
      cerrarSesion();
      throw new SinSesion();
    }
    // Local suspendido (no pagó o venció la prueba): vuelve al PIN con el aviso.
    if (r.status === 403 && accion !== "entrar") {
      cerrarSesion(cuerpo.error);
      throw new SinSesion();
    }
    if (!r.ok) throw Object.assign(new Error(cuerpo.error || "No se pudo conectar."), { estado: r.status });
    return cuerpo;
  } finally {
    cargando(-1);
  }
}

// Todo lo que cambia el stock va en fila: así "Deshacer" siempre deshace lo último que tocaste.
let cola = Promise.resolve();
function enCola(fn) {
  const p = cola.then(fn);
  cola = p.catch(() => {});
  return p;
}

// Un cambio de stock: va en fila y, mientras está pendiente, las recargas automáticas no pisan la pantalla.
function mutar(fn) {
  st.mutando++;
  st.version++;
  return enCola(fn).finally(() => {
    st.mutando--;
    st.version++;
  });
}

// ---------- Secciones: helados y panificados ----------

const sec = () => V.SECCIONES[st.seccion];
const pan = () => st.seccion === "panificados";
/** Los productos de la sección que se está viendo. */
const visibles = () => V.deSeccion(st.sabores, st.seccion);
const grupos = () => V.agrupar(visibles(), sec().grupos);
const hoySec = () => (pan() ? st.hoyPan : st.hoy);

function cambiarSeccion(seccion) {
  if (seccion === st.seccion) return;
  st.seccion = seccion;
  guardado.poner("stock_seccion", seccion);
  st.filtro = false;
  cerrarBusqueda("stock", false);
  $("aviso").hidden = true;
  pintarSeccion();
  pintarStock();
  window.scrollTo(0, 0);
}

// Lo que cambia según la sección y no se repinta con cada número: color, placeholders y ayudas.
function pintarSeccion() {
  document.body.dataset.seccion = st.seccion;
  const ej = pan() ? "(ej.: árabe, miga, rolls)" : "(ej.: pist, dulce, frut)";
  for (const id of ["stock-buscar", "carga-buscar"]) {
    $(id).placeholder = `Buscar ${sec().item}… ${ej}`;
    $(id).setAttribute("aria-label", `Buscar ${sec().item} por el nombre`);
  }
  $("b-conteo").dataset.ayuda = pan()
    ? "Corregir con lo que hay de verdad en el pozo de panificados"
    : "Corregir con lo que hay de verdad en el pozo y el freezer";
  $("b-menu").dataset.ayuda = `Agregar, ordenar o sacar ${sec().items} · Bloquear la tablet`;
}

// ---------- Sin internet ----------
// Sin internet: un cartel arriba (en la demo no hace falta internet).

function marcarRed(hay) {
  st.sinRed = !hay;
  document.body.classList.toggle("desconectada", !hay);
  $("sin-red").hidden = hay;
  if (!hay) $("sin-red-texto").textContent = V.textoSinRed(st.fotoEn);
}

function guardarFoto(r) {
  st.fotoEn = new Date().toISOString();
  guardado.poner(`stock_ultimo_estado:${LOCAL}`, JSON.stringify({ sabores: r.sabores, hoy: r.hoy, hoy_pan: r.hoy_pan, whatsapp: r.whatsapp, en_camino: r.en_camino, en: st.fotoEn }));
}

/** Pone en pantalla los últimos números guardados. Devuelve false si no hay. */
function usarFotoGuardada() {
  try {
    const f = JSON.parse(guardado.leer(`stock_ultimo_estado:${LOCAL}`));
    if (!Array.isArray(f?.sabores) || typeof f.en !== "string") return false;
    st.sabores = f.sabores;
    // Los "abiertos hoy" de otro día no corresponden.
    const deHoy = V.hoyArgentina(new Date(f.en)) === V.hoyArgentina();
    st.hoy = deHoy ? f.hoy : { abiertos: 0 };
    st.hoyPan = deHoy && f.hoy_pan ? f.hoy_pan : { abiertos: 0 };
    st.whatsapp = typeof f.whatsapp === "string" ? f.whatsapp : "";
    st.enCamino = f.en_camino ?? { helados: null, panificados: null };
    st.fotoEn = f.en;
    return true;
  } catch {
    return false;
  }
}

function fallo(e) {
  if (e instanceof SinSesion) return;
  sonar("error");
  avisar(V.escapar(e.message || "Algo salió mal."), { error: true });
}

// ---------- Vistas ----------

const VISTAS = ["pin", "stock", "carga", "historial", "tareas", "pozos", "ventas"];

function mostrar(nombre) {
  st.vista = nombre;
  for (const donde of ["stock", "carga"]) if (donde !== nombre) cerrarBusqueda(donde, false);
  $("aviso").hidden = true; // el aviso de la pantalla anterior no corresponde a la nueva
  for (const v of VISTAS) $(`v-${v}`).hidden = v !== nombre;
  const barra = document.querySelector(`#v-${nombre} .barra`);
  if (barra) observadorBarra.observe(barra);
  const fila = document.querySelector(`#v-${nombre} .chips`);
  if (fila) observadorChips.observe(fila);
  window.scrollTo(0, 0);
  pantallaEncendida();
}

// Los chips pueden ocupar dos filas (pantalla angosta): al ir a un grupo, su título queda justo debajo de ellos.
const observadorChips = new ResizeObserver((entradas) => {
  for (const e of entradas) {
    if (e.target.offsetParent !== null) {
      document.documentElement.style.setProperty("--alto-chips", `${Math.round(e.target.offsetHeight)}px`);
    }
  }
});

// Los chips quedan pegados justo debajo de la barra, que puede ocupar una o dos filas.
const observadorBarra = new ResizeObserver((entradas) => {
  for (const e of entradas) {
    if (e.target.offsetParent !== null) {
      document.documentElement.style.setProperty("--alto-barra", `${Math.round(e.target.offsetHeight)}px`);
    }
  }
});

// ---------- Aviso (abajo) ----------

let timerAviso = 0;
function avisar(texto, { deshacer = false, error = false } = {}) {
  const a = $("aviso");
  (document.querySelector("dialog[open]") ?? document.body).appendChild(a); // visible también sobre un diálogo
  $("aviso-texto").innerHTML = texto;
  $("aviso-deshacer").hidden = !deshacer;
  a.classList.toggle("error", error);
  a.hidden = false;
  a.style.animation = "none";
  void a.offsetWidth;
  a.style.animation = "";
  const ms = deshacer ? 6000 : error ? 5000 : 3500;
  const barra = $("aviso-barra");
  barra.classList.remove("corre");
  if (deshacer) {
    void barra.offsetWidth;
    barra.style.animationDuration = `${ms}ms`;
    barra.classList.add("corre");
  }
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => (a.hidden = true), ms);
}

function vibrar(patron) {
  try {
    navigator.vibrate?.(patron);
  } catch { /* no soportado */ }
}

// ---------- Sonidos ----------
// Cortos y suaves, generados en la página (sin archivos). Se apagan desde ☰ → Sonido.

let audio = null;
const sonidoPrendido = () => guardado.leer("stock_sonido") !== "no";

// Cada sonido: notas [frecuencia inicial, frecuencia final, duración en s, demora en s].
const SONIDOS = {
  toc: { onda: "sine", volumen: 0.16, notas: [[740, 520, 0.07, 0]] }, // abrir un balde
  deshacer: { onda: "sine", volumen: 0.16, notas: [[520, 740, 0.07, 0]] }, // el "toc" al revés
  exito: { onda: "sine", volumen: 0.13, notas: [[587, 587, 0.09, 0], [880, 880, 0.12, 0.09]] }, // guardado
  error: { onda: "triangle", volumen: 0.2, notas: [[240, 180, 0.2, 0]] }, // no se pudo
};

function sonar(nombre) {
  document.body.dataset.ultimoSonido = nombre; // para las pruebas
  if (!sonidoPrendido()) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
    const s = SONIDOS[nombre];
    const t0 = audio.currentTime + 0.01;
    for (const [desde, hasta, dur, demora] of s.notas) {
      const osc = audio.createOscillator();
      const vol = audio.createGain();
      const t = t0 + demora;
      osc.type = s.onda;
      osc.frequency.setValueAtTime(desde, t);
      osc.frequency.exponentialRampToValueAtTime(hasta, t + dur);
      vol.gain.setValueAtTime(0.0001, t);
      vol.gain.exponentialRampToValueAtTime(s.volumen, t + 0.008); // entrada rápida, sin "click"
      vol.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(vol).connect(audio.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  } catch { /* sin audio: no pasa nada */ }
}

function pintarBotonSonido() {
  const b = $("b-sonido");
  const si = sonidoPrendido();
  b.setAttribute("aria-pressed", String(si));
  b.querySelector("span").textContent = si ? "Sonido: sí" : "Sonido: no";
  b.dataset.ayuda = si ? "Apagar los sonidos de los botones" : "Prender los sonidos de los botones";
}

// ---------- Confirmar ----------

function confirmar(texto, si = "Sí") {
  const d = $("d-confirmar");
  $("conf-texto").textContent = texto;
  $("conf-si").textContent = si;
  d.showModal();
  return new Promise((resolver) => {
    const cerrar = (valor) => {
      $("conf-si").onclick = $("conf-no").onclick = d.oncancel = null;
      d.close();
      resolver(valor);
    };
    $("conf-si").onclick = () => cerrar(true);
    $("conf-no").onclick = () => cerrar(false);
    d.oncancel = () => cerrar(false);
  });
}

// ---------- PIN ----------

let pin = "";
let entrando = false;

function pintarPin() {
  [...$("pin-puntos").children].forEach((p, i) => p.classList.toggle("lleno", i < pin.length));
}

async function teclaPin(d) {
  if (entrando) return; // ya se está revisando el PIN
  if (d === "borrar") pin = pin.slice(0, -1);
  else if (pin.length < 4) pin += d;
  pintarPin();
  if (pin.length < 4) return;
  entrando = true;
  try {
    const r = await api("entrar", { local: LOCAL, pin });
    st.sesion = r.sesion;
    guardado.poner(`stock_sesion:${LOCAL}`, r.sesion);
    guardado.poner("stock_local", LOCAL); // la página principal abre este local la próxima vez
    pintarLocal(r.local?.nombre);
    pin = "";
    pintarPin();
    $("pin-msg").textContent = "Ingresá el PIN";
    $("pin-msg").classList.remove("mal");
    await iniciar();
  } catch (e) {
    pin = "";
    pintarPin();
    vibrar([40, 50, 40]);
    sonar("error");
    const p = $("pin-puntos");
    p.classList.remove("no");
    void p.offsetWidth;
    p.classList.add("no");
    $("pin-msg").textContent = e.estado === 0 ? "Sin conexión. Revisá el wifi y probá de nuevo." : e.message;
    $("pin-msg").classList.add("mal");
  } finally {
    entrando = false;
  }
}

function cerrarSesion(aviso = null) {
  st.sesion = null;
  guardado.poner(`stock_sesion:${LOCAL}`, null);
  guardado.poner(`stock_ultimo_estado:${LOCAL}`, null); // bloqueada, la tablet no muestra números
  $("pin-msg").textContent = aviso ?? "Ingresá el PIN";
  $("pin-msg").classList.toggle("mal", Boolean(aviso));
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  $("aviso").hidden = true;
  mostrar("pin");
}

// ---------- Stock ----------

function capital(t) {
  return t[0].toUpperCase() + t.slice(1);
}

function pintarSub() {
  const hoy = V.hoyArgentina();
  const lista = visibles();
  const total = lista.reduce((a, s) => a + s.cantidad, 0);
  const { abiertos, tortas = 0 } = hoySec();
  let texto = pan()
    ? `${capital(V.fechaLarga(hoy))} · hoy se ${abiertos === 1 ? "sacó" : "sacaron"} <strong>${abiertos}</strong> del pozo`
    : `${capital(V.fechaLarga(hoy))} · hoy se ${abiertos === 1 ? "abrió" : "abrieron"} <strong>${V.baldes(abiertos)}</strong>` +
      (tortas ? ` y ${tortas === 1 ? "salió" : "salieron"} <strong>${V.postres(tortas)}</strong>` : "");
  if (lista.length && total === 0) texto = `${capital(V.fechaLarga(hoy))} · falta el primer conteo`;
  $("stock-sub").innerHTML = texto;
}

function tarjeta(s) {
  const e = V.estadoBalde(s);
  // Abajo a la izquierda: un bloquecito por balde (hasta 8), o un cartel si hay que pedir o no queda nada.
  const pie = e === "cero"
    ? `<span class="pill pill-cero">Sin stock</span>`
    : e === "bajo"
    ? `<span class="pill pill-bajo">${s.cantidad === 1 ? "Queda 1" : "Pedir"}</span>`
    : `<span class="puntos" aria-hidden="true">${"<i></i>".repeat(Math.min(s.cantidad, 8))}</span>`;
  const esPan = V.deSeccion([s], "panificados").length > 0;
  const esTorta = V.esTorta(s);
  const aria = esPan || esTorta
    ? `${s.nombre}${s.detalle ? ` (${s.detalle})` : ""}: ${e === "cero" ? "sin stock" : `hay ${s.cantidad}`}. ` +
      (esPan ? "Tocá cuando saques uno del pozo." : "Tocá cuando salga una.")
    : `${s.nombre}: ${e === "cero" ? "sin stock" : V.baldes(s.cantidad)}. Tocá para abrir un balde.`;
  const ayuda = e === "cero"
    ? `Está en 0. Si llegó ${esPan || esTorta ? "el pedido" : "helado"}, usá “Llegó pedido”`
    : esPan
    ? "Tocá cuando saques uno del pozo: resta 1"
    : esTorta
    ? "Tocá cuando salga una (se vendió o se sacó del freezer): resta 1"
    : "Tocá cuando abras un balde de este sabor: resta 1";
  const detalle = s.detalle ? `<span class="sabor-detalle">${V.escapar(s.detalle)}</span>` : "";
  return `<button type="button" class="sabor ${e}${s.detalle ? " con-detalle" : ""}" data-id="${s.id}" data-g="${s.grupo}" aria-label="${V.escapar(aria)}" data-ayuda="${V.escapar(ayuda)}">` +
    `<span class="sabor-cabeza"><span class="sabor-nombre">${V.escapar(s.nombre)}</span>${detalle}</span>` +
    `<span class="sabor-pie">${pie}<span class="sabor-num">${s.cantidad}</span></span>` +
    `</button>`;
}

const LUPA = `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

function chips(grupos, marcarPrimero = true) {
  return `<button type="button" class="chip chip-buscar" data-buscar aria-label="Buscar ${sec().item}" data-ayuda="Buscar un ${sec().item} por el nombre">${LUPA}Buscar</button>` +
    grupos.map((g, i) =>
    `<button type="button" class="chip${marcarPrimero && i === 0 ? " activo" : ""}" data-ir="${g.id}" data-ayuda="Ir a ${g.nombre}">${g.corto ?? g.nombre} <b>${g.sabores.length}</b></button>`
  ).join("");
}

const ICONO_INFO =
  `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>`;

function avisosDeUso(total) {
  if (!visibles().length) return "";
  if (total === 0) {
    const que = pan()
      ? "Contá cuántos paquetes, cajas o unidades hay en el pozo de cada producto"
      : "Contá cuántos baldes cerrados hay de cada sabor";
    return `<div class="bienvenida"><div><h2>Empecemos por contar</h2>` +
      `<p>Todo está en 0. ${que} y cargalos con <strong>Conteo</strong>. ` +
      `Se hace una vez: después la página lleva la cuenta sola.</p></div>` +
      `<button type="button" class="btn btn-naranja" data-accion="conteo" data-ayuda="Abrir el conteo para cargar lo que hay">Hacer el conteo</button></div>`;
  }
  if (guardado.leer(pan() ? "stock_tip_pan_visto" : "stock_tip_visto")) return "";
  const consejo = pan()
    ? `<strong>Tocá un producto cada vez que saques uno del pozo</strong>` +
      // "Cómo viene" es opcional: si ningún producto lo tiene, todo va por unidad.
      (visibles().some((s) => s.detalle) ? ` (un paquete, una caja o una unidad: lo que dice abajo del nombre)` : "") +
      `. Si tocaste sin querer, usá Deshacer. Cuando llegue el pedido, “Llegó pedido”.`
    : `<strong>Tocá un sabor cada vez que abras un balde.</strong> ` +
      `Si tocaste sin querer, usá Deshacer. Cuando llegue helado, “Llegó pedido”.`;
  return `<div class="tip">${ICONO_INFO}<p>${consejo}</p>` +
    `<button type="button" class="btn btn-borde" data-accion="tip-ok" data-ayuda="Cerrar este consejo">Entendido</button></div>`;
}

// Arriba de los grupos: Helados | Panificados.
const selectorSeccion = () =>
  `<div class="secciones" role="tablist" aria-label="Sección">${
    Object.values(V.SECCIONES).map((x) =>
      `<button type="button" role="tab" class="seccion-btn${x.id === st.seccion ? " activa" : ""}" data-seccion="${x.id}" ` +
      `aria-selected="${x.id === st.seccion}" data-ayuda="Ver el stock de ${x.nombre.toLowerCase()}">${x.nombre}</button>`
    ).join("")
  }</div>`;

function pintarStock() {
  const lista = visibles();
  const grupos = V.agrupar(lista, sec().grupos);
  const total = lista.reduce((a, s) => a + s.cantidad, 0);
  const pocos = total > 0 ? lista.filter(V.bajo) : [];
  if (!pocos.length) st.filtro = false;
  $("stock-chips").innerHTML = selectorSeccion() + (pocos.length
    ? `<button type="button" class="chip chip-poco${st.filtro ? " activo" : ""}" data-filtro="poco" data-ayuda="${st.filtro ? `Volver a ver todos los ${sec().items}` : "Ver lo que hay que pedir: lo que está por debajo del ideal (o queda 1, si no tiene ideal)"}">Poco stock <b>${pocos.length}</b></button>`
    : "") + chips(grupos, !st.filtro);
  let cuerpo;
  if (!grupos.length) cuerpo = `<p class="vacio">No hay ${sec().items} en la lista. Agregalos desde el menú <strong>☰</strong>.</p>`;
  else if (st.busqueda.stock !== null) {
    $("stock-grilla").innerHTML = resultados(st.busqueda.stock, grupos, tarjeta);
    pintarSub();
    pintarEnCamino();
    return;
  } else if (st.filtro) {
    // Primero lo urgente (queda 1), después lo que ya se terminó.
    const orden = grupos.flatMap((g) => g.sabores);
    const bloque = (clase, titulo, lista) => lista.length
      ? `<section class="grupo ${clase}"><h2>${titulo}</h2><div class="grilla">${lista.map(tarjeta).join("")}</div></section>`
      : "";
    const bajos = orden.filter(V.bajo);
    cuerpo = `<div class="pedir-esto"><p>${V.cuantos(bajos.length, st.seccion)} para pedir</p>` +
      `<button type="button" class="btn btn-verde" data-accion="pedir" data-ayuda="Armar el pedido con lo que falta para llegar al ideal">Pedir esto</button></div>` +
      bloque("grupo-poco", "Queda poco · hay que pedir", bajos.filter((s) => s.cantidad > 0)) +
      bloque("grupo-cero", "Se terminó", bajos.filter((s) => s.cantidad <= 0));
  } else {
    // Arriba, lo que más se abrió en los últimos 14 días: un toque, sin buscar.
    const usados = V.masUsados(st.frecuentes, lista);
    cuerpo = (usados.length >= 3
      ? `<section class="grupo grupo-usados"><h2>Lo más usado</h2><div class="grilla">${usados.map(tarjeta).join("")}</div></section>`
      : "") + grupos.map((g) =>
      `<section class="grupo" id="g-${g.id}" data-g="${g.id}"><h2>${g.nombre}</h2>` +
      `<div class="grilla">${g.sabores.map(tarjeta).join("")}</div></section>`
    ).join("");
  }
  $("stock-grilla").innerHTML = avisosDeUso(total) + cuerpo;
  pintarSub();
  pintarEnCamino();
  marcarChip();
}

/** La marca "en camino" sobre Llegó pedido, si hay un pedido mandado de esta sección que todavía no se cargó. */
function pintarEnCamino() {
  const ec = st.enCamino[st.seccion];
  const hay = Object.keys(V.precargaEnCamino(ec, visibles())).length > 0;
  $("pedido-en-camino").hidden = !hay;
  const base = pan() ? "Sumar lo que llegó en el pedido" : "Sumar los baldes que llegaron en el pedido";
  $("b-pedido").dataset.ayuda = hay ? `${base} (ya viene puesto el que se mandó ${V.cuandoFue(ec.creado_en)})` : base;
}

function pintarTarjeta(s, efecto) {
  // Puede estar dos veces: en "Lo más usado" y en su grupo.
  for (const vieja of document.querySelectorAll(`#stock-grilla .sabor[data-id="${s.id}"]`)) vieja.outerHTML = tarjeta(s);
  if (efecto) for (const b of document.querySelectorAll(`#stock-grilla .sabor[data-id="${s.id}"]`)) b.classList.add(efecto);
}

let ultimaFoto = "";
let reintentoEstado = 0;
async function recargarEstado() {
  const version = st.version;
  const r = await api("estado");
  if (version !== st.version || st.mutando > 0) {
    // Llegó tarde (hubo un cambio en el medio): se vuelve a pedir en un rato, cuando esté todo quieto.
    if (!reintentoEstado) {
      reintentoEstado = setTimeout(() => {
        reintentoEstado = 0;
        if (st.sesion) recargarEstado().catch(() => {});
      }, 1000);
    }
    return false;
  }
  // Los pozos también (para abrir desde la pantalla de stock en el pozo que corresponde), como mucho una vez por minuto.
  if (Date.now() - pz.traidos > 60000) cargarPozos(true);
  // Lo más usado cambia despacio: cada media hora alcanza.
  if (Date.now() - st.frecuentesTraidos > 30 * 60000) cargarFrecuentes();
  const foto = JSON.stringify(r);
  st.sabores = r.sabores;
  st.hoy = r.hoy;
  st.hoyPan = r.hoy_pan ?? { abiertos: 0 };
  st.whatsapp = r.whatsapp ?? "";
  st.enCamino = r.en_camino ?? { helados: null, panificados: null };
  if (r.local) pintarLocal(r.local.nombre);
  guardarFoto(r);
  if (foto !== ultimaFoto && st.vista === "stock") pintarStock();
  ultimaFoto = foto;
  return true;
}

function abrirBalde(id) {
  const s = st.sabores.find((x) => x.id === id);
  if (!s) return;
  if (s.cantidad <= 0) {
    pintarTarjeta(s, "no");
    vibrar([30, 40, 30]);
    sonar("error");
    avisar(`<strong>${V.escapar(s.nombre)}</strong> ya está en 0. Si llegó ${pan() || V.esTorta(s) ? "el pedido" : "helado"}, usá “Llegó pedido”.`);
    return;
  }
  if (abrirDesdeStock(s)) return;
  const hoy = hoySec();
  const campo = V.esTorta(s) ? "tortas" : "abiertos"; // las tortas no son baldes: se cuentan aparte
  s.cantidad--;
  hoy[campo] = (hoy[campo] ?? 0) + 1;
  pintarTarjeta(s, "pop");
  pintarSub();
  vibrar(15);
  sonar("toc");
  avisar(`<strong>${V.escapar(s.nombre)}</strong>: ${pan() || V.esTorta(s) ? "sacaste 1" : "abriste 1 balde"} · ${s.cantidad === 1 ? "queda" : "quedan"} <strong>${s.cantidad}</strong>`, {
    deshacer: true,
  });
  st.pendientes[id] = (st.pendientes[id] ?? 0) + 1;
  mutar(() => api("abrir", { sabor_id: id }))
    .then((r) => {
      st.pendientes[id]--;
      if (!st.pendientes[id] && s.cantidad !== r.despues) {
        s.cantidad = r.despues;
        pintarTarjeta(s);
      }
    })
    .catch((e) => {
      st.pendientes[id]--;
      s.cantidad++;
      hoy[campo]--;
      pintarTarjeta(s);
      pintarSub();
      fallo(e);
      if (e.estado === 404 || e.estado === 409) recargarEstado().catch(() => {});
    });
}

function deshacer() {
  $("aviso").hidden = true;
  $("b-deshacer").disabled = true;
  const seccion = st.seccion; // Deshacer solo toca lo de la sección que se ve
  mutar(async () => {
    const { ultimo } = await api("ultimo", { seccion });
    if (!ultimo) return { deshecho: null };
    const pregunta = V.preguntaDeshacer(ultimo, seccion, st.sabores);
    if (pregunta && !(await confirmar(pregunta, "Deshacer"))) return { cancelado: true };
    return await api("deshacer", { lote: ultimo.lote, seccion });
  })
    .then(async (r) => {
      if (r.cancelado) return;
      await recargarEstado();
      if (st.vista === "stock") pintarStock();
      if ($("d-ajustes").open) pintarAjustes();
      cargarPozos(st.vista !== "pozos"); // lo deshecho también vuelve atrás en los pozos
      sonar(r.deshecho ? "deshacer" : "error");
      avisar(V.textoDeshecho(r.deshecho, seccion));
    })
    .catch(fallo)
    .finally(() => ($("b-deshacer").disabled = false));
}

// ---------- Buscar por nombre ----------

function resultados(consulta, grupos, pintar) {
  const q = consulta.trim();
  if (!q) {
    const ej = pan() ? "“árabe”, “miga” o “rolls”" : "“pist”, “dulce” o “frut”";
    return `<p class="vacio">Escribí parte del nombre, por ejemplo ${ej}.</p>`;
  }
  const lista = V.buscar(grupos.flatMap((g) => g.sabores), q);
  const texto = V.escapar(q);
  if (!lista.length) return `<p class="vacio">No hay ningún ${sec().item} con “${texto}”.</p>`;
  return `<section class="grupo grupo-busqueda"><h2>${V.cuantos(lista.length, st.seccion)} con “${texto}”</h2>` +
    `<div class="grilla">${lista.map(pintar).join("")}</div></section>`;
}

function repintar(donde) {
  if (donde === "stock") pintarStock();
  else if (st.carga) pintarCargaGrilla();
}

function abrirBusqueda(donde) {
  if (donde === "stock") st.filtro = false;
  st.busqueda[donde] = "";
  $(`${donde}-chips`).hidden = true;
  $(`${donde}-buscador`).hidden = false;
  $(`${donde}-buscar`).value = "";
  repintar(donde);
  window.scrollTo(0, 0);
  $(`${donde}-buscar`).focus();
}

function cerrarBusqueda(donde, pintar = true) {
  if (st.busqueda[donde] === null) return;
  st.busqueda[donde] = null;
  $(`${donde}-buscar`).blur();
  $(`${donde}-chips`).hidden = false;
  $(`${donde}-buscador`).hidden = true;
  if (pintar) repintar(donde);
}

// Al tocar un resultado, se esconde el teclado de la pantalla (la búsqueda queda).
function soltarTeclado() {
  if (document.activeElement?.type === "search") document.activeElement.blur();
}

// El chip del grupo que se está viendo queda marcado.
function marcarChip() {
  if (st.vista === "stock" && st.filtro) return;
  if (st.busqueda[st.vista === "carga" ? "carga" : "stock"] !== null) return;
  const tope = (parseInt(getComputedStyle(document.documentElement).getPropertyValue("--alto-barra")) || 88) +
    (parseInt(getComputedStyle(document.body).getPropertyValue("--alto-red")) || 0);
  const contenedor = st.vista === "carga" ? "carga" : "stock";
  const grupos = [...document.querySelectorAll(`#${contenedor}-grilla .grupo:not(.grupo-usados)`)];
  let actual = grupos[0]?.dataset.g;
  const chipsAlto = document.querySelector(`#${contenedor}-chips`)?.offsetHeight ?? 72;
  for (const g of grupos) if (g.getBoundingClientRect().top <= tope + chipsAlto + 60) actual = g.dataset.g;
  if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) actual = grupos.at(-1)?.dataset.g;
  document.querySelectorAll(`#${contenedor}-chips .chip`).forEach((c) => c.classList.toggle("activo", c.dataset.ir === actual));
}

function irAGrupo(id) {
  const contenedor = st.vista === "carga" ? "carga" : "stock";
  document.querySelector(`#${contenedor}-grilla .grupo[data-g="${id}"]`)?.scrollIntoView({ behavior: "smooth" });
}

// ---------- Llegó pedido / Conteo / Armar pedido ----------

function valorCarga(s) {
  const v = st.carga.borrador[s.id];
  if (v !== undefined) return v;
  if (st.carga.precarga?.[s.id] !== undefined) return st.carga.precarga[s.id];
  if (st.carga.tipo === "armar") return V.sugerido(s);
  return st.carga.tipo === "conteo" ? s.cantidad : 0;
}

function itemCarga(s) {
  const v = valorCarga(s);
  const tipo = st.carga.tipo;
  const pedido = tipo === "pedido";
  const cambiado = tipo === "conteo" ? v !== s.cantidad : v > 0;
  const n = V.escapar(s.nombre);
  let sub;
  let ideal = ""; // en Armar pedido, un renglón propio para el ideal (al lado de los botones no entra)
  if (tipo === "armar") {
    sub = `hay ${s.cantidad}`;
    ideal = `<button type="button" class="item-ideal" data-ideal="${s.id}" aria-label="Cambiar el ideal de ${n}" ` +
      `data-ayuda="Cuánto conviene tener. El pedido sugiere lo que falta para llegar">` +
      `${s.ideal == null ? "Poner ideal" : `Ideal: <strong>${s.ideal}</strong>`}</button>`;
  } else {
    sub = pedido
      ? (v > 0 ? `hay ${s.cantidad} → quedan <strong>${s.cantidad + v}</strong>` : `hay ${s.cantidad}`)
      : (cambiado ? `decía ${s.cantidad} → <strong>${v}</strong>` : `decía ${s.cantidad}`);
  }
  const detalle = s.detalle ? ` <span class="item-detalle">${V.escapar(s.detalle)}</span>` : "";
  return `<div class="item${cambiado ? " cambiado" : ""}" data-id="${s.id}">` +
    `<span class="item-nombre">${detalle ? `<span>${n}</span>${detalle}` : n}</span>${ideal}<div class="item-fila"><span class="item-sub">${sub}</span>` +
    `<button type="button" class="paso" data-paso="-1" data-id="${s.id}" aria-label="Uno menos de ${n}" data-ayuda="Uno menos"${v <= 0 ? " disabled" : ""}>` +
    `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>` +
    `<button type="button" class="item-valor" data-numero="${s.id}" aria-label="Escribir la cantidad de ${n}" data-ayuda="Tocá para escribir el número con el teclado">${pedido && v > 0 ? "+" + v : v}</button>` +
    `<button type="button" class="paso mas" data-paso="1" data-id="${s.id}" aria-label="Uno más de ${n}" data-ayuda="Uno más"${v >= 999 ? " disabled" : ""}>` +
    `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></div></div>`;
}

/** Lo que se guarda (pedido/conteo) o se manda (armar) con lo cargado hasta ahora. */
function itemsCarga() {
  const { tipo, borrador, precarga } = st.carga;
  if (tipo === "armar") return V.itemsArmar(borrador, visibles());
  return V.itemsDeBorrador(tipo, { ...precarga, ...borrador }, visibles());
}

function pintarGuardar() {
  const items = itemsCarga();
  const b = $("b-carga-guardar");
  b.textContent = st.carga.tipo === "armar"
    ? V.textoSiguiente(items, st.seccion)
    : V.textoGuardar(st.carga.tipo, items, st.seccion, st.sabores);
  b.disabled = items.length === 0;
}

const TITULOS_CARGA = { pedido: "Llegó pedido", conteo: "Conteo", armar: "Armar pedido" };

function abrirCarga(tipo) {
  // Llegó pedido con un pedido en camino: ya viene puesto lo que se pidió (precarga), y se corrige lo que llegó distinto.
  const ec = tipo === "pedido" ? st.enCamino[st.seccion] : null;
  const precarga = ec ? V.precargaEnCamino(ec, visibles()) : {};
  const hayPrecarga = Object.keys(precarga).length > 0;
  st.carga = { tipo, borrador: {}, precarga: hayPrecarga ? precarga : null, inicio: Date.now() };
  const v = $("v-carga");
  v.classList.toggle("conteo", tipo === "conteo");
  v.classList.toggle("armar", tipo === "armar");
  const titulo = TITULOS_CARGA[tipo];
  $("carga-titulo").textContent = pan() ? `${titulo} · Panificados` : titulo;
  const item = sec().item;
  $("carga-sub").textContent = {
    pedido: `Tocá + en cada ${item} que entró, o tocá el número para escribirlo. Nada se guarda hasta que toques Guardar.`,
    conteo: `Poné lo que hay de verdad en cada ${item} (con + y −, o tocando el número). Solo se guardan los que cambian.`,
    armar: `Ya está puesto lo que falta para llegar al ideal de cada ${item}. Cambiá lo que quieras y tocá Siguiente.`,
  }[tipo];
  if (hayPrecarga) {
    $("carga-sub").textContent = `Ya está puesto el pedido que se mandó ${V.cuandoFue(ec.creado_en)}. ` +
      "Corregí lo que llegó distinto y tocá Guardar.";
  }
  $("b-carga-vacio").hidden = !hayPrecarga;
  $("b-carga-guardar").dataset.ayuda = tipo === "armar"
    ? "Ver el mensaje del pedido y mandarlo por WhatsApp"
    : "Guardar todo lo que cargaste";
  cerrarBusqueda("carga", false);
  $("carga-chips").innerHTML = chips(grupos());
  pintarCargaGrilla();
  pintarGuardar();
  mostrar("carga");
}

function pintarCargaGrilla() {
  const gs = grupos();
  $("carga-grilla").innerHTML = st.busqueda.carga !== null
    ? resultados(st.busqueda.carga, gs, itemCarga)
    : gs.map((g) =>
      `<section class="grupo" id="c-${g.id}" data-g="${g.id}"><h2>${g.nombre}</h2>` +
      `<div class="grilla">${g.sabores.map(itemCarga).join("")}</div></section>`
    ).join("");
}

function pasoCarga(id, delta) {
  const s = st.sabores.find((x) => x.id === id);
  if (!s) return;
  fijarCarga(id, valorCarga(s) + delta);
  vibrar(8);
}

function fijarCarga(id, valor) {
  const s = st.sabores.find((x) => x.id === id);
  if (!s) return;
  st.carga.borrador[id] = Math.min(999, Math.max(0, valor));
  document.querySelector(`#carga-grilla .item[data-id="${id}"]`).outerHTML = itemCarga(s);
  pintarGuardar();
}

// Teclado grande para escribir una cantidad de una (más rápido que tocar + muchas veces).
let numero = null; // { id, texto, nuevo }

function pintarNumero() {
  const mas = st.carga.tipo === "pedido" && !numero.ideal && numero.texto !== "0";
  $("num-valor").textContent = mas ? `+${numero.texto}` : numero.texto;
}

/** El teclado grande: para la cantidad de la tarjeta o (ideal = true) para el ideal del producto. */
function abrirNumero(id, ideal = false) {
  const s = st.sabores.find((x) => x.id === id);
  if (!s) return;
  numero = { id, texto: String(ideal ? (s.ideal ?? 0) : valorCarga(s)), nuevo: true, ideal };
  $("num-sabor").textContent = s.nombre;
  const unidad = pan() || V.esTorta(s) ? (s.detalle ? ` (${s.detalle})` : "") : " baldes";
  $("num-pregunta").textContent = ideal ? `¿Cuántos${unidad} conviene tener? (hay ${s.cantidad})` : {
    pedido: `¿Cuántos${unidad} entraron? (hay ${s.cantidad})`,
    conteo: `¿Cuántos${unidad} hay de verdad? (decía ${s.cantidad})`,
    armar: `¿Cuántos${unidad} pedir? (hay ${s.cantidad})`,
  }[st.carga.tipo];
  pintarNumero();
  $("d-numero").showModal();
}

/** Guarda el ideal de un producto (no cambia el stock). Si su cantidad no se tocó, pasa a la nueva sugerencia. */
async function fijarIdeal(id, ideal) {
  try {
    await api("ideal", { sabor_id: id, ideal });
  } catch (e) {
    return fallo(e);
  }
  const s = st.sabores.find((x) => x.id === id);
  if (!s) return;
  s.ideal = ideal;
  if (st.carga?.tipo !== "armar") return;
  const viejo = document.querySelector(`#carga-grilla .item[data-id="${id}"]`);
  if (viejo) viejo.outerHTML = itemCarga(s);
  pintarGuardar();
}

function teclaNumero(t) {
  if (!numero) return;
  if (t === "listo") {
    const { id, texto, ideal } = numero;
    numero = null;
    $("d-numero").close();
    if (ideal) fijarIdeal(id, Number(texto));
    else fijarCarga(id, Number(texto));
    return;
  }
  if (t === "borrar") numero.texto = numero.texto.slice(0, -1) || "0";
  else if (numero.nuevo || numero.texto === "0") numero.texto = t;
  else if (numero.texto.length < 3) numero.texto += t;
  numero.nuevo = false;
  vibrar(8);
  pintarNumero();
}

/** Saca lo precargado del pedido en camino (llegó otra cosa): se carga a mano. El pedido en camino queda anotado. */
function empezarVacio() {
  st.carga.precarga = null;
  st.carga.borrador = {};
  $("b-carga-vacio").hidden = true;
  $("carga-sub").textContent =
    `Tocá + en cada ${sec().item} que entró, o tocá el número para escribirlo. Nada se guarda hasta que toques Guardar.`;
  pintarCargaGrilla();
  pintarGuardar();
}

async function cancelarCarga() {
  // En Armar pedido lo sugerido no se pierde (se vuelve a calcular), y en Llegó pedido tampoco lo precargado:
  // solo pregunta si cambiaste algo a mano.
  const { tipo, borrador, precarga } = st.carga;
  const armando = tipo === "armar";
  const tocado = armando
    ? Object.keys(borrador).length > 0
    : JSON.stringify(itemsCarga()) !== JSON.stringify(V.itemsDeBorrador(tipo, precarga ?? {}, visibles()));
  const pregunta = armando
    ? "¿Salir sin mandar el pedido? Se pierden los cambios que hiciste."
    : "¿Salir sin guardar? Se pierde lo que cargaste.";
  if (tocado && !(await confirmar(pregunta, armando ? "Salir" : "Salir sin guardar"))) return;
  st.carga = null;
  mostrar("stock");
  pintarStock();
}

/**
 * Cuánto tardó una tarea terminada (conteo, Llegó pedido o Pedir), para medir el tiempo que ahorra la app.
 * Va aparte de todo lo demás: sin "cargando", sin avisos y sin cortar la sesión si falla; si no llega, no pasa nada.
 * Con keepalive llega aunque la página salte a WhatsApp enseguida.
 */
function anotarTiempo(tipo, seccion, inicio, items) {
  const segundos = Math.max(1, Math.round((Date.now() - inicio) / 1000));
  if (!st.sesion || segundos > 4 * 60 * 60) return; // más de 4 horas: la pantalla quedó olvidada abierta
  servidorDemo(API, {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json", "x-stock-sesion": st.sesion },
    body: JSON.stringify({ accion: "tiempo", tipo, seccion, segundos, items }),
  }).catch(() => {});
}

function guardarCarga() {
  if (st.carga.tipo === "armar") return abrirResumen();
  const { tipo, inicio } = st.carga;
  const items = itemsCarga();
  if (!items.length) return;
  const seccion = st.seccion;
  // Si vino precargado, al guardarlo deja de estar en camino.
  const enCamino = tipo === "pedido" && st.carga.precarga !== null;
  $("b-carga-guardar").disabled = true;
  mutar(() => api("cargar", { tipo, items, ...(enCamino ? { seccion, en_camino: true } : {}) }))
    .then(async (r) => {
      st.carga = null;
      anotarTiempo(tipo, seccion, inicio, items.length);
      if (enCamino) st.enCamino[seccion] = null;
      await recargarEstado().catch(() => {});
      mostrar("stock");
      pintarStock();
      const total = items.reduce((a, it) => a + it.cantidad, 0);
      sonar("exito");
      avisar(
        tipo === "pedido"
          ? `Pedido guardado: <strong>+${seccion === "helados" ? V.cuentaHelados(items, st.sabores) : V.SECCIONES[seccion].cuenta(total)}</strong>`
          : `Conteo guardado: <strong>${V.cuantos(items.length, seccion)} ${items.length === 1 ? "corregido" : "corregidos"}</strong>`,
        { deshacer: true },
      );
      if (r.omitidos) {
        setTimeout(() => avisar(`${V.cuantos(r.omitidos, seccion)} ya no ${r.omitidos === 1 ? "estaba" : "estaban"} en la lista y no se guardaron.`), 6200);
      }
      // Llegó helado: dónde se guardó cada sabor (así no queda "sin ubicar").
      if (tipo === "pedido" && seccion === "helados" && r.lote) {
        if (!pz.pozos) await cargarPozos(true);
        preguntarDondeGuardar(r.lote, items);
      }
    })
    .catch((e) => {
      fallo(e);
      pintarGuardar();
    });
}

// ---------- Armar pedido: el mensaje y WhatsApp ----------

function abrirResumen() {
  const items = itemsCarga();
  if (!items.length) return;
  st.carga.texto = V.textoPedido(st.seccion, items, V.hoyArgentina(), st.localNombre ?? LOCAL);
  $("ped-titulo").textContent = `Pedido de ${sec().nombre.toLowerCase()}`;
  $("ped-texto").textContent = st.carga.texto;
  $("ped-numero").value = V.numeroLindo(st.whatsapp);
  pintarNotaPedido();
  $("ped-auto-imprimir").checked = guardado.leer("stock_auto_imprimir") !== "no";
  $("d-pedido").showModal();
}

function pintarNotaPedido() {
  $("ped-nota").textContent = $("ped-numero").value.trim()
    ? "Se abre WhatsApp con el mensaje ya escrito para ese número. Revisalo y tocá Enviar."
    : "Sin número, WhatsApp te deja elegir a quién mandarlo. En la demo, el número no se guarda.";
}

async function mandarWhatsApp() {
  const escrito = $("ped-numero").value.trim();
  let numero = st.whatsapp;
  if (escrito !== V.numeroLindo(st.whatsapp)) {
    try {
      numero = (await api("whatsapp", { numero: escrito })).numero;
    } catch (e) {
      $("ped-numero").focus();
      return fallo(e);
    }
    st.whatsapp = numero;
    $("ped-numero").value = V.numeroLindo(numero);
  }
  // Abre WhatsApp (en la tablet, la app) con el mensaje escrito: nada se manda hasta que la persona toca Enviar.
  const link = V.linkWhatsApp(numero, st.carga.texto);
  anotarTiempo("armar", st.seccion, st.carga.inicio, itemsCarga().length);
  anotarEnCamino();
  const imprimir = $("ped-auto-imprimir").checked;
  if (imprimir) {
    $("comanda").innerHTML = V.htmlComanda(st.seccion, itemsCarga(), new Date(), st.localNombre ?? LOCAL);
    imprimirAlVolver();
  }
  const ventana = window.open(link, "_blank");
  if (ventana) ventana.opener = null;
  else location.href = link;
  $("d-pedido").close();
  st.carga = null;
  mostrar("stock");
  pintarStock();
  sonar("exito");
  avisar(
    "Pedido pasado a WhatsApp: revisalo y tocá <strong>Enviar</strong>" + (imprimir ? ". Al volver se imprime la comanda." : ""),
  );
}

/**
 * Imprime la comanda (ya puesta en #comanda) cuando la página vuelve a verse: en la tablet, WhatsApp tapa la página
 * y el cuadro de imprimir aparece al volver. Si WhatsApp se abrió al lado y la página sigue a la vista, imprime enseguida.
 */
function imprimirAlVolver() {
  let hecho = false;
  const imprimir = () => {
    if (hecho) return;
    hecho = true;
    clearTimeout(espera);
    document.removeEventListener("visibilitychange", alVolver);
    window.print();
  };
  const alVolver = () => document.visibilityState === "visible" && imprimir();
  document.addEventListener("visibilitychange", alVolver);
  const espera = setTimeout(alVolver, 2500);
}

/**
 * Anota el pedido armado como "en camino" (pisa el anterior de la sección): cuando llegue, "Llegó pedido" lo trae
 * puesto. No cambia el stock. Si falla, solo avisa: el mensaje ya está en WhatsApp.
 */
function anotarEnCamino() {
  const seccion = st.seccion;
  const items = itemsCarga().map(({ sabor_id, cantidad }) => ({ sabor_id, cantidad }));
  api("en_camino", { seccion, items })
    .then((r) => {
      st.enCamino[seccion] = r.en_camino;
      if (st.vista === "stock" && st.seccion === seccion) pintarEnCamino();
    })
    .catch((e) => {
      if (e instanceof SinSesion) return;
      avisar("El pedido no quedó anotado como «en camino»: cuando llegue, cargalo a mano en Llegó pedido.", { error: true });
    });
}

/** Imprime la comanda del pedido armado (en la impresora de tickets; el mismo cuadro deja guardarla como PDF). */
function imprimirPedido() {
  $("comanda").innerHTML = V.htmlComanda(st.seccion, itemsCarga(), new Date(), st.localNombre ?? LOCAL);
  window.print();
}

async function copiarPedido() {
  try {
    await navigator.clipboard.writeText(st.carga.texto);
    anotarEnCamino();
    avisar("Mensaje copiado: pegalo en WhatsApp o donde quieras");
  } catch {
    avisar("No se pudo copiar. Mantené apretado el texto para copiarlo.", { error: true });
  }
}

// ---------- Lo más usado ----------

async function cargarFrecuentes() {
  st.frecuentesTraidos = Date.now();
  try {
    const r = await api("frecuentes");
    const cambio = JSON.stringify(r.frecuentes) !== JSON.stringify(st.frecuentes);
    st.frecuentes = r.frecuentes ?? [];
    if (cambio && st.vista === "stock" && st.busqueda.stock === null && !st.filtro) pintarStock();
  } catch {
    st.frecuentesTraidos = 0; // que pruebe de nuevo la próxima vez (si falla, la fila no aparece y listo)
  }
}

// ---------- Descontar por voz ----------
// Se toca "Hablar", se dice qué se abrió y la app muestra lo que entendió: recién al tocar "Descontar" baja el stock.
// Usa el reconocimiento de voz del navegador (Chrome: necesita internet). Sin soporte, el botón no aparece.

const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
const voz = { rec: null, items: [], noEntendi: [], texto: "", estado: null };

function hojaVoz(html) {
  $("voz-hoja").innerHTML = html;
  if (!$("d-voz").open) $("d-voz").showModal();
}

function escucharVoz() {
  if (!Reconocedor) return;
  try {
    voz.rec?.abort();
  } catch { /* ya estaba cortado */ }
  const rec = new Reconocedor();
  voz.rec = rec;
  rec.lang = "es-AR";
  rec.interimResults = true;
  rec.maxAlternatives = 3;
  rec.continuous = false;
  voz.estado = "escuchando";
  voz.texto = "";
  hojaVoz(`<div class="hoja-cabeza"><div><h2 id="voz-titulo">Te escucho…</h2>` +
    `<p class="nota">Decí qué abriste. Por ejemplo: <strong>«dos de chocolate y un dulce de leche granizado»</strong>.</p></div>` +
    `<button type="button" class="btn btn-borde" data-voz-cancelar>Cancelar</button></div>` +
    `<div class="voz-escuchando"><span class="voz-onda" aria-hidden="true"></span><p id="voz-parcial" class="voz-parcial">&nbsp;</p></div>`);
  rec.onresult = (e) => {
    const r = e.results[e.results.length - 1];
    $("voz-parcial") && ($("voz-parcial").textContent = r[0].transcript);
    if (!r.isFinal) return;
    const textos = Array.from(r, (alt) => alt.transcript);
    const m = V.mejorInterpretacion(textos, visibles());
    voz.texto = m.texto;
    voz.items = m.items;
    voz.noEntendi = m.noEntendi;
    voz.estado = "resultado";
    pintarVoz();
  };
  rec.onerror = (e) => {
    if (voz.rec !== rec || e.error === "aborted") return;
    voz.estado = "error";
    const motivo = e.error === "not-allowed" || e.error === "service-not-allowed"
      ? "La tablet no dejó usar el micrófono. Tocá el candado de arriba (al lado de la dirección) y permití el micrófono."
      : e.error === "network"
      ? "Para entender la voz hace falta internet. Probá de nuevo cuando vuelva el wifi, o tocá el sabor."
      : e.error === "no-speech"
      ? "No escuché nada. Tocá «Hablar de nuevo» y decí el sabor cerca de la tablet."
      : "No pude escuchar. Probá de nuevo.";
    hojaVoz(`<div class="hoja-cabeza"><div><h2 id="voz-titulo">No se pudo</h2><p class="nota">${motivo}</p></div></div>` +
      `<div class="pz-hoja-pie"><button type="button" class="btn btn-borde" data-voz-cancelar>Cerrar</button>` +
      `<button type="button" class="btn btn-verde" data-voz-otra>Hablar de nuevo</button></div>`);
  };
  rec.onend = () => {
    if (voz.rec === rec && voz.estado === "escuchando") {
      voz.estado = "error";
      rec.onerror({ error: "no-speech" });
    }
  };
  try {
    rec.start();
  } catch {
    rec.onerror({ error: "otro" });
  }
}

function pintarVoz() {
  const total = voz.items.reduce((a, it) => a + it.cantidad, 0);
  const filas = voz.items.map((it, i) => {
    const s = st.sabores.find((x) => x.id === it.sabor_id);
    const falta = s && s.cantidad < it.cantidad;
    return `<div class="voz-fila${falta ? " voz-falta" : ""}"><span class="voz-nombre">${V.escapar(it.nombre)}` +
      `<small>${s ? `hay ${s.cantidad}${falta ? ": no alcanza" : ""}` : ""}</small></span>` +
      `<span class="pz-mas-menos"><button type="button" data-voz-cm="${i}" data-d="-1" aria-label="Uno menos de ${V.escapar(it.nombre)}">−</button>` +
      `<output>${it.cantidad}</output>` +
      `<button type="button" data-voz-cm="${i}" data-d="1" aria-label="Uno más de ${V.escapar(it.nombre)}">+</button></span>` +
      `<button type="button" class="pz-sacar" data-voz-sacar="${i}" aria-label="Sacar ${V.escapar(it.nombre)}">` +
      `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>`;
  }).join("");
  const sePuede = voz.items.length && voz.items.every((it) => (st.sabores.find((x) => x.id === it.sabor_id)?.cantidad ?? 0) >= it.cantidad);
  hojaVoz(`<div class="hoja-cabeza"><div><h2 id="voz-titulo">${voz.items.length ? "¿Descuento esto?" : "No entendí ningún sabor"}</h2>` +
    `<p class="nota">Escuché: «${V.escapar(voz.texto)}»</p></div></div>` +
    (filas ? `<div class="voz-lista">${filas}</div>` : "") +
    (voz.noEntendi.length
      ? `<p class="voz-no">No entendí: <strong>${voz.noEntendi.map(V.escapar).join(", ")}</strong>. Si era un sabor, decilo con el nombre completo o tocalo en la lista.</p>`
      : "") +
    `<div class="pz-hoja-pie"><button type="button" class="btn btn-borde" data-voz-cancelar>Cancelar</button>` +
    `<button type="button" class="btn btn-borde" data-voz-otra>Hablar de nuevo</button>` +
    (voz.items.length
      ? `<button type="button" class="btn btn-verde" data-voz-si${sePuede ? "" : " disabled"}>Descontar ${total}</button>`
      : "") +
    `</div>`);
}

/**
 * Descuenta lo confirmado, uno por uno, como un toque: si el sabor está en un pozo, sale de ese pozo (el de adelante
 * que lo tiene; si no, el de atrás), así el total y los pozos siguen iguales. No pregunta de dónde se trajo el reemplazo.
 */
async function descontarVoz() {
  const items = voz.items.slice();
  $("d-voz").close();
  const hechos = [];
  for (const it of items) {
    const s = st.sabores.find((x) => x.id === it.sabor_id);
    if (!s) continue;
    let n = 0;
    for (let k = 0; k < it.cantidad && s.cantidad > 0; k++) {
      const pozo = V.pozosParaAbrir(pz.pozos, s.id)[0];
      const hoy = hoySec();
      const campo = V.esTorta(s) ? "tortas" : "abiertos";
      try {
        const r = await mutar(() => pozo ? api("pozo_abrir", { pozo_id: pozo.id, sabor_id: s.id }) : api("abrir", { sabor_id: s.id }));
        s.cantidad = r.despues;
        hoy[campo] = (hoy[campo] ?? 0) + 1;
        if (pozo) {
          const fila = pozo.sabores.find((x) => x.sabor_id === s.id);
          if (fila && fila.cantidad > 0) fila.cantidad--;
        }
        n++;
      } catch (e) {
        fallo(e);
        break;
      }
    }
    if (n) {
      hechos.push(`${n} ${it.nombre}`);
      pintarTarjeta(s, "pop");
    }
  }
  pintarSub();
  if (hechos.length) {
    sonar("exito");
    vibrar(15);
    avisar(`Descontado: <strong>${hechos.map(V.escapar).join(", ")}</strong>. Si algo estaba mal, tocá Deshacer (de a uno).`);
  }
  recargarEstado().catch(() => {});
}

function clicVoz(e) {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.vozCancelar !== undefined) $("d-voz").close();
  else if (d.vozOtra !== undefined) escucharVoz();
  else if (d.vozSi !== undefined) descontarVoz();
  else if (d.vozCm !== undefined) {
    const it = voz.items[Number(d.vozCm)];
    it.cantidad = Math.max(1, Math.min(20, it.cantidad + Number(d.d)));
    pintarVoz();
  } else if (d.vozSacar !== undefined) {
    voz.items.splice(Number(d.vozSacar), 1);
    pintarVoz();
  }
}

// ---------- Pozos ----------
// El mapa de los freezers: abrir un balde en un pozo (y de dónde se trajo el reemplazo), buscar dónde está un sabor y
// contar un pozo. El total de cada sabor sigue siendo el de siempre; los pozos dicen dónde están los baldes.

const pz = { pozos: null, traidos: 0, pedido: 0, abierta: null, modo: null, abierto: null, conteo: null, resultado: null, verSinUbicar: false, guardar: null };
const pozoPorId = (id) => pz.pozos?.find((p) => p.id === id);
const helados = () => st.sabores.filter((s) => V.GRUPOS.some((g) => g.id === s.grupo));

function abrirPozos() {
  $("pz-buscar").value = "";
  mostrar("pozos");
  pintarPozos();
  cargarPozos();
}

/** Trae los pozos. `silencioso`: en segundo plano (desde la pantalla de stock): si falla, nadie se entera. */
async function cargarPozos(silencioso = false) {
  const n = ++pz.pedido;
  try {
    const r = await api("pozos");
    if (n !== pz.pedido) return;
    pz.pozos = r.pozos;
    pz.traidos = Date.now();
    if (st.vista === "pozos") pintarPozos();
    if ($("d-pozo").open && pz.modo === "pozo") pintarHojaPozo();
  } catch (e) {
    if (n === pz.pedido && !silencioso) fallo(e);
  }
}

function tarjetaPozo(p, q, marcados) {
  const filas = V.filasPozo(p, st.sabores);
  const dias = V.diasDesdeConteo(p.contado_en);
  const viejo = dias === null || dias > V.POZO_VIEJO;
  const buscados = q ? new Set(V.buscar(helados(), q).map((s) => s.id)) : null;
  const clase = ["pz-pozo", p.zona === "atras" ? "deposito" : "", p.tortas ? "tortas" : "", q ? (marcados.has(p.id) ? "encontrado" : "apagado") : ""]
    .filter(Boolean).join(" ");
  const chips = filas.length
    ? filas.map((f) => {
      const c = ["pz-chip", f.intruso ? "intruso" : "", f.cantidad === 0 ? "cero" : "", buscados?.has(f.sabor_id) && f.cantidad > 0 ? "marcado" : ""]
        .filter(Boolean).join(" ");
      return `<span class="${c}">${V.escapar(f.nombre)} <b>${f.cantidad}</b></span>`;
    }).join("")
    : `<span class="pz-nada">${p.contado_en ? "Vacío" : "Todavía no se contó"}</span>`;
  const hay = filas.filter((f) => f.cantidad > 0).length;
  return `<button type="button" class="${clase}" data-pozo="${p.id}" aria-label="Pozo ${p.numero}, ${V.escapar(p.nombre)}">` +
    `<span class="pz-cabeza"><span class="pz-num">${p.numero}</span><span class="pz-nombre"><b>${V.escapar(p.nombre)}</b>` +
    `<span>${V.cuantoEnPozo(p, st.sabores)} · ${hay} ${p.tortas ? (hay === 1 ? "producto" : "productos") : (hay === 1 ? "sabor" : "sabores")}</span></span></span>` +
    `<span class="pz-sabores">${chips}</span>` +
    `<span class="pz-pie"><span class="pz-contado${viejo ? " viejo" : ""}">${V.textoContado(dias)}</span>${viejo ? "<span>toca contarlo</span>" : ""}</span>` +
    `</button>`;
}

function pintarPozos() {
  const cuerpo = $("pz-cuerpo");
  if (!pz.pozos) {
    cuerpo.innerHTML = `<p class="vacio">Cargando los pozos…</p>`;
    return;
  }
  if (!pz.pozos.length) {
    cuerpo.innerHTML = `<p class="vacio">Este local todavía no tiene cargados sus pozos.</p>`;
    return;
  }
  const q = $("pz-buscar").value.trim();
  const marcados = q ? V.pozosCon(pz.pozos, q, helados()) : new Set();
  const sin = V.sinUbicar(pz.pozos, helados());
  const zona = (z, titulo, sub) => {
    const lista = pz.pozos.filter((p) => p.zona === z);
    return lista.length
      ? `<section class="pz-zona"><h2>${titulo} <small>${sub}</small></h2><div class="pz-pozos pz-${z}">` +
        lista.map((p) => tarjetaPozo(p, q, marcados)).join("") + `</div></section>`
      : "";
  };
  let arriba = "";
  if (!pz.pozos.some((p) => p.contado_en)) {
    arriba = `<div class="pz-arranque"><h2>Para arrancar, contá cada pozo una vez</h2><p>Tocá un pozo y después ` +
      `<strong>Contar este pozo</strong>. Ahí cargás qué sabores hay y cuántos baldes. En los pozos 1 a 4, lo que cuentes la ` +
      `primera vez queda como el lugar de cada sabor.</p></div>`;
  } else if (sin.length) {
    const baldes = sin.filter((x) => !x.torta).reduce((a, x) => a + x.cantidad, 0);
    const tortas = sin.filter((x) => x.torta).reduce((a, x) => a + x.cantidad, 0);
    const partes = [baldes ? V.baldes(baldes) : "", tortas ? V.postres(tortas) : ""].filter(Boolean).join(" y ");
    arriba = `<div class="pz-sin-ubicar"><p>La app no sabe en qué pozo ${baldes + tortas === 1 ? "está" : "están"} <strong>${partes}</strong>: ` +
      `llegaron en un pedido o falta contar ese pozo. Se ubican solos cuando contás el pozo donde están.</p>` +
      (V.todosContados(pz.pozos)
        ? `<p>Si ya contaste todos los pozos y no ${baldes + tortas === 1 ? "está" : "están"} en ningún lado, sacá${baldes + tortas === 1 ? "lo" : "los"} del total.</p>`
        : "") +
      `<div class="pz-sin-botones"><button type="button" class="btn btn-borde btn-chico" data-pz-sin>${pz.verSinUbicar ? "Ocultar" : "Ver cuáles"}</button>` +
      (V.todosContados(pz.pozos) ? `<button type="button" class="btn btn-borde btn-chico" data-pz-ajustar>No están: bajar del total</button>` : "") + `</div>` +
      (pz.verSinUbicar ? `<div class="pz-sabores">${sin.map((x) => `<span class="pz-chip">${V.escapar(x.nombre)} <b>${x.cantidad}</b></span>`).join("")}</div>` : "") +
      `</div>`;
  }
  let encontrado = "";
  if (q) {
    const sinAca = sin.filter((x) => V.buscar([{ nombre: x.nombre }], q).length);
    encontrado = marcados.size || sinAca.length
      ? `<p class="pz-lupa-res">${marcados.size ? `Está en el pozo ${[...marcados].map((id) => pozoPorId(id).numero).sort((a, b) => a - b).join(", ")}.` : ""}` +
        (sinAca.length ? ` Sin ubicar: ${sinAca.map((x) => `${V.escapar(x.nombre)} (${x.cantidad})`).join(", ")}.` : "") + `</p>`
      : `<p class="pz-lupa-res">No hay ningún sabor con “${V.escapar(q)}” en los pozos.</p>`;
  }
  cuerpo.innerHTML = arriba + encontrado +
    zona("adelante", "Adelante · heladería", "los pozos 1 a 4 tienen sus sabores fijos") +
    zona("atras", "Atrás · depósito", "se acomoda donde haya lugar") +
    `<div class="pz-leyenda"><span><span class="pz-chip">Vainilla <b>2</b></span> baldes en ese pozo</span>` +
    `<span><span class="pz-chip intruso">Granizado <b>1</b></span> está, pero no es su lugar</span>` +
    `<span><span class="pz-contado viejo">más de ${V.POZO_VIEJO} días sin contar: toca contarlo</span></span></div>`;
}

/**
 * Ya se contaron todos los pozos y lo sin ubicar no está en ningún lado: el total de esos sabores pasa a ser lo que
 * suman los pozos. Es un conteo de los de siempre: queda en el Historial y se puede deshacer.
 */
async function ajustarSinUbicar() {
  try {
    await recargarEstado().catch(() => {});
    const r = await api("pozos"); // con los números de ahora, no con los de hace un minuto
    pz.pozos = r.pozos;
    pz.traidos = Date.now();
  } catch (e) {
    return fallo(e);
  }
  const sin = V.sinUbicar(pz.pozos, helados());
  const items = V.itemsSinUbicar(pz.pozos, helados());
  if (!items.length) return pintarPozos();
  const baldes = sin.filter((x) => !x.torta).reduce((a, x) => a + x.cantidad, 0);
  const tortas = sin.filter((x) => x.torta).reduce((a, x) => a + x.cantidad, 0);
  const partes = [baldes ? V.baldes(baldes) : "", tortas ? V.postres(tortas) : ""].filter(Boolean).join(" y ");
  pintarPozos();
  if (!(await confirmar(`¿Bajar del total ${partes} que no ${baldes + tortas === 1 ? "está" : "están"} en ningún pozo? ` +
    "Queda en el Historial como un conteo y se puede deshacer.", "Bajar del total"))) return;
  try {
    await mutar(() => api("cargar", { tipo: "conteo", items }));
    sonar("exito");
    avisar(`Listo: el total ahora es lo que hay en los pozos (<strong>${partes}</strong> menos)`, { deshacer: true });
    pz.verSinUbicar = false;
    await recargarEstado().catch(() => {});
    cargarPozos();
  } catch (e) {
    fallo(e);
  }
}

// ---------- Llegó pedido: en qué pozo se guardó ----------

/** Después de guardar un pedido de helados: en qué pozo quedó cada sabor. Solo si los pozos ya se usan. */
function preguntarDondeGuardar(lote, items) {
  if (!pz.pozos?.some((p) => p.contado_en)) return;
  const filas = items.map((it) => {
    const s = st.sabores.find((x) => x.id === it.sabor_id);
    return s && V.pozosParaGuardar(pz.pozos, s).length
      ? { sabor_id: s.id, nombre: s.nombre, torta: V.esTorta(s), cantidad: it.cantidad, pozo: V.sugerirPozo(pz.pozos, s) }
      : null;
  }).filter(Boolean);
  if (!filas.length) return;
  pz.guardar = { lote, filas };
  pz.modo = "guardar";
  pintarGuardarPedido();
  if (!$("d-pozo").open) $("d-pozo").showModal();
}

function pintarGuardarPedido() {
  const g = pz.guardar;
  const marcados = g.filas.filter((f) => f.pozo).length;
  $("pz-hoja").innerHTML =
    `<div class="hoja-cabeza"><div class="pz-hoja-titulo"><h2 id="pz-titulo">¿Dónde guardaste lo que llegó?</h2>` +
    `<p class="nota">Tocá el pozo de cada sabor. Lo que no marques queda sin ubicar hasta que cuentes ese pozo.</p></div></div>` +
    `<div class="pz-guardar">${g.filas.map((f, i) => {
      const s = st.sabores.find((x) => x.id === f.sabor_id);
      return `<div class="pz-guardar-fila${f.pozo ? " elegido" : ""}"><span class="pz-fila-nombre">${V.escapar(f.nombre)} ` +
        `<small>${f.torta ? (f.cantidad === 1 ? "1 unidad" : `${f.cantidad} unidades`) : V.baldes(f.cantidad)}</small></span>` +
        `<span class="pz-guardar-pozos">${V.pozosParaGuardar(pz.pozos, s).map((p) =>
          `<button type="button" class="pz-g${f.pozo === p.id ? " elegido" : ""}${p.zona === "atras" ? " deposito" : ""}" data-pz-g="${i}" data-pozo="${p.id}" ` +
          `aria-pressed="${f.pozo === p.id}" aria-label="${V.escapar(f.nombre)} en el pozo ${p.numero}, ${V.escapar(p.nombre)}">${p.numero}</button>`
        ).join("")}</span></div>`;
    }).join("")}</div>` +
    `<div class="pz-hoja-pie"><button type="button" class="btn btn-borde" data-pz-cerrar>Ahora no</button>` +
    `<button type="button" class="btn btn-verde" data-pz-guardar-pedido${marcados ? "" : " disabled"}>Guardar en los pozos</button></div>`;
}

async function guardarPedidoEnPozos() {
  const g = pz.guardar;
  const items = g.filas.filter((f) => f.pozo).map((f) => ({ pozo_id: f.pozo, sabor_id: f.sabor_id, cantidad: f.cantidad }));
  if (!items.length) return;
  $("pz-hoja").querySelector("[data-pz-guardar-pedido]").disabled = true;
  try {
    await mutar(() => api("pozo_guardar", { lote: g.lote, items }));
    const pozos = [...new Set(items.map((it) => pozoPorId(it.pozo_id)?.numero))].sort((a, b) => a - b);
    $("d-pozo").close();
    sonar("exito");
    avisar(`Pedido guardado en ${pozos.length === 1 ? "el pozo" : "los pozos"} <strong>${pozos.join(", ")}</strong>`, { deshacer: true });
    cargarPozos(true);
  } catch (e) {
    fallo(e);
    const b = $("pz-hoja").querySelector("[data-pz-guardar-pedido]");
    if (b) b.disabled = false;
  }
}

// ---------- La hoja de un pozo ----------

function abrirHojaPozo(id) {
  pz.abierta = id;
  pz.modo = "pozo";
  pintarHojaPozo();
  if (!$("d-pozo").open) $("d-pozo").showModal();
}

function cabezaHoja(p, titulo, sub, boton = "") {
  return `<div class="hoja-cabeza"><span class="pz-num">${p.numero}</span>` +
    `<div class="pz-hoja-titulo"><h2 id="pz-titulo">${titulo}</h2>${sub ? `<p class="nota">${sub}</p>` : ""}</div>${boton}</div>`;
}

function pintarHojaPozo() {
  const p = pozoPorId(pz.abierta);
  if (!p) return $("d-pozo").close();
  const adelante = p.zona === "adelante";
  const filas = V.filasPozo(p, st.sabores);
  const total = (id) => st.sabores.find((s) => s.id === id)?.cantidad ?? 0;
  const grilla = filas.length
    ? `<div class="pz-grilla">${filas.map((f) =>
      `<button type="button" class="pz-sabor${f.intruso ? " intruso" : ""}" data-pz-abrir="${f.sabor_id}"${adelante && total(f.sabor_id) > 0 ? "" : " disabled"}>` +
      `<span class="pz-sabor-nombre">${V.escapar(f.nombre)}</span>` +
      `<span class="pz-sabor-pie"><span>${f.intruso ? "de prestado · " : ""}${total(f.sabor_id)} en total</span><b>${f.cantidad}</b></span></button>`
    ).join("")}</div>`
    : `<p class="nota">${p.contado_en ? "Este pozo está vacío." : "Todavía no se contó este pozo: tocá Contar este pozo para cargar lo que hay."}</p>`;
  $("pz-hoja").innerHTML =
    cabezaHoja(p, `Pozo ${p.numero} · ${V.escapar(p.nombre)}`,
      adelante ? `Tocá ${p.tortas ? "lo que sacaste o abriste" : "el sabor que abriste"}` : "De acá no se abre: los baldes salen cuando los llevás adelante",
      `<button type="button" class="btn btn-borde" data-pz-cerrar>Cerrar</button>`) +
    grilla +
    `<div class="pz-hoja-pie"><button type="button" class="btn btn-oscuro" data-pz-contar>` +
    `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>Contar este pozo</button></div>`;
}

async function abrirEnPozo(saborId) {
  const p = pozoPorId(pz.abierta);
  const s = st.sabores.find((x) => x.id === saborId);
  if (!p || !s) return;
  if (s.cantidad <= 0) {
    sonar("error");
    avisar(`<strong>${V.escapar(s.nombre)}</strong> ya está en 0. Si llegó helado, usá “Llegó pedido”.`);
    return;
  }
  for (const b of $("pz-hoja").querySelectorAll("button")) b.disabled = true;
  sonar("toc");
  vibrar(15);
  try {
    const r = await mutar(() => api("pozo_abrir", { pozo_id: p.id, sabor_id: s.id }));
    s.cantidad = r.despues;
    const fila = p.sabores.find((x) => x.sabor_id === s.id);
    if (fila && fila.cantidad > 0) fila.cantidad--;
    pz.abierto = { lote: Promise.resolve(r.lote), pozo: p.id, sabor: s };
    preguntarTraer(p, s);
  } catch (e) {
    fallo(e);
    pintarHojaPozo();
    recargarEstado().catch(() => {});
    cargarPozos();
  }
}

/** La pregunta de siempre después de abrir: de qué pozo de atrás se trajo el reemplazo. En tortas, no hay pregunta. */
function preguntarTraer(p, s) {
  const origenes = V.origenes(pz.pozos, s.id);
  // Si salió de un pozo de atrás, no hay reemplazo que traer.
  if (V.esTorta(s) || p.zona === "atras" || !origenes.length) return terminarAbrir(0);
  pz.modo = "traer";
  pz.abierta = p.id;
  $("pz-hoja").innerHTML =
      cabezaHoja(p, `Abriste ${V.escapar(s.nombre)}`, `Pozo ${p.numero} · ${s.cantidad === 1 ? "queda" : "quedan"} ${s.cantidad} en total`) +
      `<div class="pz-pregunta"><h3>¿De dónde trajiste el de reemplazo?</h3>` +
      `<p class="nota">En azul, los pozos que tienen ${V.escapar(s.nombre)}.</p><div class="pz-origenes">` +
      origenes.map((o) => `<button type="button" class="pz-origen${o.tiene ? " tiene" : ""}" data-pz-traje="${o.id}">` +
        `<b>Pozo ${o.numero}</b><span>${V.escapar(o.nombre)} · ${o.tiene ? `tiene ${o.tiene}` : "no tiene"}</span></button>`).join("") +
      `<button type="button" class="pz-origen nada" data-pz-traje="0"><b>No traje</b><span>queda solo el que abriste</span></button>` +
      `</div></div>`;
  if (!$("d-pozo").open) $("d-pozo").showModal();
}

/**
 * Abrir un balde desde la pantalla de stock: si el sabor está en un pozo de adelante, se
 * descuenta de ese pozo y aparece la pregunta de siempre; si está en más de uno, primero pregunta en cuál. Si solo está
 * atrás, se descuenta del pozo de atrás (sin pregunta de reemplazo). Si no está ubicado, solo baja el total, como antes. Devuelve false si no lo manejó (y sigue el toque de siempre).
 */
function abrirDesdeStock(s) {
  if (pan()) return false;
  const pozos = V.pozosParaAbrir(pz.pozos, s.id);
  if (!pozos.length) return false;
  if (pozos.length > 1) {
    pz.modo = "elegir";
    pz.abierta = null;
    $("pz-hoja").innerHTML =
      `<div class="hoja-cabeza"><div class="pz-hoja-titulo"><h2 id="pz-titulo">${pozos[0].zona === "atras" ? "¿De qué pozo sacaste" : "¿En qué pozo abriste"} ${V.escapar(s.nombre)}?</h2></div>` +
      `<button type="button" class="btn btn-borde" data-pz-cerrar>Cancelar</button></div>` +
      `<div class="pz-origenes">${pozos.map((p) => {
        const hay = p.sabores.find((x) => x.sabor_id === s.id)?.cantidad ?? 0;
        return `<button type="button" class="pz-origen tiene" data-pz-elegir="${p.id}" data-sabor="${s.id}">` +
          `<b>Pozo ${p.numero}</b><span>${V.escapar(p.nombre)} · ${hay ? `tiene ${hay}` : "es su lugar"}</span></button>`;
      }).join("")}</div>`;
    $("d-pozo").showModal();
    return true;
  }
  abrirEnPozoDesdeStock(s, pozos[0]);
  return true;
}

function abrirEnPozoDesdeStock(s, p) {
  const hoy = hoySec();
  const campo = V.esTorta(s) ? "tortas" : "abiertos";
  s.cantidad--;
  hoy[campo] = (hoy[campo] ?? 0) + 1;
  pintarTarjeta(s, "pop");
  pintarSub();
  vibrar(15);
  sonar("toc");
  const fila = p.sabores.find((x) => x.sabor_id === s.id);
  const habia = fila?.cantidad ?? 0;
  if (fila && fila.cantidad > 0) fila.cantidad--;
  // La pregunta aparece enseguida; el lote llega cuando la base confirma el balde abierto.
  const lote = mutar(() => api("pozo_abrir", { pozo_id: p.id, sabor_id: s.id }))
    .then((r) => {
      if (s.cantidad !== r.despues) {
        s.cantidad = r.despues;
        pintarTarjeta(s);
      }
      return r.lote;
    })
    .catch((e) => {
      s.cantidad++;
      hoy[campo]--;
      if (fila) fila.cantidad = habia;
      pintarTarjeta(s);
      pintarSub();
      if (pz.abierto?.lote === lote) {
        pz.abierto = null;
        if ($("d-pozo").open) $("d-pozo").close();
      }
      fallo(e);
      if (e.estado === 404 || e.estado === 409) recargarEstado().catch(() => {});
      cargarPozos(true);
      return null;
    });
  pz.abierto = { lote, pozo: p.id, sabor: s };
  preguntarTraer(p, s);
}

/** Después de abrir: de dónde vino el reemplazo (0 = no se trajo). Cerrar la hoja es "No traje". */
async function terminarAbrir(desde) {
  const a = pz.abierto;
  if (!a) return;
  pz.abierto = null;
  pz.modo = null;
  if ($("d-pozo").open) $("d-pozo").close();
  const lote = await a.lote;
  if (!lote) return; // el balde no se pudo abrir (ya se avisó)
  const hasta = pozoPorId(a.pozo);
  const origen = desde ? pozoPorId(desde) : null;
  let texto = `<strong>${V.escapar(a.sabor.nombre)}</strong>: ${V.esTorta(a.sabor) ? "sacaste 1" : "abriste 1"} en el pozo ${hasta.numero}`;
  if (origen) {
    try {
      await mutar(() => api("pozo_traer", { lote, desde: origen.id, hasta: hasta.id, sabor_id: a.sabor.id }));
      texto += ` y trajiste uno del pozo ${origen.numero}`;
    } catch (e) {
      fallo(e);
    }
  }
  avisar(`${texto} · ${a.sabor.cantidad === 1 ? "queda" : "quedan"} <strong>${a.sabor.cantidad}</strong>`, { deshacer: true });
  cargarPozos(true);
}

// ---------- Contar un pozo ----------

function empezarConteoPozo() {
  const p = pozoPorId(pz.abierta);
  if (!p) return;
  pz.conteo = {
    pozo: p.id,
    buscar: "",
    filas: V.filasPozo(p, st.sabores).map((f) => ({ sabor_id: f.sabor_id, nombre: f.nombre, app: f.cantidad, hay: f.cantidad, intruso: f.intruso })),
  };
  pz.modo = "contar";
  pintarConteoPozo();
}

/** Lo que se puede sumar al conteo según lo buscado (sabores; en el pozo de tortas, también tortas), que no esté ya. */
function opcionesConteo() {
  const c = pz.conteo;
  const p = pozoPorId(c.pozo);
  if (!c.buscar.trim()) return "";
  const opciones = V.buscar(helados().filter((s) => V.vaEnPozo(p, s) && !c.filas.some((f) => f.sabor_id === s.id)), c.buscar).slice(0, 8);
  return opciones.length
    ? `<div class="pz-opciones">${opciones.map((s) =>
      `<button type="button" class="btn btn-borde btn-chico" data-pz-sumar="${s.id}">+ ${V.escapar(s.nombre)}</button>`).join("")}</div>`
    : `<p class="nota">No hay otro ${p.tortas ? "sabor ni producto" : "sabor"} con “${V.escapar(c.buscar)}”.</p>`;
}

function pintarConteoPozo() {
  const c = pz.conteo;
  const p = pozoPorId(c.pozo);
  $("pz-hoja").innerHTML =
    cabezaHoja(p, `Contar pozo ${p.numero}`, "Mirá el pozo y corregí con + y −. Al lado está lo que dice la app.",
      `<button type="button" class="btn btn-borde" data-pz-cancelar>Cancelar</button>`) +
    `<div class="pz-conteo">${c.filas.length ? c.filas.map((f, i) =>
      `<div class="pz-fila${f.hay !== f.app ? " distinta" : ""}"><span class="pz-fila-nombre">${V.escapar(f.nombre)}` +
      (f.intruso ? ` <button type="button" class="pz-lugar" data-pz-lugar="${f.sabor_id}">es su lugar</button>` : "") + `</span>` +
      `<span class="pz-app">la app dice ${f.app}</span><span class="pz-mas-menos">` +
      `<button type="button" data-pz-cm="${i}" data-d="-1" aria-label="Uno menos de ${V.escapar(f.nombre)}">−</button>` +
      `<output>${f.hay}</output>` +
      `<button type="button" data-pz-cm="${i}" data-d="1" aria-label="Uno más de ${V.escapar(f.nombre)}">+</button></span>` +
      `<button type="button" class="pz-sacar" data-pz-sacar="${i}" aria-label="Sacar ${V.escapar(f.nombre)} de este pozo" data-ayuda="Sacarlo de este pozo (si lo cargaste por error)">` +
      `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>`
    ).join("") : `<p class="nota">Todavía no hay nada anotado en este pozo. Buscá abajo lo que hay y sumalo.</p>`}</div>` +
    `<div class="pz-agregar"><label class="buscar-campo"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>` +
    `<input type="search" id="pz-agregar" placeholder="¿Hay algo más acá? Buscalo y sumalo" autocomplete="off" autocapitalize="off" spellcheck="false" value="${V.escapar(c.buscar)}"></label>` +
    `<div id="pz-opciones">${opcionesConteo()}</div></div>` +
    `<div class="pz-hoja-pie"><button type="button" class="btn btn-verde" data-pz-guardar>Guardar conteo</button></div>`;
}

async function guardarConteoPozo() {
  const c = pz.conteo;
  const p = pozoPorId(c.pozo);
  $("pz-hoja").querySelector("[data-pz-guardar]").disabled = true;
  try {
    const r = await mutar(() => api("pozo_contar", { pozo_id: p.id, items: c.filas.map((f) => ({ sabor_id: f.sabor_id, cantidad: f.hay })) }));
    pz.conteo = null;
    pz.modo = "resultado";
    sonar("exito");
    const difs = r.diferencias;
    $("pz-hoja").innerHTML =
      cabezaHoja(p, `Pozo ${p.numero} contado`, difs.length
        ? `${difs.length === 1 ? "1 diferencia" : `${difs.length} diferencias`} con lo que decía la app${r.ajustes ? `. Se corrigió el total de ${r.ajustes === 1 ? "1 sabor" : `${r.ajustes} sabores`} (queda en el Historial)` : ""}.`
        : "Todo coincidía con lo que decía la app.") +
      (difs.length ? `<ul class="pz-resultado">${difs.map((d) => {
        const n = d.despues - d.antes;
        return `<li class="${n < 0 ? "menos" : "mas"}">${V.escapar(d.nombre)}: la app decía ${d.antes}, había ${d.despues} (${n > 0 ? "+" : ""}${n})</li>`;
      }).join("")}</ul>` : "") +
      `<div class="pz-hoja-pie">${r.lote ? `<button type="button" class="btn btn-borde" data-pz-deshacer>Deshacer este conteo</button>` : ""}` +
      `<button type="button" class="btn btn-oscuro" data-pz-cerrar>Listo</button></div>`;
    await recargarEstado().catch(() => {});
    cargarPozos();
  } catch (e) {
    fallo(e);
    const b = $("pz-hoja").querySelector("[data-pz-guardar]");
    if (b) b.disabled = false;
  }
}

async function marcarLugar(saborId) {
  const c = pz.conteo;
  try {
    await api("pozo_lugar", { pozo_id: c.pozo, sabor_id: saborId, su_lugar: true });
    const f = c.filas.find((x) => x.sabor_id === saborId);
    if (f) f.intruso = false;
    const fila = pozoPorId(c.pozo)?.sabores.find((x) => x.sabor_id === saborId);
    if (fila) fila.su_lugar = true;
    pintarConteoPozo();
  } catch (e) {
    fallo(e);
  }
}

function clicHojaPozo(e) {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.pzAbrir) abrirEnPozo(Number(d.pzAbrir));
  else if (d.pzElegir) {
    const s = st.sabores.find((x) => x.id === Number(d.sabor));
    const p = pozoPorId(Number(d.pzElegir));
    pz.modo = null;
    if (s && p && s.cantidad > 0) abrirEnPozoDesdeStock(s, p);
    else $("d-pozo").close();
  }
  else if (d.pzTraje !== undefined) terminarAbrir(Number(d.pzTraje));
  else if (d.pzG !== undefined) {
    const f = pz.guardar.filas[Number(d.pzG)];
    const id = Number(d.pozo);
    f.pozo = f.pozo === id ? null : id; // tocar el elegido lo desmarca
    pintarGuardarPedido();
  } else if (d.pzGuardarPedido !== undefined) guardarPedidoEnPozos();
  else if (d.pzContar !== undefined) empezarConteoPozo();
  else if (d.pzCm !== undefined) {
    const f = pz.conteo.filas[Number(d.pzCm)];
    f.hay = Math.max(0, Math.min(99, f.hay + Number(d.d)));
    pintarConteoPozo();
  } else if (d.pzSumar) {
    const s = st.sabores.find((x) => x.id === Number(d.pzSumar));
    const ya = pozoPorId(pz.conteo.pozo).sabores.find((x) => x.sabor_id === s.id)?.cantidad ?? 0;
    const p = pozoPorId(pz.conteo.pozo);
    pz.conteo.filas.push({ sabor_id: s.id, nombre: s.nombre, app: ya, hay: Math.max(ya, 1), intruso: p.fijo && p.sabores.some((x) => x.su_lugar) });
    pz.conteo.buscar = "";
    pintarConteoPozo();
  } else if (d.pzLugar) marcarLugar(Number(d.pzLugar));
  else if (d.pzSacar !== undefined) sacarDelPozo(Number(d.pzSacar));
  else if (d.pzGuardar !== undefined) guardarConteoPozo();
  else if (d.pzCancelar !== undefined) cancelarConteoPozo();
  else if (d.pzDeshacer !== undefined) {
    $("d-pozo").close();
    deshacer();
  } else if (d.pzCerrar !== undefined) $("d-pozo").close();
}

/**
 * Sacar un sabor del pozo (lo cargado por error). Si recién se sumó en este conteo, solo se saca de la lista; si ya estaba
 * guardado, se saca en la base: el total no cambia (esos baldes quedan sin ubicar) y deja de ser su lugar.
 */
async function sacarDelPozo(i) {
  const c = pz.conteo;
  const f = c?.filas[i];
  if (!f) return;
  const p = pozoPorId(c.pozo);
  const guardado = p.sabores.some((x) => x.sabor_id === f.sabor_id && (x.cantidad > 0 || x.su_lugar));
  if (guardado) {
    const ok = await confirmar(
      `¿Sacar ${f.nombre} del pozo ${p.numero}? Es para lo que se cargó por error: el total no cambia y esos baldes quedan sin ubicar.`,
      "Sacar",
    );
    if (!ok) return;
    try {
      await mutar(() => api("pozo_quitar", { pozo_id: p.id, sabor_id: f.sabor_id }));
    } catch (e) {
      return fallo(e);
    }
    const fila = p.sabores.find((x) => x.sabor_id === f.sabor_id);
    if (fila) Object.assign(fila, { cantidad: 0, su_lugar: false });
    avisar(`<strong>${V.escapar(f.nombre)}</strong> ya no está en el pozo ${p.numero}`);
    cargarPozos();
  }
  c.filas.splice(i, 1);
  pintarConteoPozo();
}

async function cancelarConteoPozo() {
  const c = pz.conteo;
  const cambio = c && c.filas.some((f) => f.hay !== f.app);
  if (cambio && !(await confirmar("¿Salir sin guardar el conteo de este pozo?", "Salir"))) return;
  pz.conteo = null;
  pz.modo = "pozo";
  pintarHojaPozo();
}

// ---------- Tareas del equipo ----------
// La planilla semanal adentro de la app: cada día, las tareas se reparten entre los que trabajan (botón "Armar
// semana": al azar pero parejo) y cada uno marca la suya: No se hizo (0), A medias (1) o Hecha (2).

const tar = { lunes: null, dia: 0, datos: null, pedido: 0, equipo: null };

function abrirTareas() {
  const hoy = V.hoyArgentina();
  tar.lunes = V.lunesDe(hoy);
  tar.dia = V.diaSemana(hoy) - 1;
  tar.datos = null;
  mostrar("tareas");
  pintarTareas();
  cargarTareas();
}

async function cargarTareas() {
  const n = ++tar.pedido;
  try {
    const r = await api("tareas", { lunes: tar.lunes });
    if (n !== tar.pedido) return; // se cambió de semana mientras tanto
    tar.datos = r;
    pintarTareas();
  } catch (e) {
    if (n === tar.pedido) fallo(e);
  }
}

function cambiarSemanaTareas(delta) {
  tar.lunes = V.sumarDias(tar.lunes, 7 * delta);
  tar.datos = null;
  pintarTareas();
  cargarTareas();
}

const fechaTar = () => V.sumarDias(tar.lunes, tar.dia);
const trabajaEl = (p, i) => !p.francos.includes(i + 1);

function filaTarea(a, t, presentes, equipo) {
  const actual = equipo.find((p) => p.id === a.persona_id);
  const opciones = [...presentes];
  if (actual && !opciones.includes(actual)) opciones.push(actual); // alguien de franco al que igual se le pasó
  const quien = `<select class="tar-quien" data-quien="${t.id}" aria-label="Quién hace ${V.escapar(t.nombre)}" data-ayuda="Pasarle esta tarea a otra persona">` +
    `<option value=""${a.persona_id === null ? " selected" : ""}>Nadie</option>` +
    opciones.map((p) => `<option value="${p.id}"${p.id === a.persona_id ? " selected" : ""}>${V.escapar(p.nombre)}</option>`).join("") +
    `</select>`;
  const niveles = V.NIVELES.map(({ nivel, texto }) =>
    `<button type="button" class="nivel" data-nivel="${nivel}" data-n="${nivel}" data-tarea="${t.id}" aria-pressed="${a.nivel === nivel}" ` +
    `aria-label="${V.escapar(t.nombre)}: ${texto}">${texto}</button>`
  ).join("");
  return `<div class="tar-fila${a.nivel === null ? "" : ` n${a.nivel}`}" data-fila="${t.id}">` +
    `<span class="tar-nombre">${t.numero}. ${V.escapar(t.nombre)}<small>${V.escapar(t.frecuencia)}</small></span>${quien}` +
    `<div class="tar-niveles" role="group" aria-label="Cómo quedó">${niveles}</div></div>`;
}

function pintarTareas() {
  const lunes = tar.lunes, d = tar.datos, hoy = V.hoyArgentina();
  $("tar-semana").textContent = `${V.fechaCorta(lunes)} al ${V.fechaCorta(V.sumarDias(lunes, 6))}`;
  $("tar-dias").innerHTML = V.DIAS_SEMANA.map((nombre, i) => {
    const f = V.sumarDias(lunes, i);
    const delDia = d ? d.asignaciones.filter((a) => a.fecha === f) : [];
    const marcadas = delDia.filter((a) => a.nivel !== null).length;
    return `<button type="button" class="chip${i === tar.dia ? " activo" : ""}" data-tar-dia="${i}" aria-pressed="${i === tar.dia}" ` +
      `data-ayuda="Ver las tareas del ${nombre.toLowerCase()} ${V.fechaCorta(f)}">${nombre.slice(0, 3)} ${V.fechaCorta(f)}` +
      `${f === hoy ? " · hoy" : ""}${delDia.length ? ` <b>${marcadas}/${delDia.length}</b>` : ""}</button>`;
  }).join("");
  if (!d) {
    $("tar-sub").textContent = "";
    $("tar-cuerpo").innerHTML = `<p class="vacio">Cargando las tareas…</p>`;
    return;
  }
  const fecha = fechaTar();
  const semana = d.asignaciones;
  const delDia = semana.filter((a) => a.fecha === fecha);
  const presentes = d.equipo.filter((p) => trabajaEl(p, tar.dia));
  const franco = d.equipo.filter((p) => !trabajaEl(p, tar.dia));
  const marcadas = delDia.filter((a) => a.nivel !== null).length;
  $("tar-sub").innerHTML = semana.length
    ? `${V.escapar(V.DIAS_SEMANA[tar.dia])} ${V.fechaCorta(fecha)} · <strong>${marcadas} de ${delDia.length}</strong> marcadas`
    : "Esta semana todavía no se repartió";
  const deTodos = d.tareas.filter((t) => t.de_todos);
  let cuerpo;
  if (!d.equipo.length || !d.tareas.length) {
    cuerpo = `<div class="tar-vacio"><div><h2>Falta cargar el equipo</h2><p>Este local todavía no tiene su equipo o su lista de tareas.</p></div></div>`;
  } else if (!semana.length) {
    cuerpo = `<div class="tar-vacio"><div><h2>Armemos la semana</h2><p>Tocá <strong>Armar semana</strong> y las tareas de cada día ` +
      `se reparten al azar, parejo entre los que trabajan ese día (según los francos y el turno de cada uno). ` +
      `Después se puede pasar una tarea a otra persona, o volver a armar.</p></div>` +
      `<button type="button" class="btn btn-verde" data-accion="tar-armar">Armar semana</button></div>`;
  } else {
    const tareaDe = new Map(d.tareas.map((t) => [t.id, t]));
    const grupos = new Map(d.equipo.map((p) => [p.id, []]));
    const sinNadie = [];
    for (const a of delDia) {
      const t = tareaDe.get(a.tarea_id);
      if (!t) continue;
      (grupos.has(a.persona_id) ? grupos.get(a.persona_id) : sinNadie).push([a, t]);
    }
    const tarjeta = (titulo, sub, filas, clase = "") =>
      `<section class="tar-persona ${clase}"><h2>${titulo}<small>${sub}</small></h2>` +
      (filas.length ? filas.map(([a, t]) => filaTarea(a, t, presentes, d.equipo)).join("") : `<p class="nota">Sin tareas este día.</p>`) +
      `</section>`;
    const personas = d.equipo.filter((p) => trabajaEl(p, tar.dia) || grupos.get(p.id).length).map((p) => {
      const filas = grupos.get(p.id).sort((x, y) => x[1].numero - y[1].numero);
      const hechas = filas.filter(([a]) => a.nivel === 2).length;
      const hs = V.horario(p.turno, tar.dia + 1, p.horario);
      const sub = `${V.TURNOS[p.turno]}${hs ? ` ${hs}` : ""}${trabajaEl(p, tar.dia) ? "" : " · franco"} · ${hechas}/${filas.length} hechas`;
      return tarjeta(V.escapar(p.nombre), sub, filas);
    });
    if (sinNadie.length) personas.push(tarjeta("Sin asignar", "elegí quién la hace", sinNadie, "sin-nadie"));
    cuerpo = `<div class="tar-resumen"><span>Trabajan: <strong>${presentes.map((p) => V.escapar(p.nombre)).join(", ") || "nadie"}</strong></span>` +
      (franco.length ? `<span>Franco: <strong>${franco.map((p) => V.escapar(p.nombre)).join(", ")}</strong></span>` : "") +
      `</div><div class="tar-personas">${personas.join("")}</div>`;
  }
  if (d.equipo.length && semana.length) {
    const carga = V.cargaSemana(d.equipo, d.tareas, semana);
    const max = Math.max(1, ...carga.map((c) => c.porDia));
    cuerpo += `<div class="tar-pie">` +
      (deTodos.length ? `<p>Todos, todos los días: <strong>${deTodos.map((t) => `${t.numero}. ${V.escapar(t.nombre)}`).join(" · ")}</strong>.</p>` : "") +
      `<div class="tar-carga"><h3>Carga de la semana</h3><table><thead><tr><th>Quién</th><th>Días</th><th>Tareas</th>` +
      `<th>Puntos por día</th><th>Hechas</th></tr></thead><tbody>` +
      carga.map((c) => `<tr><td>${V.escapar(c.nombre)}</td><td>${c.dias}</td><td>${c.tareas}</td>` +
        `<td>${String(c.porDia).replace(".", ",")}<span class="barrita" style="width:${Math.round((c.porDia / max) * 80)}px"></span></td>` +
        `<td>${c.hechas} de ${c.tareas}</td></tr>`).join("") +
      `</tbody></table></div><p>Los puntos cuentan el peso de cada tarea (liviana 1, media 2, pesada 3), divididos por los días que trabaja cada uno.</p></div>`;
  }
  $("tar-cuerpo").innerHTML = cuerpo;
}

async function armarTareas() {
  const d = tar.datos;
  if (!d) return;
  const marcadas = d.asignaciones.filter((a) => a.nivel !== null);
  if (d.asignaciones.length) {
    const pregunta = marcadas.length
      ? `¿Repartir de nuevo la semana? Lo que ya se marcó (${marcadas.length}) queda como está.`
      : "¿Repartir de nuevo la semana? Cambia quién hace cada tarea.";
    if (!(await confirmar(pregunta, "Repartir"))) return;
  }
  const items = V.armarSemana({ equipo: d.equipo, tareas: d.tareas, lunes: tar.lunes, historial: d.historial, marcadas });
  $("b-tar-armar").disabled = true;
  try {
    await api("tareas_armar", { lunes: tar.lunes, items });
    sonar("exito");
    avisar("Semana armada: las tareas quedaron repartidas parejo");
    await cargarTareas();
  } catch (e) {
    fallo(e);
  } finally {
    $("b-tar-armar").disabled = false;
  }
}

/** Marca cómo quedó una tarea del día. Tocar de nuevo la misma marca la saca. */
async function marcarTarea(tareaId, nivel) {
  const d = tar.datos, fecha = fechaTar();
  const a = d?.asignaciones.find((x) => x.fecha === fecha && x.tarea_id === tareaId);
  if (!a) return;
  const antes = a.nivel;
  a.nivel = antes === nivel ? null : nivel;
  pintarTareas();
  vibrar(10);
  try {
    Object.assign(a, await api("tarea_marcar", { fecha, tarea_id: tareaId, nivel: a.nivel }));
    if (a.nivel === 2) sonar("toc");
  } catch (e) {
    a.nivel = antes;
    pintarTareas();
    fallo(e);
  }
}

async function asignarTarea(tareaId, personaId) {
  const d = tar.datos, fecha = fechaTar();
  const a = d?.asignaciones.find((x) => x.fecha === fecha && x.tarea_id === tareaId);
  if (!a) return;
  const antes = a.persona_id;
  a.persona_id = personaId;
  pintarTareas();
  try {
    Object.assign(a, await api("tarea_asignar", { fecha, tarea_id: tareaId, persona_id: personaId }));
    const p = d.equipo.find((x) => x.id === personaId);
    avisar(p ? `Ahora la hace <strong>${V.escapar(p.nombre)}</strong>` : "La tarea quedó sin asignar");
  } catch (e) {
    a.persona_id = antes;
    pintarTareas();
    fallo(e);
  }
}

// Equipo: francos y turno de cada uno (lo que cambia semana a semana). Se guarda al tocar Listo.
function abrirEquipo() {
  if (!tar.datos) return;
  tar.equipoCambio = false;
  $("eq-nueva").value = "";
  tar.equipo = tar.datos.equipo.map((p) => ({ ...p, francos: [...p.francos] }));
  pintarEquipo();
  $("d-equipo").showModal();
}

function pintarEquipo() {
  $("eq-lista").innerHTML = tar.equipo.map((p) =>
    `<div class="eq-fila"><input type="text" class="eq-nombre" data-eq-nombre="${p.id}" maxlength="40" value="${V.escapar(p.nombre)}" aria-label="Nombre">` +
    `<select data-eq-turno="${p.id}" aria-label="Turno de ${V.escapar(p.nombre)}">` +
    Object.entries(V.TURNOS_LARGO).map(([k, t]) => `<option value="${k}"${k === p.turno ? " selected" : ""}>${t}</option>`).join("") +
    `</select><div class="eq-dias" role="group" aria-label="Francos de ${V.escapar(p.nombre)}">` +
    V.DIAS_SEMANA.map((dia, i) =>
      `<button type="button" class="eq-dia" data-eq-franco="${p.id}" data-d="${i + 1}" aria-pressed="${p.francos.includes(i + 1)}" ` +
      `aria-label="${dia}: ${p.francos.includes(i + 1) ? "franco" : "trabaja"}" data-ayuda="${dia}: tocá para marcar o sacar el franco">${dia.slice(0, 2)}</button>`
    ).join("") + `</div>` +
    `<button type="button" class="eq-sacar" data-eq-sacar="${p.id}" aria-label="Sacar a ${V.escapar(p.nombre)} del equipo" data-ayuda="Sacarlo del equipo (ya no trabaja acá)">` +
    `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>`
  ).join("");
}

async function guardarEquipo() {
  const cambios = tar.equipo.filter((p) => {
    const antes = tar.datos.equipo.find((x) => x.id === p.id);
    return antes && (antes.turno !== p.turno || antes.francos.join() !== [...p.francos].sort().join());
  });
  const nombres = tar.equipo.filter((p) => {
    const antes = tar.datos.equipo.find((x) => x.id === p.id);
    return antes && p.nombre.trim() && antes.nombre !== p.nombre.trim();
  });
  $("b-eq-listo").disabled = true;
  try {
    for (const p of nombres) await api("persona_guardar", { persona_id: p.id, nombre: p.nombre.trim() });
    for (const p of cambios) await api("equipo_fijar", { persona_id: p.id, turno: p.turno, francos: p.francos });
    const habia = tar.equipoCambio;
    tar.equipoCambio = false;
    $("d-equipo").close();
    if (cambios.length || nombres.length || habia) {
      avisar(`Equipo guardado. Tocá <strong>Armar semana</strong> para repartir con los cambios.`);
      await cargarTareas();
    }
  } catch (e) {
    fallo(e);
  } finally {
    $("b-eq-listo").disabled = false;
  }
}

// ---------- Lista de tareas (agregar, cambiar, sacar) ----------

const lt = { editando: null, cambio: false };
const MOMENTOS = { apertura: "Apertura", cierre: "Cierre", todo: "Todo el día" };
const PESOS = { 1: "Liviana", 2: "Media", 3: "Pesada" };

function abrirListaTareas() {
  if (!tar.datos) return;
  lt.editando = null;
  lt.cambio = false;
  pintarListaTareas();
  $("d-lista").showModal();
}

function pintarListaTareas() {
  const d = tar.datos;
  $("b-lt-nueva").hidden = lt.editando !== null;
  if (lt.editando) return pintarEditorTarea();
  const dueña = (id) => d.equipo.find((p) => p.id === id)?.nombre;
  $("lt-cuerpo").innerHTML = d.tareas.length
    ? d.tareas.map((t) => {
      const dias = t.dias.length === 7 ? "Todos los días" : t.dias.map((x) => V.DIAS_SEMANA[x - 1].slice(0, 2)).join(" ");
      const extra = [MOMENTOS[t.momento], PESOS[t.peso], dias, t.de_todos ? "De todos" : "", t.fija_id && dueña(t.fija_id) ? `Siempre: ${dueña(t.fija_id)}` : ""]
        .filter(Boolean).join(" · ");
      return `<div class="lt-fila"><span class="lt-num">${t.numero}</span><span class="lt-nombre">${V.escapar(t.nombre)}` +
        `<small>${V.escapar(extra)}</small></span>` +
        `<button type="button" class="btn btn-borde btn-chico" data-lt-editar="${t.id}">Cambiar</button></div>`;
    }).join("")
    : `<p class="nota">Todavía no hay tareas. Tocá <strong>Agregar tarea</strong>.</p>`;
}

function pintarEditorTarea() {
  const t = lt.editando;
  const nueva = t.id === null;
  const opciones = (obj, actual) => Object.entries(obj).map(([k, v]) => `<option value="${k}"${String(actual) === k ? " selected" : ""}>${v}</option>`).join("");
  $("lt-cuerpo").innerHTML =
    `<form class="lt-editor" id="f-lt">` +
    `<h3>${nueva ? "Tarea nueva" : `Tarea ${t.numero}`}</h3>` +
    `<label>Nombre<input type="text" id="lt-nombre" maxlength="80" autocomplete="off" value="${V.escapar(t.nombre)}" placeholder="Ej.: Limpieza de la vitrina"></label>` +
    `<label>Cada cuánto / cómo (opcional)<input type="text" id="lt-frec" maxlength="60" autocomplete="off" value="${V.escapar(t.frecuencia)}" placeholder="Ej.: Diario – cierre"></label>` +
    `<div class="lt-par"><label>Cuándo<select id="lt-momento">${opciones(MOMENTOS, t.momento)}</select></label>` +
    `<label>Qué tan pesada<select id="lt-peso">${opciones(PESOS, t.peso)}</select></label></div>` +
    `<div class="lt-dias-cont"><span>Qué días se hace</span><div class="eq-dias" role="group" aria-label="Días en que se hace">` +
    V.DIAS_SEMANA.map((dia, i) => `<button type="button" class="eq-dia" data-lt-dia="${i + 1}" aria-pressed="${t.dias.includes(i + 1)}" aria-label="${dia}">${dia.slice(0, 2)}</button>`).join("") +
    `</div></div>` +
    `<label>Siempre la hace<select id="lt-fija"><option value="">Nadie en especial (se reparte)</option>` +
    tar.datos.equipo.map((p) => `<option value="${p.id}"${p.id === t.fija_id ? " selected" : ""}>${V.escapar(p.nombre)}</option>`).join("") +
    `</select></label>` +
    `<label class="lt-check"><input type="checkbox" id="lt-todos"${t.de_todos ? " checked" : ""}> Es de todos, todos los días (no se reparte ni se marca)</label>` +
    `<div class="lt-botones">${nueva ? "" : `<button type="button" class="btn btn-borde btn-sacar" data-lt-sacar>Sacar de la lista</button>`}` +
    `<span class="lt-espacio"></span><button type="button" class="btn btn-borde" data-lt-cancelar>Cancelar</button>` +
    `<button type="submit" class="btn btn-verde" id="b-lt-guardar">Guardar</button></div></form>`;
  $("lt-nombre").focus();
}

/** Lo que hay en el editor (los días se van guardando en lt.editando al tocarlos). */
function leerEditorTarea() {
  const t = lt.editando;
  return {
    id: t.id,
    nombre: $("lt-nombre").value,
    frecuencia: $("lt-frec").value,
    momento: $("lt-momento").value,
    peso: Number($("lt-peso").value),
    dias: [...t.dias].sort((a, b) => a - b),
    fija_id: $("lt-fija").value ? Number($("lt-fija").value) : null,
    de_todos: $("lt-todos").checked,
  };
}

async function guardarTarea(e) {
  e.preventDefault();
  const datos = leerEditorTarea();
  if (!datos.nombre.trim()) return avisar("Escribí el nombre de la tarea.", { error: true });
  if (!datos.dias.length) return avisar("Elegí al menos un día.", { error: true });
  $("b-lt-guardar").disabled = true;
  try {
    await api("tarea_guardar", datos);
    sonar("exito");
    lt.cambio = true;
    lt.editando = null;
    await cargarTareas();
    pintarListaTareas();
    avisar(`Tarea guardada. Tocá <strong>Armar semana</strong> para repartir con los cambios.`);
  } catch (err) {
    fallo(err);
    const b = $("b-lt-guardar");
    if (b) b.disabled = false;
  }
}

async function sacarTarea() {
  const t = lt.editando;
  if (!(await confirmar(`¿Sacar «${t.nombre}» de la lista? Deja de repartirse; lo de las semanas anteriores queda.`, "Sacar"))) return;
  try {
    await api("tarea_sacar", { tarea_id: t.id });
    lt.cambio = true;
    lt.editando = null;
    await cargarTareas();
    pintarListaTareas();
    avisar(`<strong>${V.escapar(t.nombre)}</strong> ya no está en la lista.`);
  } catch (err) {
    fallo(err);
  }
}

// ---------- Equipo: agregar y sacar gente ----------

async function agregarPersona(e) {
  e.preventDefault();
  const nombre = $("eq-nueva").value.trim();
  if (!nombre) return avisar("Escribí el nombre.", { error: true });
  $("b-eq-agregar").disabled = true;
  try {
    const p = await api("persona_guardar", { nombre });
    tar.datos.equipo.push({ ...p, francos: [...p.francos] });
    tar.equipo.push({ ...p, francos: [...p.francos] });
    tar.equipoCambio = true;
    $("eq-nueva").value = "";
    pintarEquipo();
    $("eq-lista").lastElementChild?.scrollIntoView({ block: "nearest" });
    avisar(`<strong>${V.escapar(p.nombre)}</strong> ya está en el equipo. Elegí su turno y sus francos.`);
  } catch (err) {
    fallo(err);
  } finally {
    $("b-eq-agregar").disabled = false;
  }
}

async function sacarPersona(id) {
  const p = tar.equipo.find((x) => x.id === id);
  if (!p) return;
  if (!(await confirmar(`¿Sacar a ${p.nombre} del equipo? Deja de recibir tareas; sus tareas fijas quedan para repartir.`, "Sacar"))) return;
  try {
    await api("persona_sacar", { persona_id: id });
    tar.equipo = tar.equipo.filter((x) => x.id !== id);
    tar.datos.equipo = tar.datos.equipo.filter((x) => x.id !== id);
    tar.equipoCambio = true;
    pintarEquipo();
    avisar(`<strong>${V.escapar(p.nombre)}</strong> ya no está en el equipo.`);
  } catch (err) {
    fallo(err);
  }
}

// ---------- Historial ----------

function pintarHistorial(r) {
  st.hist = { fecha: r.fecha, hoy: r.hoy };
  $("hist-titulo").textContent = pan() ? "Historial · Panificados" : "Historial";
  $("hist-col-nombre").textContent = pan() ? "Producto" : "Sabor";
  $("hist-dia").textContent = V.tituloDia(r.fecha, r.hoy);
  $("b-dia-sig").disabled = r.fecha >= r.hoy;
  $("hist-fecha").value = r.fecha;
  $("hist-fecha").max = r.hoy;

  const { abiertos, tortas = 0, entraron, conteos, top } = r.resumen;
  const max = Math.max(1, ...top.map((t) => t.n));
  $("hist-resumen").innerHTML =
    `<div class="tarjeta"><span>${pan() ? "Sacados del pozo" : "Baldes abiertos"}</span><strong>${abiertos}</strong></div>` +
    (tortas ? `<div class="tarjeta"><span>Tortas y postres que salieron</span><strong>${tortas}</strong></div>` : "") +
    `<div class="tarjetas-2"><div class="tarjeta t-azul"><span>Entraron</span><strong>${entraron ? "+" + entraron : 0}</strong></div>` +
    `<div class="tarjeta t-naranja"><span>Conteos</span><strong>${conteos}</strong></div></div>` +
    (top.length
      ? `<div class="tarjeta top"><h3>Lo que más salió</h3>${
        top.map((t) =>
          `<div class="top-fila"><span>${V.escapar(t.nombre)}</span>` +
          `<span class="top-barra" style="width:${Math.round((t.n / max) * 100)}%"></span><b>${t.n}</b></div>`
        ).join("")
      }</div>`
      : "");

  $("hist-filas").innerHTML = r.movimientos.length
    ? r.movimientos.map((m) => {
      const f = V.filaMovimiento(m, st.seccion);
      return `<div class="hist-fila ${V.escapar(f.clase)}"><span class="h-hora">${f.hora}</span><span class="h-tipo">${V.escapar(f.tipo)}</span>` +
        `<span class="h-sabor">${V.escapar(f.sabor)}</span><span class="h-cambio">${V.escapar(f.cambio)}</span>` +
        `<span class="h-quedo">${V.escapar(f.quedo)}</span></div>`;
    }).join("")
    : `<p class="vacio">No hubo movimientos este día.</p>`;
}

let pedidoHistorial = 0;
async function verDia(fecha) {
  const n = ++pedidoHistorial;
  if (fecha && st.hist.hoy) {
    // Se muestra el día al instante, así tocar ‹ tres veces seguidas retrocede tres días.
    st.hist.fecha = fecha;
    $("hist-dia").textContent = V.tituloDia(fecha, st.hist.hoy);
    $("b-dia-sig").disabled = fecha >= st.hist.hoy;
    $("hist-fecha").value = fecha;
    $("hist-resumen").innerHTML = "";
    $("hist-filas").innerHTML = `<p class="vacio">Cargando…</p>`; // que no quede a la vista el día anterior
  }
  try {
    const r = await api("historial", { seccion: st.seccion, ...(fecha ? { fecha } : {}) });
    if (n === pedidoHistorial) pintarHistorial(r); // si se pidió otro día mientras tanto, esta respuesta no va
  } catch (e) {
    if (n === pedidoHistorial) fallo(e);
  }
}

// ---------- Ventas del mes ----------
// El reporte del mes con el stock: había + entró (pedidos y lo sumado en conteos) − salió (tocado en la app y lo que
// faltó en conteos) = quedó. En kilos para el helado (cada balde = 6,1 kg); tortas y panificados, por unidad.

const ven = { mes: null, datos: null, pedido: 0, dia: null, verPlanilla: false };

function abrirVentas() {
  ven.mes = V.hoyArgentina().slice(0, 7);
  ven.datos = null;
  mostrar("ventas");
  pintarVentas();
  cargarVentas();
}

function cambiarMes(n) {
  const sig = V.sumarMes(ven.mes, n);
  if (sig > V.hoyArgentina().slice(0, 7)) return;
  ven.mes = sig;
  ven.datos = null;
  pintarVentas();
  cargarVentas();
}

async function cargarVentas() {
  const n = ++ven.pedido;
  try {
    const r = await api("ventas", { mes: ven.mes });
    if (n !== ven.pedido) return;
    ven.datos = r;
    // El detalle arranca en el último día que vendió algo.
    ven.dia = [...r.ventas.por_dia].reverse().find((d) => d.salio > 0)?.fecha ?? r.ventas.por_dia.at(-1)?.fecha ?? null;
    pintarVentas();
  } catch (e) {
    if (n === ven.pedido) fallo(e);
  }
}

function listaVentas(titulo, filas, texto) {
  if (!filas.length) return "";
  const max = filas[0].salio;
  return `<section class="tarjeta top ven-lista"><h3>${titulo}</h3>${filas.map((f) =>
    `<div class="top-fila"><span>${V.escapar(f.nombre)}</span>` +
    `<span class="top-barra" style="width:${Math.max(4, Math.round((f.salio / max) * 100))}%"></span><b>${texto(f)}</b></div>`
  ).join("")}</section>`;
}

/** Una fila de la cuenta del mes: "+ Llegó en pedidos · 186 kg (30 baldes)". */
const filaCuenta = (signo, texto, n, extra = "", clase = "") =>
  `<div class="ven-fila${clase ? ` ${clase}` : ""}"><span class="ven-signo">${signo}</span><span>${texto}${extra ? `<small>${extra}</small>` : ""}</span>` +
  `<b>${V.kilos(n)}</b><small class="ven-baldes">${V.baldes(n)}</small></div>`;

function detalleDia(d) {
  const t = V.fechaLarga(d.fecha);
  return `${t[0].toUpperCase()}${t.slice(1)}: había ${V.kilos(d.habia)}` + (d.entro ? ` · entró ${V.kilos(d.entro)}` : "") +
    ` · salió <strong>${V.kilos(d.salio)}</strong> (${V.baldes(d.salio)}) · quedó ${V.kilos(d.quedo)}` +
    (d.tortas ? ` · ${V.postres(d.tortas)}` : "") + (d.pan ? ` · ${d.pan} de panificados` : "");
}

function pintarVentas() {
  $("ven-mes").textContent = V.nombreMes(ven.mes);
  $("b-mes-sig").disabled = ven.mes >= V.hoyArgentina().slice(0, 7);
  const cuerpo = $("ven-cuerpo");
  const r = ven.datos;
  if (!r || r.mes !== ven.mes) {
    cuerpo.innerHTML = `<p class="vacio">Cargando…</p>`;
    $("b-ven-wa").hidden = true;
    return;
  }
  const v = r.ventas, a = r.anterior, b = v.baldes;
  if (!v.dias) {
    cuerpo.innerHTML = `<p class="vacio">En ${V.nombreMes(ven.mes).toLowerCase()} la app todavía no anotaba nada.</p>`;
    $("b-ven-wa").hidden = true;
    return;
  }
  $("b-ven-wa").hidden = false;
  $("b-ven-wa").href = V.linkWhatsApp("", V.textoReporte(r, st.localNombre ?? LOCAL ?? "el local"));
  const vend = V.vendidoDe(b);
  const mesA = V.nombreMes(a.mes).split(" ")[0].toLowerCase();
  const cambio = V.comparar({ baldes: vend, dias: v.dias }, { baldes: V.vendidoDe(a.baldes), dias: a.dias });
  const desde = V.fechaCorta(v.desde), hasta = V.fechaCorta(v.hasta);
  const maxDia = Math.max(1, ...v.por_dia.map((d) => d.salio));
  const sel = v.por_dia.find((d) => d.fecha === ven.dia);
  const avisos = [];
  if (!v.cierra) avisos.push("Hay un cambio de stock que no quedó anotado: los números de este mes pueden no ser exactos.");
  if (v.arranca_despues) avisos.push(`La app empezó a anotar el ${desde}: el mes cuenta desde ese día.`);
  if (b.falto && b.falto * 4 >= vend) {
    avisos.push(`${V.kilos(b.falto)} salieron por conteos que encontraron menos de lo anotado: pueden ser baldes que se ` +
      "abrieron sin tocarlos en la app, o números viejos que se corrigieron.");
  }

  cuerpo.innerHTML =
    (avisos.length ? `<div class="ven-avisos">${avisos.map((x) => `<p>${x}</p>`).join("")}</div>` : "") +
    `<div class="ven-tarjetas">` +
    `<div class="tarjeta ven-hero"><span>Helado vendido · del ${desde} al ${hasta}</span><strong>${V.kilos(vend)}</strong>` +
    `<small>${V.baldes(vend)}: ${b.abiertos} tocados en la app${b.falto ? ` + ${b.falto} que faltaron en conteos` : ""}</small></div>` +
    `<div class="tarjeta"><span>Por día</span><strong>${V.kilos(vend / v.dias)}</strong>` +
    `<small>promedio de ${v.dias === 1 ? "1 día" : `${v.dias} días`}</small></div>` +
    (v.en_curso && v.dias >= V.DIAS_PROYECCION
      ? `<div class="tarjeta"><span>Si sigue así, el mes cierra en</span><strong>${V.kilos(V.proyeccion(vend, v.dias, v.dias_mes))}</strong>` +
        `<small>${V.kilos(vend / v.dias)} × ${v.dias_mes} días</small></div>`
      : "") +
    `<div class="tarjeta"><span>Comparado con ${mesA}</span><strong>${cambio ?? "—"}</strong><small>${a.dias
      ? `por día: ${V.kilos(V.vendidoDe(a.baldes) / a.dias)} en ${mesA}`
      : "no hay datos de ese mes"}</small></div>` +
    `<div class="tarjeta"><span>${v.en_curso ? "Hay ahora" : `Quedó el ${hasta}`}</span><strong>${V.kilos(b.quedo)}</strong>` +
    `<small>${V.baldes(b.quedo)} de helado</small></div>` +
    `</div>` +

    `<section class="tarjeta ven-cuenta"><h3>La cuenta del helado</h3>` +
    filaCuenta("", `Había el ${desde}`, b.habia) +
    filaCuenta("+", "Llegó en pedidos", b.pedidos) +
    (b.sumado ? filaCuenta("+", "Sumado en conteos", b.sumado, "stock que no estaba anotado (por ejemplo, la carga inicial)") : "") +
    filaCuenta("−", "Tocado en la app", b.abiertos) +
    (b.falto ? filaCuenta("−", "Faltó en conteos", b.falto, "se vendió sin tocarlo en la app, o eran números viejos") : "") +
    filaCuenta("=", v.en_curso ? "Hay ahora" : `Quedó el ${hasta}`, b.quedo, "", "ven-total") +
    `<p class="nota">Vendido = tocado en la app + lo que faltó en conteos = <strong>${V.kilos(vend)}</strong>.</p></section>` +

    `<section class="tarjeta ven-grafico"><h3>Kilos vendidos por día</h3>` +
    `<p class="ven-detalle" id="ven-detalle">${sel ? detalleDia(sel) : "Tocá un día para ver el detalle."}</p>` +
    `<div class="ven-barras" style="--dias:${v.por_dia.length}">${v.por_dia.map((d) =>
      `<button type="button" class="ven-dia${d.fecha === ven.dia ? " elegido" : ""}" data-ven-dia="${d.fecha}" ` +
      `aria-label="${V.escapar(V.fechaLarga(d.fecha))}: ${V.kilos(d.salio)}" aria-pressed="${d.fecha === ven.dia}">` +
      `<span class="ven-barra" style="height:${d.salio ? Math.max(3, Math.round((d.salio / maxDia) * 100)) : 0}%"></span>` +
      `<span class="ven-num">${Number(d.fecha.slice(8, 10))}</span></button>`
    ).join("")}</div></section>` +

    `<section class="tarjeta ven-planilla"><div class="ven-planilla-cabeza"><h3>Día por día</h3>` +
    `<button type="button" class="btn btn-borde btn-chico" data-ven-planilla>${ven.verPlanilla ? "Ocultar" : "Ver la planilla"}</button></div>` +
    (ven.verPlanilla
      ? `<div class="ven-tabla" role="table" aria-label="Stock de helado día por día, en kilos">` +
        `<div class="ven-tr ven-th" role="row"><span role="columnheader">Día</span><span role="columnheader">Había</span>` +
        `<span role="columnheader">Entró</span><span role="columnheader">Salió</span><span role="columnheader">Quedó</span></div>` +
        v.por_dia.map((d) =>
          `<div class="ven-tr" role="row"><span role="cell">${V.escapar(V.fechaLarga(d.fecha))}</span>` +
          `<span role="cell">${V.kilos(d.habia)}</span><span role="cell">${d.entro ? V.kilos(d.entro) : "—"}</span>` +
          `<span role="cell"><b>${d.salio ? V.kilos(d.salio) : "—"}</b></span><span role="cell">${V.kilos(d.quedo)}</span></div>`
        ).join("") +
        `<div class="ven-tr ven-tf" role="row"><span role="cell">Total</span><span role="cell">${V.kilos(b.habia)}</span>` +
        `<span role="cell">${V.kilos(V.entroDe(b))}</span><span role="cell"><b>${V.kilos(vend)}</b></span>` +
        `<span role="cell">${V.kilos(b.quedo)}</span></div></div>`
      : "") +
    `</section>` +

    listaVentas("Sabores del mes", v.sabores, (f) =>
      `${V.kilos(f.salio)} <small>(${f.salio}${f.falto ? `, ${f.falto} por conteo` : ""})</small>`) +
    listaVentas("Tortas y postres", v.tortas_lista, (f) => String(f.salio)) +
    listaVentas("Panificados", v.pan_lista, (f) => String(f.salio)) +
    `<p class="nota ven-nota">Cada balde = ${V.kilos(1)}. Sale del stock de la app (lo que había, lo que llegó y lo que ` +
    "quedó), no de la caja: para que dé bien, hay que tocar cada balde que se abre, cargar cada pedido y contar los pozos seguido.</p>";
}

// ---------- Ajustes: sabores ----------

function pintarAjustes() {
  $("aj-titulo").textContent = pan() ? "Panificados" : "Sabores";
  $("alta-etiqueta").firstChild.textContent = pan() ? "Producto nuevo" : "Sabor nuevo";
  $("alta-nombre").placeholder = pan() ? "Ej.: Rolls de jamón y queso" : "Ej.: Dulce de leche c/ brownie";
  $("alta-detalle-campo").hidden = !pan();
  $("f-alta").classList.toggle("con-detalle", pan());
  const elegido = $("alta-grupo").value;
  $("alta-grupo").innerHTML = sec().grupos.map((g) => `<option value="${g.id}">${g.nombre}</option>`).join("");
  if (sec().grupos.some((g) => g.id === elegido)) $("alta-grupo").value = elegido;
  $("aj-nota").textContent = `Sacar un ${sec().item} lo esconde de la pantalla pero guarda su historial. ` +
    "Se puede volver a agregar con el mismo nombre.";
  $("aj-lista").innerHTML = grupos().map((g) =>
    `<div class="aj-grupo"><h3>${g.nombre}</h3>${
      g.sabores.map((s, i) => {
        const n = V.escapar(s.nombre);
        const det = s.detalle ? ` <span class="aj-detalle">${V.escapar(s.detalle)}</span>` : "";
        const cant = V.cuantoHay(s);
        return `<div class="aj-fila"><span class="aj-nombre">${n}${det}</span><span class="aj-cant">${cant}</span>` +
          `<button type="button" class="btn btn-borde btn-icono" data-mover="-1" data-id="${s.id}" aria-label="Subir ${n}" data-ayuda="Subirlo un lugar en la lista"${i === 0 ? " disabled" : ""}>` +
          `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>` +
          `<button type="button" class="btn btn-borde btn-icono" data-mover="1" data-id="${s.id}" aria-label="Bajar ${n}" data-ayuda="Bajarlo un lugar en la lista"${i === g.sabores.length - 1 ? " disabled" : ""}>` +
          `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>` +
          `<button type="button" class="btn btn-borde btn-sacar" data-sacar="${s.id}" data-ayuda="Esconder este ${sec().item} de la pantalla (su historial se guarda)">Sacar</button></div>`;
      }).join("")
    }</div>`
  ).join("") || `<p class="vacio">No hay ${sec().items}.</p>`;
}

async function cambioDeSabores(promesa, aviso) {
  try {
    const r = await mutar(() => promesa());
    await recargarEstado();
    pintarAjustes();
    if (aviso) {
      sonar("exito");
      avisar(aviso(r), { deshacer: true });
    }
  } catch (e) {
    fallo(e);
  }
}

// ---------- Pantalla siempre encendida ----------

let bloqueoPantalla = null;
async function pantallaEncendida() {
  if (st.vista === "pin" || bloqueoPantalla || document.visibilityState !== "visible") return;
  try {
    bloqueoPantalla = await navigator.wakeLock?.request("screen");
    bloqueoPantalla?.addEventListener("release", () => (bloqueoPantalla = null));
  } catch { /* no soportado o sin permiso */ }
}

// ---------- Ayudas: qué hace cada botón ----------
// Con mouse: aparece al apoyarlo encima. En la tablet: dejando el dedo apretado; al soltar NO se activa el botón.

let timerAyuda = 0;
let ocultarAyudaEn = 0;
let presion = null; // { x, y, el } mientras el dedo está apoyado
let suprimirClick = false;

function mostrarAyuda(el, ms = 0) {
  const texto = el.dataset.ayuda;
  if (!texto || !el.isConnected) return;
  const a = $("ayuda");
  (document.querySelector("dialog[open]") ?? document.body).appendChild(a);
  a.textContent = texto;
  a.hidden = false;
  const r = el.getBoundingClientRect();
  const w = a.offsetWidth, h = a.offsetHeight, margen = 10;
  const abajo = r.bottom + margen + h <= innerHeight - 8;
  const top = abajo ? r.bottom + margen : r.top - margen - h;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  a.style.top = `${Math.max(8, top)}px`;
  a.style.left = `${left}px`;
  a.style.setProperty("--flecha", `${Math.min(Math.max(16, r.left + r.width / 2 - left), w - 16)}px`);
  a.classList.toggle("arriba", !abajo);
  clearTimeout(ocultarAyudaEn);
  if (ms) ocultarAyudaEn = setTimeout(ocultarAyuda, ms);
}

function ocultarAyuda() {
  clearTimeout(timerAyuda);
  $("ayuda").hidden = true;
}

function conectarAyudas() {
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = e.target.closest("[data-ayuda]");
    if (!el || el.contains(e.relatedTarget)) return;
    ocultarAyuda();
    timerAyuda = setTimeout(() => mostrarAyuda(el), 450);
  });
  document.addEventListener("pointerout", (e) => {
    if (e.pointerType !== "mouse") return;
    const el = e.target.closest("[data-ayuda]");
    if (el && !el.contains(e.relatedTarget)) ocultarAyuda();
  });

  document.addEventListener("pointerdown", (e) => {
    suprimirClick = false;
    ocultarAyuda();
    if (e.pointerType === "mouse") return;
    const el = e.target.closest("[data-ayuda]");
    if (!el) return;
    presion = { x: e.clientX, y: e.clientY, el };
    timerAyuda = setTimeout(() => {
      suprimirClick = true;
      vibrar(10);
      mostrarAyuda(el, 3000);
    }, 550);
  });
  document.addEventListener("pointermove", (e) => {
    if (presion && Math.hypot(e.clientX - presion.x, e.clientY - presion.y) > 12) {
      clearTimeout(timerAyuda);
      presion = null;
    }
  });
  const soltar = () => {
    if (presion) clearTimeout(timerAyuda);
    presion = null;
  };
  document.addEventListener("pointerup", soltar);
  document.addEventListener("pointercancel", soltar);
  // Después de una presión larga, el toque no cuenta (no abre un balde ni nada).
  document.addEventListener("click", (e) => {
    if (!suprimirClick) return;
    suprimirClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest("[data-ayuda]")) e.preventDefault();
  });
  addEventListener("scroll", ocultarAyuda, { passive: true });
  document.addEventListener("click", ocultarAyuda);
}

// ---------- Arranque y eventos ----------

/** El nombre del local en el título de la pestaña, la barra y la pantalla del PIN. */
function pintarLocal(nombre) {
  if (nombre && nombre !== st.localNombre) {
    st.localNombre = nombre;
    guardado.poner(`stock_nombre:${LOCAL}`, nombre);
  }
  const n = st.localNombre;
  document.title = n ? `Stock · Heladería Demo ${n}` : "Stock · Heladería Demo";
  $("marca-local").textContent = n ? `${n} · Stock` : "Stock";
  $("pin-titulo").textContent = n ? `${n} · Stock de helados` : "Stock de helados";
}

/** Solo en un aparato que entró con PIN en más de un local (el celular de quien maneja varios); en la tablet, []. */
function otrosLocales() {
  return V.localesConocidos(guardado.claves("stock_nombre:"), LOCAL);
}

/** Cada local tiene su sesión guardada: el que ya entró ahí vuelve directo, sin PIN. */
function irALocal(local) {
  location.reload();
}

/** Página principal: abre el último local de esta tablet, o pregunta cuál es. */
function elegirLocal() {
  const ultimo = guardado.leer("stock_local");
  const destino = V.localDeRuta(`/${ultimo ?? ""}`);
  if (destino) return location.reload();
  $("v-pin").classList.add("elegir-local");
  $("f-local").hidden = false;
  mostrar("pin");
  $("local-codigo").focus();
}

async function iniciar() {
  if (!LOCAL) return elegirLocal();
  pintarLocal();
  if (!st.sesion) return mostrar("pin");
  mostrar("stock");
  try {
    await recargarEstado();
    pintarStock();
  } catch (e) {
    if (e.estado !== 0) return fallo(e);
    // Sin internet: los últimos números que vio esta tablet (el cartel de arriba dice de cuándo son).
    if (usarFotoGuardada()) {
      marcarRed(false);
      pintarStock();
    } else {
      $("stock-grilla").innerHTML = `<p class="vacio">No hay internet y esta tablet todavía no tiene números guardados. ` +
        `Cuando vuelva el wifi se cargan solos.</p>`;
    }
  }
}

function conectar() {
  conectarAyudas();
  $("f-local").addEventListener("submit", (e) => {
    e.preventDefault();
    const slug = V.slugEscrito($("local-codigo").value);
    if (!slug) {
      $("local-msg").textContent = "Escribí el código del local (te lo pasa quien te dio la tablet).";
      return $("local-codigo").focus();
    }
    location.assign(`/${slug}${location.search}`);
  });
  $("teclado").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-d]");
    if (b) teclaPin(b.dataset.d);
  });
  document.addEventListener("keydown", (e) => {
    const tecla = /^\d$/.test(e.key) ? e.key : e.key === "Backspace" ? "borrar" : e.key === "Enter" ? "listo" : null;
    if (!tecla) return;
    if (numero) teclaNumero(tecla);
    else if (st.vista === "pin" && tecla !== "listo") teclaPin(tecla);
  });

  $("stock-grilla").addEventListener("click", (e) => {
    const accion = e.target.closest("[data-accion]")?.dataset.accion;
    if (accion === "conteo") return abrirCarga("conteo");
    if (accion === "pedir") return abrirCarga("armar");
    if (accion === "tip-ok") {
      guardado.poner(pan() ? "stock_tip_pan_visto" : "stock_tip_visto", "1");
      return document.querySelector("#stock-grilla .tip")?.remove();
    }
    const b = e.target.closest(".sabor");
    if (b) {
      soltarTeclado();
      abrirBalde(Number(b.dataset.id));
    }
  });
  $("b-deshacer").addEventListener("click", deshacer);
  $("aviso-deshacer").addEventListener("click", deshacer);
  $("b-pedido").addEventListener("click", () => abrirCarga("pedido"));
  $("b-carga-vacio").addEventListener("click", empezarVacio);
  $("b-armar").addEventListener("click", () => abrirCarga("armar"));
  $("b-ped-volver").addEventListener("click", () => $("d-pedido").close());
  $("b-ped-whatsapp").addEventListener("click", mandarWhatsApp);
  $("b-ped-copiar").addEventListener("click", copiarPedido);
  $("b-ped-imprimir").addEventListener("click", imprimirPedido);
  $("ped-auto-imprimir").addEventListener("change", (e) => guardado.poner("stock_auto_imprimir", e.target.checked ? null : "no"));
  $("ped-numero").addEventListener("input", pintarNotaPedido);
  $("ped-numero").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("ped-numero").blur();
  });
  // El conteo general está en el menú ☰ (arriba quedó "Pozos").
  $("b-conteo").addEventListener("click", () => {
    if ($("d-ajustes").open) $("d-ajustes").close();
    abrirCarga("conteo");
  });
  $("b-pozos").addEventListener("click", abrirPozos);
  $("b-tareas").addEventListener("click", () => {
    $("d-ajustes").close();
    abrirTareas();
  });
  $("b-voz").hidden = !Reconocedor;
  $("b-voz").addEventListener("click", escucharVoz);
  $("voz-hoja").addEventListener("click", clicVoz);
  $("d-voz").addEventListener("close", () => {
    voz.estado = null;
    try {
      voz.rec?.abort();
    } catch { /* ya estaba cortado */ }
  });
  $("b-ventas").addEventListener("click", () => {
    $("d-ajustes").close();
    abrirVentas();
  });
  $("b-ven-volver").addEventListener("click", () => {
    mostrar("stock");
    pintarStock();
  });
  $("b-mes-ant").addEventListener("click", () => cambiarMes(-1));
  $("b-mes-sig").addEventListener("click", () => cambiarMes(1));
  $("ven-cuerpo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-ven-dia], [data-ven-planilla]");
    if (!b) return;
    if (b.dataset.venDia) ven.dia = b.dataset.venDia;
    else ven.verPlanilla = !ven.verPlanilla;
    pintarVentas();
  });
  $("b-pz-volver").addEventListener("click", () => {
    mostrar("stock");
    pintarStock();
  });
  $("pz-buscar").addEventListener("input", pintarPozos);
  $("pz-cuerpo").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.pozo) abrirHojaPozo(Number(b.dataset.pozo));
    else if (b.dataset.pzSin !== undefined) {
      pz.verSinUbicar = !pz.verSinUbicar;
      pintarPozos();
    }
    else if (b.dataset.pzAjustar !== undefined) ajustarSinUbicar();
  });
  $("pz-hoja").addEventListener("click", clicHojaPozo);
  $("pz-hoja").addEventListener("input", (e) => {
    if (e.target.id !== "pz-agregar" || !pz.conteo) return;
    pz.conteo.buscar = e.target.value;
    $("pz-opciones").innerHTML = opcionesConteo();
  });
  // Cerrar la hoja a mitad de "¿de dónde lo trajiste?" es "No traje"; a mitad de un conteo, lo descarta.
  $("d-pozo").addEventListener("close", () => {
    if (pz.abierto) terminarAbrir(0);
    pz.conteo = null;
    pz.guardar = null;
    pz.modo = null;
  });
  $("d-pozo").addEventListener("cancel", (e) => {
    if (pz.modo === "contar" && pz.conteo?.filas.some((f) => f.hay !== f.app)) {
      e.preventDefault();
      cancelarConteoPozo();
    }
  });
  $("b-tar-volver").addEventListener("click", () => {
    mostrar("stock");
    pintarStock();
  });
  $("b-sem-ant").addEventListener("click", () => cambiarSemanaTareas(-1));
  $("b-sem-sig").addEventListener("click", () => cambiarSemanaTareas(1));
  $("b-tar-armar").addEventListener("click", armarTareas);
  $("b-tar-equipo").addEventListener("click", abrirEquipo);
  $("tar-dias").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tar-dia]");
    if (!b) return;
    tar.dia = Number(b.dataset.tarDia);
    pintarTareas();
  });
  $("tar-cuerpo").addEventListener("click", (e) => {
    const n = e.target.closest("[data-nivel]");
    if (n) return marcarTarea(Number(n.dataset.tarea), Number(n.dataset.nivel));
    if (e.target.closest('[data-accion="tar-armar"]')) armarTareas();
  });
  $("tar-cuerpo").addEventListener("change", (e) => {
    const s = e.target.closest("[data-quien]");
    if (s) asignarTarea(Number(s.dataset.quien), s.value ? Number(s.value) : null);
  });
  $("eq-lista").addEventListener("click", (e) => {
    const sacar = e.target.closest("[data-eq-sacar]");
    if (sacar) return sacarPersona(Number(sacar.dataset.eqSacar));
    const b = e.target.closest("[data-eq-franco]");
    if (!b) return;
    const p = tar.equipo.find((x) => x.id === Number(b.dataset.eqFranco));
    const dia = Number(b.dataset.d);
    p.francos = p.francos.includes(dia) ? p.francos.filter((x) => x !== dia) : [...p.francos, dia].sort((a, b) => a - b);
    pintarEquipo();
  });
  $("eq-lista").addEventListener("change", (e) => {
    const s = e.target.closest("[data-eq-turno]");
    if (s) tar.equipo.find((x) => x.id === Number(s.dataset.eqTurno)).turno = s.value;
  });
  $("eq-lista").addEventListener("input", (e) => {
    const n = e.target.closest("[data-eq-nombre]");
    if (n) tar.equipo.find((x) => x.id === Number(n.dataset.eqNombre)).nombre = n.value;
  });
  $("f-eq-alta").addEventListener("submit", agregarPersona);
  // Si se agregó o sacó a alguien y se cerró sin "Listo", igual se ve en la semana.
  $("d-equipo").addEventListener("close", () => {
    if (tar.equipoCambio) {
      tar.equipoCambio = false;
      cargarTareas();
    }
  });
  $("b-tar-lista").addEventListener("click", abrirListaTareas);
  $("b-lt-listo").addEventListener("click", () => $("d-lista").close());
  $("b-lt-nueva").addEventListener("click", () => {
    lt.editando = { id: null, numero: null, nombre: "", frecuencia: "", momento: "todo", peso: 2, dias: [1, 2, 3, 4, 5, 6, 7], fija_id: null, de_todos: false };
    pintarListaTareas();
  });
  $("lt-cuerpo").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.ltEditar) {
      const t = tar.datos.tareas.find((x) => x.id === Number(b.dataset.ltEditar));
      lt.editando = { ...t, dias: [...t.dias] };
      pintarListaTareas();
    } else if (b.dataset.ltDia) {
      const dia = Number(b.dataset.ltDia);
      const t = lt.editando;
      t.dias = t.dias.includes(dia) ? t.dias.filter((x) => x !== dia) : [...t.dias, dia];
      b.setAttribute("aria-pressed", String(t.dias.includes(dia)));
    } else if (b.dataset.ltCancelar !== undefined) {
      lt.editando = null;
      pintarListaTareas();
    } else if (b.dataset.ltSacar !== undefined) sacarTarea();
  });
  $("lt-cuerpo").addEventListener("submit", guardarTarea);
  $("b-eq-listo").addEventListener("click", guardarEquipo);
  $("b-historial").addEventListener("click", () => {
    mostrar("historial");
    verDia(null);
  });
  $("b-menu").addEventListener("click", () => {
    pintarAjustes();
    $("b-cambiar-local").hidden = otrosLocales().length === 0;
    $("d-ajustes").showModal();
  });

  for (const id of ["stock-chips", "carga-chips"]) {
    $(id).addEventListener("click", (e) => {
      const seccion = e.target.closest(".seccion-btn");
      if (seccion) return cambiarSeccion(seccion.dataset.seccion);
      const c = e.target.closest(".chip");
      if (!c) return;
      if (c.dataset.buscar !== undefined) return abrirBusqueda(st.vista === "carga" ? "carga" : "stock");
      if (c.dataset.filtro) {
        st.filtro = !st.filtro;
        pintarStock();
        return window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (st.vista === "stock" && st.filtro) {
        st.filtro = false;
        pintarStock();
      }
      irAGrupo(c.dataset.ir);
    });
  }
  for (const donde of ["stock", "carga"]) {
    const campo = $(`${donde}-buscar`);
    campo.addEventListener("input", () => {
      st.busqueda[donde] = campo.value;
      repintar(donde);
    });
    campo.addEventListener("keydown", (e) => {
      if (e.key === "Enter") campo.blur(); // esconde el teclado y deja ver los resultados
      if (e.key === "Escape") cerrarBusqueda(donde);
    });
    $(`${donde}-buscador`).querySelector("[data-cerrar-busqueda]").addEventListener("click", () => cerrarBusqueda(donde));
  }
  let pendienteScroll = false;
  window.addEventListener("scroll", () => {
    if (pendienteScroll) return;
    pendienteScroll = true;
    requestAnimationFrame(() => {
      pendienteScroll = false;
      if (st.vista === "stock" || st.vista === "carga") marcarChip();
    });
  }, { passive: true });

  $("carga-grilla").addEventListener("click", (e) => {
    if (e.target.closest("button")) soltarTeclado();
    const ideal = e.target.closest("[data-ideal]");
    if (ideal) return abrirNumero(Number(ideal.dataset.ideal), true);
    const n = e.target.closest("[data-numero]");
    if (n) return abrirNumero(Number(n.dataset.numero));
    const b = e.target.closest("[data-paso]");
    if (b && !b.disabled) pasoCarga(Number(b.dataset.id), Number(b.dataset.paso));
  });
  $("num-teclado").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-n]");
    if (b) teclaNumero(b.dataset.n);
  });
  $("d-numero").addEventListener("close", () => (numero = null));
  $("d-numero").addEventListener("click", (e) => {
    if (e.target === $("d-numero")) $("d-numero").close(); // tocar afuera = cancelar
  });
  $("b-carga-cancelar").addEventListener("click", cancelarCarga);
  $("b-carga-guardar").addEventListener("click", guardarCarga);

  $("b-hist-volver").addEventListener("click", () => {
    mostrar("stock");
    pintarStock();
  });
  $("b-dia-ant").addEventListener("click", () => verDia(V.sumarDias(st.hist.fecha, -1)));
  $("b-dia-sig").addEventListener("click", () => verDia(V.sumarDias(st.hist.fecha, 1)));
  $("hist-fecha").addEventListener("change", (e) => e.target.value && verDia(e.target.value));
  $("b-elegir-fecha").addEventListener("click", () => {
    const campo = $("hist-fecha");
    try {
      campo.showPicker(); // abre el calendario del navegador
    } catch {
      // Navegador viejo sin showPicker: se muestra el campo de fecha común en lugar del botón.
      campo.classList.add("visible");
      $("b-elegir-fecha").hidden = true;
      campo.focus();
    }
  });

  $("f-alta").addEventListener("submit", (e) => {
    e.preventDefault();
    const nombre = $("alta-nombre").value.trim();
    const grupo = $("alta-grupo").value;
    const seccion = st.seccion;
    const detalle = seccion === "panificados" ? $("alta-detalle").value.trim() : "";
    if (!nombre) return $("alta-nombre").focus();
    cambioDeSabores(() => api("agregar", { nombre, grupo, seccion, ...(detalle ? { detalle } : {}) }), (r) => {
      $("alta-nombre").value = "";
      $("alta-detalle").value = "";
      return `<strong>${V.escapar(r.nombre)}</strong> agregado a ${V.SECCIONES[seccion].grupos.find((g) => g.id === grupo).nombre}`;
    });
  });
  $("aj-lista").addEventListener("click", async (e) => {
    const mover = e.target.closest("[data-mover]");
    if (mover && !mover.disabled) {
      return cambioDeSabores(() => api("mover", { sabor_id: Number(mover.dataset.id), direccion: Number(mover.dataset.mover) }));
    }
    const sacar = e.target.closest("[data-sacar]");
    if (!sacar) return;
    const s = st.sabores.find((x) => x.id === Number(sacar.dataset.sacar));
    const quedan = s && s.cantidad > 0 ? ` Todavía figura con ${pan() || V.esTorta(s) ? s.cantidad : V.baldes(s.cantidad)}.` : "";
    if (!s || !(await confirmar(`¿Sacar ${s.nombre} de la lista?${quedan} Su historial se guarda.`, "Sacar"))) return;
    cambioDeSabores(() => api("sacar", { sabor_id: s.id }), (r) => `<strong>${V.escapar(r.nombre)}</strong> salió de la lista`);
  });
  $("b-aj-listo").addEventListener("click", () => $("d-ajustes").close());
  for (const d of document.querySelectorAll("dialog")) {
    d.addEventListener("close", () => {
      if (d.contains($("aviso"))) document.body.appendChild($("aviso"));
      if (d.contains($("ayuda"))) document.body.appendChild($("ayuda"));
    });
  }
  $("d-ajustes").addEventListener("close", () => {
    document.body.appendChild($("aviso"));
    if (st.vista === "stock") pintarStock();
  });
  pintarBotonSonido();
  $("b-sonido").addEventListener("click", () => {
    guardado.poner("stock_sonido", sonidoPrendido() ? "no" : "si");
    pintarBotonSonido();
    sonar("toc"); // al prender, se escucha cómo suena
  });
  $("b-cambiar-local").addEventListener("click", () => {
    const otros = otrosLocales();
    if (otros.length === 1) return irALocal(otros[0].local);
    $("loc-lista").innerHTML = otros.map((o) =>
      `<button type="button" class="btn btn-borde" data-local="${V.escapar(o.local)}">${V.escapar(o.nombre)}</button>`
    ).join("");
    $("d-locales").showModal();
  });
  $("loc-lista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-local]");
    if (b) irALocal(b.dataset.local);
  });
  $("loc-no").addEventListener("click", () => $("d-locales").close());
  $("b-bloquear").addEventListener("click", async () => {
    if (await confirmar("¿Bloquear la tablet? Para volver a usarla hay que poner el PIN.", "Bloquear")) cerrarSesion();
  });

  // Si otra tablet o un celular cambió algo, se ve solo. Nunca en medio de un toque pendiente.
  setInterval(() => {
    if (st.vista === "stock" && document.visibilityState === "visible" && enVuelo === 0) {
      recargarEstado().catch(() => {});
    }
  }, 20000);
  // Se cortó o volvió el wifi: el cartel se ajusta, y al volver se traen los números.
  addEventListener("offline", () => marcarRed(false));
  addEventListener("online", () => {
    if (st.vista === "stock" && st.sesion) recargarEstado().catch(() => {});
    else marcarRed(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    pantallaEncendida();
    if (st.vista === "stock" && st.sesion) recargarEstado().catch(() => {});
  });
}

conectar();
pintarSeccion();
if (navigator.onLine
 === false) marcarRed(false);
iniciar();
// Demo: sin service worker (no queda nada guardado en el aparato).
