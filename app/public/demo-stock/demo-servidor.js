// Demo: un "servidor" falso que vive en la memoria de la página. Nada sale a internet ni se guarda:
// al recargar, todo vuelve a los datos ficticios de arranque.
import { armarSemana, KILOS_BALDE } from "./vista.js";

export const PIN_DEMO = "1234";
export const LOCAL_DEMO = { slug: "centro", nombre: "Centro" };

const GRUPOS_HELADOS = ["cremas", "dulces_de_leche", "chocolates", "frutas_al_agua", "tortas"];
const GRUPOS_PAN = ["panes", "salados", "dulces"];
const SECCIONES = { helados: GRUPOS_HELADOS, panificados: GRUPOS_PAN };
const DIA_MS = 86_400_000;

// ---------- Fechas (Argentina, UTC−3) ----------
const hoyAR = (d = new Date()) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
const rangoDia = (f) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return null;
  const desde = new Date(`${f}T00:00:00-03:00`);
  if (isNaN(desde) || hoyAR(desde) !== f) return null;
  return { desde, hasta: new Date(desde.getTime() + DIA_MS) };
};
const sumarDias = (f, n) => {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaSemana = (f) => ((new Date(`${f}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = lunes … 7 = domingo
const lunesDe = (f) => sumarDias(f, 1 - diaSemana(f));
const mesAnterior = (m) => {
  const [a, n] = m.split("-").map(Number);
  return n === 1 ? `${a - 1}-12` : `${a}-${String(n - 1).padStart(2, "0")}`;
};
const mesSiguiente = (m) => {
  const [a, n] = m.split("-").map(Number);
  return n === 12 ? `${a + 1}-01` : `${a}-${String(n + 1).padStart(2, "0")}`;
};
const enAR = (fecha, h, m = 0) => new Date(`${fecha}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`);
const uuid = () => crypto.randomUUID?.() ??
  "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

// Azar con semilla: los datos de arranque son siempre parecidos.
let semilla = 20261114;
const azar = () => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
};
const entre = (a, b) => a + Math.floor(azar() * (b - a + 1));

// ---------- Datos ficticios ----------
const CARTA = [
  ["cremas", ["Vainilla", "Crema americana", "Sambayón", "Frutilla a la crema", "Banana split", "Tramontana", "Menta granizada", "Cereza a la crema", "Mascarpone con frutos rojos", "Crema del cielo"]],
  ["dulces_de_leche", ["Dulce de leche", "Dulce de leche granizado", "Dulce de leche con brownie", "Súper dulce de leche", "Dulce de leche con nuez"]],
  ["chocolates", ["Chocolate", "Chocolate amargo", "Chocolate suizo", "Chocolate con almendras", "Chocolate blanco", "Chocolate rocher"]],
  ["frutas_al_agua", ["Limón", "Frutilla al agua", "Maracuyá", "Durazno", "Ananá", "Frambuesa"]],
  ["tortas", ["Torta helada de oreo", "Almendrado", "Bombón escocés", "Torta helada de frutilla", "Cassata"]],
  ["panes", [["Pan árabe", "paquete x 6"], ["Pan de miga", "paquete x 24"], ["Pan lactal", "unidad"]]],
  ["salados", [["Chipá", "bolsa x 12"], ["Rolls de jamón y queso", "caja x 6"], ["Fosforitos", "caja x 8"]]],
  ["dulces", [["Medialunas", "docena"], ["Cookies", "caja x 10"], ["Alfajores de maicena", "caja x 6"], ["Budín de limón", "unidad"]]],
];
const POPULARES = new Set(["Dulce de leche", "Dulce de leche granizado", "Chocolate", "Chocolate suizo", "Frutilla a la crema", "Limón", "Sambayón", "Súper dulce de leche", "Menta granizada"]);

function crearEstado() {
  semilla = 20261114;
  const ahora = new Date();
  const hoy = hoyAR(ahora);
  const E = { sabores: [], movs: [], sigMov: 1, config: {}, equipo: [], tareas: [], dias: [], pozos: [], pozoLog: {} };

  // Sabores y productos
  let id = 1;
  for (const [grupo, lista] of CARTA) {
    lista.forEach((x, i) => {
      const [nombre, detalle] = Array.isArray(x) ? x : [x, null];
      const pan = GRUPOS_PAN.includes(grupo), torta = grupo === "tortas";
      const ideal = pan ? entre(6, 12) : torta ? entre(2, 4) : POPULARES.has(nombre) ? entre(6, 9) : entre(3, 5);
      E.sabores.push({ id: id++, nombre, grupo, orden: i + 1, cantidad: 0, detalle, ideal, activo: true, peso: POPULARES.has(nombre) ? 4 : pan ? 2 : 1 });
    });
  }

  // Historia: desde el 1 del mes pasado hasta ahora. Carga inicial, ventas de cada día, pedidos martes y viernes, conteos los lunes.
  const mov = (lote, tipo, s, antes, despues, cuando) => E.movs.push({
    id: E.sigMov++, lote, tipo, sabor_id: s.id, nombre: s.nombre, grupo: s.grupo, antes, despues,
    creado_en: cuando.toISOString(), deshecho_en: null,
  });
  const inicio = `${mesAnterior(hoy.slice(0, 7))}-01`;
  const loteIni = uuid();
  for (const s of E.sabores) {
    const n = Math.max(1, s.ideal + entre(-1, 1));
    mov(loteIni, "conteo", s, 0, n, enAR(inicio, 10, 5));
    s.cantidad = n;
  }
  const helado = E.sabores.filter((s) => GRUPOS_HELADOS.includes(s.grupo) && s.grupo !== "tortas");
  const tortas = E.sabores.filter((s) => s.grupo === "tortas");
  const pan = E.sabores.filter((s) => GRUPOS_PAN.includes(s.grupo));
  const elegir = (lista) => {
    const con = lista.filter((s) => s.cantidad > 0);
    const total = con.reduce((a, s) => a + s.peso, 0);
    let r = azar() * total;
    for (const s of con) if ((r -= s.peso) <= 0) return s;
    return con.at(-1);
  };
  for (let f = inicio; f <= hoy; f = sumarDias(f, 1)) {
    const dia = diaSemana(f);
    const eventos = [];
    // Pedidos: martes y viernes a las 11 (helado y tortas); panificados lunes, miércoles y viernes a las 9.
    if (dia === 2 || dia === 5) eventos.push([enAR(f, 11, entre(0, 40)), "pedido_helado"]);
    if (dia === 1 || dia === 3 || dia === 5) eventos.push([enAR(f, 9, entre(0, 30)), "pedido_pan"]);
    if (dia === 1 && f !== inicio) eventos.push([enAR(f, 12, entre(0, 50)), "conteo"]);
    const finde = dia >= 6;
    const nHel = entre(finde ? 10 : 6, finde ? 15 : 10);
    // Hoy, lo vendido se reparte entre la apertura y este momento (así la demo siempre muestra movimiento del día).
    const cuando = (h0, h1) => {
      if (f !== hoy) return enAR(f, entre(h0, h1 - 1), entre(0, 59));
      const a = enAR(f, 9).getTime(), b = Math.max(a + 3600_000, ahora.getTime() - 4 * 60000);
      return new Date(a + azar() * (b - a));
    };
    const nHoy = f === hoy ? Math.max(3, Math.round(nHel * 0.5)) : nHel;
    for (let i = 0; i < nHoy; i++) eventos.push([cuando(12, 24), "abrir_helado"]);
    for (let i = 0, n = entre(f === hoy ? 1 : 0, finde ? 3 : 1); i < n; i++) eventos.push([cuando(14, 23), "abrir_torta"]);
    for (let i = 0, n = entre(4, 9); i < n; i++) eventos.push([cuando(8, 20), "sacar_pan"]);
    eventos.sort((a, b) => a[0] - b[0]);
    for (const [cuando, tipo] of eventos) {
      if (cuando > ahora) continue;
      if (tipo.startsWith("pedido")) {
        const lista = tipo === "pedido_pan" ? pan : [...helado, ...tortas];
        const lote = uuid();
        for (const s of lista) {
          const falta = s.ideal - s.cantidad;
          if (falta <= 0) continue;
          const n = falta + (azar() < 0.3 ? 1 : 0);
          mov(lote, "pedido", s, s.cantidad, s.cantidad + n, cuando);
          s.cantidad += n;
        }
      } else if (tipo === "conteo") {
        const lote = uuid();
        for (const s of helado) {
          if (azar() > 0.18 || s.cantidad === 0) continue;
          const n = Math.max(0, s.cantidad + (azar() < 0.75 ? -1 : 1));
          mov(lote, "conteo", s, s.cantidad, n, cuando);
          s.cantidad = n;
        }
      } else {
        const s = elegir(tipo === "abrir_helado" ? helado : tipo === "abrir_torta" ? tortas : pan);
        if (!s) continue;
        mov(uuid(), "abrio", s, s.cantidad, s.cantidad - 1, cuando);
        s.cantidad--;
      }
    }
  }
  for (const s of E.sabores) delete s.peso;

  // Un pedido de helado ya mandado por WhatsApp que todavía no llegó.
  const faltan = helado.filter((s) => s.cantidad < s.ideal).slice(0, 6);
  const enCamino = (faltan.length ? faltan : helado.slice(0, 4)).map((s) => ({ sabor_id: s.id, cantidad: Math.max(1, s.ideal - s.cantidad) }));
  E.config.en_camino_helados = { items: enCamino, creado_en: new Date(ahora.getTime() - 95 * 60000).toISOString() };
  E.config.whatsapp = "";

  // Pozos: 3 vitrinas adelante (cada sabor con su lugar), 3 de depósito atrás y el de tortas.
  const pozo = (numero, nombre, zona, fijo, tortasP, contadoHace) => {
    const p = { id: numero, numero, nombre, zona, fijo, tortas: tortasP, contado_en: contadoHace === null ? null : new Date(ahora.getTime() - contadoHace * DIA_MS).toISOString(), sabores: [] };
    E.pozos.push(p);
    return p;
  };
  const vit = [pozo(1, "Vitrina 1 · Cremas", "adelante", true, false, 0), pozo(2, "Vitrina 2 · Dulces y chocolates", "adelante", true, false, 1), pozo(3, "Vitrina 3 · Frutales", "adelante", true, false, 2)];
  const dep = [pozo(4, "Depósito A", "atras", false, false, 3), pozo(5, "Depósito B", "atras", false, false, 5), pozo(6, "Depósito C", "atras", false, false, 9)];
  const pt = pozo(7, "Tortas heladas", "adelante", false, true, 1);
  const vitrinaDe = (g) => (g === "cremas" ? vit[0] : g === "frutas_al_agua" ? vit[2] : vit[1]);
  helado.forEach((s, i) => {
    let resto = s.cantidad - (i % 9 === 4 ? 1 : 0); // alguno queda "sin ubicar"
    const adelante = Math.min(resto, s.cantidad > 3 ? 2 : 1);
    vitrinaDe(s.grupo).sabores.push({ sabor_id: s.id, cantidad: Math.max(0, adelante), su_lugar: true });
    resto -= Math.max(0, adelante);
    if (resto > 0) {
      const a = dep[i % 3];
      a.sabores.push({ sabor_id: s.id, cantidad: resto, su_lugar: false });
    }
  });
  for (const s of tortas) if (s.cantidad > 0) pt.sabores.push({ sabor_id: s.id, cantidad: s.cantidad, su_lugar: false });

  // Equipo y tareas (nombres inventados).
  [["Sofía", "manana", [3]], ["Martín", "manana", [6]], ["Lucía", "intermedio", [1]], ["Tomás", "tarde", [2]], ["Valentina", "tarde", [4]], ["Nicolás", "tarde", [7]]]
    .forEach(([nombre, turno, francos], i) => E.equipo.push({ id: i + 1, nombre, inicial: nombre[0], turno, francos, orden: i + 1, horario: null, activo: true }));
  const T = (nombre, frecuencia, momento, peso, dias, fija = null, deTodos = false) =>
    E.tareas.push({ id: E.tareas.length + 1, numero: E.tareas.length + 1, nombre, frecuencia, momento, peso, dias, fija_id: fija, de_todos: deTodos, activo: true });
  const todos = [1, 2, 3, 4, 5, 6, 7];
  T("Limpiar vidrios de las vitrinas", "Todos los días", "apertura", 2, todos);
  T("Armar las vitrinas con los baldes", "Todos los días", "apertura", 2, todos);
  T("Reponer cucuruchos, potes y cucharitas", "Todos los días", "apertura", 1, todos);
  T("Anotar temperaturas de los pozos", "Todos los días", "apertura", 1, todos);
  T("Revisar fechas de vencimiento", "Todos los días", "todo", 1, todos, null, true);
  T("Limpiar mesas y salón", "Todos los días", "todo", 2, todos);
  T("Contar los pozos de depósito", "Lunes y jueves", "todo", 2, [1, 4]);
  T("Ordenar el depósito", "Miércoles", "todo", 3, [3]);
  T("Limpiar heladeras de panificados", "Martes y sábado", "todo", 2, [2, 6]);
  T("Lavar bachas y espátulas", "Todos los días", "cierre", 2, todos);
  T("Barrer y trapear", "Todos los días", "cierre", 2, todos);
  T("Limpiar el baño", "Lunes, miércoles y viernes", "cierre", 3, [1, 3, 5]);
  T("Sacar la basura", "Todos los días", "cierre", 1, todos);
  T("Cierre de caja", "Todos los días", "cierre", 2, todos, 4);
  // Reparto de esta semana y las 4 anteriores; lo pasado, marcado.
  const lunesHoy = lunesDe(hoy);
  const hora = Number(new Date(ahora.getTime() - 3 * 3600_000).toISOString().slice(11, 13));
  for (let k = 4; k >= 0; k--) {
    const lunes = sumarDias(lunesHoy, -7 * k);
    const items = armarSemana({ equipo: E.equipo, tareas: E.tareas, lunes, historial: [], marcadas: [], azar });
    for (const it of items) {
      let nivel = null;
      const tarea = E.tareas.find((t) => t.id === it.tarea_id);
      if (it.fecha < hoy || (it.fecha === hoy && hora >= 12 && tarea.momento === "apertura")) {
        const r = azar();
        nivel = r < 0.82 ? 2 : r < 0.93 ? 1 : 0;
      }
      E.dias.push({ fecha: it.fecha, tarea_id: it.tarea_id, persona_id: it.persona_id, nivel });
    }
  }
  return E;
}

// ---------- Lógica (igual que la función real, sobre la memoria) ----------
let E = null;
const sabor = (id) => {
  const s = E.sabores.find((x) => x.id === id && x.activo);
  if (!s) throw new Falla(404, "Ese sabor ya no está en la lista.");
  return s;
};
class Falla extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}
const sin = ({ activo: _a, ...x }) => x;
function nuevoMov(lote, tipo, s, antes, despues) {
  E.movs.push({ id: E.sigMov++, lote, tipo, sabor_id: s.id, nombre: s.nombre, grupo: s.grupo, antes, despues, creado_en: new Date().toISOString(), deshecho_en: null });
}
const deSeccion = (sec, movs) => movs.filter((m) => SECCIONES[sec].includes(m.grupo));
function movimientos(desde, hasta) {
  return E.movs.filter((m) => new Date(m.creado_en) >= desde && new Date(m.creado_en) < hasta).reverse();
}
function resumenDia(movs) {
  const vivos = movs.filter((m) => !m.deshecho_en);
  const por = new Map();
  let abiertos = 0, tortas = 0, entraron = 0;
  const lotes = new Set();
  for (const m of vivos) {
    if (m.tipo === "abrio") {
      if (m.grupo === "tortas") tortas++;
      else abiertos++;
      por.set(m.nombre, (por.get(m.nombre) ?? 0) + 1);
    } else if (m.tipo === "pedido") entraron += m.despues - m.antes;
    else if (m.tipo === "conteo") lotes.add(m.lote);
  }
  const top = [...por.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).slice(0, 6).map(([nombre, n]) => ({ nombre, n }));
  return { abiertos, tortas, entraron, conteos: lotes.size, top };
}
function abrir(id) {
  const s = sabor(id);
  if (s.cantidad <= 0) throw new Falla(409, `${s.nombre} ya está en 0.`);
  const lote = uuid();
  nuevoMov(lote, "abrio", s, s.cantidad, s.cantidad - 1);
  s.cantidad--;
  return { sabor_id: id, nombre: s.nombre, antes: s.cantidad + 1, despues: s.cantidad, lote };
}
function cargar(tipo, items) {
  const lote = uuid();
  let cambios = 0, omitidos = 0;
  for (const it of items) {
    const s = E.sabores.find((x) => x.id === it.sabor_id && x.activo);
    if (!s) {
      omitidos++;
      continue;
    }
    const nueva = tipo === "pedido" ? Math.min(s.cantidad + it.cantidad, 9999) : it.cantidad;
    if (nueva !== s.cantidad) {
      nuevoMov(lote, tipo, s, s.cantidad, nueva);
      s.cantidad = nueva;
      cambios++;
    }
  }
  return { cambios, omitidos, lote: cambios ? lote : null };
}
function ultimoMov(grupos) {
  const grupo = (m) => E.sabores.find((x) => x.id === m.sabor_id).grupo;
  const u = [...E.movs].reverse().find((m) => !m.deshecho_en && grupos.includes(grupo(m)));
  if (!u || new Date(u.creado_en).getTime() < Date.now() - 12 * 3600_000) return null;
  return u;
}
function ultimo(grupos) {
  const u = ultimoMov(grupos);
  if (!u) return null;
  return { lote: u.lote, tipo: u.tipo, creado_en: u.creado_en, items: E.movs.filter((m) => m.lote === u.lote).map((m) => ({ nombre: m.nombre, antes: m.antes, despues: m.despues })) };
}
function deshacer(lote, grupos) {
  const u = ultimoMov(grupos);
  if (!u) return null;
  if (lote && lote !== u.lote) throw new Falla(409, "Hubo otro cambio en el medio. Probá de nuevo.");
  const items = [];
  for (const m of E.movs.filter((x) => x.lote === u.lote)) {
    const s = E.sabores.find((x) => x.id === m.sabor_id);
    if (m.tipo === "alta") s.activo = false;
    else if (m.tipo === "baja") s.activo = true;
    else s.cantidad = Math.max(0, s.cantidad - (m.despues - m.antes));
    m.deshecho_en = new Date().toISOString();
    items.push({ nombre: s.nombre, cantidad: s.cantidad });
  }
  pozoDeshacer(u.lote);
  return { tipo: u.tipo, items };
}

// Pozos: cada cambio queda anotado con su lote, para que Deshacer lo vuelva atrás.
function filaPozo(p, saborId, crear = true) {
  let f = p.sabores.find((x) => x.sabor_id === saborId);
  if (!f && crear) {
    f = { sabor_id: saborId, cantidad: 0, su_lugar: false };
    p.sabores.push(f);
  }
  return f;
}
function pozoCambio(lote, p, saborId, delta) {
  const f = filaPozo(p, saborId);
  const antes = f.cantidad;
  f.cantidad = Math.max(0, f.cantidad + delta);
  if (lote && f.cantidad !== antes) (E.pozoLog[lote] ??= []).push({ pozo: p.id, sabor_id: saborId, delta: f.cantidad - antes });
}
function pozoDeshacer(lote) {
  const log = E.pozoLog[lote];
  if (!log) return;
  for (const c of [...log].reverse()) {
    const p = E.pozos.find((x) => x.id === c.pozo);
    const f = p && filaPozo(p, c.sabor_id);
    if (f) f.cantidad = Math.max(0, f.cantidad - c.delta);
  }
  delete E.pozoLog[lote];
}
const pozo = (id) => {
  const p = E.pozos.find((x) => x.id === id);
  if (!p) throw new Falla(404, "No existe ese pozo.");
  return p;
};

// Ventas del mes: había + entró − salió = quedó, por día y por rubro.
const rubro = (g) => (GRUPOS_PAN.includes(g) ? "pan" : g === "tortas" ? "tortas" : "baldes");
const cuentaVacia = () => ({ habia: 0, pedidos: 0, sumado: 0, abiertos: 0, falto: 0, quedo: 0 });
function reporteVentas(mes) {
  const ahora = new Date(), hoy = hoyAR(ahora);
  const diasMes = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
  const enCurso = mes === hoy.slice(0, 7);
  const vivos = E.movs.filter((m) => !m.deshecho_en);
  const primero = E.movs[0] ? hoyAR(new Date(E.movs[0].creado_en)) : null;
  const vacio = { desde: null, hasta: null, dias: 0, dias_mes: diasMes, en_curso: enCurso, arranca_despues: false, cierra: true, baldes: cuentaVacia(), tortas: cuentaVacia(), pan: cuentaVacia(), por_dia: [], sabores: [], tortas_lista: [], pan_lista: [] };
  const finMes = `${mes}-${String(diasMes).padStart(2, "0")}`;
  if (!primero || primero > finMes) return vacio;
  const desde = primero > `${mes}-01` ? primero : `${mes}-01`;
  const hasta = enCurso ? hoy : finMes;
  if (desde > hasta) return vacio;
  // Stock de cada rubro en un momento: lo de ahora menos lo que cambió después.
  const ahoraR = { baldes: 0, tortas: 0, pan: 0 };
  for (const s of E.sabores) ahoraR[rubro(s.grupo)] += s.cantidad;
  const stockEn = (t) => {
    const r = { ...ahoraR };
    for (const m of vivos) if (new Date(m.creado_en) >= t) r[rubro(m.grupo)] -= m.despues - m.antes;
    return r;
  };
  const C = { baldes: cuentaVacia(), tortas: cuentaVacia(), pan: cuentaVacia() };
  const porSabor = new Map();
  const por_dia = [];
  let dias = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    dias++;
    const { desde: d0, hasta: d1 } = rangoDia(f);
    const habia = stockEn(d0);
    const dia = { baldes: cuentaVacia(), tortas: cuentaVacia(), pan: cuentaVacia() };
    for (const m of vivos) {
      const t = new Date(m.creado_en);
      if (t < d0 || t >= d1) continue;
      const c = dia[rubro(m.grupo)], n = m.despues - m.antes;
      const ps = porSabor.get(m.sabor_id) ?? { nombre: m.nombre, grupo: m.grupo, salio: 0, falto: 0 };
      if (m.tipo === "abrio") {
        c.abiertos += -n;
        ps.salio += -n;
      } else if (m.tipo === "pedido") c.pedidos += n;
      else if (m.tipo === "conteo") {
        if (n > 0) c.sumado += n;
        else {
          c.falto += -n;
          ps.salio += -n;
          ps.falto += -n;
        }
      }
      porSabor.set(m.sabor_id, ps);
    }
    for (const r of ["baldes", "tortas", "pan"]) {
      const c = dia[r];
      c.habia = habia[r];
      c.quedo = c.habia + c.pedidos + c.sumado - c.abiertos - c.falto;
      if (dias === 1) C[r].habia = c.habia;
      for (const k of ["pedidos", "sumado", "abiertos", "falto"]) C[r][k] += c[k];
      C[r].quedo = c.quedo;
    }
    const b = dia.baldes;
    por_dia.push({ fecha: f, habia: b.habia, entro: b.pedidos + b.sumado, salio: b.abiertos + b.falto, quedo: b.quedo, tortas: dia.tortas.abiertos + dia.tortas.falto, pan: dia.pan.abiertos + dia.pan.falto });
  }
  const lista = (r) => [...porSabor.values()].filter((x) => rubro(x.grupo) === r && x.salio > 0)
    .sort((a, b) => b.salio - a.salio || a.nombre.localeCompare(b.nombre, "es"))
    .map(({ nombre, salio, falto }) => ({ nombre, salio, falto }));
  return {
    desde, hasta, dias, dias_mes: diasMes, en_curso: enCurso, arranca_despues: desde > `${mes}-01`, cierra: true,
    baldes: C.baldes, tortas: C.tortas, pan: C.pan, por_dia,
    sabores: lista("baldes"), tortas_lista: lista("tortas"), pan_lista: lista("pan"),
  };
}

function tareasSemana(lunes) {
  const hasta = sumarDias(lunes, 6), antes = sumarDias(lunes, -28);
  const veces = new Map();
  for (const d of E.dias) {
    if (d.persona_id === null || d.fecha < antes || d.fecha >= lunes) continue;
    const k = `${d.persona_id}:${d.tarea_id}`;
    const h = veces.get(k) ?? { persona_id: d.persona_id, tarea_id: d.tarea_id, veces: 0 };
    h.veces++;
    veces.set(k, h);
  }
  return {
    equipo: E.equipo.filter((p) => p.activo).sort((a, b) => a.orden - b.orden).map((p) => ({ ...sin(p), francos: [...p.francos] })),
    tareas: E.tareas.filter((t) => t.activo).sort((a, b) => a.numero - b.numero).map((t) => ({ ...sin(t), dias: [...t.dias] })),
    asignaciones: E.dias.filter((d) => d.fecha >= lunes && d.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tarea_id - b.tarea_id).map((d) => ({ ...d })),
    historial: [...veces.values()],
  };
}
function fila(fecha, tareaId) {
  let d = E.dias.find((x) => x.fecha === fecha && x.tarea_id === tareaId);
  if (!d) E.dias.push((d = { fecha, tarea_id: tareaId, persona_id: null, nivel: null }));
  return d;
}

// ---------- Las acciones (las mismas que la función real) ----------
function accion(b) {
  const sec = b.seccion === "panificados" ? "panificados" : "helados";
  const ahora = new Date();
  switch (b.accion) {
    case "entrar":
      if (b.pin !== PIN_DEMO) throw new Falla(401, `PIN incorrecto. En la demo es ${PIN_DEMO}.`);
      return { sesion: "demo", local: LOCAL_DEMO };
    case "estado": {
      const r = rangoDia(hoyAR(ahora));
      const movs = movimientos(r.desde, r.hasta);
      return {
        local: LOCAL_DEMO,
        sabores: E.sabores.filter((s) => s.activo).sort((a, b) => a.orden - b.orden || a.id - b.id).map(sin),
        hoy: resumenDia(deSeccion("helados", movs)),
        hoy_pan: resumenDia(deSeccion("panificados", movs)),
        whatsapp: E.config.whatsapp,
        en_camino: { helados: E.config.en_camino_helados ?? null, panificados: E.config.en_camino_panificados ?? null },
      };
    }
    case "historial": {
      const dia = typeof b.fecha === "string" ? b.fecha : hoyAR(ahora);
      const r = rangoDia(dia);
      if (!r) throw new Falla(400, "Fecha inválida.");
      const movs = deSeccion(sec, movimientos(r.desde, r.hasta));
      return { fecha: dia, hoy: hoyAR(ahora), resumen: resumenDia(movs), movimientos: movs };
    }
    case "ventas": {
      const hoy = hoyAR(ahora);
      const mes = typeof b.mes === "string" ? b.mes : hoy.slice(0, 7);
      if (mes > hoy.slice(0, 7)) throw new Falla(400, "Ese mes todavía no empezó.");
      const v = reporteVentas(mes), a = reporteVentas(mesAnterior(mes));
      return { mes, hoy, ventas: v, anterior: { mes: mesAnterior(mes), dias: a.dias, desde: a.desde, hasta: a.hasta, baldes: a.baldes, tortas: a.tortas, pan: a.pan, cierra: a.cierra } };
    }
    case "frecuentes": {
      const desde = ahora.getTime() - 14 * DIA_MS;
      const n = new Map();
      for (const m of E.movs) if (m.tipo === "abrio" && !m.deshecho_en && new Date(m.creado_en).getTime() >= desde) n.set(m.sabor_id, (n.get(m.sabor_id) ?? 0) + 1);
      return { frecuentes: [...n.entries()].sort((a, b) => b[1] - a[1]).map(([sabor_id, veces]) => ({ sabor_id, n: veces })) };
    }
    case "abrir": {
      const { lote: _l, ...r } = abrir(b.sabor_id);
      return r;
    }
    case "cargar": {
      if (b.tipo !== "pedido" && b.tipo !== "conteo") throw new Falla(400, "Tipo inválido.");
      const items = (Array.isArray(b.items) ? b.items : []).filter((it) => b.tipo === "conteo" || it.cantidad > 0);
      if (!items.length) throw new Falla(400, "No hay nada para guardar.");
      const r = cargar(b.tipo, items);
      if (b.tipo === "pedido" && b.en_camino === true) delete E.config[`en_camino_${sec}`];
      return r;
    }
    case "ultimo":
      return { ultimo: ultimo(SECCIONES[sec]) };
    case "deshacer":
      return { deshecho: deshacer(b.lote ?? null, SECCIONES[sec]) };
    case "agregar": {
      const nombre = String(b.nombre ?? "").replace(/\s+/g, " ").trim();
      if (!nombre || nombre.length > 60) throw new Falla(400, sec === "panificados" ? "Escribí el nombre del producto." : "Escribí el nombre del sabor.");
      if (!SECCIONES[sec].includes(b.grupo)) throw new Falla(400, "Elegí un grupo.");
      const igual = (s) => s.nombre.toLowerCase() === nombre.toLowerCase();
      if (E.sabores.some((s) => s.activo && igual(s))) throw new Falla(409, "Ya hay uno con ese nombre.");
      const orden = Math.max(0, ...E.sabores.filter((s) => s.activo && s.grupo === b.grupo).map((s) => s.orden)) + 1;
      const viejo = E.sabores.findLast((s) => !s.activo && igual(s));
      const s = viejo ?? { id: Math.max(...E.sabores.map((x) => x.id)) + 1, nombre, grupo: b.grupo, orden, cantidad: 0, detalle: b.detalle || null, ideal: null, activo: true };
      if (viejo) Object.assign(viejo, { activo: true, grupo: b.grupo, orden });
      else E.sabores.push(s);
      nuevoMov(uuid(), "alta", s, s.cantidad, s.cantidad);
      return { id: s.id, nombre: s.nombre };
    }
    case "sacar": {
      const s = sabor(b.sabor_id);
      s.activo = false;
      nuevoMov(uuid(), "baja", s, s.cantidad, s.cantidad);
      return { id: s.id, nombre: s.nombre };
    }
    case "mover": {
      const s = sabor(b.sabor_id);
      const g = E.sabores.filter((x) => x.activo && x.grupo === s.grupo).sort((a, c) => a.orden - c.orden || a.id - c.id);
      const i = g.indexOf(s), j = i + (b.direccion < 0 ? -1 : 1);
      if (j >= 0 && j < g.length) {
        [g[i], g[j]] = [g[j], g[i]];
        g.forEach((x, n) => (x.orden = n + 1));
      }
      return { ok: true };
    }
    case "ideal": {
      const s = sabor(b.sabor_id);
      s.ideal = b.ideal === null ? null : Number(b.ideal);
      return { id: s.id, ideal: s.ideal };
    }
    case "whatsapp": {
      // Solo queda en la memoria de esta pestaña.
      let d = String(b.numero ?? "").replace(/\D/g, "");
      if (d.startsWith("0")) d = d.slice(1);
      if (d.length === 10) d = "549" + d;
      if (d && (d.length < 11 || d.length > 15)) throw new Falla(400, "Ese número de WhatsApp no es válido.");
      E.config.whatsapp = d;
      return { numero: d };
    }
    case "en_camino": {
      if (b.items === null) {
        delete E.config[`en_camino_${sec}`];
        return { en_camino: null };
      }
      const v = { items: b.items.filter((it) => it.cantidad > 0).map(({ sabor_id, cantidad }) => ({ sabor_id, cantidad })), creado_en: ahora.toISOString() };
      E.config[`en_camino_${sec}`] = v;
      return { en_camino: v };
    }
    case "tiempo":
      return { ok: true };
    case "tareas":
      return tareasSemana(b.lunes);
    case "tareas_armar": {
      const hasta = sumarDias(b.lunes, 6);
      for (const d of E.dias) if (d.fecha >= b.lunes && d.fecha <= hasta && d.nivel === null) d.persona_id = null;
      let guardadas = 0;
      for (const it of b.items ?? []) {
        const ya = E.dias.find((d) => d.fecha === it.fecha && d.tarea_id === it.tarea_id);
        if (ya) {
          if (ya.nivel !== null) continue;
          ya.persona_id = it.persona_id;
        } else E.dias.push({ fecha: it.fecha, tarea_id: it.tarea_id, persona_id: it.persona_id, nivel: null });
        guardadas++;
      }
      return { guardadas };
    }
    case "tarea_asignar": {
      const d = fila(b.fecha, b.tarea_id);
      d.persona_id = b.persona_id ?? null;
      return { ...d };
    }
    case "tarea_marcar": {
      const d = fila(b.fecha, b.tarea_id);
      d.nivel = b.nivel ?? null;
      return { ...d };
    }
    case "equipo_fijar": {
      const p = E.equipo.find((x) => x.id === b.persona_id && x.activo);
      if (!p) throw new Falla(404, "Esa persona ya no está en el equipo.");
      if (p.turno !== b.turno) p.horario = null;
      p.turno = b.turno;
      p.francos = [...new Set(b.francos)].sort((a, c) => a - c);
      return { ...sin(p), francos: [...p.francos] };
    }
    case "persona_guardar": {
      const nombre = String(b.nombre ?? "").replace(/\s+/g, " ").trim();
      if (!nombre || nombre.length > 40) throw new Falla(400, "Escribí el nombre.");
      if (b.persona_id) {
        const p = E.equipo.find((x) => x.id === b.persona_id && x.activo);
        if (!p) throw new Falla(404, "Esa persona ya no está en el equipo.");
        p.nombre = nombre;
        p.inicial = nombre[0].toUpperCase();
        return { ...sin(p), francos: [...p.francos] };
      }
      const p = { id: Math.max(0, ...E.equipo.map((x) => x.id)) + 1, nombre, inicial: nombre[0].toUpperCase(), turno: "manana", francos: [], orden: Math.max(0, ...E.equipo.map((x) => x.orden)) + 1, horario: null, activo: true };
      E.equipo.push(p);
      return { ...sin(p), francos: [] };
    }
    case "persona_sacar": {
      const p = E.equipo.find((x) => x.id === b.persona_id && x.activo);
      if (!p) throw new Falla(404, "Esa persona ya no está en el equipo.");
      p.activo = false;
      for (const t of E.tareas) if (t.fija_id === p.id) t.fija_id = null;
      return { id: p.id };
    }
    case "tarea_guardar": {
      const nombre = String(b.nombre ?? "").replace(/\s+/g, " ").trim();
      if (!nombre) throw new Falla(400, "Escribí el nombre de la tarea.");
      const datos = {
        nombre, frecuencia: String(b.frecuencia ?? "").trim(), momento: b.momento ?? "todo", peso: b.peso ?? 2,
        dias: [...new Set(b.dias ?? [])].sort((a, c) => a - c), fija_id: b.fija_id ?? null, de_todos: b.de_todos === true,
      };
      if (b.id) {
        const t = E.tareas.find((x) => x.id === b.id && x.activo);
        if (!t) throw new Falla(404, "Esa tarea ya no está en la lista.");
        Object.assign(t, datos);
        return sin(t);
      }
      const t = { id: Math.max(0, ...E.tareas.map((x) => x.id)) + 1, numero: Math.max(0, ...E.tareas.map((x) => x.numero)) + 1, ...datos, activo: true };
      E.tareas.push(t);
      return sin(t);
    }
    case "tarea_sacar": {
      const t = E.tareas.find((x) => x.id === b.tarea_id && x.activo);
      if (!t) throw new Falla(404, "Esa tarea ya no está en la lista.");
      t.activo = false;
      return { id: t.id };
    }
    case "pozos":
      return { pozos: structuredClone(E.pozos) };
    case "pozo_abrir": {
      const p = pozo(b.pozo_id);
      const r = abrir(b.sabor_id);
      pozoCambio(r.lote, p, b.sabor_id, -1);
      return r;
    }
    case "pozo_traer": {
      const desde = pozo(b.desde), hasta = pozo(b.hasta);
      pozoCambio(b.lote, desde, b.sabor_id, -1);
      pozoCambio(b.lote, hasta, b.sabor_id, +1);
      return { ok: true };
    }
    case "pozo_contar": {
      const p = pozo(b.pozo_id);
      const nuevos = new Map((b.items ?? []).map((it) => [it.sabor_id, it.cantidad]));
      for (const f of p.sabores) if (!nuevos.has(f.sabor_id)) nuevos.set(f.sabor_id, 0);
      const diferencias = [], ajustes = [];
      for (const [saborId, n] of nuevos) {
        const f = filaPozo(p, saborId);
        const antes = f.cantidad;
        if (antes === n) continue;
        const s = E.sabores.find((x) => x.id === saborId);
        diferencias.push({ sabor_id: saborId, nombre: s?.nombre ?? "", antes, despues: n });
        f.cantidad = n;
        if (!s || !s.activo) continue;
        // El total: si faltó, baja; si sobró, sube solo lo que no estaba anotado en ningún pozo.
        const otros = E.pozos.filter((x) => x !== p).reduce((a, x) => a + (x.sabores.find((y) => y.sabor_id === saborId)?.cantidad ?? 0), 0);
        const total = n < antes ? Math.max(0, s.cantidad - (antes - n)) : Math.max(s.cantidad, otros + n);
        if (total !== s.cantidad) ajustes.push({ sabor_id: saborId, cantidad: total });
      }
      p.contado_en = ahora.toISOString();
      const r = ajustes.length ? cargar("conteo", ajustes) : { lote: null, cambios: 0 };
      return { lote: r.lote, ajustes: r.cambios, diferencias };
    }
    case "pozo_lugar": {
      const p = pozo(b.pozo_id);
      filaPozo(p, b.sabor_id).su_lugar = b.su_lugar === true;
      return { pozo_id: p.id, sabor_id: b.sabor_id, su_lugar: b.su_lugar === true };
    }
    case "pozo_quitar": {
      const p = pozo(b.pozo_id);
      const f = filaPozo(p, b.sabor_id, false);
      const antes = f?.cantidad ?? 0;
      p.sabores = p.sabores.filter((x) => x.sabor_id !== b.sabor_id);
      return { pozo_id: p.id, sabor_id: b.sabor_id, antes };
    }
    case "pozo_guardar": {
      for (const it of b.items ?? []) pozoCambio(b.lote, pozo(it.pozo_id), it.sabor_id, it.cantidad);
      return { pozos: new Set((b.items ?? []).map((it) => it.pozo_id)).size };
    }
    default:
      throw new Falla(400, "Acción desconocida.");
  }
}

/** Reemplaza al fetch de la página real: responde como la función, pero desde la memoria. */
export async function servidorDemo(_url, opciones = {}) {
  E ??= crearEstado();
  await new Promise((r) => setTimeout(r, 60)); // un poquito de demora, como la red
  let cuerpo, estado = 200;
  try {
    cuerpo = structuredClone(accion(JSON.parse(opciones.body ?? "{}")));
  } catch (e) {
    estado = e instanceof Falla ? e.estado : 500;
    cuerpo = { error: e instanceof Falla ? e.message : "Algo salió mal en la demo." };
    if (!(e instanceof Falla)) console.error(e);
  }
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });
}

export { KILOS_BALDE };
