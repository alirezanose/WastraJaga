import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourceDir = path.resolve(
  __dirname,
  "../node_modules/@mediapipe/tasks-vision/wasm"
);
const destDir = path.resolve(__dirname, "../public/mediapipe");

if (!fs.existsSync(sourceDir)) {
  console.warn(
    "[mediapipe-copy] Folder wasm source tidak ditemukan di node_modules. Lewati."
  );
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });

const files = fs.readdirSync(sourceDir);
for (const file of files) {
  if (file.endsWith(".wasm") || file.endsWith(".js")) {
    const src = path.join(sourceDir, file);
    const dest = path.join(destDir, file);
    fs.copyFileSync(src, dest);
  }
}

console.log(`[mediapipe-copy] Berhasil menyalin aset wasm ke ${destDir}`);
