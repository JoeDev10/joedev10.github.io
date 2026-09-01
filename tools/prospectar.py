#!/usr/bin/env python3
"""
Prospección automática para Deploy — busca negocios de barrio que ya facturan
y no tienen página web, los puntúa y deja un CSV ordenado por prioridad.

Automatiza ENCONTRAR y PRIORIZAR. No manda nada: la última columna del CSV es
un link de WhatsApp con el mensaje ya escrito, y lo abrís y apretás enviar vos.
Mandar en automático te banea el número, y ese número está en toda la web.

USO
    set GOOGLE_PLACES_KEY=tu_api_key      (Windows / PowerShell: $env:GOOGLE_PLACES_KEY="...")
    python tools/prospectar.py
    python tools/prospectar.py --rubros barberia,pasteleria --barrios Palermo,Caballito
    python tools/prospectar.py --min-puntaje 7

La key se saca en console.cloud.google.com → habilitar "Places API (New)".
Nunca la pongas en este archivo: el repo es público.

SALIDA
    tools/salida/prospectos-AAAA-MM-DD.csv   (ignorado por git)
    tools/salida/contactados.csv             (a quién ya le escribiste; se respeta
                                              en las corridas siguientes)
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

# ── Configuración ──────────────────────────────────────────────────────────────

MI_WHATSAPP = "5491144091981"   # tu número, el que recibe la respuesta
MI_EJEMPLO = "https://joedev10.github.io/lubit/"

# Rubros donde ya tenés un trabajo real para mostrar. Vender lo que ya hiciste
# es mucho más fácil que vender una idea.
RUBROS = [
    "barberia", "peluqueria", "pasteleria", "heladeria",
    "tienda de ropa", "reparacion de celulares", "gimnasio",
    "vivero", "ferreteria", "cafeteria de especialidad",
]

BARRIOS = [
    "Palermo", "Caballito", "Villa Crespo", "Flores", "Belgrano",
    "Almagro", "San Telmo", "Núñez", "Devoto", "Boedo",
    "Avellaneda", "Lomas de Zamora", "Quilmes", "San Isidro", "Vicente López",
]

MIN_PUNTAJE = 5          # menos que esto no lo trabajes esta semana
PAGINAS_POR_BUSQUEDA = 2  # 20 resultados por página, máx 3 páginas por Google

# Un "sitio web" que en realidad es una red social es exactamente el mismo hueco
# que no tener ninguno: no hay dónde ver el catálogo.
NO_ES_SITIO = (
    "instagram.com", "facebook.com", "fb.com", "linktr.ee",
    "linktree", "wa.me", "whatsapp.com", "tiendanube.com/inicio",
    "beacons.ai", "bio.link", "linkr.bio", "milkshake.app",
)

API = "https://places.googleapis.com/v1/places:searchText"
CAMPOS = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.nationalPhoneNumber",
    "places.internationalPhoneNumber",
    "places.websiteUri",
    "places.rating",
    "places.userRatingCount",
    "places.googleMapsUri",
    "places.businessStatus",
    "nextPageToken",
])

SALIDA = Path(__file__).parent / "salida"

# La consola de Windows arranca en cp1252 y revienta al imprimir flechas o acentos.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass


# ── Google Places ──────────────────────────────────────────────────────────────

def buscar(consulta, key, token=None):
    """Una página de resultados. Devuelve (lista_de_lugares, siguiente_token)."""
    cuerpo = {"textQuery": consulta, "languageCode": "es", "regionCode": "AR"}
    if token:
        cuerpo["pageToken"] = token

    req = urllib.request.Request(
        API,
        data=json.dumps(cuerpo).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": key,
            "X-Goog-FieldMask": CAMPOS,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            datos = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detalle = e.read().decode("utf-8", "replace")[:400]
        print(f"    ! error {e.code} en '{consulta}': {detalle}", file=sys.stderr)
        return [], None
    except urllib.error.URLError as e:
        print(f"    ! sin conexión en '{consulta}': {e.reason}", file=sys.stderr)
        return [], None

    return datos.get("places", []), datos.get("nextPageToken")


# ── Puntaje ────────────────────────────────────────────────────────────────────

def sin_sitio_real(lugar):
    web = (lugar.get("websiteUri") or "").lower()
    if not web:
        return True, "sin web"
    if any(d in web for d in NO_ES_SITIO):
        return True, "solo redes"
    return False, web


def puntuar(lugar):
    """Traduce el scorecard del playbook a los campos que devuelve la API."""
    puntos, motivos = 0, []

    hueco, detalle = sin_sitio_real(lugar)
    if not hueco:
        return 0, ["ya tiene web"]          # descarte directo
    puntos += 3
    motivos.append(detalle)

    reseñas = lugar.get("userRatingCount") or 0
    if reseñas >= 50:
        puntos += 4
        motivos.append(f"{reseñas} reseñas")
    elif reseñas >= 20:
        puntos += 3
        motivos.append(f"{reseñas} reseñas")
    elif reseñas >= 8:
        puntos += 1
        motivos.append(f"solo {reseñas} reseñas")
    else:
        motivos.append("casi sin reseñas")

    puntaje = lugar.get("rating") or 0
    if puntaje >= 4.2:
        puntos += 2
        motivos.append(f"{puntaje}★")
    elif puntaje and puntaje < 3.5:
        puntos -= 1
        motivos.append(f"ojo: {puntaje}★")

    if lugar.get("nationalPhoneNumber"):
        puntos += 1
        motivos.append("con teléfono")

    return puntos, motivos


# ── WhatsApp ───────────────────────────────────────────────────────────────────

def a_wa(telefono_intl):
    """
    Pasa '+54 11 4409-1981' al formato que espera wa.me.
    Los móviles argentinos necesitan un 9 después del 54 y sin el 15;
    Google no lo devuelve así, por eso se inserta acá.
    """
    if not telefono_intl:
        return ""
    d = re.sub(r"\D", "", telefono_intl)
    if d.startswith("54") and not d.startswith("549"):
        d = "549" + d[2:]
    return d if len(d) >= 12 else ""


def armar_mensaje(nombre, reseñas):
    cuenta = f"{reseñas} reseñas buenísimas" if reseñas else "muy buenas reseñas"
    return (
        f"Hola, ¿hablo con el dueño de {nombre}?\n\n"
        f"Los encontré en Google Maps: tienen {cuenta} pero la ficha no tiene "
        f"sitio web, así que el que los busca no encuentra dónde ver los productos.\n\n"
        f"Hago páginas para negocios de barrio y entrego en 48hs. "
        f"Acá una que hice → {MI_EJEMPLO}\n\n"
        f"¿Te la muestro?"
    )


def link_wa(lugar):
    num = a_wa(lugar.get("internationalPhoneNumber"))
    if not num:
        return ""
    texto = armar_mensaje(
        lugar.get("displayName", {}).get("text", "tu negocio"),
        lugar.get("userRatingCount") or 0,
    )
    return f"https://wa.me/{num}?text={urllib.parse.quote(texto)}"


# ── Historial ──────────────────────────────────────────────────────────────────

def ya_contactados():
    f = SALIDA / "contactados.csv"
    if not f.exists():
        return set()
    with f.open(encoding="utf-8", newline="") as fh:
        return {fila["place_id"] for fila in csv.DictReader(fh) if fila.get("place_id")}


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Busca negocios sin web y los prioriza.")
    ap.add_argument("--rubros", help="lista separada por comas")
    ap.add_argument("--barrios", help="lista separada por comas")
    ap.add_argument("--min-puntaje", type=int, default=MIN_PUNTAJE)
    ap.add_argument("--paginas", type=int, default=PAGINAS_POR_BUSQUEDA)
    args = ap.parse_args()

    key = os.environ.get("GOOGLE_PLACES_KEY")
    if not key:
        sys.exit(
            "Falta GOOGLE_PLACES_KEY.\n"
            '  PowerShell:  $env:GOOGLE_PLACES_KEY="tu_key"\n'
            "  bash:        export GOOGLE_PLACES_KEY=tu_key"
        )

    rubros = [r.strip() for r in args.rubros.split(",")] if args.rubros else RUBROS
    barrios = [b.strip() for b in args.barrios.split(",")] if args.barrios else BARRIOS

    SALIDA.mkdir(parents=True, exist_ok=True)
    saltear = ya_contactados()
    if saltear:
        print(f"Ignorando {len(saltear)} negocios ya contactados.\n")

    vistos, candidatos = set(), []
    total = len(rubros) * len(barrios)
    hecho = 0

    for rubro in rubros:
        for barrio in barrios:
            hecho += 1
            consulta = f"{rubro} en {barrio}, Buenos Aires, Argentina"
            print(f"[{hecho}/{total}] {consulta}")

            token = None
            for _ in range(max(1, args.paginas)):
                lugares, token = buscar(consulta, key, token)
                for lugar in lugares:
                    pid = lugar.get("id")
                    if not pid or pid in vistos or pid in saltear:
                        continue
                    if lugar.get("businessStatus") != "OPERATIONAL":
                        continue
                    vistos.add(pid)

                    puntos, motivos = puntuar(lugar)
                    if puntos < args.min_puntaje:
                        continue

                    candidatos.append({
                        "puntaje": puntos,
                        "negocio": lugar.get("displayName", {}).get("text", ""),
                        "rubro": rubro,
                        "barrio": barrio,
                        "reseñas": lugar.get("userRatingCount") or 0,
                        "estrellas": lugar.get("rating") or "",
                        "telefono": lugar.get("nationalPhoneNumber", ""),
                        "direccion": lugar.get("formattedAddress", ""),
                        "por_que": " · ".join(motivos),
                        "maps": lugar.get("googleMapsUri", ""),
                        "whatsapp": link_wa(lugar),
                        "place_id": pid,
                    })

                if not token:
                    break
                time.sleep(2)   # el nextPageToken de Google tarda en activarse

    if not candidatos:
        print("\nNinguno pasó el filtro. Probá bajando --min-puntaje o sumando barrios.")
        return

    candidatos.sort(key=lambda c: (-c["puntaje"], -c["reseñas"]))

    destino = SALIDA / f"prospectos-{date.today().isoformat()}.csv"
    with destino.open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(candidatos[0].keys()))
        w.writeheader()
        w.writerows(candidatos)

    con_wa = sum(1 for c in candidatos if c["whatsapp"])
    print(f"\n{len(candidatos)} prospectos ({con_wa} con WhatsApp listo) → {destino}")
    print("\nLos 5 mejores, para arrancar hoy:")
    for c in candidatos[:5]:
        print(f"  {c['puntaje']:>2}/10  {c['negocio']} ({c['barrio']}) — {c['por_que']}")
    print(
        "\nAbrí el CSV, revisá cada uno en el celular antes de escribir, y mandá vos.\n"
        "Cuando le escribas a alguno, pegá su place_id en salida/contactados.csv\n"
        "para que no te vuelva a salir la semana que viene."
    )


if __name__ == "__main__":
    main()
