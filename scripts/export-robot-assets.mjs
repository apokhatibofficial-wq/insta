// Copies the owner's robot layers into public/robot and adds a *lossless*
// WebP next to each PNG (pixel-identical; the artwork is never altered).
import { copyFileSync, readdirSync } from "node:fs";
import sharp from "sharp";

const src = new URL("../design_handoff_khatib_platform/designs/assets/", import.meta.url).pathname;
const dst = new URL("../public/robot/", import.meta.url).pathname;
for (const f of readdirSync(src).filter((f) => f.endsWith(".png"))) {
  copyFileSync(src + f, dst + f);
  await sharp(src + f).webp({ lossless: true, exact: true, effort: 6 }).toFile(dst + f.replace(/\.png$/, ".webp"));
}
