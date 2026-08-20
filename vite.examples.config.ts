import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(root, "../glyph-matter-examples");

async function flattenExamplePages(): Promise<void> {
  const nested = join(outDir, "examples");
  const names = await readdir(nested).catch(() => [] as string[]);
  for (const name of names) {
    if (!name.endsWith(".html") || name === "index.html") continue;
    const html = (await readFile(join(nested, name), "utf8"))
      .replaceAll("../assets/", "./assets/")
      .replaceAll('src="../', 'src="./')
      .replaceAll('href="../', 'href="./');
    await writeFile(join(outDir, name), html);
  }
  await rm(nested, { recursive: true, force: true });
}

export default defineConfig({
  root,
  base: "./",
  publicDir: "public",
  plugins: [
    {
      name: "flatten-and-readme",
      async closeBundle() {
        await flattenExamplePages();
        await mkdir(outDir, { recursive: true });
        await writeFile(
          resolve(outDir, "README.md"),
          [
            "# glyph-matter examples",
            "",
            "Workbench plus sketches for [miltonlaufer.com.ar/glyph-matter-examples](https://www.miltonlaufer.com.ar/glyph-matter-examples).",
            "",
            "Rebuild from the library repo:",
            "",
            "```bash",
            "cd ../glyph-matter",
            "npm run build:examples",
            "```",
            "",
          ].join("\n"),
        );
      },
    },
  ],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        field: resolve(root, "examples/field.html"),
        morph: resolve(root, "examples/morph.html"),
        "in-between": resolve(root, "examples/in-between.html"),
        attract: resolve(root, "examples/attract.html"),
        wind: resolve(root, "examples/wind.html"),
        vortex: resolve(root, "examples/vortex.html"),
        sequence: resolve(root, "examples/sequence.html"),
        image: resolve(root, "examples/image.html"),
        webcam: resolve(root, "examples/webcam.html"),
        audio: resolve(root, "examples/audio.html"),
        "audio-bands": resolve(root, "examples/audio-bands.html"),
        "audio-beats": resolve(root, "examples/audio-beats.html"),
      },
    },
  },
});
