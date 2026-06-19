import esbuild from "esbuild";
import process from "node:process";
import builtins from "builtin-modules";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const prod = process.argv.includes("production");
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here);

mkdirSync(outDir, { recursive: true });

await esbuild.build({
  banner: {
    js: "/* Checklist Flow for Obsidian */",
  },
  bundle: true,
  entryPoints: [resolve(here, "src/main.ts")],
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  logLevel: "info",
  minify: prod,
  outfile: resolve(outDir, "main.js"),
  platform: "browser",
  sourcemap: prod ? false : "inline",
  target: "es2022",
  treeShaking: true,
});

copyFileSync(resolve(here, "manifest.json"), resolve(outDir, "manifest.json"));
copyFileSync(resolve(here, "styles.css"), resolve(outDir, "styles.css"));
