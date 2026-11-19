// Samples the colours of screenshots (web or native) in a headless browser canvas: no image library needed.
// Returns, per file, the top colours by share (quantised to 4 bits per channel, then reported as the mean
// of the real pixels in each bin) and the canvas colour (the colour of the outer 2% frame).
import { readFileSync } from "node:fs";

export async function samplePixels(browser, files, { top = 12 } = {}) {
  const page = await browser.newPage();
  const out = {};
  for (const f of files) {
    const b64 = readFileSync(f).toString("base64");
    out[f] = await page.evaluate(async ({ b64, top }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = new OffscreenCanvas(img.width, img.height), x = c.getContext("2d");
      x.drawImage(img, 0, 0);
      const { data, width, height } = x.getImageData(0, 0, img.width, img.height);
      const bins = new Map(), frame = new Map();
      const fw = Math.max(2, Math.round(width * 0.02)), fh = Math.max(2, Math.round(height * 0.02));
      for (let y = 0; y < height; y += 2) for (let i = 0; i < width; i += 2) {
        const o = (y * width + i) * 4, r = data[o], g = data[o + 1], b = data[o + 2];
        const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const e = bins.get(k) ?? [0, 0, 0, 0]; e[0] += r; e[1] += g; e[2] += b; e[3]++; bins.set(k, e);
        if (y < fh || y > height - fh || i < fw || i > width - fw) { const f = frame.get(k) ?? [0, 0, 0, 0]; f[0] += r; f[1] += g; f[2] += b; f[3]++; frame.set(k, f); }
      }
      const toHex = e => "#" + [0, 1, 2].map(j => Math.round(e[j] / e[3]).toString(16).padStart(2, "0")).join("");
      const total = [...bins.values()].reduce((s, e) => s + e[3], 0);
      const colours = [...bins.values()].sort((a, b) => b[3] - a[3]).slice(0, top).map(e => ({ hex: toHex(e), share: +(e[3] / total).toFixed(4) }));
      const canvas = toHex([...frame.values()].sort((a, b) => b[3] - a[3])[0]);
      return { width, height, canvas, colours };
    }, { b64, top });
  }
  await page.close();
  return out;
}
