#!/usr/bin/env python3
"""
Pipeline de leads para Deploy — lo que pasa DESPUÉS de encontrar el prospecto.

prospectar.py los encuentra y los puntúa en frío. Esto los califica cuando
contestan, te dice a quién escribirle hoy y no te deja perder a nadie por
olvido, que es como se pierde la mayoría.

USO
    python tools/pipeline.py importar        # trae lo último de prospectar.py
    python tools/pipeline.py hoy             # el tablero del día: a quién escribirle
    python tools/pipeline.py calificar 123   # las 5 preguntas, te dice si va preview
    python tools/pipeline.py preview 123     # arma la maqueta del negocio, lista para mandar
    python tools/pipeline.py marcar 123 respondio --nota "pidio precio"
    python tools/pipeline.py lista --estado caliente

El "123" es el número de fila que muestra `hoy` y `lista`. También acepta el
place_id completo.

Todo vive en tools/salida/pipeline.csv, que está fuera del repo.
"""

import argparse
import csv
import html
import sys
import webbrowser
from datetime import date, datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

SALIDA = Path(__file__).parent / "salida"
PIPELINE = SALIDA / "pipeline.csv"
MI_EJEMPLO = "https://joedev10.github.io/lubit/"

CAMPOS = [
    "place_id", "negocio", "barrio", "telefono", "whatsapp",
    "puntaje_frio", "calificacion", "estado", "contactado", "ultimo_toque", "notas",
    # lo que usa la preview; en pipelines viejos quedan vacíos y no pasa nada
    "rubro", "direccion", "estrellas", "reseñas", "maps",
]

# estado -> (días hasta el próximo toque, qué mandar)
CADENCIA = {
    "nuevo":      (0, "Primer mensaje (guión B)"),
    "contactado": (3, "Seguimiento día 3 (guión D)"),
    "seguido":    (4, "Cierre de ciclo (guión E)"),
    "respondio":  (0, "Calificalo: python tools/pipeline.py calificar <n>"),
    "caliente":   (0, "Hacele la preview HOY: python tools/pipeline.py preview <n>"),
    "tibio":      (2, "Seguí la conversación, todavía no gastes la preview"),
    "frio":       (30, "Guardalo para dentro de un mes"),
    "preview":    (2, "Preguntale si la vio"),
    "propuesta":  (2, "Pedí definición: sí o no"),
}
TERMINALES = {"cerrado", "perdido"}


# ── almacenamiento ─────────────────────────────────────────────────────────────

def cargar():
    if not PIPELINE.exists():
        return []
    with PIPELINE.open(encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def guardar(filas):
    SALIDA.mkdir(parents=True, exist_ok=True)
    with PIPELINE.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CAMPOS)
        w.writeheader()
        for f in filas:
            w.writerow({c: f.get(c, "") for c in CAMPOS})


def hoy_str():
    return date.today().isoformat()


def dias_desde(txt):
    if not txt:
        return 999
    try:
        return (date.today() - datetime.fromisoformat(txt).date()).days
    except ValueError:
        return 999


def buscar_fila(filas, ref):
    """Acepta el número de fila que se muestra en pantalla, o el place_id."""
    if ref.isdigit():
        i = int(ref) - 1
        if 0 <= i < len(filas):
            return filas[i]
        sys.exit(f"No hay fila {ref}. Corré 'lista' para ver los números.")
    for f in filas:
        if f["place_id"] == ref:
            return f
    sys.exit(f"No encontré '{ref}'.")


# ── importar desde prospectar.py ───────────────────────────────────────────────

def cmd_importar(args):
    csvs = sorted(SALIDA.glob("prospectos-*.csv"))
    if not csvs:
        sys.exit("No hay CSV de prospectar.py todavía. Corré primero:\n"
                 "  python tools/prospectar.py")
    origen = csvs[-1]

    filas = cargar()
    conocidos = {f["place_id"] for f in filas}
    nuevos = 0

    with origen.open(encoding="utf-8-sig", newline="") as fh:
        for p in csv.DictReader(fh):
            if p["place_id"] in conocidos:
                continue
            filas.append({
                "place_id": p["place_id"],
                "negocio": p["negocio"],
                "barrio": p.get("barrio", ""),
                "telefono": p.get("telefono", ""),
                "whatsapp": p.get("whatsapp", ""),
                "puntaje_frio": p.get("puntaje", ""),
                "calificacion": "",
                "estado": "nuevo",
                "contactado": "",
                "ultimo_toque": "",
                "notas": "",
                "rubro": p.get("rubro", ""),
                "direccion": p.get("direccion", ""),
                "estrellas": p.get("estrellas", ""),
                "reseñas": p.get("reseñas", ""),
                "maps": p.get("maps", ""),
            })
            nuevos += 1

    guardar(filas)
    print(f"{nuevos} prospectos nuevos desde {origen.name}. "
          f"El pipeline tiene {len(filas)} en total.")
    if nuevos:
        print("\nAhora corré:  python tools/pipeline.py hoy")


# ── el tablero del día ─────────────────────────────────────────────────────────

def vence(fila):
    """Días de atraso: >= 0 significa que hoy toca tocarlo."""
    estado = fila["estado"]
    if estado in TERMINALES:
        return None
    espera, _ = CADENCIA.get(estado, (0, ""))
    ref = fila["ultimo_toque"] or fila["contactado"]
    if not ref:
        return 0
    return dias_desde(ref) - espera


def cmd_hoy(args):
    filas = cargar()
    if not filas:
        sys.exit("Pipeline vacío. Corré:  python tools/pipeline.py importar")

    urgentes, nuevos = [], []
    for i, f in enumerate(filas, 1):
        d = vence(f)
        if d is None or d < 0:
            continue
        (nuevos if f["estado"] == "nuevo" else urgentes).append((i, f, d))

    # los que ya están en conversación van primero: valen más que uno frío
    urgentes.sort(key=lambda x: -x[2])
    nuevos.sort(key=lambda x: -int(x[1]["puntaje_frio"] or 0))

    print(f"\n  TABLERO DEL {hoy_str()}")
    print("  " + "=" * 62)

    if urgentes:
        print(f"\n  EN CONVERSACIÓN — {len(urgentes)} esperando algo tuyo\n")
        for i, f, d in urgentes:
            _, accion = CADENCIA.get(f["estado"], (0, "revisar"))
            accion = accion.replace("<n>", str(i))
            atraso = "hoy" if d == 0 else f"hace {d}d"
            print(f"  [{i:>3}] {f['negocio'][:34]:<34} {f['estado']:<10} {atraso}")
            print(f"        -> {accion}")
            if f["notas"]:
                print(f"        nota: {f['notas']}")
            if f["whatsapp"]:
                print(f"        {f['whatsapp'][:78]}")
            print()

    cupo = max(0, args.cupo - len(urgentes))
    if nuevos and cupo:
        print(f"\n  A ESTRENAR — los {min(cupo, len(nuevos))} de mayor puntaje\n")
        for i, f, _ in nuevos[:cupo]:
            print(f"  [{i:>3}] {f['negocio'][:34]:<34} {f['puntaje_frio']}/10  {f['barrio']}")
            if f["whatsapp"]:
                print(f"        {f['whatsapp'][:78]}")
            print()

    if not urgentes and not nuevos:
        print("\n  Nada pendiente. Corré 'importar' para traer más prospectos.\n")
        return

    print("  " + "-" * 62)
    print("  Cuando le escribas:   python tools/pipeline.py marcar <n> contactado")
    print("  Cuando te conteste:   python tools/pipeline.py calificar <n>\n")


# ── calificación del lead ──────────────────────────────────────────────────────

PREGUNTAS = [
    ("¿Es el dueño o el que decide?", 3),
    ("¿Hoy contesta precios uno por uno por WhatsApp?", 3),
    ("¿Contestó más de una línea, se enganchó?", 2),
    ("¿Tiene productos con foto para armar el catálogo?", 2),
    ("¿Preguntó el precio o los tiempos?", 2),
]


def cmd_calificar(args):
    filas = cargar()
    f = buscar_fila(filas, args.ref)

    print(f"\n  Calificando: {f['negocio']}  (puntaje frío {f['puntaje_frio']}/10)")
    print("  Contestá s / n\n")

    total = 0
    for pregunta, peso in PREGUNTAS:
        while True:
            try:
                r = input(f"  {pregunta} [s/n] ").strip().lower()
            except (EOFError, KeyboardInterrupt):
                print("\n  Cancelado.")
                return
            if r in ("s", "si", "sí", "y"):
                total += peso
                break
            if r in ("n", "no"):
                break

    if total >= 9:
        estado, veredicto = "caliente", "CALIENTE"
        que_hacer = ("Hacele la preview hoy mismo. Este es de los que cierran:\n"
                     "  no lo dejes enfriar más de 24 horas.\n"
                     f"  python tools/pipeline.py preview {args.ref}")
    elif total >= 5:
        estado, veredicto = "tibio", "TIBIO"
        que_hacer = ("Seguí la conversación, todavía no gastes la preview.\n"
                     "  Te falta saber si decide él o si le duele el problema.")
    else:
        estado, veredicto = "frio", "FRÍO"
        que_hacer = ("No inviertas la preview acá. Dejalo en la lista larga\n"
                     "  y volvé en un mes.")

    f["calificacion"] = f"{veredicto} {total}/12"
    f["estado"] = estado
    f["ultimo_toque"] = hoy_str()
    if args.nota:
        f["notas"] = args.nota
    guardar(filas)

    print(f"\n  {veredicto} — {total}/12")
    print(f"  {que_hacer}\n")


# ── preview ────────────────────────────────────────────────────────────────────

def cmd_preview(args):
    """Arma la maqueta del negocio y la abre. Mandarla y marcarla siguen a mano."""
    import preview   # vive al lado, en tools/preview.py

    filas = cargar()
    f = buscar_fila(filas, args.ref)

    if f["estado"] in ("nuevo", "contactado", "seguido"):
        print(f"\n  Ojo: {f['negocio']} está en '{f['estado']}', todavía no contestó.")
        print("  La preview es lo caro. Conviene calificarlo antes de gastarla.")
    elif f["estado"] in ("tibio", "frio"):
        print(f"\n  Ojo: {f['negocio']} calificó {f['calificacion'] or f['estado']}.")
        print("  Igual la armo, pero fijate si no conviene seguir la charla primero.")

    archivo = preview.escribir(f, SALIDA / "previews")
    print(f"\n  Maqueta: {archivo}")
    if not f.get("rubro"):
        print("  (sin rubro en el pipeline: quedó genérica. Los importados de ahora"
              " en más lo traen.)")

    print(
        "\n  Para que la pueda abrir desde el celular, subila:\n"
        f"    arrastrá la carpeta  {archivo.parent}  a  https://app.netlify.com/drop\n"
        "    (o: netlify deploy --dir \"" + str(archivo.parent) + "\" --prod)\n"
        "\n  Mandale el link, y recién ahí:\n"
        f"    python tools/pipeline.py marcar {args.ref} preview\n"
    )
    if not args.no_abrir:
        webbrowser.open(archivo.resolve().as_uri())


# ── marcar / listar ────────────────────────────────────────────────────────────

def cmd_marcar(args):
    filas = cargar()
    f = buscar_fila(filas, args.ref)
    validos = sorted(set(CADENCIA) | TERMINALES)
    if args.estado not in validos:
        sys.exit(f"Estado inválido. Usá uno de: {', '.join(validos)}")

    f["estado"] = args.estado
    f["ultimo_toque"] = hoy_str()
    if args.estado == "contactado" and not f["contactado"]:
        f["contactado"] = hoy_str()
    if args.nota:
        f["notas"] = args.nota
    guardar(filas)
    print(f"  {f['negocio']} -> {args.estado}")


TABLERO_CSS = """
:root{--bg:#EDEFF0;--card:#fff;--ink:#16191C;--ink2:#57626C;--ink3:#8A939C;
--line:#D6DBDE;--ok:#0B6E4F;--soft:#E1EFE9;--hot:#A2411D}
@media(prefers-color-scheme:dark){:root{--bg:#131619;--card:#1B1F23;--ink:#E6E9EB;
--ink2:#9BA5AE;--ink3:#6E7880;--line:#2E353B;--ok:#4FB08A;--soft:#172E26;--hot:#DC8A66}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font:16px/1.55 "Segoe UI",system-ui,sans-serif;padding:28px 18px 70px}
.w{max-width:820px;margin:0 auto}
h1{font-size:1.6rem;margin:0 0 4px;letter-spacing:-.02em}
.sub{color:var(--ink2);margin:0 0 26px;font-size:.95rem}
h2{font-size:.72rem;text-transform:uppercase;letter-spacing:.13em;color:var(--ink3);
margin:32px 0 12px;font-weight:700}
.c{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--line);
border-radius:3px;padding:15px 17px;margin-bottom:11px;
display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.c.hot{border-left-color:var(--hot)}
.c.new{border-left-color:var(--ok)}
.i{flex:1;min-width:210px}
.n{font-weight:600;font-size:1.03rem}
.m{color:var(--ink2);font-size:.87rem;margin-top:2px}
.todo{color:var(--ink);font-size:.9rem;margin-top:6px}
.b{display:inline-block;background:var(--ok);color:#fff;text-decoration:none;
padding:9px 16px;border-radius:3px;font-weight:600;font-size:.9rem;white-space:nowrap}
.b:hover{opacity:.88}
.b.off{background:transparent;color:var(--ink3);border:1px solid var(--line)}
.p{font-variant-numeric:tabular-nums;color:var(--ink3);font-size:.85rem;
background:var(--soft);padding:3px 8px;border-radius:2px;white-space:nowrap}
.f{margin-top:34px;padding-top:18px;border-top:1px solid var(--line);
color:var(--ink3);font-size:.87rem}
code{background:var(--soft);padding:1px 5px;border-radius:2px;font-size:.88em}
.empty{color:var(--ink2)}
"""


def tarjeta(i, f, clase, encabezado, accion):
    wa = f.get("whatsapp", "")
    boton = (f'<a class="b" href="{html.escape(wa)}" target="_blank" '
             f'rel="noopener">Abrir WhatsApp</a>') if wa else \
            (f'<span class="b off">sin teléfono</span>')
    nota = f'<div class="m">nota: {html.escape(f["notas"])}</div>' if f.get("notas") else ""
    return f"""<div class="c {clase}">
  <div class="i">
    <div class="n">[{i}] {html.escape(f['negocio'])}</div>
    <div class="m">{html.escape(encabezado)}</div>
    <div class="todo">{html.escape(accion)}</div>{nota}
  </div>
  <span class="p">{html.escape(f.get('calificacion') or (f.get('puntaje_frio','') + '/10'))}</span>
  {boton}
</div>"""


def cmd_tablero(args):
    """Genera el tablero clickeable y lo abre en el navegador."""
    filas = cargar()
    if not filas:
        sys.exit("Pipeline vacío. Corré:  python tools/pipeline.py importar")

    urgentes, nuevos = [], []
    for i, f in enumerate(filas, 1):
        d = vence(f)
        if d is None or d < 0:
            continue
        (nuevos if f["estado"] == "nuevo" else urgentes).append((i, f, d))

    urgentes.sort(key=lambda x: -x[2])
    nuevos.sort(key=lambda x: -int(x[1]["puntaje_frio"] or 0))
    cupo = max(0, args.cupo - len(urgentes))

    partes = []
    if urgentes:
        partes.append(f"<h2>En conversación · {len(urgentes)} esperando algo tuyo</h2>")
        for i, f, d in urgentes:
            _, accion = CADENCIA.get(f["estado"], (0, "revisar"))
            accion = accion.replace("<n>", str(i))
            atraso = "para hoy" if d == 0 else f"hace {d} días"
            clase = "hot" if f["estado"] in ("caliente", "respondio") else ""
            partes.append(tarjeta(i, f, clase, f"{f['estado']} · {atraso}", accion))

    if nuevos and cupo:
        partes.append(f"<h2>A estrenar · los {min(cupo, len(nuevos))} de mayor puntaje</h2>")
        for i, f, _ in nuevos[:cupo]:
            partes.append(tarjeta(i, f, "new", f"{f['barrio']} · sin contactar",
                                  "Primer mensaje — ya va escrito en el link"))

    if not partes:
        partes.append('<p class="empty">Nada pendiente hoy. '
                      'Corré <code>prospectar.py</code> para traer más.</p>')

    doc = f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tablero Deploy — {hoy_str()}</title><style>{TABLERO_CSS}</style></head><body>
<div class="w">
<h1>A quién escribirle hoy</h1>
<p class="sub">{hoy_str()} · {len(urgentes)} en conversación · {len(nuevos)} sin estrenar ·
{len(filas)} en el pipeline</p>
{''.join(partes)}
<div class="f">
Cada botón abre WhatsApp con el mensaje ya escrito. Leelo, cambiale lo que quieras
y apretá enviar vos — mandarlos en automático te banea el número.<br><br>
Después de escribir: <code>python tools/pipeline.py marcar N contactado</code><br>
Cuando te contesten: <code>python tools/pipeline.py calificar N</code><br>
Si sale caliente: <code>python tools/pipeline.py preview N</code>
</div></div></body></html>"""

    SALIDA.mkdir(parents=True, exist_ok=True)
    destino = SALIDA / "tablero.html"
    destino.write_text(doc, encoding="utf-8")
    print(f"  Tablero: {destino}")
    if not args.no_abrir:
        webbrowser.open(destino.resolve().as_uri())


def cmd_lista(args):
    filas = cargar()
    if not filas:
        sys.exit("Pipeline vacío.")
    print()
    conteo = {}
    for i, f in enumerate(filas, 1):
        conteo[f["estado"]] = conteo.get(f["estado"], 0) + 1
        if args.estado and f["estado"] != args.estado:
            continue
        cal = f["calificacion"] or f"frío {f['puntaje_frio']}/10"
        print(f"  [{i:>3}] {f['negocio'][:32]:<32} {f['estado']:<11} {cal}")
    print("\n  " + "  ".join(f"{k}:{v}" for k, v in sorted(conteo.items())) + "\n")


# ── main ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Pipeline de leads de Deploy.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("importar", help="traer lo último de prospectar.py")

    p = sub.add_parser("hoy", help="a quién escribirle hoy")
    p.add_argument("--cupo", type=int, default=20, help="tope de mensajes por día")

    p = sub.add_parser("calificar", help="las 5 preguntas sobre un lead que contestó")
    p.add_argument("ref")
    p.add_argument("--nota", default="")

    p = sub.add_parser("preview", help="armar la maqueta del negocio para mandarle")
    p.add_argument("ref")
    p.add_argument("--no-abrir", action="store_true")

    p = sub.add_parser("marcar", help="cambiar el estado de un lead")
    p.add_argument("ref")
    p.add_argument("estado")
    p.add_argument("--nota", default="")

    p = sub.add_parser("tablero", help="tablero clickeable en el navegador")
    p.add_argument("--cupo", type=int, default=20)
    p.add_argument("--no-abrir", action="store_true")

    p = sub.add_parser("lista", help="ver todo el pipeline")
    p.add_argument("--estado", default="")

    args = ap.parse_args()
    {"importar": cmd_importar, "hoy": cmd_hoy, "calificar": cmd_calificar,
     "preview": cmd_preview, "marcar": cmd_marcar, "tablero": cmd_tablero,
     "lista": cmd_lista}[args.cmd](args)


if __name__ == "__main__":
    main()
