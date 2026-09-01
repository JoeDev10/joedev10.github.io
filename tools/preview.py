#!/usr/bin/env python3
"""
Generador de la preview — la maqueta que se le manda al lead caliente.

Es el único paso de la cadena que seguía siendo 100% a mano, y es el caro:
armar a ojo una página para cada prospecto se come la tarde. Esto la arma
con lo que ya sabemos de él (nombre, rubro, barrio, dirección, teléfono,
estrellas y reseñas de Google) y deja los huecos donde van SUS fotos y SUS
precios, que es lo que hay que pedirle en la próxima conversación.

No pretende ser el sitio terminado. Es la maqueta que le hace decir "ah,
así se vería", y por eso lleva arriba una barra que dice exactamente eso:
que es una vista previa, no el sitio oficial del negocio.

Se usa desde el pipeline:
    python tools/pipeline.py preview 12
"""

import html
import re
import unicodedata
import urllib.parse
from datetime import date
from pathlib import Path

MI_WHATSAPP = "5491144091981"    # el número de Joel, el que recibe "la quiero"
MI_SITIO = "https://joedev10.github.io/"


# ── temas por rubro ────────────────────────────────────────────────────────────
# Una barbería y una heladería no pueden verse igual: si la maqueta no se
# parece al rubro, el dueño no se ve adentro y no cierra.

TEMAS = {
    "calido": dict(bg="#FFF9F4", card="#FFFFFF", ink="#241A15", ink2="#6B584E",
                   line="#EADCD0", acc="#B4533A", accink="#FFFFFF", soft="#FBEFE6"),
    "verde":  dict(bg="#F4F8F3", card="#FFFFFF", ink="#17231A", ink2="#4F6154",
                   line="#DBE6DC", acc="#2F6B3F", accink="#FFFFFF", soft="#E8F1E9"),
    "oscuro": dict(bg="#111417", card="#191D21", ink="#F0EDE7", ink2="#A0A7AE",
                   line="#282E34", acc="#C8A55B", accink="#14161A", soft="#1F252A"),
    "rosa":   dict(bg="#FFF7F9", card="#FFFFFF", ink="#25161C", ink2="#6D5560",
                   line="#EFDDE3", acc="#A8446B", accink="#FFFFFF", soft="#FAEAEF"),
    "azul":   dict(bg="#F4F7FA", card="#FFFFFF", ink="#141B22", ink2="#516170",
                   line="#DCE4EC", acc="#1F5C8B", accink="#FFFFFF", soft="#E7EFF6"),
}

# rubro -> (tema, sección, qué se muestra ahí, cómo se escribe bien el rubro)
# El último importa: la búsqueda los guarda sin tilde ("heladeria") y así
# aparecerían en el encabezado de la maqueta, que es lo primero que él lee.
RUBROS = {
    "barberia":     ("oscuro", "Servicios",  "corte",       "Barbería"),
    "peluqueria":   ("rosa",   "Servicios",  "servicio",    "Peluquería"),
    "gimnasio":     ("oscuro", "Planes",     "plan",        "Gimnasio"),
    "pasteleria":   ("calido", "Carta",      "producto",    "Pastelería"),
    "heladeria":    ("calido", "Sabores",    "sabor",       "Heladería"),
    "cafeteria":    ("calido", "Carta",      "producto",    "Cafetería"),
    "vivero":       ("verde",  "Catálogo",   "planta",      "Vivero"),
    "ropa":         ("rosa",   "Catálogo",   "prenda",      "Tienda de ropa"),
    "tienda":       ("rosa",   "Catálogo",   "prenda",      "Tienda"),
    "ferreteria":   ("azul",   "Catálogo",   "producto",    "Ferretería"),
    "reparacion":   ("azul",   "Servicios",  "reparación",  "Reparación de celulares"),
    "celulares":    ("azul",   "Servicios",  "reparación",  "Reparación de celulares"),
}

# "Mirá el servicios" delata la plantilla en la primera línea que lee.
ARTICULO = {"Carta": "la", "Catálogo": "el", "Servicios": "los",
            "Sabores": "los", "Planes": "los"}


def tema_de(rubro):
    """El rubro viene como vino de la búsqueda ('tienda de ropa'), no normalizado."""
    r = sin_acentos((rubro or "").lower())
    for clave, valor in RUBROS.items():
        if clave in r:
            return valor
    return ("azul", "Catálogo", "producto", (rubro or "").capitalize())


# ── texto ──────────────────────────────────────────────────────────────────────

def sin_acentos(txt):
    return "".join(c for c in unicodedata.normalize("NFD", txt)
                   if unicodedata.category(c) != "Mn")


def slug(txt):
    s = re.sub(r"[^a-z0-9]+", "-", sin_acentos(txt).lower()).strip("-")
    return s[:48] or "negocio"


def numero_wa(link_o_tel):
    """
    Saca el número pelado del link de WhatsApp que guardó prospectar.py
    (wa.me/549...?text=...). Si le pasan un teléfono suelto, lo limpia igual.
    """
    if not link_o_tel:
        return ""
    m = re.search(r"wa\.me/(\d+)", link_o_tel)
    if m:
        return m.group(1)
    d = re.sub(r"\D", "", link_o_tel)
    if d.startswith("54") and not d.startswith("549"):
        d = "549" + d[2:]
    return d if len(d) >= 12 else ""


def wa_cliente(numero, negocio, seccion):
    """
    El CTA de la maqueta: el CLIENTE escribiéndole al negocio, no al revés.
    El texto va por la sección y no por el producto en singular, porque "un
    prenda" o "un reparación" delatan la plantilla en el propio WhatsApp.
    """
    if not numero:
        return ""
    texto = (f"Hola {negocio}! Vi la página y quería consultar por "
             f"{ARTICULO.get(seccion, 'el')} {seccion.lower()}.")
    return f"https://wa.me/{numero}?text={urllib.parse.quote(texto)}"


def wa_joel(negocio):
    texto = (f"Hola Joel, soy de {negocio}. Vi la vista previa que me mandaste "
             f"y quiero avanzar.")
    return f"https://wa.me/{MI_WHATSAPP}?text={urllib.parse.quote(texto)}"


def estrellas_html(puntaje):
    """Cinco estrellas con las llenas primero. Si no hay puntaje, no se dibuja."""
    try:
        n = round(float(puntaje))
    except (TypeError, ValueError):
        return ""
    n = max(0, min(5, n))
    return '<span class="est">' + "★" * n + '<span class="est-off">' + \
           "★" * (5 - n) + "</span></span>"


# ── estilos ────────────────────────────────────────────────────────────────────
# Todo inline y sin dependencias: la maqueta se abre desde un pendrive, desde
# Netlify Drop o desde el celular del dueño con datos malos, y tiene que verse
# igual en los tres casos.

CSS = """
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);
font:17px/1.6 -apple-system,"Segoe UI",Roboto,system-ui,sans-serif}
img{max-width:100%}
a{color:inherit}
.w{max-width:940px;margin:0 auto;padding:0 20px}

/* barra de honestidad: esto es una maqueta, no el sitio del negocio */
.aviso{background:var(--ink);color:var(--bg);font-size:.82rem;padding:9px 0}
.aviso .w{display:flex;gap:12px;align-items:center;justify-content:space-between;
flex-wrap:wrap}
.aviso b{font-weight:700}
.aviso a{background:var(--acc);color:var(--accink);text-decoration:none;
padding:6px 13px;border-radius:999px;font-weight:700;white-space:nowrap}

/* hero */
.hero{padding:64px 0 52px;text-align:center;
background:linear-gradient(180deg,var(--soft),var(--bg))}
.rubro{font-size:.74rem;letter-spacing:.18em;text-transform:uppercase;
color:var(--acc);font-weight:700;margin:0 0 14px}
h1{font-size:clamp(2.1rem,7vw,3.4rem);line-height:1.08;letter-spacing:-.025em;
margin:0 0 16px;font-weight:800}
.bajada{font-size:1.12rem;color:var(--ink2);max-width:34em;margin:0 auto 30px}
.ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.b{display:inline-block;text-decoration:none;font-weight:700;font-size:1.02rem;
padding:15px 30px;border-radius:999px;background:var(--acc);color:var(--accink)}
.b.alt{background:transparent;color:var(--ink);border:1.5px solid var(--line)}
.b.off{background:transparent;color:var(--ink2);border:1.5px dashed var(--line)}

/* franja de confianza: son datos reales de su ficha de Google */
.conf{border-top:1px solid var(--line);border-bottom:1px solid var(--line);
background:var(--card);padding:20px 0}
.conf .w{display:flex;gap:10px 34px;flex-wrap:wrap;justify-content:center;
align-items:center;font-size:.95rem;color:var(--ink2);text-align:center}
.conf span.d{display:inline-flex;gap:7px;align-items:center;white-space:nowrap}
.conf b{color:var(--ink)}
.est{color:var(--acc);letter-spacing:2px}
.est-off{opacity:.25}

section{padding:60px 0}
h2{font-size:clamp(1.5rem,4vw,2.1rem);letter-spacing:-.02em;margin:0 0 8px;
font-weight:800}
.sub{color:var(--ink2);margin:0 0 34px;max-width:36em}

/* grilla de productos: los huecos son a propósito y lo dicen */
.grid{display:grid;gap:12px;grid-template-columns:repeat(2,1fr)}
.item{background:var(--card);border:1px solid var(--line);border-radius:14px;
overflow:hidden}
.foto{aspect-ratio:1/1;background:
repeating-linear-gradient(45deg,var(--soft),var(--soft) 12px,var(--card) 12px,var(--card) 24px);
display:flex;align-items:center;justify-content:center;color:var(--ink2);
font-size:.78rem;text-align:center;padding:12px;border-bottom:1px solid var(--line);
line-height:1.35}
@media(min-width:760px){.grid{gap:18px;grid-template-columns:repeat(3,1fr)}
.foto{aspect-ratio:4/3;font-size:.82rem}}
.item .t{padding:12px 14px 14px}
.item .n{font-weight:700;font-size:.98rem}
.item .d{color:var(--ink2);font-size:.86rem;margin-top:3px}
.item .p{margin-top:10px;font-weight:800;color:var(--acc)}

/* pasos */
.pasos{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.paso{background:var(--card);border:1px solid var(--line);border-radius:14px;
padding:22px 20px}
.paso .num{width:34px;height:34px;border-radius:50%;background:var(--acc);
color:var(--accink);display:flex;align-items:center;justify-content:center;
font-weight:800;margin-bottom:13px}
.paso h3{margin:0 0 5px;font-size:1.05rem}
.paso p{margin:0;color:var(--ink2);font-size:.95rem}

/* contacto */
.contacto{background:var(--card);border-top:1px solid var(--line)}
.datos{display:grid;gap:16px 40px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));
margin-bottom:32px}
.dato .k{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;
color:var(--ink2);font-weight:700;margin-bottom:5px}
.dato .v{font-size:1.05rem;font-weight:600}
.dato a{color:var(--acc);text-decoration:none}

/* cierre de Deploy: acá se vende */
.deploy{background:var(--ink);color:var(--bg);padding:52px 0;text-align:center}
.deploy h2{margin:0 0 12px}
.deploy p{color:var(--bg);opacity:.72;max-width:38em;margin:0 auto 26px}
.deploy .b{background:var(--acc);color:var(--accink)}
.pie{padding:22px 0;text-align:center;color:var(--ink2);font-size:.83rem}
.pie a{color:var(--ink2)}
"""


# ── armado ─────────────────────────────────────────────────────────────────────

def _items(seccion, singular, n=6):
    """Seis huecos que se ven intencionales y dicen qué falta."""
    filas = []
    for i in range(1, n + 1):
        filas.append(
            '<div class="item">'
            f'<div class="foto">Foto {i}<br>de tu {html.escape(singular)}</div>'
            '<div class="t">'
            f'<div class="n">{html.escape(singular.capitalize())} {i}</div>'
            '<div class="d">Acá va la descripción que le pongas vos</div>'
            '<div class="p">$ &mdash;</div>'
            "</div></div>"
        )
    return f'<div class="grid">{"".join(filas)}</div>'


def construir(lead):
    """
    lead: el dict del pipeline. Devuelve el HTML completo, autocontenido.
    Todo lo que no sabemos queda como hueco visible, nunca inventado.
    """
    negocio = lead.get("negocio") or "Tu negocio"
    rubro = lead.get("rubro") or ""
    barrio = lead.get("barrio") or ""
    direccion = lead.get("direccion") or ""
    telefono = lead.get("telefono") or ""
    maps = lead.get("maps") or ""
    estrellas = lead.get("estrellas") or ""
    reseñas = lead.get("reseñas") or ""

    clave_tema, seccion, singular, rubro_lindo = tema_de(rubro)
    t = TEMAS[clave_tema]
    raiz = ":root{" + ";".join(f"--{k}:{v}" for k, v in t.items()) + "}"

    num = numero_wa(lead.get("whatsapp") or telefono)
    wa = wa_cliente(num, negocio, seccion)
    e = html.escape

    # Sin número el botón queda apagado en vez de desaparecer: el CTA es lo que
    # la maqueta tiene que demostrar, y así ve dónde iría el suyo.
    boton_wa = (f'<a class="b" href="{e(wa)}" target="_blank" rel="noopener">'
                f'Pedir por WhatsApp</a>') if wa else \
               '<span class="b off">Pedir por WhatsApp — falta tu número</span>'

    ubicacion = (f"{rubro_lindo} en {barrio}" if rubro_lindo and barrio
                 else (rubro_lindo or barrio))
    sub_ubi = f'<p class="rubro">{e(ubicacion)}</p>' if ubicacion else ""

    # Franja de confianza: solo lo que Google ya dice de él. Si no hay dato, no va.
    confianza = []
    if estrellas:
        confianza.append(f'<span class="d">{estrellas_html(estrellas)} '
                         f'<b>{e(str(estrellas))}</b> en Google</span>')
    if reseñas:
        confianza.append(f'<span class="d"><b>{e(str(reseñas))}</b> reseñas de clientes</span>')
    if direccion:
        destino = maps or ("https://www.google.com/maps/search/" +
                           urllib.parse.quote(f"{negocio} {direccion}"))
        confianza.append(f'<span class="d"><a href="{e(destino)}" target="_blank" '
                         f'rel="noopener">{e(direccion)}</a></span>')
    franja = (f'<div class="conf"><div class="w">{"".join(confianza)}</div></div>'
              if confianza else "")

    # Contacto: los mismos datos, sin inventar horarios que no conocemos.
    datos = []
    if telefono:
        datos.append(f'<div class="dato"><div class="k">Teléfono</div>'
                     f'<div class="v">{e(telefono)}</div></div>')
    datos.append('<div class="dato"><div class="k">WhatsApp</div><div class="v">'
                 + (f'<a href="{e(wa)}" target="_blank" rel="noopener">Escribinos</a>'
                    if wa else '<span style="opacity:.55">Falta tu número</span>')
                 + "</div></div>")
    if direccion:
        datos.append(f'<div class="dato"><div class="k">Dónde estamos</div>'
                     f'<div class="v">{e(direccion)}</div></div>')
    datos.append('<div class="dato"><div class="k">Horarios</div>'
                 '<div class="v" style="opacity:.55">Los cargamos con tus datos</div></div>')

    return f"""<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>{e(negocio)} — vista previa</title>
<style>{raiz}{CSS}</style>
</head><body>

<div class="aviso"><div class="w">
<span><b>Vista previa</b> — maqueta hecha para {e(negocio)}. No es su sitio oficial.</span>
<a href="{e(wa_joel(negocio))}" target="_blank" rel="noopener">La quiero así</a>
</div></div>

<div class="hero"><div class="w">
{sub_ubi}
<h1>{e(negocio)}</h1>
<p class="bajada">Todo lo que vendés, en un link. El que te busca ve los precios,
elige, y te escribe con el pedido hecho — sin que vos contestes lo mismo veinte veces.</p>
<div class="ctas">{boton_wa}
<a class="b alt" href="#catalogo">Ver {e(seccion.lower())}</a></div>
</div></div>

{franja}

<section id="catalogo"><div class="w">
<h2>{e(seccion)}</h2>
<p class="sub">Acá van tus fotos y tus precios. Los cambiás cuando quieras,
desde el celular, sin llamar a nadie.</p>
{_items(seccion, singular)}
</div></section>

<section style="background:var(--soft)"><div class="w">
<h2>Cómo comprar</h2>
<p class="sub">Tres pasos, sin vueltas.</p>
<div class="pasos">
<div class="paso"><div class="num">1</div>
<h3>Mirá {ARTICULO.get(seccion, "el")} {e(seccion.lower())}</h3>
<p>Con foto y precio actualizado, a cualquier hora.</p></div>
<div class="paso"><div class="num">2</div><h3>Escribinos</h3>
<p>Un toque y se abre WhatsApp con tu pedido ya escrito.</p></div>
<div class="paso"><div class="num">3</div><h3>Lo coordinamos</h3>
<p>Te confirmamos y arreglamos entrega o retiro.</p></div>
</div>
</div></section>

<section class="contacto"><div class="w">
<h2>Contacto</h2>
<p class="sub">Los datos que ya están en tu ficha de Google.</p>
<div class="datos">{"".join(datos)}</div>
{boton_wa}
</div></section>

<div class="deploy"><div class="w">
<h2>Esto es una maqueta. La real lleva lo tuyo.</h2>
<p>La armé en base a tu ficha de Google, así que las fotos y los precios son
huecos. Con tus fotos, tus precios y tu dominio, esto queda publicado en 48hs.</p>
<a class="b" href="{e(wa_joel(negocio))}" target="_blank" rel="noopener">Quiero la mía</a>
</div></div>

<div class="pie">Maqueta sin publicar · {date.today().isoformat()} ·
hecha por <a href="{MI_SITIO}" target="_blank" rel="noopener">Deploy</a></div>

</body></html>"""


def escribir(lead, carpeta):
    """Deja la maqueta lista para arrastrar a Netlify Drop. Devuelve el archivo."""
    destino = Path(carpeta) / slug(lead.get("negocio") or "negocio")
    destino.mkdir(parents=True, exist_ok=True)
    archivo = destino / "index.html"
    archivo.write_text(construir(lead), encoding="utf-8")
    return archivo
