import { defineConfig } from "vite";

/**
 * MJR Digital — configuración de Vite.
 *
 * La web se publica en https://joedev10.github.io/ (dominio raíz del usuario),
 * por eso `base` es "/".
 *
 * Todo lo que va a producción tal cual (imágenes, la demo de stock, sitemap y
 * robots) vive en public/ y se copia sin tocar: la demo sigue saliendo en
 * /demo-stock/.
 *
 * Lo que queda FUERA del build a propósito: tools/ (los .py y .bat de
 * prospección, que hoy se publicaban por error) y docs/ (notas internas).
 */
export default defineConfig({
  base: "/",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    assetsDir: "assets",
    cssTarget: "chrome90",
  },
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
  },
});
