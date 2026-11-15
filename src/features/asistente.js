/* ==========================================================
   MJR Digital — asistente (chat)
   Las respuestas viven acá, del lado del visitante: el bot
   remoto queda apagado hasta que el backend esté actualizado.
   ========================================================== */

const API_BASE = "https://chatbot-joeldev-production.up.railway.app";
const API_URL = API_BASE + "/chat";
const WA_NUM = "5491144091981";
// El bot remoto (Railway) todavía tiene respuestas viejas; por eso queda apagado.
// Queda el gancho listo; se enciende cuando el backend esté actualizado.
const USAR_BOT_REMOTO = false;

const RESPUESTAS = [
  { claves: ["obra social", "obra social?"],
    texto: "Esto es una demo de cómo respondería el agente en el WhatsApp de un consultorio: «Trabajo con particular. Si tenés una obra social, te cuento cómo es la modalidad y te ofrezco un horario. ¿Querés que te pase los turnos libres de esta semana?» Si te gusta cómo suena, lo probás 15 días gratis en tu número." },
  { claves: ["tenes turno", "tenés turno", "el jueves", "turno el"],
    texto: "Esto es una demo de cómo respondería el agente en tu WhatsApp: «Sí, el jueves tengo 10:00, 11:30 y 16:00. ¿Cuál te queda mejor?» El turno queda anotado y te llega el aviso. Si querés, lo probás 15 días gratis en tu número." },
  { claves: ["15 dias", "15 días", "prueba", "gratis", "probar"],
    texto: "El agente lo probás 15 días gratis en tu WhatsApp, sin pagar nada. Joel lo deja andando con tu forma de atender. Si te sirve, seguís con el combo que mejor te quede: Arranque, Básico o Completo. La web se arma cuando confirmás que seguís.", wa: true },
  { claves: ["automatiz", "chatbot", " bot", "asistente", " ia ", "inteligencia", "agente"],
    texto: "El corazón de MJR Digital son las automatizaciones con IA para profesionales: un agente de WhatsApp que contesta, agenda turnos, manda recordatorios y te pasa lo importante. Si no tenés web, también te la armamos, integrada con el agente. Lo probás 15 días gratis." },
  { claves: ["recordatorio", "seguimiento"],
    texto: "Antes del turno el agente manda un recordatorio. Si la persona no confirma, hace el seguimiento. Eso va en las automatizaciones de turnos, y en el combo Completo se puede sumar la seña." },
  { claves: ["turno", "agenda", "reserva"],
    texto: "Con los turnos automáticos la persona elige un horario libre, queda anotada y le llega un recordatorio. En el combo Completo también se puede cobrar la seña. El agente lo probás 15 días gratis." },
  { claves: ["mercado pago", "mercadopago", "link de pago", "cobr", "seña", "sena"],
    texto: "En el combo Completo el agente puede mandar un link de Mercado Pago para la seña o el servicio, y te llega el aviso cuando está pago." },
  { claves: ["mensual", "por mes", "abono", "/mes"],
    texto: "El precio depende del combo y de tu negocio, así que Joel te lo pasa a medida por WhatsApp. El agente se prueba 15 días gratis, sin pagar nada.", wa: true },
  { claves: ["arranque", "link in bio", "link-in-bio", "mas barato", "más barato", "barat", "economic"],
    texto: "El combo Arranque incluye agente Básico (consultas 24 h, y te pasa lo que no puede resolver) y una página tipo link-in-bio en un subdominio, con hasta 2 cambios chicos por mes. El agente se prueba 15 días gratis. Para el precio de tu caso, escribile a Joel por WhatsApp.", wa: true },
  { claves: ["basico", "básico", "recomendado", "landing"],
    texto: "El combo Básico (el recomendado) incluye agente Básico 24 h, landing de 1 página (servicios, fotos, horarios, mapa y WhatsApp), dominio .com.ar el primer año, hosting, SSL, Search Console, 1 ronda de cambios y capacitación corta. Para el precio de tu caso, escribile a Joel por WhatsApp.", wa: true },
  { claves: ["completo", "panel", "a medida"],
    texto: "El combo Completo incluye agente que toma pedidos con Mercado Pago o turnos con seña, web con panel para editar servicios o precios, dominio .com.ar el primer año, hosting, SSL, Search Console, 2 rondas de cambios y capacitación. Para el precio de tu caso, escribile a Joel por WhatsApp.", wa: true },
  { claves: ["precio", "cuanto", " sale", "cuesta", "costo", "valor", "plan", "tarifa", "combo"],
    texto: "Hay tres combos (Arranque, Básico y Completo), todos con 15 días de prueba gratis del agente. El precio depende del combo y de tu negocio: escribile a Joel por WhatsApp y te lo pasa a medida. ¿A qué te dedicás? Así te digo cuál te conviene.", wa: true },
  { claves: ["cuota", " pago ", "pagar", "transferencia", "adelanto", "50%"],
    texto: "Los 15 días del agente son gratis, no hay seña para probarlo. La web se arma si, después de la prueba, decidís seguir con un combo. Para el precio y la forma de pago, escribile a Joel por WhatsApp.", wa: true },
  { claves: ["cuanto tiempo", "cuantos dias", "cuando la", "tarda", "tiempo", "demora", "rapido", "plazo", "entrega", "48"],
    texto: "Joel deja el agente andando para la prueba de 15 días apenas le contás cómo atendés. La web del combo se arma cuando confirmás que seguís." },
  { claves: ["dominio", "hosting", ".com", " url", "subdominio"],
    texto: "El hosting va incluido en los tres combos. En Arranque la página va en un subdominio, y si querés dominio propio lo ves con Joel por WhatsApp. En Básico y Completo, el dominio .com.ar del primer año está incluido." },
  { claves: ["garantia", "no me gusta", "conforme", "devolu", "riesgo", "compromiso"],
    texto: "La prueba de 15 días no tiene costo ni compromiso. Si el agente no te sirve, no seguís y no debés nada. La web se arma recién cuando confirmás que querés continuar." },
  { claves: ["cambio", "soporte", "modific", "actualiz", "mantenimiento"],
    texto: "En Arranque hay hasta 2 cambios chicos por mes. En Básico, 1 ronda de cambios en la web. En Completo, 2 rondas. Después, los ajustes del agente y de la web van por WhatsApp." },
  { claves: ["ejemplo", "portfolio", "trabajos", "demo", "hiciste", "clientes"],
    texto: "En la web hay dos demos de muestra, no son clientes: Tinta Fundida (impresión 3D) y Lubit (celulares). Sirven para ver cómo queda una página. El servicio que ofrezco hoy es el agente de WhatsApp para profesionales, y la web como complemento." },
  { claves: ["necesito", "empezar", "requisito", "que te paso", "arrancar"],
    texto: "Solo contarle a Joel cómo atendés: horarios, servicios y cómo agendás. Con eso deja el agente andando en tu WhatsApp para la prueba de 15 días. No hace falta que sepas de tecnología.", wa: true },
  { claves: ["contador", "contadora", "abogad", "consultorio", "profesional", "estudio"],
    texto: "Justo para eso está pensado: un agente que contesta consultas, agenda turnos y te pasa lo importante, mientras vos atendés. Lo probás 15 días gratis. Y si no tenés web, Joel te la arma integrada con el agente.", wa: true },
  { claves: ["barberia", "peluqueria", "estetica", "gimnasio", "entrenador", "pilates", "nutricion"],
    texto: "Para un local o consultorio de turnos va muy bien el agente con agenda y recordatorios. En el Completo se puede sumar la seña por Mercado Pago. Lo probás 15 días gratis en tu WhatsApp." },
  { claves: ["restaurant", "comida", "delivery", "heladeria", "pasteleria", "gastronom", "cafe", "pizzeria"],
    texto: "También se puede dejar un agente que tome pedidos y cobre con Mercado Pago, que es lo que incluye el combo Completo. Igual el foco de MJR Digital son profesionales que atienden por WhatsApp. Escribile a Joel y lo vemos.", wa: true },
  { claves: ["pagina web", "página web", "sitio", "landing", "no tengo web"],
    texto: "La web es el punto de entrada, no el titular. Si no tenés, te la armamos integrada con el agente: link-in-bio en el Arranque, landing de 1 página en el Básico, o web con panel en el Completo." },
  { claves: ["contacto", "whatsapp", "telefono", "llamar", "hablar con joel"],
    texto: "Podés escribirle a Joel por WhatsApp al +54 9 11 4409-1981. Te contesta él, no un call center.", wa: true },
  { claves: ["gracias", "genial", "perfecto", "buenisimo", "joya"],
    texto: "¡De nada! Cuando quieras, escribile a Joel por WhatsApp y lo probás 15 días gratis en tu número.", wa: true },
  { claves: ["hola", "buenas", "buen dia", "que tal"],
    texto: "¡Hola! Soy el asistente de MJR Digital. Te puedo contar cómo funciona el agente de WhatsApp, los combos y la prueba de 15 días. También podés escribirme como si fueras un paciente pidiendo un turno, para ver una demo. ¿Qué necesitás?" },
];

const SALUDO = "¡Hola! Soy el asistente de MJR Digital. Preguntame por los combos o la prueba de 15 días, o escribime como si fueras un paciente pidiendo un turno, para ver una demo.";

function normalizar(t) {
  return " " + t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿?¡!.,;:]/g, " ") + " ";
}

function respuestaLocal(pregunta) {
  const t = normalizar(pregunta);
  let mejor = null, puntos = 0;
  for (const r of RESPUESTAS) {
    const n = r.claves.filter(c => t.includes(c)).length;
    if (n > puntos) { mejor = r; puntos = n; }
  }
  return mejor;
}

function linkWhatsApp(pregunta) {
  const msg = pregunta
    ? "¡Hola, MJR Digital! Te escribo desde la web. Te quería consultar: " + pregunta
    : "¡Hola! Quiero probar el agente 15 días gratis";
  return "https://wa.me/" + WA_NUM + "?text=" + encodeURIComponent(msg);
}

export function initAsistente() {
  const toggle = document.getElementById("chat-toggle");
  const chatWin = document.getElementById("chat-window");
  const messages = document.getElementById("messages");
  const input = document.getElementById("chat-input-text");
  const sendBtn = document.getElementById("send-btn");
  const tooltip = document.getElementById("chat-tooltip");
  if (!toggle || !chatWin || !messages || !input || !sendBtn) return;

  let botOnline = USAR_BOT_REMOTO;
  const marcarBotCaido = () => { botOnline = false; };
  if (USAR_BOT_REMOTO) {
    fetch(API_BASE + "/health", { signal: AbortSignal.timeout(8000) })
      .then(r => { if (!r.ok) marcarBotCaido(); })
      .catch(marcarBotCaido);
  }

  // Cerrado no se puede tabular adentro.
  chatWin.inert = true;

  let history = [], isOpen = false, isStreaming = false;

  /* ---------- Aviso flotante ----------
     Aparece recién cuando los botones del hero ya no están en pantalla,
     para no taparlos. */
  let tooltipCerrado = false, tooltipListo = false, heroEnPantalla = true;
  function mostrarTooltip() {
    if (!tooltip || tooltipCerrado || !tooltipListo || heroEnPantalla || isOpen) return;
    tooltip.style.display = "flex";
  }
  if (tooltip) {
    tooltip.style.display = "none";
    setTimeout(() => { tooltipListo = true; mostrarTooltip(); }, 3000);
    const heroBotones = document.getElementById("heroActions");
    if (heroBotones) {
      new IntersectionObserver(entries => {
        entries.forEach(e => {
          heroEnPantalla = e.isIntersecting;
          if (heroEnPantalla) tooltip.style.display = "none"; else mostrarTooltip();
        });
      }).observe(heroBotones);
    } else { heroEnPantalla = false; }
    const cerrar = document.getElementById("tooltip-close");
    if (cerrar) cerrar.addEventListener("click", (e) => {
      e.stopPropagation(); tooltipCerrado = true; tooltip.style.display = "none";
    });
  }

  /* ---------- Abrir y cerrar ---------- */
  function abrirChat() {
    if (isOpen) return;
    isOpen = true;
    chatWin.classList.remove("hidden");
    chatWin.setAttribute("aria-hidden", "false");
    chatWin.inert = false;
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Cerrar el asistente");
    if (tooltip) { tooltip.style.display = "none"; tooltipCerrado = true; }
    if (history.length === 0) addBubble("bot", SALUDO);
  }

  function cerrarChat() {
    isOpen = false;
    chatWin.classList.add("hidden");
    chatWin.setAttribute("aria-hidden", "true");
    chatWin.inert = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Abrir el asistente");
  }

  toggle.addEventListener("click", () => { if (isOpen) cerrarChat(); else abrirChat(); });

  const abrirBtn = document.getElementById("abrir-asistente");
  if (abrirBtn) abrirBtn.addEventListener("click", () => { abrirChat(); input.focus(); });

  /* ---------- Burbujas ---------- */
  function addBubble(role, text, typing = false) {
    const el = document.createElement("div");
    el.className = `bubble ${role}${typing ? " typing" : ""}`;
    el.textContent = text;
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function derivarAWhatsApp(bubble, pregunta) {
    bubble.classList.remove("typing");
    bubble.textContent = "Esa te la responde Joel en persona. Tocá acá y le llega tu consulta ya escrita:";
    const a = document.createElement("a");
    a.href = linkWhatsApp(pregunta);
    a.target = "_blank"; a.rel = "noopener noreferrer";
    a.className = "chat-wa";
    a.textContent = "Seguir por WhatsApp →";
    bubble.appendChild(a);
    messages.scrollTop = messages.scrollHeight;
  }

  function escribir(bubble, texto, conWa, pregunta) {
    bubble.classList.remove("typing");
    bubble.textContent = "";
    let i = 0;
    const paso = () => {
      i = Math.min(texto.length, i + 3);
      bubble.textContent = texto.slice(0, i);
      messages.scrollTop = messages.scrollHeight;
      if (i < texto.length) return setTimeout(paso, 12);
      if (conWa) {
        const a = document.createElement("a");
        a.href = linkWhatsApp(pregunta);
        a.target = "_blank"; a.rel = "noopener noreferrer";
        a.className = "chat-wa";
        a.textContent = "Escribirle a Joel por WhatsApp →";
        bubble.appendChild(a);
        messages.scrollTop = messages.scrollHeight;
      }
    };
    paso();
  }

  function responderLocal(bubble, pregunta) {
    const r = respuestaLocal(pregunta);
    if (!r) return derivarAWhatsApp(bubble, pregunta);
    history.push({ role: "assistant", content: r.texto });
    setTimeout(() => escribir(bubble, r.texto, !!r.wa, pregunta), 500);
  }

  /* ---------- Enviar ---------- */
  async function send(textoForzado) {
    const text = (textoForzado || input.value).trim();
    if (!text || isStreaming) return;
    input.value = ""; input.style.height = "auto";
    addBubble("user", text);
    if (!botOnline) {
      history.push({ role: "user", content: text });
      responderLocal(addBubble("bot", "Escribiendo...", true), text);
      return;
    }
    history.push({ role: "user", content: text });
    isStreaming = true; sendBtn.disabled = true;
    const botBubble = addBubble("bot", "Escribiendo...", true);
    let accumulated = "";
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) throw new Error();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      botBubble.classList.remove("typing"); botBubble.textContent = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        botBubble.textContent = accumulated;
        messages.scrollTop = messages.scrollHeight;
      }
      history.push({ role: "assistant", content: accumulated });
    } catch {
      marcarBotCaido();
      responderLocal(botBubble, text);
    } finally {
      isStreaming = false; sendBtn.disabled = false; input.focus();
    }
  }

  sendBtn.addEventListener("click", () => send());
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });

  /* ---------- Preguntas sugeridas de la sección "Demo en vivo" ---------- */
  document.querySelectorAll(".chip[data-pregunta]").forEach(chip => {
    chip.addEventListener("click", () => {
      abrirChat();
      send(chip.getAttribute("data-pregunta"));
    });
  });
}
