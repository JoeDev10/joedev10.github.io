# QA Report — Joel Dev Landing Page
**Proyecto:** [joel-servicios-web](https://joedev10.github.io/joel-servicios-web/)  
**Fecha:** Mayo 2026  
**Tester:** QA automatizado + revisión manual  
**Versión:** `master` — commit `0a96b97`  
**Herramientas:** Chrome DevTools, IntersectionObserver API, JavaScript DOM inspection, Preview server local (port 3000)

---

## 1. Resumen Ejecutivo

| Métrica | Resultado |
|---|---|
| Casos de prueba ejecutados | 25 |
| ✅ Aprobados | 20 |
| ⚠️ Advertencias (no bloqueantes) | 3 |
| 🔴 Bugs bloqueantes encontrados | 5 |
| 🔴 Bugs bloqueantes corregidos | 5 |
| Estado general | **APROBADO con mejoras menores pendientes** |

---

## 2. Entorno de Pruebas

| Item | Detalle |
|---|---|
| Servidor local | `npx serve` — puerto 3000 |
| Viewport mobile | 375 × 812 px (iPhone SE / standard) |
| Viewport tablet | 768 × 1024 px |
| Viewport desktop | 1280 × 800 px |
| URL producción | https://joedev10.github.io/joel-servicios-web/ |
| Archivos testeados | `index.html`, `styles.css` |

---

## 3. Casos de Prueba

### 3.1 Navegación y Links

| ID | Caso de prueba | Prioridad | Resultado | Notas |
|---|---|---|---|---|
| TC-001 | Links del nav desktop resuelven a secciones existentes | Alta | ✅ PASS | `#servicios`, `#portfolio`, `#precios`, `#contacto` verificados |
| TC-002 | Links del menú mobile resuelven a secciones existentes | Alta | ✅ PASS | Mismas secciones, IDs correctos |
| TC-003 | Menú mobile cierra al hacer click en un link | Alta | ✅ PASS | Event listeners funcionando |
| TC-004 | Link externo Instagram abre en nueva pestaña | Media | ✅ PASS | `target="_blank"` presente |
| TC-005 | Links portfolio (Lubit, Pablo Helados) abren en nueva pestaña | Media | ✅ PASS | `target="_blank"` presente |
| TC-006 | Links externos sin `rel="noopener noreferrer"` | Media | ⚠️ WARN | Ver issue #3 |

### 3.2 WhatsApp CTAs

| ID | Caso de prueba | Prioridad | Resultado | Notas |
|---|---|---|---|---|
| TC-007 | Todos los links de WhatsApp usan el número correcto | Alta | ✅ PASS | 9/9 links con `5491144091981` |
| TC-008 | Cada botón de WhatsApp tiene mensaje contextual diferente | Media | ✅ PASS | Plan Básico, Tienda, A medida, portfolio, hero, etc. |

### 3.3 Interactividad JavaScript

| ID | Caso de prueba | Prioridad | Resultado | Notas |
|---|---|---|---|---|
| TC-009 | FAQ accordion abre al hacer click | Alta | ✅ PASS | `.faq-item` recibe clase `.open` correctamente |
| TC-010 | FAQ accordion cierra al hacer click nuevamente | Alta | ✅ PASS | Toggle funciona en ambas direcciones |
| TC-011 | Hamburger menu abre al hacer click | Alta | ✅ PASS | `.mobileMenu` recibe clase `.open` |
| TC-012 | Hamburger menu cierra al hacer click nuevamente | Alta | ✅ PASS | Toggle funciona en ambas direcciones |
| TC-013 | Scroll reveal anima elementos al entrar en viewport | Media | ✅ PASS | 66 elementos con clase `.reveal` registrados |
| TC-014 | Contador animado se activa al entrar en viewport | Media | ✅ PASS | `48hs`, `15+`, `100%` animados correctamente |
| TC-015 | Sticky WhatsApp bar aparece al salir del hero | Alta | ✅ PASS | IntersectionObserver detecta `.hero-btns` |
| TC-016 | Chat widget abre/cierra correctamente | Media | ✅ PASS | Estado `isOpen` gestionado correctamente |
| TC-017 | Botones sin atributo `type` | Baja | ⚠️ WARN | 9 botones sin `type="button"` — ver issue #1 |

### 3.4 Imágenes y Media

| ID | Caso de prueba | Prioridad | Resultado | Notas |
|---|---|---|---|---|
| TC-018 | Todas las imágenes tienen atributo `alt` descriptivo | Alta | ✅ PASS | 5/5 imágenes con alt text detallado |
| TC-019 | Todas las imágenes del portfolio tienen `loading="lazy"` | Media | ✅ PASS | 5/5 imágenes con lazy loading |
| TC-020 | Ninguna imagen está rota (404) | Alta | ✅ PASS | 0 imágenes rotas |

### 3.5 SEO y Meta Tags

| ID | Caso de prueba | Prioridad | Resultado | Notas |
|---|---|---|---|---|
| TC-021 | `<title>` presente y descriptivo | Alta | ✅ PASS | "Joel Dev — Páginas Web para Emprendedores | Argentina" |
| TC-022 | Meta description presente y actualizada | Alta | ✅ PASS | Alineada con el copy actual del hero |
| TC-023 | Open Graph tags completos | Alta | ✅ PASS | `og:title`, `og:description`, `og:image`, `og:type`, `og:url` |
| TC-024 | Schema.org JSON-LD válido | Media | ✅ PASS | JSON parseable, tipo `ProfessionalService` |
| TC-025 | Jerarquía de encabezados correcta (H1→H2→H3→H4) | Media | ✅ PASS | Sin saltos de nivel, estructura semántica correcta |

---

## 4. Bugs Encontrados y Corregidos

### BUG-001 — Chat button se superpone con sticky bar en mobile
- **Severidad:** 🔴 Alta
- **Estado:** ✅ Corregido en commit `0a96b97`
- **Descripción:** En mobile (≤768px), el botón del chat flotante (`#chat-toggle`) estaba posicionado en `bottom: 24px`, superponiéndose con la sticky WhatsApp bar verde. El texto "Quiero mi página web ahora" quedaba parcialmente tapado.
- **Causa raíz:** El bloque `<style>` inline del widget de chat sobreescribía el media query del archivo externo `styles.css` debido al orden en cascada CSS.
- **Fix aplicado:** Se agregó un media query `@media (max-width: 768px)` dentro del bloque `<style>` inline con `!important` para posicionar correctamente: `#chat-toggle { bottom: 90px }`.

### BUG-002 — Tooltip del chat cubre contenido en mobile
- **Severidad:** 🔴 Alta
- **Estado:** ✅ Corregido en commit `0a96b97`
- **Descripción:** El tooltip "¡Hola! ¿Querés una página web?" aparecía después de 3 segundos y tapaba la sección de dolores y el badge de urgencia en mobile.
- **Fix aplicado:** `display: none !important` en mobile via media query en el inline `<style>`.

### BUG-003 — Footer con año incorrecto
- **Severidad:** 🟡 Media
- **Estado:** ✅ Corregido en commit `0a96b97`
- **Descripción:** El footer mostraba `© 2025` siendo que el año actual es 2026.
- **Fix aplicado:** Cambio directo en `index.html`.

### BUG-004 — Meta description desactualizada
- **Severidad:** 🟡 Media
- **Estado:** ✅ Corregido en commit `0a96b97`
- **Descripción:** La meta description decía "Tu negocio online sin complicaciones..." correspondiente al H1 anterior. Tras actualizar el copy del hero, la meta description quedó desincronizada.
- **Fix aplicado:** Actualizada a "Tu negocio vende solo, incluso cuando no estás. Páginas web profesionales para emprendedores en Argentina…"

### BUG-005 — Falta og:image para previsualizaciones en redes
- **Severidad:** 🟡 Media
- **Estado:** ✅ Corregido en commit `0a96b97`
- **Descripción:** Ausencia del meta tag `og:image`. Al compartir el link en WhatsApp o Instagram, no se generaba ninguna imagen de previsualización.
- **Fix aplicado:** Se agregó `<meta property="og:image" content="https://joedev10.github.io/joel-servicios-web/img/mockup-lubit.png" />`.

---

## 5. Advertencias Pendientes (no bloqueantes)

### WARN-001 — Botones sin atributo `type`
- **Severidad:** 🟡 Baja
- **Elementos afectados:** `#hamburger`, 6x `.faq-pregunta`, `#chat-toggle`, `#send-btn` (9 total)
- **Impacto:** Según la especificación HTML5, `<button>` sin `type` se asume como `type="submit"`. Dentro de un `<form>`, esto podría causar envíos no deseados. En este caso no hay formularios, por lo que el impacto funcional es nulo, pero es mala práctica y puede causar comportamientos inesperados en ciertos navegadores.
- **Recomendación:** Agregar `type="button"` a todos los botones no-submit.

### WARN-002 — Links externos sin `rel="noopener noreferrer"`
- **Severidad:** 🟡 Baja  
- **Elementos afectados:** Todos los `<a target="_blank">` (Instagram, Lubit, Pablo Helados, WhatsApp links)
- **Impacto:** Sin `rel="noopener"`, la página destino puede acceder a `window.opener` y redirigir la página original (tab-napping attack). Riesgo bajo dado que los destinos son sitios conocidos.
- **Recomendación:** Agregar `rel="noopener noreferrer"` a todos los links con `target="_blank"`.

### WARN-003 — Portfolio inconsistente: primeros 3 items sin link "Ver sitio"
- **Severidad:** 🟢 Baja
- **Descripción:** Los items de Lubit y Pablo Helados tienen botón "Ver sitio →" en el overlay, pero los primeros 3 items (Viejo Karma, Black Edge, Dulce Origen) no lo tienen.
- **Recomendación:** Agregar links a los 3 proyectos anteriores si existen URLs, o eliminar los links de los nuevos para consistencia visual.

---

## 6. Métricas Generales

### Performance DOM
| Métrica | Valor | Benchmark |
|---|---|---|
| Total nodos DOM | 386 | ✅ < 1.500 (recomendado) |
| Archivos CSS externos | 1 | ✅ Óptimo |
| Bloques `<script>` | 2 | ✅ Aceptable |
| Bloques `<style>` inline | 1 | ⚠️ Mejor en externo |
| Links WhatsApp correctos | 9/9 | ✅ 100% |
| Imágenes rotas | 0/5 | ✅ 100% |
| Imágenes con lazy load | 5/5 | ✅ 100% |
| Imágenes con alt text | 5/5 | ✅ 100% |

### Reducción de peso de imágenes (sesión actual)
| Imagen | Antes | Después | Ahorro |
|---|---|---|---|
| Captura (148) — Viejo Karma | 483 KB | 277 KB | −43% |
| Captura (152) — Black Edge | 358 KB | 174 KB | −51% |
| Captura (154) — Dulce Origen | 367 KB | 225 KB | −39% |
| mockup-lubit.png | 347 KB | 211 KB | −39% |
| mockup-heladeria.png | 49 KB | 37 KB | −24% |
| **Total** | **1.604 KB** | **924 KB** | **−42%** |

### SEO Checklist
| Item | Estado |
|---|---|
| `<title>` descriptivo | ✅ |
| Meta description | ✅ |
| Meta viewport | ✅ |
| Canonical URL | ✅ |
| `lang` en html | ✅ |
| og:title | ✅ |
| og:description | ✅ |
| og:image | ✅ |
| og:type | ✅ |
| twitter:card | ✅ |
| Schema.org JSON-LD | ✅ |
| Jerarquía H1→H2→H3 | ✅ |
| Alt text en imágenes | ✅ |
| Google site verification | ✅ |

---

## 7. Accesibilidad

| Criterio | Estado | Notas |
|---|---|---|
| Alt text en imágenes | ✅ | Todos descriptivos y contextuales |
| `aria-label` en hamburger | ✅ | "Abrir menú" |
| `type` en botones | ⚠️ | Faltante en 9 botones |
| Contraste de colores | ⚠️ | No testeado con herramienta WCAG (requiere browser extension) |
| Navegación por teclado | ⚠️ | No testeado manualmente |
| Skip navigation link | ❌ | No implementado |

---

## 8. Responsive Design

| Viewport | Resolución | Estado | Observaciones |
|---|---|---|---|
| Mobile S | 375 × 812 | ✅ | H1 fluid con `clamp()`, grilla 1 col, sticky bar visible |
| Tablet | 768 × 1024 | ✅ | Nav visible, grilla 2 cols, sticky bar oculta |
| Desktop | 1280 × 800 | ✅ | Layout completo, nav horizontal, sin sticky bar |

---

## 9. Recomendaciones Futuras

1. **Agregar `type="button"` a todos los botones** (WARN-001)
2. **Agregar `rel="noopener noreferrer"` a links externos** (WARN-002)
3. **Agregar links "Ver sitio" a los 3 primeros proyectos del portfolio** (WARN-003)
4. **Mover el bloque `<style>` inline del chat widget al archivo `styles.css`** — mejor mantenibilidad
5. **Agregar un `skip navigation link`** — mejora accesibilidad para usuarios de lectores de pantalla
6. **Testear contraste de colores con WCAG Contrast Checker** — verificar ratio mínimo 4.5:1
7. **Agregar `og:image:width` y `og:image:height`** para optimizar previsualización en redes sociales
8. **Implementar un `sitemap.xml` dinámico** si el sitio escala a múltiples páginas
9. **Considerar convertir imágenes a formato WebP** para mayor ahorro de peso (~25-30% adicional vs PNG comprimido)

---

*Reporte generado con revisión automática via JavaScript DOM inspection y revisión manual de código.*
