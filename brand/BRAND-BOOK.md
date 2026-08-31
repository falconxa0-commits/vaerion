# Vaerion Brand Book

**The Vaerion design system** — one visual language across the seal, the
terminal, the reports, and the web. Luxury here means refinement, not
decoration: every rule below exists to make the product feel *calm,
confident, precise, and elegant*.

- **Generated assets**: everything under `brand/logo/`, `brand/png/`, and
  `public/` (icons, og image) is produced by `tools/brand-render.ts`.
  Never hand-edit an artifact — change the geometry source and regenerate.
  Running the generator twice produces identical bytes (verified).
- **Mirrors**: terminal tokens are mirrored in
  `packages/vaerion/src/cli/ui.ts`; the web face uses the same hex values.

---

## 1. The mark

The **Seal** — a rounded square containing the **Witness Rule** above the
**V**. The rule is the line of evidence; the V is verification descending
to a single point. Two elements, one statement: *measured, then verified*.

| Asset | File | Use |
|---|---|---|
| Seal (icon) | `brand/logo/vaerion-icon.svg` | app icon, favicon source, avatars |
| Monogram (bare mark) | `brand/logo/vaerion-monogram.svg` | inline marks, watermarks, loading states |
| Wordmark | `brand/logo/vaerion-wordmark.svg` (ink) / `-light` (porcelain) | headers, documents |
| Primary lockup | `brand/logo/vaerion-logo.svg` (gold-on-ink) / `-light` | hero surfaces, release pages, OG |
| Favicon | `public/favicon.svg` + `public/favicon-32.png` | browser tab |

### Editions

| Edition | File | Rule |
|---|---|---|
| **Gold** | `editions/gold.svg` | the signature edition — dark surfaces, release moments |
| **White** | `editions/white.svg` | dark surfaces where gold would compete with data |
| **Black** | `editions/black.svg` | light surfaces (print, documents) |
| **Mono** | `editions/mono.svg` | single-color contexts; follows `currentColor` |

### Clearspace & size

- Clearspace: keep `1 × rule-width` (≈ `1/28` of the seal height) free on
  all sides; `2 ×` preferred in print.
- The seal reads from **16 px**; use the monogram (no container) below 24 px.
- Never: rotate, recolor outside the palette, add effects/shadows to the
  mark, place the wordmark inside the seal, or stretch any axis.

---

## 2. Color

The palette is ink, porcelain, and **one** accent: gold. Everything else is
neutral. Semantic colors exist only for evidence states (success / warning
/ error / info) and are muted, never neon.

| Token | Hex | Role |
|---|---|---|
| `ink` | `#17171B` | primary surface, black-edition foreground |
| `ink-soft` | `#232329` | raised surface on ink |
| `porcelain` | `#FAF9F6` | light surface |
| `gold` | `#C9A227` | **the** accent — headers of state, key highlights |
| `gold-bright` | `#E3B341` | gold on dark surfaces and small sizes |
| `graphite` | `#55555E` | secondary text |
| `mist` | `#9C9CA6` | muted text, captions |
| `line` | `#2A2A31` | hairlines on ink |

Terminal evidence colors (used by the CLI):

| Token | Hex | Meaning |
|---|---|---|
| `success` | `#3F9B6E` | verified, green path |
| `warn` | `#C98A1F` | attention, repair hints |
| `error` | `#C24E4E` | refusal, failure |
| `info` | `#6B8FA3` | neutral guidance |
| `dim` | `#8A8A93` | de-emphasis |

Rules: gold is never used for body text; red appears **only** for failures;
color always accompanies a word or symbol (never color alone —
accessibility law); `NO_COLOR` / non-TTY strips every color (the CLI's
plain mode is the fallback for everyone).

---

## 3. Typography

| Use | Face | Notes |
|---|---|---|
| Display / UI | Inter (web: Geist Sans) | tight tracking on large sizes, sentence case |
| Terminal / code / hashes | Geist Mono, JetBrains Mono, or `ui-monospace` | the engine's native voice |
| Print / PDF | Inter + JetBrains Mono | same hierarchy rules |

Hierarchy: page/panel titles 20–28 semibold · section labels 13–14 uppercase
+10% tracking · body 15–16/1.6 · captions & evidence metadata 12–13 in
`mist`/`dim`. Hashes, ids, and code always mono. Never fake small-caps,
never more than two families per surface.

The **wordmark** letterforms are custom monoline caps drawn in the brand
renderer — not a font. Never re-typeset "VAERION" as a substitute for the
wordmark asset.

---

## 4. Geometry

| Token | Value | Notes |
|---|---|---|
| Grid | 4 px base; 8 px rhythm | all padding/spacing multiples of 4 |
| Spacing scale | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 | |
| Radius | seal `104/512 ≈ 20%` · cards `12` · inputs `8` · badges `999` | one radius family per surface class |
| Hairlines | 1 px, `line` on ink / `#E5E3DE` on porcelain | borders whisper, never shout |
| Shadows | ink surfaces: none · light surfaces: `0 1 2 rgba(23,23,27,.06), 0 8 24 rgba(23,23,27,.08)` | elevation is rare |

---

## 5. Motion

Calm by law: **150–250 ms**, ease-out, opacity + transform only.

- Enter: 180 ms ease-out, 4 px rise + fade.
- Exit: 140 ms ease-in, fade.
- Progress: indeterminate shimmer ≤ 2% luminance amplitude; determinate
  bars never animate backwards.
- No bounce, no parallax, no attention-seeking loops. Reduced-motion
  (`prefers-reduced-motion`) collapses everything to instant.

---

## 6. Icon language

Lucide (stroke 1.5–2, round caps) in the web app; a fixed set of Unicode
glyphs in the terminal (see `packages/vaerion/src/cli/ui.ts` — the glyphs
are chosen to degrade gracefully in non-Unicode terminals). Icons label
state, they never decorate: ✓ success · ✗ failure · ⚠ warning · →
guidance. One icon per row; never icons + badges + color for the same
signal.

---

## 7. Terminal (the primary surface)

The CLI is the product's front door. Law:

1. **Plain mode is a contract** — non-TTY output is stable text; machines
   and tests depend on it. Rich rendering activates only on a TTY
   (`VAE_UI=plain|rich|auto` overrides).
2. **One layout system** — every screen is composed from the same
   components (panel, table, badge, steps, receipt). No free-hand output.
3. **Unicode box drawing** with ASCII-safe degradation.
4. **Evidence over ornament** — color and glyphs mark verification state;
   nothing blinks, nothing spins unless work is actually running.

---

## 8. Voice

Engineered, declarative, exact. Sentences short. Numbers measured. No
exclamation marks, no hype, no "blazing fast". A receipt reads like a
notary document; an error reads like a colleague: what failed, why, the
fix, the doc.
