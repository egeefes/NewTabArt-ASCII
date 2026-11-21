// Builds the standalone web page: one self-contained HTML file (code, styles, fonts and favicon
// inlined) with just the animals, the picker and Tweaks. Output: dist-web/index.html.
import { build } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { copyFileSync } from "node:fs";

await build({
  root: "web",
  base: "./",
  publicDir: false,
  logLevel: "warn",
  build: { outDir: "../dist-web", emptyOutDir: true, assetsInlineLimit: Infinity },
  plugins: [
    // The page has no logo, so don't pack the logo image the shared stylesheet points at.
    {
      name: "drop-logo",
      transform(code, id) {
        if (id.endsWith("/page.css")) return code.replace(/url\(\.\/public\/dia-logo\.png\)/g, "none");
      },
    },
    viteSingleFile(),
  ],
});
copyFileSync("LICENSE", "dist-web/LICENSE");
console.log("Built dist-web/index.html");
