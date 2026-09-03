<!--
Verification law of record (CONTRIBUTING.md): all gates green BEFORE the change
is committed. The single entrypoint is `bun run tools/verify.ts`, which writes
the measured result to `.vaerion-verification.json`; CI re-runs the same gates
(`.github/workflows/verify.yml`).
-->

## What changed

<!-- Concise statement of what this PR does. If it fixes a defect, state the
root cause — not just the symptom. -->

## Verification gates

- [ ] `bun run tools/verify.ts` run on this tree — ALL gates green, exit 0
- [ ] The measured record `.vaerion-verification.json` is refreshed as required
      (runs pin the committed record fail-closed)

## Evidence

<!-- Paste the measured evidence: the gate summary (tests passed / failed /
expectations / files), relevant before/after outputs, exit codes. No claims
without evidence — honesty above appearance. Label anything not yet measured
as UNVERIFIED. -->

## Constitutional checklist

- [ ] No parallel systems — one engine; no shadow or duplicated implementation
- [ ] Single pipeline — all verification flows through `tools/verify.ts` (the
      one entrypoint); no bespoke gate scripts
- [ ] Thin clients — CLI / API / SDK surfaces stay thin over the engine
      contracts
- [ ] Contracts additive — `spec/` changes add; nothing removed or renamed;
      error codes never reused; `spec/openapi.json` regenerated only via
      `tools/gen-openapi.ts`
- [ ] Decisions recorded — behavioral or structural decisions carry an ADR in
      `docs/adr/`
- [ ] Records appended — `worklog.md` carries the measured record of this
      change (what was done, what was measured, what remains)
- [ ] No fabrication — every claim here is measurable in this repository;
      uncertainties are labeled UNVERIFIED, never dressed as verified

## License

By contributing, you agree that your contribution is licensed under the Apache
License 2.0 (`LICENSE`), per `CONTRIBUTING.md`.
