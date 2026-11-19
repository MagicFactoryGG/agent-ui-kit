// Colour maths for the intake: parse any CSS colour a browser or a stylesheet gives, compare in OKLab,
// check WCAG contrast, and derive a missing light or dark value. No dependencies.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}
function oklabToRgb(L, a, b) {
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map(v => clamp(gam(v)));
}
export function rgbToOklab([r, g, b]) {
  [r, g, b] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// CIE Lab (D50) → sRGB, for Chromium's lab() output.
function labToRgb(L, A, B) {
  const fy = (L + 16) / 116, fx = fy + A / 500, fz = fy - B / 200;
  const e = 216 / 24389, k = 24389 / 27;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k, yr = L > k * e ? fy ** 3 : L / k, zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const [X, Y, Z] = [xr * 0.96422, yr, zr * 0.82521];
  // D50 → D65 (Bradford) then XYZ → linear sRGB
  const x = 0.9554734527 * X - 0.0230985368 * Y + 0.0632593086 * Z;
  const y = -0.0283697093 * X + 1.0099954580 * Y + 0.0210413990 * Z;
  const z = 0.0123140016 * X - 0.0205076964 * Y + 1.3303659366 * Z;
  return [3.2409699 * x - 1.5373832 * y - 0.4986108 * z, -0.9692436 * x + 1.8759675 * y + 0.0415551 * z, 0.0556301 * x - 0.2039770 * y + 1.0569715 * z].map(v => clamp(gam(v)));
}
const num = (s, pct = 1) => (s.endsWith("%") ? parseFloat(s) / 100 * pct : parseFloat(s));

/** Returns { rgb:[0..1]x3, alpha } or null. Accepts hex, rgb(a), hsl(a), bare "H S% L%", oklch, oklab, lab, color(srgb). */
export function parse(input) {
  if (input == null) return null;
  let s = String(input).trim().toLowerCase();
  if (s === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  if (s === "black") return { rgb: [0, 0, 0], alpha: 1 };
  if (s === "white") return { rgb: [1, 1, 1], alpha: 1 };
  let m;
  if ((m = s.match(/^#([0-9a-f]{3,8})$/))) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map(c => c + c).join("");
    const v = [0, 2, 4, 6].map(i => (h.length > i ? parseInt(h.slice(i, i + 2), 16) / 255 : 1));
    return { rgb: v.slice(0, 3), alpha: v[3] };
  }
  if (/^[\d.]+(deg)?\s+[\d.]+%\s+[\d.]+%(\s*\/\s*[\d.]+%?)?$/.test(s)) s = `hsl(${s})`; // shadcn bare HSL
  if ((m = s.match(/^([a-z]+)\((.*)\)$/))) {
    const fn = m[1];
    const [main, alphaPart] = m[2].replace(/,/g, " ").split("/");
    const p = main.trim().split(/\s+/);
    let alpha = alphaPart ? num(alphaPart.trim()) : p.length === 4 ? num(p[3]) : 1;
    if (fn === "rgb" || fn === "rgba") return { rgb: p.slice(0, 3).map(x => num(x, 255) / 255), alpha };
    if (fn === "hsl" || fn === "hsla") return { rgb: hslToRgb(parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2])), alpha };
    if (fn === "oklch") { const L = num(p[0]), C = num(p[1], 0.4), H = (parseFloat(p[2]) || 0) * Math.PI / 180; return { rgb: oklabToRgb(L, C * Math.cos(H), C * Math.sin(H)), alpha }; }
    if (fn === "oklab") return { rgb: oklabToRgb(num(p[0]), num(p[1], 0.4), num(p[2], 0.4)), alpha };
    if (fn === "lab") return { rgb: labToRgb(num(p[0], 100), parseFloat(p[1]), parseFloat(p[2])), alpha };
    if (fn === "color" && p[0] === "srgb") return { rgb: p.slice(1, 4).map(Number), alpha };
  }
  return null;
}
export const hex = c => "#" + c.rgb.map(v => Math.round(clamp(v) * 255).toString(16).padStart(2, "0")).join("") + (c.alpha < 1 ? Math.round(c.alpha * 255).toString(16).padStart(2, "0") : "");
export const toHex = s => { const c = parse(s); return c ? hex(c) : null; };
export function deltaE(a, b) {
  const A = rgbToOklab(parse(a).rgb), B = rgbToOklab(parse(b).rgb);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}
const lum = rgb => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export function contrast(a, b) {
  const x = lum(parse(a).rgb), y = lum(parse(b).rgb);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function oklch(s) {
  const [L, a, b] = rgbToOklab(parse(s).rgb);
  return { L, C: Math.hypot(a, b), H: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}
export function fromOklch(L, C, H) {
  const h = (H * Math.PI) / 180;
  return hex({ rgb: oklabToRgb(L, C * Math.cos(h), C * Math.sin(h)), alpha: 1 });
}
/** Blend a colour with alpha over a solid base (for translucent fills). */
export function over(top, base) {
  const t = parse(top), b = parse(base);
  return hex({ rgb: t.rgb.map((v, i) => v * t.alpha + b.rgb[i] * (1 - t.alpha)), alpha: 1 });
}

/**
 * Derive the missing scheme's value : keep the hue and chroma, mirror the lightness,
 * then, for a text role, move the lightness until contrast with its surface is at least 4.5:1.
 * role: "surface" | "text" | "accent"; against: the derived surface the text sits on (hex).
 */
export function deriveOther(value, { role, against } = {}) {
  const { L, C, H } = oklch(value);
  let L2 = clamp(1 - L + (role === "accent" ? 0.1 : 0), 0, 1);
  if (role === "surface") L2 = L > 0.5 ? clamp(0.18 - (L - 0.9), 0, 0.25) : clamp(0.98 - L * 0.3, 0.85, 1);
  let out = fromOklch(L2, C, H);
  if (role === "text" && against) {
    const dir = oklch(against).L < 0.5 ? 1 : -1;
    for (let i = 0; i < 100 && contrast(out, against) < 4.5; i++) { L2 = clamp(L2 + dir * 0.01); out = fromOklch(L2, C, H); }
  }
  return out;
}
