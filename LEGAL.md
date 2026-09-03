# LEGAL — the Vaerion identity layer of record

| | |
|---|---|
| **Document** | Legal identity, ownership, licensing, contributor terms, and naming policy — the single page of record for "who is Vaerion" |
| **Scope** | Every surface that carries the project's name, copyright, license, or authorship: `LICENSE`, package metadata (npm, PyPI, winget, DEB, RPM, Homebrew), the README, the dashboard, and the release artifacts |
| **Authoritative date** | 2026 · established during the ASCENSION XXV GA-readiness campaign |

## 1. Identity of record

| Field | Value | Where it is carried |
|---|---|---|
| Project name | **Vaerion** | all manifests, docs, CLI help, dashboard |
| Copyright holder | **Auren** (project founder; pseudonym — see §6) | `LICENSE` ("Copyright 2026 Auren"), npm `author`, PyPI `authors`, DEB/RPM `Maintainer`, winget `Copyright` |
| Contact | `auren@vaerion.dev` | package metadata, security disclosure route (`SECURITY.md` → RISK-LEDGER R-7) |
| Source repository | `https://github.com/falconxa0-commits/vaerion` | the only source of truth; mirrors are derived |
| License | **Apache-2.0** | `LICENSE` at the repository root |
| Governance | the engineering constitution (`docs/constitution/`) + ADR index (`docs/adr/`) | decision law, amendment path, D-T ledger |

`vaerion.dev` is the project's intended web identity (publisher URL, support contact domain). Domain provisioning is a publication step owned by the Founder (risk-ledger F-5); until it is live, this repository and its GitHub Releases are the only authoritative surfaces.

## 2. Ownership statement

- The copyright in the Vaerion engine, CLI, SDKs, packaging, and documentation is held by **Auren**, 2026, and licensed to the public under the Apache License 2.0.
- The GitHub repository `falconxa0-commits/vaerion` is owned by the Founder's account (`falconxa0-commits`). Administrative authority over the repository, its releases, secrets, and settings rests with the Founder.
- Decision authority is layered and recorded in the constitution: P1 (safety/refusal, non-overridable) → P2 (verification law) → P3 (architecture/ADR) → P4 (product, release, and identity decisions). Identity and publication decisions are P4; automation proposes, the Founder disposes.
- Contributions become part of the project's copyright base under the inbound-license terms of §4; the project does not require a copyright assignment.

## 3. Licensing documentation

**What is licensed:** the entire repository content that is distributed — engine, CLI, SDKs, packaging and installer scripts, container/CI ports, and the documentation — under **Apache License 2.0** (`LICENSE`, verbatim standard text with the §1 copyright line).

**What that means, practically:**

- You may use, modify, and redistribute Vaerion — commercially or privately — under Apache-2.0 terms (notice preservation, license copy, NOTICE-file handling, and the patent grant as written in the license).
- The **`.vxn` bundles, journals, receipts, and other artifacts Vaerion produces** are your data and your output; Vaerion's license does not claim them.
- The **brand assets** (the name "Vaerion", the seal, the wordmark under `brand/`) are covered by §5 below, not by the open-source grant alone.
- Third-party dependencies are governed by their own licenses. The dependency inventory of record is `bun.lock` (engine/dashboard) and `packaging/npm/package.json` + `packaging/python/pyproject.toml` (published surfaces). The published package's runtime dependency set (ajv, hash-wasm, yaml) is intentionally minimal and permissively licensed; the authoritative per-package license files travel inside those packages, and a generated license report + SBOM accompanies the GA publication (risk-ledger F-5; see `docs/ga/SECURITY-AUDIT.md` when it lands).

**No per-file copyright headers:** a repo-wide sweep (ASCENSION XXV, Phase XXVI) found zero conflicting or stale copyright notices in source files. Apache-2.0's §4(d) notice is optional ("may"); the project therefore carries the license once, authoritatively, in `LICENSE` + this page, rather than injecting headers into 100+ files. This is a recorded decision, not an omission.

## 4. Contributor terms

- By contributing (PR, patch, or otherwise), you agree your contribution is licensed under the Apache License 2.0 — the same terms in `CONTRIBUTING.md` §License. No CLA, no copyright assignment, no contributor agreement to sign: the inbound = outbound license model.
- Contributions must honor the repository's own laws to be accepted: the verification gates must stay green, the constitution's amendment path must be followed for law changes, and provenance ("what produced this change") must be honest.
- Anything contributed that is *not* yours to license (copied code without a compatible license, secrets, private keys) is rejected on sight; `SECURITY.md` and `.gitignore` (`/keys/*.key`) encode the mechanical half of this.

## 5. Naming and trademark policy

- "Vaerion", the seal, and the wordmark are the project's **unregistered trademarks** of record, held by the copyright holder in §1. They are not (yet) registered marks; registration is a Founder decision, recorded here as intentionally open.
- You may use the name and assets to refer to the project, in documentation, and in interoperable tooling (including package-manager listings for unmodified Vaerion builds).
- You may not present a modified fork as official "Vaerion", nor use the seal as your own project's mark. Reproducible builds that pass the project's own verification (`dist-verify`) may state they are *verified Vaerion builds*.

## 6. The pseudonym disclosure (F-2)

The copyright line reads "Auren" — a **pseudonym**, recorded as the project founder's working identity across the repository, the git history, and the package metadata. The risk ledger's F-2 states the honest position: **a full legal name is required before strangers are asked to trust signatures**, because a pseudonymous copyright line weakens the legal force of a signed release and a trademark claim.

- Owner: the Founder (P4). Nothing about the legal identity can be decided by automation or contributors.
- When the legal name lands, the change is mechanical and swept: `LICENSE` copyright line, npm `author`, PyPI `authors`, DEB/RPM `Maintainer`, winget `Copyright`/`Publisher`, this page, and the README governance section — the same surfaces this page inventory-lists in §1, plus a version-register negative-sweep re-run to prove no stale "Auren-only" surface remains.
- Until then, every identity surface says "Auren" — consistently, everywhere, with no conflicting identity (verified, Phase XXVI).

## 7. Contact and enforcement

- Legal, licensing, and naming questions: `auren@vaerion.dev`.
- Security disclosures: the **private** route in `SECURITY.md` (never a public issue).
- Governance questions: the constitution and ADR index; amendments follow the recorded path only.

*Repository reality wins. Constitution wins. Evidence wins.*
