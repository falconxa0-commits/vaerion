# Vaerion Accessibility Audit — Phase 8 (the accessibility law)

| | |
|---|---|
| **Scope** | The human web face (`src/app/**`) and the CLI output-profile law (`resolveProfile`) |
| **Method** | Deterministic structural checker (`tools/a11y-check.ts`, gate `a11y-structural` in `tools/verify.ts`) + browser-measured audit (this document) + behavior-pinned color accessibility (`tests/integration/color-accessibility.test.ts`) |
| **Status** | `VERIFIED` items were measured in this environment (agent-browser, Chromium). `NOT MEASURED HERE` items are named honestly — no claim without a label (D-S). |
| **Constitution** | v1.4 A4 — executes the §7 MS-6 accessibility sweep as permanent gated law |

## 1. Structural invariants (deterministic, permanently gated)

The checker enforces nine invariants over the web-face sources and fails the
gate on any violation; the engine test suite pins every rule to fail on a
violating surface and pass on a compliant one
(`packages/vaerion/tests/integration/accessibility.test.ts`):

| Invariant | Enforcement |
|---|---|
| `lang-attribute` | root `<html>` declares `lang="en"` |
| `metadata-present` | layout metadata carries title + description |
| `single-h1` | exactly one `<h1>` per page surface |
| `landmarks-present` | `<main>`, `<header>`, `<footer>` present |
| `sections-labeled` | every `<section>` carries `aria-label` |
| `image-alt` | every `<Image>`/`<img>` carries alt text |
| `progressbar-labeled` | every `role="progressbar"` carries `aria-label` + `aria-valuemin/now/max` |
| `no-positive-tabindex` | natural tab order (no `tabIndex > 0`) |
| `focus-visible-styled` | the stylesheet styles `:focus-visible` |

## 2. Defects found and fixed at root (this phase)

1. **Unlabeled progress bars.** The overall roadmap bar lacked `aria-label`;
   the eight milestone mini-bars lacked progressbar semantics entirely.
   *Fixed*: full progressbar semantics with per-milestone accessible names
   (`"MS-3 Model Gateway progress"`); verified live — the accessibility tree
   now reads `progressbar "MS-0 Skeleton and Law-in-Repo progress": 100`.
2. **Keyboard focus not styled at the base layer.** `globals.css` styled no
   `:focus-visible` fallback (components carried their own; the base layer
   did not). *Fixed*: base `:focus-visible` outline ring — components extend,
   never remove.
3. **Duplicate React keys ("Encountered two children with the same key: 8").**
   The phase-program ledger legitimately contains two "Phase 8" rows (the
   out-of-order git/CI phase of the earlier program and the A4 accessibility
   law); the web face keyed rows by phase number. *Fixed*: deterministic
   row identity (`dt-<index>`) emitted by `tools/status.ts`; verified live —
   zero console errors after reload.

## 3. Browser-measured results (agent-browser, Chromium — `VERIFIED`)

| Check | Result |
|---|---|
| Page loads; title present | ✅ "Vaerion — AI-native development engine" |
| Console errors after fresh load | ✅ zero (defect 3 found and fixed during this audit) |
| Page errors | ✅ zero |
| Accessibility tree landmarks | ✅ `main`, five labeled `region`s, `header`, `footer` |
| Heading structure | ✅ exactly one `h1`; `h2` sections |
| Labeled progress bars | ✅ 9/9 carry accessible names and values |
| Images | ✅ 0 images without alt text |
| Focusable elements receive focus | ✅ `document.activeElement` follows `.focus()` |
| Horizontal overflow at 390×844 | ✅ none (scrollWidth 390 == clientWidth 390) |
| Horizontal overflow at 1280×800 | ✅ none |
| Footer discipline | ✅ sticky at viewport bottom when content is short (800/800 desktop); pushed naturally below long content (mobile) — never overlaying content |

## 4. CLI color accessibility (`VERIFIED` by behavior pins)

The profile law (`resolveProfile`) is pinned by
`tests/integration/color-accessibility.test.ts`:

- `NO_COLOR`, `TERM=dumb`, or `CI` each veto a capable TTY down to the plain
  profile (ambient honesty beats TTY capability);
- an explicit `VAE_UI=rich` beats ambient `NO_COLOR` (explicit user choice >
  ambient default — documented precedence);
- `--json` is never painted in any environment;
- end-to-end: a real `vae dev` run under `NO_COLOR` emits zero ANSI escape
  sequences, with a control run proving the veto (not an absence) is doing
  the work.

No status in any CLI surface is conveyed by color alone: rich badges always
carry text ("GREEN"/"RED"), and the plain/json faces are text-only.

## 5. Honest limits (`NOT MEASURED HERE`)

- **Contrast ratios were not instrument-measured** in this audit. The palette
  is zinc/gold/emerald on white or zinc-50 (and their dark-mode inversions) —
  designed for high contrast — but no WCAG contrast computation was executed
  in this environment.
- **Screen-reader passes** (NVDA/VoiceOver/TalkBack) were not run; the audit
  covers the accessibility *tree* (Chromium) and structural invariants.
- **The demo `/api` route group** (if any future interactive surfaces are
  added) will be swept by the same `a11y-structural` gate at that time.

## 6. Law

The structural invariants are permanently enforced as the `a11y-structural`
gate inside `tools/verify.ts` (D-R: the one verification entrypoint) — every
future regression of the human surface's accessibility fails the release
gates, exactly like the performance budgets of Phase 7.
