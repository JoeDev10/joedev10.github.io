# Despliegue de MJR Digital

Guía corta de cómo está armado el sitio después de pasarlo a Vite, cómo
correrlo en tu máquina y cómo se publica. Lo primero es lo más importante:
hoy el sitio se publica desde la raíz del repo, así que hay un paso extra
cada vez que se toca algo.

---

## 1. Cómo se publica hoy (importante)

GitHub Pages está configurado como **"Deploy from a branch"**: publica la
**raíz de `master` tal cual**, sin pasar por el workflow. Por eso la raíz del
repo **es** el sitio ya construido:

```
index.html  assets/  img/  demo-stock/  robots.txt  sitemap.xml
```

Eso lo genera `npm run publicar` a partir del código que vive en `app/`.

> Esto se descubrió a los golpes: la primera vez que se mergeó el rediseño, el
> builder viejo de Jekyll publicó la raíz con el código fuente adentro y el
> sitio quedó sin estilos ni imágenes durante unos minutos.

### Si tocás el sitio, el flujo es:

```bash
git add -A
git commit -m "..."
git push
```

Nada más. El workflow `deploy.yml` se encarga de construir y de commitear el
sitio de la raíz por vos, y además publica el mismo build por la vía de
Actions. No hace falta acordarse de nada.

Si querés ver el resultado antes de pushear, podés correr `npm run publicar`
a mano y commitearlo; el workflow después no va a tener nada que cambiar.

### Cómo sacarse esto de encima (recomendado)

En **Settings → Pages → Build and deployment → Source**, cambiar de
*Deploy from a branch* a **GitHub Actions**. Con eso:

- el workflow se simplifica: deja de commitear la raíz y solo sube `dist/`;
- se puede borrar de la raíz `index.html`, `assets/`, `img/`, `demo-stock/`,
  `robots.txt`, `sitemap.xml`, más `_config.yml` y `scripts/publicar.mjs`;
- se termina el ruido de los commits automáticos y el repo queda limpio.

Mientras tanto, `_config.yml` se encarga de que no se publique lo que no va:
`app/` (las fuentes), `tools/` (los `.py` y `.bat` de prospección), `docs/`,
`scripts/` y la config del proyecto.

---

## 2. Cómo correrlo en tu máquina

Hace falta Node 20.19 o más nuevo (recomendado: Node 22).

```bash
npm install          # la primera vez
npm run dev          # servidor de desarrollo en http://localhost:5173
```

Para ver exactamente lo que se va a publicar:

```bash
npm run build        # genera dist/
npm run preview      # sirve dist/ en http://localhost:4173
```

`dist/` no se versiona. Lo que sí se versiona es el build de la raíz, que sale
de `npm run publicar`.

---

## 3. Estructura

```
index.html                  EL SITIO PUBLICADO (generado, se commitea)
assets/                     idem: JS y CSS con hash
img/  demo-stock/           idem: copiados de app/public/
robots.txt  sitemap.xml     idem
_config.yml                 qué NO publica GitHub Pages

app/                        el código fuente
  index.html                la entrada de Vite
  public/                   se copia tal cual al sitio
    img/  demo-stock/  sitemap.xml  robots.txt
  src/
    main.js                 enciende todo y decide qué se carga
    styles/
      base.css              variables de marca, reset, tipografías, fondos
      layout.css            header, menú de celular y grilla del hero
      components.css        botones, bento, celular, demos, combos, chat…
      motion.css            intro, cursor, revelados, banda clara (entra último)
    features/
      asistente.js          el chat (respuestas locales, bot remoto apagado)
      hero-demo.js          el agente del celular del hero y la línea de la noche
      ui.js                 mouse, barra de progreso, header, menú, preguntas
    motion/
      movimiento.js         intro, cursor, riel, cinta y carga de la red del hero
      scroll.js             Lenis + GSAP ScrollTrigger (import dinámico)
    three/
      hero-net.js           la red de puntos en WebGL (import dinámico)

scripts/
  construir.mjs             npm run build    → dist/
  publicar.mjs              npm run publicar → la raíz del repo

vite.config.js
tools/                      prospección (.py y .bat) — no se publica
docs/                       notas internas — no se publica
.github/workflows/deploy.yml
```

---

## 4. Qué se carga y cuándo

| Pieza | Cuándo se baja |
| --- | --- |
| CSS y JS base (~9 kB + 11 kB comprimidos) | siempre |
| Lenis + GSAP ScrollTrigger (~51 kB comprimidos) | solo si el visitante **no** pidió menos movimiento |
| Three.js (~132 kB comprimidos) | solo en escritorio (≥1025 px y puntero de mouse), con 4 núcleos o más, 4 GB de memoria o más y WebGL andando; además, recién después del `load` y en un hueco libre del navegador |

Si algo de eso no se cumple, el hero muestra un degradado quieto con los
colores de la marca y **no se descarga nada de Three.js**.

Con `prefers-reduced-motion: reduce` no arranca ni Lenis, ni GSAP, ni
Three.js: la página queda quieta y todo se ve igual de completo.

---

## 5. Lighthouse

Medido sobre `npm run preview`, con Lighthouse 12 en modo **mobile**:

| | Resultado | Objetivo |
| --- | --- | --- |
| Performance | **94** | ≥ 85 |
| Accesibilidad | **100** | ≥ 95 |
| Buenas prácticas | 96 | — |
| SEO | **100** | — |

Métricas: FCP 1,6 s · LCP 3,0 s · TBT 20 ms · CLS 0.

Los 96 de buenas prácticas son un solo aviso: el script de Microsoft Clarity
no pudo cargar en el entorno donde se midió (sin salida a `clarity.ms`). En
producción eso no pasa.

**Por qué el 3D quedó solo en escritorio:** medido con Three.js activo en
celular, Performance baja de 94 a **75** (TBT 600 ms), por el peso y el
parseo del chunk. Se decidió dejar la red animada en escritorio y el
degradado quieto en celular.

Para volver a medirlo:

```bash
npm run build
npm run preview &
npx lighthouse http://localhost:4173/ --form-factor=mobile --screenEmulation.mobile \
  --only-categories=performance,accessibility,best-practices,seo --view
```

---

## 6. Nota sobre Netlify

Quedó un sitio viejo en Netlify (`62df5d23…`) que publicaba la carpeta tal
cual, sin build. Con Vite eso ya no alcanza. Si lo querés seguir usando, en
**Site configuration → Build & deploy** hay que poner:

- **Build command:** `npm run build`
- **Publish directory:** `dist`

Si no, lo más limpio es borrar ese sitio y quedarse solo con GitHub Pages.
No lo toqué porque es una decisión tuya.

---

## 7. Lo que falta cargar (contenido real)

Nada de esto está inventado: donde falta contenido real quedó el marcador a
la vista.

- **`[CASO REAL PENDIENTE]`** — tarjeta en la sección "Demos web"
  (`index.html`, bloque `.work-pendiente`). Ahí va el primer caso de un
  cliente real, con captura y qué se resolvió. Hasta que lo tengas, la
  tarjeta avisa que está reservada.
- **Tinta Fundida y Lubit** son demos de muestra, no clientes. La nota
  debajo de la sección ya lo aclara.
- **Meta Pixel** está desactivado: en `index.html` quedó el comentario con el
  lugar donde va el código oficial cuando tengas el ID. Los clics a WhatsApp
  ya mandan el evento `Lead` si el pixel existe.
- **Bot remoto del asistente**: apagado (`USAR_BOT_REMOTO = false` en
  `src/features/asistente.js`). El chat responde con las respuestas que están
  en ese mismo archivo. Se enciende cuando el backend de Railway esté
  actualizado.
- El único dato duro que hay en la página es **15 días de prueba gratis**. No
  hay cifras de clientes, testimonios ni logos.
