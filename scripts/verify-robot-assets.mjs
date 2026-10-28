// Proves every WebP is visually identical to its PNG source: all pixels with
// alpha > 0 must match exactly (RGBA). Fully transparent pixels are invisible.
import { readdirSync } from "node:fs";
import sharp from "sharp";

const dir = new URL("../public/robot/", import.meta.url).pathname;
let bad = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
  const a = await sharp(dir + f).ensureAlpha().raw().toBuffer();
  const b = await sharp(dir + f.replace(/\.png$/, ".webp")).ensureAlpha().raw().toBuffer();
  let diff = a.length !== b.length;
  for (let i = 0; !diff && i < a.length; i += 4) {
    if (a[i + 3] === 0 && b[i + 3] === 0) continue;
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) diff = true;
  }
  if (diff) {
    bad++;
    console.error("MISMATCH", f);
  }
}
console.log(bad ? `${bad} mismatching files` : "all WebP files are visually identical to their PNGs");
process.exit(bad ? 1 : 0);
