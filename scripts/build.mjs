// Builds the extension for one browser: `node scripts/build.mjs chrome` (Dia, Chrome, Edge, Arc…)
// or `node scripts/build.mjs firefox`. Output goes to dist-<target>/.
import { execSync } from "node:child_process";
import { copyFileSync } from "node:fs";

const target = process.argv[2] ?? "chrome";
if (!["chrome", "firefox"].includes(target)) throw new Error(`Unknown target "${target}" (use chrome or firefox)`);
const out = `dist-${target}`;

execSync(`npx vite build --base=./ --outDir ${out} --emptyOutDir`, { stdio: "inherit" });
for (const f of ["LICENSE", "README.md"]) copyFileSync(f, `${out}/${f}`);

if (target === "firefox") {
  // Firefox lets extensions replace the new tab directly, so it gets its own background script instead
  // of Dia's redirect: one that moves the cursor from the address bar into the page.
  copyFileSync("firefox/manifest.json", `${out}/manifest.json`);
  copyFileSync("firefox/background.js", `${out}/background.js`);
}
console.log(`Built ${out}/`);
