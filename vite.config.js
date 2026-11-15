import { defineConfig } from "vite";

/**
 * MJR Digital — configuración de Vite.
 *
 * El código fuente vive en app/ y el sitio YA CONSTRUIDO se versiona en la
 * raíz del repo. Eso es a propósito: GitHub Pages está configurado como
 * "Deploy from a branch" y publica la raíz de master tal cual, sin pasar por
 * el workflow. Si en la raíz estuvieran las fuentes, el sitio se publicaría
 * roto (fue lo que pasó al mergear el rediseño por primera vez).
 *
 * Mientras siga así, cada cambio en el sitio necesita `npm run publicar` y
 * commitear el resultado. Cuando Pages pase a "GitHub Actions" se puede
 * volver a publicar solo dist/ y borrar la copia de la raíz.
 * Todo explicado en docs/DESPLIEGUE.md.
 *
 * Lo que queda FUERA de lo publicado: app/ (las fuentes), tools/ (los .py y
 * .bat de prospección), docs/ y scripts/. Esa lista vive en _config.yml.
 */
export default defineConfig({
  root: "app",
  base: "/",
  publicDir: "public",
  build: {
    outDir: "../dist",
    // Nunca poner esto en true: `npm run publicar` construye sobre la raíz
    // del repo, y vaciarla borraría el proyecto entero. Cada script limpia
    // su propia carpeta antes de construir.
    emptyOutDir: false,
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
