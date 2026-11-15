// Demo con datos ficticios del sistema de stock para heladerías.
// Funciones puras de la página (sin DOM): textos, fechas y agrupado. Se prueban en tests/vista_test.ts.

export const GRUPOS = [
  { id: "cremas", nombre: "Cremas" },
  { id: "dulces_de_leche", nombre: "Dulces de leche" },
  { id: "chocolates", nombre: "Chocolates" },
  { id: "frutas_al_agua", nombre: "Frutas al agua" },
  { id: "tortas", nombre: "Tortas heladas", corto: "Tortas" }, // en el chip, corto: así entran todos en una fila
];

export const GRUPOS_PAN = [
  { id: "panes", nombre: "Panes" },
  { id: "salados", nombre: "Salados" },
  { id: "dulces", nombre: "Dulces" },
];

// Las dos secciones de la tablet. En panificados se cuenta lo que se saca del pozo (paquete, caja o unidad,
// según el producto): los números van solos, sin "baldes".
export const SECCIONES = {
  helados: { id: "helados", nombre: "Helados", grupos: GRUPOS, item: "sabor", items: "sabores", cuenta: baldes },
  panificados: {
    id: "panificados",
    nombre: "Panificados",
    grupos: GRUPOS_PAN,
    item: "producto",
    items: "productos",
    cuenta: (n) => String(n),
  },
};

/** Los productos de una sección. */
export function deSeccion(sabores, seccion) {
  const ids = SECCIONES[seccion].grupos.map((g) => g.id);
  return sabores.filter((s) => ids.includes(s.grupo));
}

/** "1 sabor", "3 productos"… */
export function cuantos(n, seccion = "helados") {
  const sec = SECCIONES[seccion];
  return `${n} ${n === 1 ? sec.item : sec.items}`;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Hay que pedirlo: está por debajo de su ideal. Sin ideal, cuando queda 1 o nada (como antes de que existiera). */
export function bajo(s) {
  return s.ideal == null ? s.cantidad <= 1 : s.cantidad < s.ideal;
}

/** "cero" | "bajo" | "ok": cómo se pinta el botón de un sabor. */
export function estadoBalde(s) {
  if (s.cantidad <= 0) return "cero";
  return bajo(s) ? "bajo" : "ok";
}

/** Sabores por grupo, en el orden de la carta. Los grupos vacíos no aparecen. */
export function agrupar(sabores, grupos = GRUPOS) {
  return grupos.map((g) => ({ ...g, sabores: sabores.filter((s) => s.grupo === g.id) }))
    .filter((g) => g.sabores.length > 0);
}

export function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** "AAAA-MM-DD" ± n días. */
export function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "martes 27/10" */
export function fechaLarga(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/** Título del día en el historial: "Hoy", "Ayer" o la fecha. */
export function tituloDia(fecha, hoy) {
  if (fecha === hoy) return `Hoy · ${fechaLarga(fecha)}`;
  if (fecha === sumarDias(hoy, -1)) return `Ayer · ${fechaLarga(fecha)}`;
  const t = fechaLarga(fecha);
  return t[0].toUpperCase() + t.slice(1);
}

/** Hora de Argentina "21:42" de una fecha ISO. */
export function hora(iso) {
  const d = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(11, 16);
}

/** Hoy en Argentina, "AAAA-MM-DD". */
export function hoyArgentina(ahora = new Date()) {
  return new Date(ahora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Cartel de arriba cuando no hay internet. `de`: cuándo se trajeron los números que se ven (ISO), o null. */
export function textoSinRed(de, ahora = new Date()) {
  const fin = "Lo que toques ahora no se guarda.";
  if (!de) return `Sin internet · ${fin}`;
  const dia = hoyArgentina(new Date(de));
  const cuando = dia === hoyArgentina(ahora) ? `de las ${hora(de)}` : `del ${fechaLarga(dia)} a las ${hora(de)}`;
  return `Sin internet · Los números son ${cuando}. ${fin}`;
}

export function baldes(n) {
  return n === 1 ? "1 balde" : `${n} baldes`;
}

// ---------- Tortas heladas y postres ----------
// Son un grupo de Helados (van en el mismo pedido y el mismo conteo), pero no vienen en baldes: se cuentan por unidad.

/** Es una torta o un postre (se cuenta por unidad, no en baldes). */
export function esTorta(s) {
  return s?.grupo === "tortas";
}

export function postres(n) {
  return n === 1 ? "1 torta o postre" : `${n} tortas o postres`;
}

/** Cuánto hay de un producto, con su unidad: "3 baldes" en los helados; "hay 3" en tortas y panificados. */
export function cuantoHay(s) {
  return GRUPOS.some((g) => g.id === s.grupo) && !esTorta(s) ? baldes(s.cantidad) : `hay ${s.cantidad}`;
}

/**
 * Total de un pedido de helados, con los baldes y las tortas por separado: "4 baldes", "2 tortas o postres" o
 * "4 baldes · 2 tortas o postres". Cada item trae su grupo, o se busca en `sabores` (por id o por nombre).
 */
export function cuentaHelados(items, sabores = []) {
  let b = 0, t = 0;
  for (const it of items) {
    const grupo = it.grupo ?? sabores.find((s) => s.id === it.sabor_id || (it.nombre && s.nombre === it.nombre))?.grupo;
    const n = it.cantidad ?? it.despues - it.antes;
    if (grupo === "tortas") t += n;
    else b += n;
  }
  if (b && t) return `${baldes(b)} · ${postres(t)}`;
  return t ? postres(t) : baldes(b);
}

/** Cómo se muestra una fila del historial. */
export function filaMovimiento(m, seccion = "helados") {
  const pan = seccion === "panificados";
  const tipos = {
    abrio: pan ? "Sacó del pozo" : "Abrió balde",
    pedido: "Llegó pedido",
    conteo: "Conteo",
    alta: pan ? "Producto agregado" : "Sabor agregado",
    baja: pan ? "Producto sacado" : "Sabor sacado",
  };
  let cambio = "";
  if (m.tipo === "abrio" || m.tipo === "pedido") {
    const d = m.despues - m.antes;
    cambio = d > 0 ? `+${d}` : `−${-d}`;
  } else if (m.tipo === "conteo") cambio = `${m.antes} → ${m.despues}`;
  return {
    hora: hora(m.creado_en),
    tipo: m.deshecho_en ? "Deshecho" : tipos[m.tipo] ?? m.tipo,
    clase: m.deshecho_en ? "deshecho" : m.tipo,
    sabor: m.nombre,
    cambio,
    quedo: m.tipo === "alta" || m.tipo === "baja" || m.deshecho_en ? "" : String(m.despues),
  };
}

/** Texto del aviso después de deshacer. Va como HTML: los nombres se escapan. */
export function textoDeshecho(d, seccion = "helados") {
  if (!d) return "No hay nada para deshacer de las últimas 12 horas.";
  const primero = escapar(d.items[0]?.nombre ?? "");
  const n = d.items.length;
  switch (d.tipo) {
    case "abrio":
      return `Deshecho: ${primero} vuelve a ${d.items[0].cantidad}.`;
    case "pedido":
      return n === 1 ? `Deshecho el pedido de ${primero}.` : `Deshecho el pedido (${cuantos(n, seccion)}).`;
    case "conteo":
      return `Deshecho el conteo (${cuantos(n, seccion)}).`;
    case "alta":
      return `${primero} salió de la lista.`;
    case "baja":
      return `${primero} volvió a la lista.`;
    default:
      return "Deshecho.";
  }
}

/** Pregunta antes de deshacer algo grande (texto plano). null = no hace falta preguntar (un toque). */
export function preguntaDeshacer(u, seccion = "helados", sabores = []) {
  if (!u || u.tipo === "abrio") return null;
  const h = hora(u.creado_en);
  const n = u.items.length;
  const nombre = u.items[0]?.nombre ?? "";
  switch (u.tipo) {
    case "pedido": {
      const total = u.items.reduce((a, it) => a + it.despues - it.antes, 0);
      const cuenta = seccion === "helados" ? cuentaHelados(u.items, sabores) : SECCIONES[seccion].cuenta(total);
      return `¿Deshacer el pedido de las ${h}? Se restan ${cuenta} de ${cuantos(n, seccion)}.`;
    }
    case "conteo":
      return `¿Deshacer el conteo de las ${h}? Vuelven a lo de antes ${cuantos(n, seccion)}.`;
    case "alta":
      return `¿Sacar ${nombre}, que se agregó a las ${h}?`;
    case "baja":
      return `¿Volver a poner ${nombre} en la lista?`;
    default:
      return "¿Deshacer el último cambio?";
  }
}

/** Lo que se manda al guardar un pedido o un conteo, a partir del borrador {sabor_id: número}. */
export function itemsDeBorrador(tipo, borrador, sabores) {
  const items = [];
  for (const s of sabores) {
    const v = borrador[s.id];
    if (v === undefined) continue;
    if (tipo === "pedido" && v > 0) items.push({ sabor_id: s.id, cantidad: v });
    if (tipo === "conteo" && v !== s.cantidad) items.push({ sabor_id: s.id, cantidad: v });
  }
  return items;
}

/** Texto del botón Guardar del modo pedido/conteo. */
export function textoGuardar(tipo, items, seccion = "helados", sabores = []) {
  if (tipo === "pedido") {
    const total = items.reduce((a, it) => a + it.cantidad, 0);
    const cuenta = seccion === "helados" ? cuentaHelados(items, sabores) : SECCIONES[seccion].cuenta(total);
    return total ? `Guardar pedido · +${cuenta}` : "Guardar pedido";
  }
  return items.length ? `Guardar conteo · ${items.length} ${items.length === 1 ? "cambio" : "cambios"}` : "Guardar conteo";
}

/** Para buscar: sin tildes, en minúscula, espacios simples y "c/" como "con". */
export function normalizar(texto) {
  return String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\bc\//g, "con ").replace(/\s+/g, " ").trim();
}

/** Sabores cuyo nombre contiene todas las palabras buscadas (en cualquier orden). */
export function buscar(sabores, consulta) {
  const palabras = normalizar(consulta).split(" ").filter(Boolean);
  if (!palabras.length) return [];
  return sabores.filter((s) => {
    const nombre = normalizar(s.nombre);
    return palabras.every((p) => nombre.includes(p));
  });
}

// ---------- Armar pedido ----------

/** Cuánto sugiere pedir: lo que falta para llegar al ideal. Sin ideal, nada. */
export function sugerido(s) {
  return s.ideal == null ? 0 : Math.max(0, s.ideal - s.cantidad);
}

/** Lo que va en el pedido armado: lo tocado (borrador) o, si no se tocó, lo sugerido. Solo lo que es más de 0. */
export function itemsArmar(borrador, sabores) {
  return sabores
    .map((s) => ({ s, cantidad: borrador[s.id] ?? sugerido(s) }))
    .filter((x) => x.cantidad > 0)
    .map(({ s, cantidad }) => ({ sabor_id: s.id, nombre: s.nombre, detalle: s.detalle ?? null, grupo: s.grupo, cantidad }));
}

/**
 * El mensaje para WhatsApp, como lo escribe Caro: "cantidad + producto", uno por renglón
 * (con "cómo viene" entre paréntesis, así quien lo recibe sabe qué es "uno"). Los helados llevan el total de baldes.
 */
export function textoPedido(seccion, items, fecha, local = "Centro") {
  const lineas = items.map((it) => `${it.cantidad} ${it.nombre}${it.detalle ? ` (${it.detalle})` : ""}`);
  const pie = seccion === "helados" ? `\n\nTotal: ${cuentaHelados(items)}` : "";
  return `Pedido de ${SECCIONES[seccion].nombre.toLowerCase()} · ${local}\n${fechaLarga(fecha)}\n\n${lineas.join("\n")}${pie}`;
}

/** Link que abre WhatsApp con el mensaje escrito (no manda nada: hay que tocar Enviar). Sin número, elige el contacto. */
export function linkWhatsApp(numero, texto) {
  return `https://wa.me/${numero || ""}?text=${encodeURIComponent(texto)}`;
}

/** "5491123456789" → "+54 9 11 2345-6789" (para mostrar). */
export function numeroLindo(n) {
  if (!n) return "";
  const m = /^549(11|\d{3})(\d{3,4})(\d{4})$/.exec(n);
  return m ? `+54 9 ${m[1]} ${m[2]}-${m[3]}` : `+${n}`;
}

/** Texto del botón para seguir al resumen del pedido armado. */
export function textoSiguiente(items, seccion = "helados") {
  if (!items.length) return "Siguiente";
  return `Siguiente · ${cuantos(items.length, seccion)}`;
}

// ---------- Pedido en camino ----------

/** El pedido en camino como borrador de "Llegó pedido": {sabor_id: cantidad}, solo de lo que sigue en la lista. */
export function precargaEnCamino(enCamino, sabores) {
  const ids = new Set(sabores.map((s) => s.id));
  const borrador = {};
  for (const it of enCamino?.items ?? []) {
    if (ids.has(it.sabor_id) && it.cantidad > 0) borrador[it.sabor_id] = it.cantidad;
  }
  return borrador;
}

/** Cuándo se mandó: "hoy a las 19:30", "ayer a las 19:30" o "el martes 27/10 a las 19:30". */
export function cuandoFue(iso, ahora = new Date()) {
  const dia = hoyArgentina(new Date(iso));
  const hoy = hoyArgentina(ahora);
  const cuando = dia === hoy ? "hoy" : dia === sumarDias(hoy, -1) ? "ayer" : `el ${fechaLarga(dia)}`;
  return `${cuando} a las ${hora(iso)}`;
}

// ---------- Comanda impresa ----------

/**
 * La comanda para la impresora de tickets (80 mm): título, fecha y hora, un renglón por producto con la cantidad
 * grande y "cómo viene" abajo, y el total. HTML escapado: los nombres no pueden meter código.
 */
export function htmlComanda(seccion, items, ahora = new Date(), local = "Centro") {
  const sec = SECCIONES[seccion];
  const total = items.reduce((a, it) => a + it.cantidad, 0);
  const filas = items.map((it) =>
    `<li><b class="c-cant">${it.cantidad}</b><span class="c-prod">${escapar(it.nombre)}` +
    `${it.detalle ? `<small>${escapar(it.detalle)}</small>` : ""}</span></li>`
  ).join("");
  const pie = seccion === "helados" ? cuentaHelados(items) : `${cuantos(items.length, seccion)} · ${total} en total`;
  return `<p class="c-marca">Heladería Demo · ${escapar(local)}</p>` +
    `<h1 class="c-titulo">Pedido de ${sec.nombre.toLowerCase()}</h1>` +
    `<p class="c-fecha">${fechaLarga(hoyArgentina(ahora))} · ${hora(ahora.toISOString())}</p>` +
    `<ol class="c-lista">${filas}</ol>` +
    `<p class="c-total">Total: ${pie}</p>`;
}

// ---------- Locales ----------

/** El local de la dirección ("/centro" → "centro"), o null en la página principal o si no parece un local. */
export function localDeRuta(ruta) {
  const m = /^\/([a-z0-9][a-z0-9-]{0,28}[a-z0-9])\/?$/.exec(ruta);
  return m ? m[1] : null;
}

/**
 * Los otros locales donde ya se entró con PIN en este aparato ([local, nombre] guardados), ordenados por nombre.
 * En la tablet de un local da [] y el botón "Cambiar de local" no aparece.
 */
export function localesConocidos(pares, actual) {
  return pares
    .filter(([local]) => localDeRuta(`/${local}`) === local && local !== actual)
    .map(([local, nombre]) => ({ local, nombre: nombre || local }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** Lo que alguien escribe como código de su local ("Villa Urquiza" → "villa-urquiza"), o null si no sirve. */
export function slugEscrito(texto) {
  const s = normalizar(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/.test(s) ? s : null;
}

// ---------- Tareas del equipo ----------
// Cada día, las tareas de la planilla se reparten entre los que trabajan ese día (sin franco). Cada uno marca
// la suya: 0 = no se hizo, 1 = a medias, 2 = hecha.

export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const TURNOS = { manana: "Mañana", intermedio: "Intermedio", tarde: "Tarde" };
/** Para elegir el turno en "Equipo", con sus horarios. */
export const TURNOS_LARGO = {
  manana: "Mañana (8 a 16; sáb. y dom. 9 a 17)",
  intermedio: "Intermedio (14 a 22)",
  tarde: "Tarde (16 a 24)",
};

/**
 * El horario de un turno ese día (1 = lunes … 7 = domingo): la mañana es de 8 a 16, y el fin de semana de 9 a 17;
 * el intermedio, de 14 a 22; la tarde, de 16 a 24.
 * `propio`: el de alguien que no entra justo en el turno ("14 a 22"); si está, es ese.
 * @param {string} turno @param {number} dia @param {string | null} [propio]
 */
export function horario(turno, dia, propio = null) {
  if (propio) return propio;
  if (turno === "manana") return dia >= 6 ? "9 a 17" : "8 a 16";
  if (turno === "intermedio") return "14 a 22";
  if (turno === "tarde") return "16 a 24";
  return "";
}
export const NIVELES = [
  { nivel: 0, texto: "No se hizo" },
  { nivel: 1, texto: "A medias" },
  { nivel: 2, texto: "Hecha" },
];
export const PESOS = { 1: "liviana", 2: "media", 3: "pesada" };

/** El lunes de la semana de esa fecha ("AAAA-MM-DD"). */
export function lunesDe(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, d === 0 ? -6 : 1 - d);
}

/** Qué día de la semana es (1 = lunes … 7 = domingo). */
export function diaSemana(fecha) {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay() || 7;
}

/** "9/11" */
export function fechaCorta(fecha) {
  return `${Number(fecha.slice(8, 10))}/${Number(fecha.slice(5, 7))}`;
}

/**
 * Puede hacer esa tarea por su turno: la de apertura le toca a la mañana; la de cierre, a la tarde (el intermedio se va
 * a las 22, antes del cierre). Las de todo el día, cualquiera.
 */
export function turnoSirve(persona, momento) {
  return momento === "todo" || (momento === "apertura" ? persona.turno === "manana" : persona.turno === "tarde");
}

/**
 * Arma el reparto de una semana, al azar pero parejo. Para cada día, entre los que no tienen franco:
 * - la tarea fija (ej.: las de la encargada) va a su dueña, si ese día trabaja;
 * - la de apertura a alguien de la mañana y la de cierre a alguien de la tarde (si hay);
 * - cada día, a quien menos carga tiene ese día (contando el peso de cada tarea), y en la semana, a quien menos
 *   carga tiene por día trabajado;
 * - evita repetir la misma tarea dos días seguidos y lo que cada uno más hizo en las semanas anteriores.
 * `marcadas` (lo ya marcado) no se reparte de nuevo, pero cuenta en la carga. `azar` da números de 0 a 1.
 * Devuelve [{ fecha, tarea_id, persona_id }] (persona_id null = nadie trabaja ese día).
 * @param {{ equipo: any[], tareas: any[], lunes: string, historial?: any[], marcadas?: any[], azar?: () => number }} datos
 */
export function armarSemana({ equipo, tareas, lunes, historial = [], marcadas = [], azar = Math.random }) {
  const veces = new Map(historial.map((h) => [`${h.persona_id}:${h.tarea_id}`, h.veces]));
  const peso = new Map(tareas.map((t) => [t.id, t.peso]));
  const diasTrabaja = new Map(equipo.map((p) => [p.id, Math.max(1, 7 - p.francos.length)]));
  const carga = new Map(equipo.map((p) => [p.id, 0]));
  const ayer = new Map();
  const items = [];
  for (let i = 0; i < 7; i++) {
    const fecha = sumarDias(lunes, i);
    const presentes = equipo.filter((p) => !p.francos.includes(i + 1));
    const hoy = new Map(presentes.map((p) => [p.id, 0]));
    const yaMarcadas = new Set();
    for (const m of marcadas.filter((m) => m.fecha === fecha)) {
      yaMarcadas.add(m.tarea_id);
      if (m.persona_id !== null && carga.has(m.persona_id)) {
        carga.set(m.persona_id, carga.get(m.persona_id) + (peso.get(m.tarea_id) ?? 0));
        if (hoy.has(m.persona_id)) hoy.set(m.persona_id, hoy.get(m.persona_id) + (peso.get(m.tarea_id) ?? 0));
      }
    }
    // Primero las fijas, después de la más pesada a la más liviana; entre iguales, al azar.
    const delDia = tareas.filter((t) => !t.de_todos && t.dias.includes(i + 1) && !yaMarcadas.has(t.id))
      .map((t) => ({ t, r: azar() }))
      .sort((a, b) =>
        Number(presentes.some((p) => p.id === b.t.fija_id)) - Number(presentes.some((p) => p.id === a.t.fija_id)) ||
        b.t.peso - a.t.peso || a.r - b.r
      ).map((x) => x.t);
    const hoyAyer = new Map();
    for (const t of delDia) {
      let elegido = null;
      if (presentes.some((p) => p.id === t.fija_id)) elegido = t.fija_id;
      else if (presentes.length) {
        const sirven = presentes.filter((p) => turnoSirve(p, t.momento));
        const candidatos = sirven.length ? sirven : presentes;
        const puntaje = (p) =>
          hoy.get(p.id) * 10 + (carga.get(p.id) / diasTrabaja.get(p.id)) * 2 + (ayer.get(t.id) === p.id ? 6 : 0) +
          (veces.get(`${p.id}:${t.id}`) ?? 0) * 1.5 + azar() * 3;
        elegido = candidatos.map((p) => ({ id: p.id, v: puntaje(p) })).sort((a, b) => a.v - b.v)[0].id;
      }
      if (elegido !== null) {
        carga.set(elegido, carga.get(elegido) + t.peso);
        hoy.set(elegido, hoy.get(elegido) + t.peso);
      }
      hoyAyer.set(t.id, elegido);
      items.push({ fecha, tarea_id: t.id, persona_id: elegido });
    }
    for (const [t, p] of hoyAyer) ayer.set(t, p);
  }
  return items;
}

/** Cuánto le tocó a cada uno en la semana: tareas, puntos (por peso), días que trabaja y cuántas marcó. */
export function cargaSemana(equipo, tareas, asignaciones) {
  const peso = new Map(tareas.map((t) => [t.id, t.peso]));
  return equipo.map((p) => {
    const suyas = asignaciones.filter((a) => a.persona_id === p.id);
    const dias = 7 - p.francos.length;
    const puntos = suyas.reduce((s, a) => s + (peso.get(a.tarea_id) ?? 0), 0);
    return {
      id: p.id,
      nombre: p.nombre,
      tareas: suyas.length,
      puntos,
      dias,
      porDia: dias ? Math.round((puntos / dias) * 10) / 10 : 0,
      hechas: suyas.filter((a) => a.nivel === 2).length,
      marcadas: suyas.filter((a) => a.nivel !== null).length,
    };
  });
}

// ---------- Pozos ----------

/** Pasados estos días sin contar, el pozo avisa "toca contarlo". */
export const POZO_VIEJO = 7;

/**
 * Lo que se ve de un pozo: lo que hay (más de 0) y, en uno fijo, sus lugares aunque estén vacíos.
 * `intruso`: está en un pozo fijo pero no es su lugar. Solo sabores que siguen en la lista.
 */
export function filasPozo(pozo, sabores) {
  const de = new Map(sabores.map((s) => [s.id, s]));
  return pozo.sabores
    .filter((x) => de.has(x.sabor_id) && (x.cantidad > 0 || (pozo.fijo && x.su_lugar)))
    .map((x) => ({ ...x, nombre: de.get(x.sabor_id).nombre, intruso: pozo.fijo && !x.su_lugar }));
}

/** Cuántos hay en total en un pozo (baldes, o unidades en el de tortas). */
export function totalPozo(pozo) {
  return pozo.sabores.reduce((a, x) => a + x.cantidad, 0);
}

/** Qué se puede cargar en un pozo: en el de tortas, solo tortas; en los demás, solo baldes (para que no se mezclen). */
export function vaEnPozo(pozo, s) {
  return pozo.tortas ? esTorta(s) : !esTorta(s);
}

/** Lo que hay en un pozo, con su unidad: "3 baldes", "2 unidades" o, si están mezclados, "3 baldes · 2 unidades". */
export function cuantoEnPozo(pozo, sabores) {
  const de = new Map(sabores.map((s) => [s.id, s]));
  let baldesN = 0, unidades = 0;
  for (const x of pozo.sabores) {
    if (!de.has(x.sabor_id) || x.cantidad <= 0) continue;
    if (esTorta(de.get(x.sabor_id))) unidades += x.cantidad;
    else baldesN += x.cantidad;
  }
  const textoUnidades = unidades === 1 ? "1 unidad" : `${unidades} unidades`;
  if (baldesN && unidades) return `${baldes(baldesN)} · ${textoUnidades}`;
  if (unidades || (pozo.tortas && !baldesN)) return textoUnidades;
  return baldes(baldesN);
}

/**
 * Lo que la app no sabe en qué pozo está: el total de cada sabor menos lo que suman los pozos (llegó en un pedido o
 * todavía no se contó). Solo helados, solo lo que da más de 0, en el orden de la carta.
 */
export function sinUbicar(pozos, sabores) {
  const ubicados = new Map();
  for (const p of pozos) for (const x of p.sabores) ubicados.set(x.sabor_id, (ubicados.get(x.sabor_id) ?? 0) + x.cantidad);
  return sabores
    .filter((s) => GRUPOS.some((g) => g.id === s.grupo))
    .map((s) => ({ sabor_id: s.id, nombre: s.nombre, torta: esTorta(s), cantidad: s.cantidad - (ubicados.get(s.id) ?? 0) }))
    .filter((x) => x.cantidad > 0);
}

/** Dónde se puede guardar lo que llegó de ese sabor (las tortas, solo en el pozo de tortas). */
export function pozosParaGuardar(pozos, s) {
  return (pozos ?? []).filter((p) => vaEnPozo(p, s));
}

/**
 * Dónde guardar lo que llegó de ese sabor, como sugerencia: las tortas, en el pozo de tortas; un balde, en el pozo de
 * atrás que más tiene de ese sabor (ahí se suele guardar). Si no está atrás, ninguno: que elijan.
 */
export function sugerirPozo(pozos, s) {
  const lista = pozosParaGuardar(pozos, s);
  if (esTorta(s)) return lista.find((p) => p.tortas)?.id ?? null;
  let mejor = null, max = 0;
  for (const p of lista.filter((x) => x.zona === "atras")) {
    const n = p.sabores.find((x) => x.sabor_id === s.id)?.cantidad ?? 0;
    if (n > max) [mejor, max] = [p.id, n];
  }
  return mejor;
}

/** Todos los pozos se contaron alguna vez (recién ahí lo sin ubicar es "no está en ningún lado"). */
export function todosContados(pozos) {
  return (pozos ?? []).length > 0 && pozos.every((p) => p.contado_en);
}

/**
 * El conteo que baja del total lo que no está en ningún pozo: a cada sabor sin ubicar, su total pasa a ser lo que
 * suman los pozos. Va como un conteo de los de siempre (queda en el Historial y se puede deshacer).
 */
export function itemsSinUbicar(pozos, sabores) {
  const de = new Map(sabores.map((s) => [s.id, s]));
  return sinUbicar(pozos, sabores).map((x) => ({ sabor_id: x.sabor_id, cantidad: de.get(x.sabor_id).cantidad - x.cantidad }));
}

/** Días desde que se contó el pozo (en días de Argentina), o null si nunca se contó. */
export function diasDesdeConteo(contadoEn, ahora = new Date()) {
  if (!contadoEn) return null;
  const dia = (f) => new Date(`${f}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((dia(hoyArgentina(ahora)) - dia(hoyArgentina(new Date(contadoEn)))) / 86400000));
}

export function textoContado(dias) {
  if (dias === null) return "sin contar";
  if (dias === 0) return "contado hoy";
  if (dias === 1) return "contado ayer";
  return `contado hace ${dias} días`;
}

/** De dónde puede venir el reemplazo: los pozos de atrás, con cuántos tienen de ese sabor (los que tienen, primero). */
export function origenes(pozos, saborId) {
  return pozos.filter((p) => p.zona === "atras")
    .map((p) => ({ id: p.id, numero: p.numero, nombre: p.nombre, tiene: p.sabores.find((x) => x.sabor_id === saborId)?.cantidad ?? 0 }));
}

/**
 * Al abrir un balde desde la pantalla de stock: en qué pozo de adelante se abrió. Primero, los que tienen baldes de ese
 * sabor; si ninguno tiene, los que son su lugar (está vacío pero va ahí). Si adelante no está, sale de un pozo de atrás
 * que lo tenga (si no, el pozo seguiría contándolo y no coincidiría con el total). Vacío = no está ubicado: solo baja
 * el total.
 */
export function pozosParaAbrir(pozos, saborId) {
  const tiene = (p) => p.sabores.some((x) => x.sabor_id === saborId && x.cantidad > 0);
  const adelante = (pozos ?? []).filter((p) => p.zona === "adelante");
  const con = adelante.filter(tiene);
  if (con.length) return con;
  const lugar = adelante.filter((p) => p.sabores.some((x) => x.sabor_id === saborId && x.su_lugar));
  if (lugar.length) return lugar;
  return (pozos ?? []).filter((p) => p.zona === "atras" && tiene(p));
}

/** Los pozos donde hay de ese sabor (para la lupa). */
export function pozosCon(pozos, consulta, sabores) {
  const ids = new Set(buscar(sabores, consulta).map((s) => s.id));
  return new Set(pozos.filter((p) => p.sabores.some((x) => x.cantidad > 0 && ids.has(x.sabor_id))).map((p) => p.id));
}

// ---------- Ventas del mes ----------
// Cada balde de helado trae 6,1 kg.
export const KILOS_BALDE = 6.1;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Kilos como se escriben acá: "223,2 kg", "1.240 kg", "0 kg". */
export function kilos(baldes, porBalde = KILOS_BALDE) {
  // En décimas de kilo (61), para que la cuenta no arrastre errores de redondeo de la coma.
  const kg = Math.round(baldes * Math.round(porBalde * 10)) / 10;
  return `${kg.toLocaleString("es-AR", { maximumFractionDigits: kg >= 1000 ? 0 : 1 })} kg`;
}

/** "Noviembre 2026" */
export function nombreMes(mes) {
  const m = MESES[Number(mes.slice(5, 7)) - 1];
  return `${m[0].toUpperCase()}${m.slice(1)} ${mes.slice(0, 4)}`;
}

/** "AAAA-MM" ± n meses. */
export function sumarMes(mes, n) {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Cuánto cambió lo vendido por día contra el mes anterior: "+12 %", "−8 %", "igual"; null si no hay con qué comparar.
 * Por día, porque el mes en curso todavía no terminó.
 */
export function comparar(actual, anterior) {
  if (!actual.dias || !anterior.dias || !anterior.baldes) return null;
  const pct = Math.round(((actual.baldes / actual.dias) / (anterior.baldes / anterior.dias) - 1) * 100);
  return pct === 0 ? "igual" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)} %`;
}

// La cuenta de un rubro (como la arma la función): había + entró − salió = quedó.
// Entró = pedidos + lo que un conteo encontró de más. Salió (vendido) = tocado en la app + lo que faltó en un conteo.
export const vendidoDe = (c) => c.abiertos + c.falto;
export const entroDe = (c) => c.pedidos + c.sumado;

/** Con menos días anotados que esto, la proyección del mes no es confiable y no se muestra. */
export const DIAS_PROYECCION = 3;

/** Baldes por día en el período, y si el mes sigue a ese ritmo, cuántos daría el mes entero. */
export function proyeccion(baldes, dias, diasMes) {
  return dias ? (baldes / dias) * diasMes : 0;
}

/** El resumen para mandar por WhatsApp (texto simple, como un mensaje). */
export function textoReporte(r, local) {
  const v = r.ventas, b = v.baldes, a = r.anterior;
  const mesA = nombreMes(a.mes).split(" ")[0].toLowerCase();
  const vend = vendidoDe(b);
  const lineas = [
    `Ventas de helado · ${local}`,
    `${nombreMes(r.mes)} (del ${fechaCorta(v.desde)} al ${fechaCorta(v.hasta)}, ${v.dias === 1 ? "1 día" : `${v.dias} días`})`,
    "",
    `Vendido: ${kilos(vend)} (${baldes(vend)})`,
    `Por día: ${kilos(vend / v.dias)}`,
  ];
  if (v.en_curso && v.dias >= DIAS_PROYECCION) lineas.push(`Si sigue así, el mes cierra en: ${kilos(proyeccion(vend, v.dias, v.dias_mes))}`);
  const cambio = comparar({ baldes: vend, dias: v.dias }, { baldes: vendidoDe(a.baldes), dias: a.dias });
  if (cambio) lineas.push(`Comparado con ${mesA} (por día): ${cambio}`);
  lineas.push("", `Stock: había ${kilos(b.habia)} el ${fechaCorta(v.desde)} · entró ${kilos(entroDe(b))} · quedó ${kilos(b.quedo)}`);
  if (v.sabores.length) {
    lineas.push("", "Lo que más salió:");
    v.sabores.slice(0, 5).forEach((x, i) => lineas.push(`${i + 1}. ${x.nombre}: ${kilos(x.salio)}`));
  }
  lineas.push("", `Tortas y postres: ${vendidoDe(v.tortas)} · Panificados: ${vendidoDe(v.pan)}`);
  return lineas.join("\n");
}

// ---------- Descontar por voz ----------
// Lo que se dijo ("dos de chocolate y un dulce de leche granizado") → qué sabores y cuántos. Nunca descuenta solo:
// la pantalla muestra lo que entendió y hay que confirmar.

const NUMEROS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
// Palabras que se dicen pero no son parte del sabor (no cuentan como "no entendí").
const RELLENO = new Set([
  "abri", "abrimos", "abro", "abrio", "abrieron", "abre", "se", "saque", "saco", "sacamos", "sacaron", "saca", "balde",
  "baldes", "unidad", "unidades", "de", "del", "y", "e", "el", "la", "los", "las", "otro", "otra", "mas", "tambien",
  "por", "favor", "porfa", "che", "listo", "nada", "ahi", "va", "son", "es", "fue", "hoy",
]);

/** Texto para comparar: sin tildes, en minúscula, "c/" = "con", "&" y "and" = "y", sin signos. */
export function normalizarVoz(texto) {
  return normalizar(String(texto).replace(/&/g, " y ")).replace(/[.,;:!?¿¡"'()]/g, " ").replace(/\band\b/g, "y")
    .replace(/\s+/g, " ").trim();
}

/** Dos palabras son la misma aunque el reconocimiento le erre a una letra (en palabras de 5 letras o más). */
function igualPalabra(a, b) {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) <= 1;
}

/** Una cantidad dicha: "dos" o "2", de 1 a 20 (más es raro para una vez: mejor que figure como "no entendí"). */
const numeroDe = (p) => NUMEROS[p] ?? (/^\d{1,2}$/.test(p) && Number(p) >= 1 && Number(p) <= 20 ? Number(p) : null);

/**
 * Lo que se dijo → [{ sabor_id, nombre, cantidad }] (sin repetir) y lo que no se entendió. Primero busca los nombres
 * enteros (el más largo gana: "dulce de leche granizado" antes que "dulce de leche"); lo que sobra, si es parte del
 * nombre de un solo sabor ("kinder" → Chocolate Kinder), también vale. El número va antes del sabor ("dos de chocolate").
 */
export function interpretarVoz(texto, sabores) {
  const t = normalizarVoz(texto).split(" ").filter(Boolean);
  const nombres = sabores.map((s) => ({ s, p: normalizarVoz(s.nombre).split(" ").filter(Boolean) })).filter((x) => x.p.length);
  const usado = new Array(t.length).fill(false);
  const hallados = []; // { s, desde }
  const candidatos = [];
  for (const { s, p } of nombres) {
    for (let i = 0; i + p.length <= t.length; i++) {
      if (p.every((w, k) => igualPalabra(w, t[i + k]))) candidatos.push({ s, desde: i, largo: p.length });
    }
  }
  candidatos.sort((a, b) => b.largo - a.largo || a.desde - b.desde);
  for (const c of candidatos) {
    if (usado.slice(c.desde, c.desde + c.largo).some(Boolean)) continue;
    for (let k = 0; k < c.largo; k++) usado[c.desde + k] = true;
    hallados.push({ s: c.s, desde: c.desde });
  }
  // Lo que sobró, en tramos cortados por números y "y": si es parte del nombre de un solo sabor, es ese.
  const noEntendi = [];
  let tramo = [];
  const cerrarTramo = () => {
    const palabras = tramo.filter((i) => !RELLENO.has(t[i]));
    if (palabras.length) {
      const consulta = palabras.map((i) => t[i]).join(" ");
      const opciones = sabores.filter((s) => {
        const nombre = normalizarVoz(s.nombre).split(" ");
        return palabras.every((i) => nombre.some((w) => igualPalabra(w, t[i]) || (t[i].length >= 4 && w.startsWith(t[i]))));
      });
      if (opciones.length === 1) {
        for (const i of tramo) usado[i] = true;
        hallados.push({ s: opciones[0], desde: palabras[0] });
      } else noEntendi.push(consulta);
    }
    tramo = [];
  };
  for (let i = 0; i <= t.length; i++) {
    if (i === t.length || usado[i] || numeroDe(t[i]) !== null || t[i] === "y" || t[i] === "e") cerrarTramo();
    else tramo.push(i);
  }
  // La cantidad: el número justo antes del sabor (saltando "de", "balde"…).
  const items = new Map();
  for (const h of hallados.sort((a, b) => a.desde - b.desde)) {
    let cantidad = 1;
    for (let i = h.desde - 1; i >= 0 && !usado[i]; i--) {
      const n = numeroDe(t[i]);
      if (n !== null) {
        cantidad = n;
        break;
      }
      if (!RELLENO.has(t[i])) break;
    }
    const ya = items.get(h.s.id);
    items.set(h.s.id, { sabor_id: h.s.id, nombre: h.s.nombre, cantidad: Math.min(20, (ya?.cantidad ?? 0) + cantidad) });
  }
  return { items: [...items.values()], noEntendi };
}

/**
 * De varias versiones de lo que se dijo (el reconocimiento da alternativas, la primera es la más probable): la primera,
 * salvo que otra entienda más sabores.
 */
export function mejorInterpretacion(textos, sabores) {
  let mejor = null;
  for (const texto of textos) {
    const r = { texto, ...interpretarVoz(texto, sabores) };
    if (!mejor || r.items.length > mejor.items.length) mejor = r;
  }
  return mejor ?? { texto: "", items: [], noEntendi: [] };
}

/** Los sabores de la sección que más se abrieron (de lo que manda la función), hasta `n`. */
export function masUsados(frecuentes, sabores, n = 8) {
  const de = new Map(sabores.map((s) => [s.id, s]));
  return (frecuentes ?? []).filter((f) => de.has(f.sabor_id)).slice(0, n).map((f) => de.get(f.sabor_id));
}
