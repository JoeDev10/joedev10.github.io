/**
 * Construye el sitio SOBRE LA RAÍZ del repo.
 *
 * Hace falta porque GitHub Pages está en "Deploy from a branch" y publica la
 * raíz de master tal cual. Después de correr esto hay que commitear lo que
 * cambió (index.html, assets/, img/, demo-stock/, robots.txt, sitemap.xml).
 *
 * Cuando Pages pase a "GitHub Actions", este script y la copia de la raíz
 * se pueden borrar: alcanza con el workflow publicando dist/.
 */
import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));

// Los nombres de los assets llevan hash: si no se limpia, se van juntando
// los viejos en cada build.
rmSync(new URL("../assets", import.meta.url), { recursive: true, force: true });

execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build", "--outDir", ".."], {
  cwd: raiz,
  stdio: "inherit",
});
