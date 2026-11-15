/**
 * Build normal: deja el sitio en dist/.
 * Es lo que usa el workflow de GitHub Actions y lo que sirve `npm run preview`.
 */
import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const raiz = fileURLToPath(new URL("..", import.meta.url));

rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  cwd: raiz,
  stdio: "inherit",
});
