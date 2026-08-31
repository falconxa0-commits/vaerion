/**
 * Vaerion brand renderer — the single source of geometric truth for the
 * brand system. Every logo asset (SVG + PNG) is DETERMINISTICALLY GENERATED
 * from the tokens and geometry below: run it twice, get identical bytes —
 * the same reproducibility law the engine applies to .vxn bundles.
 *
 *   bun run tools/brand-render.ts          # regenerate every brand artifact
 *
 * Outputs:
 *   brand/logo/*.svg      vector masters (seal, monogram, wordmark, lockups, editions)
 *   brand/png/*.png       raster editions (sharp, deterministic)
 *   brand/terminal.ascii.txt  the canonical terminal mark
 *   public/favicon.svg + public/icon-192.png + public/icon-512.png
 *   public/apple-touch-icon.png + public/og-image.png
 *
 * Design tokens live here and are mirrored (by hand, deliberately) in:
 *   packages/vaerion/src/cli/ui.ts        (terminal theme)
 *   brand/BRAND-BOOK.md                   (the written system)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dir, "..");

/* ─────────────────────────────  design tokens  ───────────────────────────── */

export const TOKENS = {
  ink: "#17171B", // primary surface / black-edition foreground
  inkSoft: "#232329", // raised surface
  porcelain: "#FAF9F6", // white-edition surface
  gold: "#C9A227", // the Vaerion gold — the only accent
  goldBright: "#E3B341", // gold on dark, small sizes
  graphite: "#55555E", // secondary text
  mist: "#9C9CA6", // muted text
  line: "#2A2A31", // hairlines on ink
  terminal: {
    success: "#3F9B6E",
    warn: "#C98A1F",
    error: "#C24E4E",
    info: "#6B8FA3",
    dim: "#8A8A93",
  },
} as const;

/* ─────────────────────────────  geometry (512 grid)  ─────────────────────── */
/* The Seal: a rounded square; inside, the Witness Rule above the V.
 * The rule is the line of evidence; the V is verification descending to a
 * single point. Two elements, one statement: measured, then verified.     */

const SEAL = {
  size: 512,
  box: { x: 40, y: 40, w: 432, h: 432, rx: 104 },
  rule: { x1: 150, x2: 362, y: 140, w: 18 },
  vee: { left: 150, right: 362, top: 196, apex: 376, cx: 256, w: 40 },
} as const;

function sealSvg(opts: { container: "fill" | "none"; mark: string; containerFill: string; bg?: string }): string {
  const { box, rule, vee } = SEAL;
  const veePath = `M${vee.left},${vee.top} L${vee.cx},${vee.apex} L${vee.right},${vee.top}`;
  const container =
    opts.container === "fill"
      ? `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.rx}" fill="${opts.containerFill}"/>`
      : `<rect x="${box.x + 12}" y="${box.y + 12}" width="${box.w - 24}" height="${box.h - 24}" rx="${box.rx - 12}" fill="none" stroke="${opts.containerFill}" stroke-width="24"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SEAL.size} ${SEAL.size}" role="img" aria-label="Vaerion seal">
  ${opts.bg ? `<rect width="${SEAL.size}" height="${SEAL.size}" fill="${opts.bg}"/>` : ""}
  ${container}
  <line x1="${rule.x1}" y1="${rule.y}" x2="${rule.x2}" y2="${rule.y}" stroke="${opts.mark}" stroke-width="${rule.w}" stroke-linecap="butt"/>
  <path d="${veePath}" fill="none" stroke="${opts.mark}" stroke-width="${vee.w}" stroke-linecap="butt" stroke-linejoin="miter"/>
</svg>
`;
}

/* ─────────────────────────────  monogram (bare mark)  ────────────────────── */

function monogramSvg(color: string): string {
  const { rule, vee } = SEAL;
  const veePath = `M${vee.left},${vee.top} L${vee.cx},${vee.apex} L${vee.right},${vee.top}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="120 96 272 334" role="img" aria-label="Vaerion monogram">
  <line x1="${rule.x1}" y1="${rule.y}" x2="${rule.x2}" y2="${rule.y}" stroke="${color}" stroke-width="${rule.w}" stroke-linecap="butt"/>
  <path d="${veePath}" fill="none" stroke="${color}" stroke-width="${vee.w}" stroke-linecap="butt" stroke-linejoin="miter"/>
</svg>
`;
}

/* ─────────────────────────────  wordmark (custom monoline caps)  ─────────── */
/* VAERION drawn as geometric monoline capitals — no font dependency, no
 * reflow: every renderer draws the same letterforms. Stroke rhythm matches
 * the seal (one width everywhere).                                        */

interface LetterDef { w: number; d: string[]; ellipses?: Array<{ cx: number; cy: number; rx: number; ry: number }> }

const STROKE = 22;
const CAP_TOP = 20;
const BASE = 180;
const MID = 100;

const LETTERS: Record<string, LetterDef> = {
  V: { w: 150, d: [`M0,${CAP_TOP} L75,${BASE} L150,${CAP_TOP}`] },
  A: { w: 150, d: [`M0,${BASE} L75,${CAP_TOP} L150,${BASE}`, `M29,118 L121,118`] },
  E: { w: 120, d: [`M120,${CAP_TOP} L0,${CAP_TOP}`, `M0,${CAP_TOP} L0,${BASE}`, `M0,${BASE} L120,${BASE}`, `M0,${MID} L96,${MID}`] },
  R: {
    w: 140,
    d: [
      `M0,${CAP_TOP} L0,${BASE}`,
      `M0,${CAP_TOP} L70,${CAP_TOP}`,
      `M0,${MID} L70,${MID}`,
      `M70,${CAP_TOP} A40,40 0 0 1 70,${MID}`,
      `M74,${MID} L134,${BASE}`,
    ],
  },
  I: { w: 22, d: [`M0,${CAP_TOP} L0,${BASE}`] },
  O: { w: 170, d: [], ellipses: [{ cx: 85, cy: (CAP_TOP + BASE) / 2, rx: 74, ry: 80 }] },
  N: { w: 150, d: [`M0,${BASE} L0,${CAP_TOP}`, `M0,${CAP_TOP} L150,${BASE}`, `M150,${BASE} L150,${CAP_TOP}`] },
};

const WORD = "VAERION";
const TRACK = 62; // letter spacing

function wordmarkSvg(color: string): { svg: string; width: number; pad: number } {
  const parts: string[] = [];
  let x = 0;
  for (const ch of WORD) {
    const L = LETTERS[ch]!;
    for (const d of L.d) parts.push(`  <path d="${d}" transform="translate(${x},0)"/>`);
    for (const e of L.ellipses ?? []) parts.push(`  <ellipse cx="${x + e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}"/>`);
    x += L.w + TRACK;
  }
  const width = x - TRACK;
  const pad = STROKE; // one full stroke width of clearspace around the ink
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} 0 ${width + 2 * pad} 200" role="img" aria-label="Vaerion">
<g fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="butt" stroke-linejoin="miter">
${parts.join("\n")}
</g>
</svg>
`;
  return { svg, width, pad };
}

/* ─────────────────────────────  lockup (seal + wordmark)  ────────────────── */

function lockupSvg(sealFill: string, mark: string, bg?: string): string {
  const { width, pad } = wordmarkSvg(mark);
  const gap = 64;
  const capBand = 150; // cap band [20,180] rendered 150 high, optically centered against the 200 seal
  const s = capBand / 160;
  const ty = 25 - 20 * s;
  const total = 200 + gap + (width + 2 * pad) * s;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 200" role="img" aria-label="Vaerion">
  ${bg ? `<rect width="${total}" height="200" fill="${bg}"/>` : ""}
  <g transform="scale(${200 / SEAL.size})">
    <rect x="${SEAL.box.x}" y="${SEAL.box.y}" width="${SEAL.box.w}" height="${SEAL.box.h}" rx="${SEAL.box.rx}" fill="${sealFill}"/>
    <line x1="${SEAL.rule.x1}" y1="${SEAL.rule.y}" x2="${SEAL.rule.x2}" y2="${SEAL.rule.y}" stroke="${mark}" stroke-width="${SEAL.rule.w}"/>
    <path d="M${SEAL.vee.left},${SEAL.vee.top} L${SEAL.vee.cx},${SEAL.vee.apex} L${SEAL.vee.right},${SEAL.vee.top}" fill="none" stroke="${mark}" stroke-width="${SEAL.vee.w}" stroke-linejoin="miter"/>
  </g>
  <g transform="translate(${200 + gap + pad * s},${ty}) scale(${s})">
    <g fill="none" stroke="${mark}" stroke-width="${STROKE}" stroke-linecap="butt" stroke-linejoin="miter">
      ${wordmarkInner()}
    </g>
  </g>
</svg>
`;
  return svg;
}

function wordmarkInner(): string {
  const parts: string[] = [];
  let x = 0;
  for (const ch of WORD) {
    const L = LETTERS[ch]!;
    for (const d of L.d) parts.push(`<path d="${d}" transform="translate(${x},0)"/>`);
    for (const e of L.ellipses ?? []) parts.push(`<ellipse cx="${x + e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}"/>`);
    x += L.w + TRACK;
  }
  return parts.join("\n      ");
}

/* ─────────────────────────────  terminal mark  ───────────────────────────── */

const TERMINAL_ASCII = `────────────
 ╲        ╱
  ╲      ╱
   ╲    ╱
    ╲  ╱
     ╲╱
────────────
`;

/* ─────────────────────────────  OG image  ────────────────────────────────── */

function ogSvg(): string {
  const t = TOKENS;
  const wm = wordmarkSvg(t.porcelain);
  const wmWidth = 620;
  const s = wmWidth / wm.width;
  const capBandH = 160 * s;
  const wmX = 84;
  const wmTop = 316; // cap-band top (not box top): cap top = wmTop
  const ty = wmTop - 20 * s;
  const tagY = wmTop + capBandH + 58;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${t.ink}"/>
  <rect x="0" y="614" width="1200" height="16" fill="${t.gold}"/>
  <g transform="translate(96,72) scale(${160 / 512})">
    <rect x="${SEAL.box.x}" y="${SEAL.box.y}" width="${SEAL.box.w}" height="${SEAL.box.h}" rx="${SEAL.box.rx}" fill="${t.inkSoft}"/>
    <line x1="${SEAL.rule.x1}" y1="${SEAL.rule.y}" x2="${SEAL.rule.x2}" y2="${SEAL.rule.y}" stroke="${t.gold}" stroke-width="${SEAL.rule.w}"/>
    <path d="M${SEAL.vee.left},${SEAL.vee.top} L${SEAL.vee.cx},${SEAL.vee.apex} L${SEAL.vee.right},${SEAL.vee.top}" fill="none" stroke="${t.gold}" stroke-width="${SEAL.vee.w}" stroke-linejoin="miter"/>
  </g>
  <g transform="translate(${wmX},${ty}) scale(${s})">
    <g fill="none" stroke="${t.porcelain}" stroke-width="${STROKE}" stroke-linecap="butt" stroke-linejoin="miter">
      ${wordmarkInner()}
    </g>
  </g>
  <text x="${wmX + 2}" y="${tagY}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="28" letter-spacing="1.5" fill="${t.mist}">local-first · deterministic · auditable by construction</text>
  <text x="${wmX + 2}" y="${tagY + 64}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="26" fill="${t.gold}">$ vae run demo</text>
</svg>
`;
}

/* ─────────────────────────────  emit everything  ─────────────────────────── */

const t = TOKENS;

const artifacts: Array<{ path: string; svg: string; png?: Array<{ width: number; name: string }> }> = [
  // Primary seal (porcelain-mark on ink container, transparent bg)
  { path: "brand/logo/vaerion-icon.svg", svg: sealSvg({ container: "fill", mark: t.porcelain, containerFill: t.ink }) },
  // Gold edition — gold mark on ink
  { path: "brand/logo/editions/gold.svg", svg: sealSvg({ container: "fill", mark: t.goldBright, containerFill: t.ink }), png: [{ width: 1024, name: "seal-gold-1024.png" }] },
  // White edition — porcelain mark on ink
  { path: "brand/logo/editions/white.svg", svg: sealSvg({ container: "fill", mark: t.porcelain, containerFill: t.ink }), png: [{ width: 1024, name: "seal-white-1024.png" }] },
  // Black edition — ink mark on porcelain
  { path: "brand/logo/editions/black.svg", svg: sealSvg({ container: "fill", mark: t.ink, containerFill: t.porcelain }), png: [{ width: 1024, name: "seal-black-1024.png" }] },
  // Monochrome edition — single-color, follows context (currentColor)
  {
    path: "brand/logo/editions/mono.svg",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Vaerion seal (monochrome)">
  <rect x="52" y="52" width="408" height="408" rx="92" fill="none" stroke="currentColor" stroke-width="24"/>
  <line x1="${SEAL.rule.x1}" y1="${SEAL.rule.y}" x2="${SEAL.rule.x2}" y2="${SEAL.rule.y}" stroke="currentColor" stroke-width="${SEAL.rule.w}"/>
  <path d="M${SEAL.vee.left},${SEAL.vee.top} L${SEAL.vee.cx},${SEAL.vee.apex} L${SEAL.vee.right},${SEAL.vee.top}" fill="none" stroke="currentColor" stroke-width="${SEAL.vee.w}" stroke-linejoin="miter"/>
</svg>
`,
  },
  // Monogram
  { path: "brand/logo/vaerion-monogram.svg", svg: monogramSvg(t.gold) },
  // Wordmark (ink for light surfaces)
  { path: "brand/logo/vaerion-wordmark.svg", svg: wordmarkSvg(t.ink).svg, png: [{ width: 2000, name: "wordmark-ink-2000.png" }] },
  { path: "brand/logo/vaerion-wordmark-light.svg", svg: wordmarkSvg(t.porcelain).svg },
  // Primary lockup + editions
  { path: "brand/logo/vaerion-logo.svg", svg: lockupSvg(t.ink, t.goldBright), png: [{ width: 2400, name: "logo-gold-2400.png" }] },
  { path: "brand/logo/vaerion-logo-light.svg", svg: lockupSvg(t.porcelain, t.ink) },
  // OG image
  { path: "public/og-image.svg", svg: ogSvg() },
  { path: "brand/og-image.svg", svg: ogSvg(), png: [{ width: 1200, name: "og-image.png" }] },
];

async function emitOgPng(): Promise<void> {
  const buf = await sharp(Buffer.from(ogSvg()), { density: 72 * 3 }).resize({ width: 1200 }).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(ROOT, "public", "og-image.png"), buf);
}

function wordmarkWidth(): number {
  let x = 0;
  for (const ch of WORD) x += LETTERS[ch]!.w + TRACK;
  return x - TRACK;
}

async function main(): Promise<void> {
  mkdirSync(join(ROOT, "brand", "logo", "editions"), { recursive: true });
  mkdirSync(join(ROOT, "brand", "png"), { recursive: true });
  mkdirSync(join(ROOT, "public"), { recursive: true });

  writeFileSync(join(ROOT, "brand", "terminal.ascii.txt"), TERMINAL_ASCII, "utf8");

  // favicon: the seal, gold on ink, crisp at small sizes
  writeFileSync(join(ROOT, "public", "favicon.svg"), sealSvg({ container: "fill", mark: t.goldBright, containerFill: t.ink }), "utf8");

  for (const a of artifacts) {
    const abs = join(ROOT, a.path);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, a.svg, "utf8");
    for (const p of a.png ?? []) {
      const outPath = join(ROOT, "brand", "png", p.name);
      const width = p.width;
      const density = Math.ceil(72 * (width / 512));
      const buf = await sharp(Buffer.from(a.svg), { density }).resize({ width }).png({ compressionLevel: 9 }).toBuffer();
      writeFileSync(outPath, buf);
    }
  }

  // web icons from the favicon seal
  for (const [px, name] of [
    [512, "icon-512.png"],
    [192, "icon-192.png"],
    [180, "apple-touch-icon.png"],
    [32, "favicon-32.png"],
  ] as const) {
    const buf = await sharp(Buffer.from(sealSvg({ container: "fill", mark: t.goldBright, containerFill: t.ink })), {
      density: Math.ceil(72 * (px / 512)),
    })
      .resize({ width: px, height: px })
      .png({ compressionLevel: 9 })
      .toBuffer();
    writeFileSync(join(ROOT, "public", name), buf);
  }

  console.log(`brand: ${artifacts.length} svg masters + web icons + terminal mark generated (wordmark width ${wordmarkWidth()})`);
}

await main();
await emitOgPng();
