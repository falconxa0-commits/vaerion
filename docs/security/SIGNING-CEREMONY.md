# The Vaerion Production Signing Key Ceremony (F-3)

| | |
|---|---|
| **Document** | The ceremony record: how the production release key was created, provisioned, and verified; the ownership, rotation, and recovery law going forward |
| **Authority** | The Founder's written directive (ASCENSION XXV, Phase XXVII): *"Create: production key process · key ownership documentation · rotation policy · recovery procedure. Configure: GitHub `RELEASE_SIGNING_KEY`. Verify: CI uses the production key; releases are reproducible; consumers verify successfully."* The directive is the authorizing record for every action below. |
| **Supersedes** | The bootstrap-key state recorded in RISK-LEDGER **R-2** and disclosed by every pack report generated before this ceremony |
| **Related** | `LEGAL.md` (ownership), `docs/security/RISK-LEDGER.md` (R-2), `.github/workflows/verify.yml` (the consumer of the secret), `tools/dist-pack.ts` (fail-closed key loading) |

## 1. What changed

Before this ceremony, every release was signed by a **session-bound bootstrap key**: `tools/dist-pack.ts` generated a fresh Ed25519 pair whenever `keys/release-signing.key` was absent, wrote it untracked, and the pack report **disclosed** the fact (the fail-closed design meant nothing was ever hidden — but the trust anchor changed with every session, so it was not a production trust chain).

After this ceremony:

1. A **production Ed25519 key** exists in exactly one place: the GitHub Actions secret **`RELEASE_SIGNING_KEY`** (PKCS8 PEM, sealed-box encrypted at rest by GitHub).
2. The tracked key of record `keys/release-signing.pub` is the production public half (SPKI PEM). Its fingerprint — the same formula `dist-pack.ts` prints into every `VERIFY.md` — is:

   ```
   sha256(spki-der): f28f089b43c0f7e776803cb83a47fb91…
   ```

3. Every future `v*` tag run signs the release artifact set with the production key. The bootstrap path remains as the fail-closed fallback and its disclosure line in the pack report is the tripwire: **a release whose report says "bootstrap key GENERATED this run" was not signed by this ceremony's key.**
4. The local private-key copy created during the ceremony was destroyed immediately after provisioning (`shred` + removal, verified absent). The private key is intentionally unrecoverable from any repository, session, or backup — see §5.

## 2. The process (as executed, honestly)

| Step | Action | Record |
|---|---|---|
| 1 | Key generated: `openssl genpkey -algorithm ed25519`, PKCS8 PEM, in a session-private temp file (`chmod 600`, outside the repository) | this session; never entered the repo, a commit, or a log |
| 2 | Format verified loadable by the exact CI code path (`node:crypto createPrivateKey`, `ed25519`) | measured before provisioning |
| 3 | Secret provisioned via the GitHub API: repo public key fetched → PyNaCl `SealedBox` encryption → `PUT /actions/secrets/RELEASE_SIGNING_KEY` → **HTTP 201** | API response; secrets list then measured `total_count: 1` |
| 4 | Key of record rotated: tracked `keys/release-signing.pub` replaced with the production public half; fingerprint re-measured on the tracked file = §1 fingerprint | this commit |
| 5 | Private-key copy destroyed (`shred -u`); verified absent | this session |
| 6 | End-to-end verification on GitHub infrastructure: a `v*` tag pushed → the release job signs with the secret → artifacts downloaded and verified **three ways** (sha256 manifest → engine `dist-verify` consumer path → independent openssl Ed25519 cross-check); the pack report checked for the **absence** of the bootstrap disclosure | the release run of record for the first post-ceremony tag |

### Honest limitations (labeled, never dressed)

- **Generation environment**: the key was generated in the campaign sandbox under the Founder's written directive — not on an air-gapped machine with witnesses. The directive's bar was a *permanent release trust* replacing the per-session bootstrap key; that bar is met. If the Founder later desires a hardware-custodied or air-gapped ceremony key, the rotation path in §4 makes that a routine, non-disruptive operation.
- **Secret scope**: `RELEASE_SIGNING_KEY` is a repository-level Actions secret readable only by the CI runtime during the release job. Admin access to the repository is the trust boundary — which is why branch protection on `main` (this campaign, Phase XXXIII) is part of the same security posture.
- **Historical releases**: tags ≤ `v0.1.12-rc1` were signed by their own session-bound keys; each artifact set ships its public key *beside* the artifacts (manifest-bound), so their verification paths remain intact and unchanged. The production key anchors everything signed *after* the ceremony.

## 3. Key ownership

- The production key is owned by the project (see `LEGAL.md` §2) and administered by the Founder.
- No human — including the Founder — can read the private key back out of GitHub secrets (write-only by design). This is deliberate: the question is never "who has the key" but "what does CI sign".
- The public key of record lives in the repository (`keys/release-signing.pub`) and travels *inside* every release artifact set, manifest-bound, so consumer verification needs nothing but the artifacts themselves.

## 4. Rotation policy

| Trigger | Action |
|---|---|
| **Scheduled** (recommended: annually, or at each GA major) | Repeat §2 steps 1–6 with a fresh key: generate → provision → rotate the tracked pub → destroy the copy → cut a release whose notes state the rotation |
| **Suspected compromise** | Treat as §5 recovery **plus** an incident disclosure via `SECURITY.md`'s private route first, public changelog entry after the new key is live |
| **Key-holder change** (Founder transition) | Rotation is the transfer of custody: provision the new secret under the new administration; the old key's releases keep verifying against their shipped keys |

Rotation never rewrites history: old tags keep their signatures, old keys keep verifying their own artifacts (the shipped-beside-key design). The repository's key of record always refers to the *current* trust anchor; `CHANGELOG.md` records every rotation.

## 5. Recovery procedure

**The private key cannot be recovered** — from GitHub, from the repository, or from this session (the local copy was destroyed per §2 step 5). This is the intended property: a recoverable key is a stealable key.

If the key is lost, leaked, or the Founder simply wants it replaced:

1. Generate a new key (§2 step 1) and provision it (§2 steps 3–5) — the old secret is overwritten in place.
2. Rotate the tracked key of record (§2 step 4).
3. Cut a new tag; the release notes state the rotation and the new fingerprint.
4. Consumers verify the new release against the new key that ships beside it; no consumer ever trusted the old key *in-place* — they trusted the artifacts' own manifest-bound key set.

Compromise handling adds one step **before** all others: private incident disclosure via `SECURITY.md` (R-7 route), because a compromised key means artifacts may have been forged — the disclosure names the affected release range (every tag whose artifacts carry the compromised key beside them, i.e. everything signed after the key went live and before rotation).

## 6. Verification law going forward

A Vaerion release is trustworthy when **all three** verification legs pass:

1. `sha256sum --check SHA256SUMS` — artifact integrity.
2. `bun run tools/dist-verify.ts --manifest MANIFEST.json --sig MANIFEST.json.sig --pub release-signing.pub` — the engine's own verifier (the consumer path; no repository needed).
3. An **independent** implementation cross-check (openssl Ed25519 over the canonical manifest with the decoded signature) — the leg that catches a defect in leg 2 itself.

Plus the **posture check** specific to this ceremony: the release job's pack report must NOT contain the bootstrap-key disclosure line. Its presence after this ceremony means the secret was missing or unreadable — treat that release as unsigned and stop.

*Repository reality wins. Constitution wins. Evidence wins.*
