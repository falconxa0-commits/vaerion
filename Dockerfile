# Vaerion — container image (multi-stage, non-root).
#
# Supply-chain law (mirrors .github/workflows/verify.yml):
#   - the substrate is the pinned verified Bun: oven/bun:1.3.14
#   - dependencies install with --frozen-lockfile from bun.lock
#   - the entrypoint is the engine's own CLI entrypoint — the ONE surface
#     every other launcher resolves (packaging law: no second CLI surface)
#
# STATUS: authored + reviewed only — UNVERIFIED until a container host
# builds and runs it (this workspace has no container host; the honest
# marker convention follows packaging/README.md). The entrypoint path and
# the bun.lock supply-chain contract are verified against the tree.

# ── Stage 1: frozen dependency install ─────────────────────────────────
FROM oven/bun:1.3.14 AS deps
WORKDIR /app

# Workspace manifests first (packages/*, sdks/*, tools) so the frozen
# lockfile install layers cache independently of source.
COPY package.json bun.lock ./
COPY packages/vaerion/package.json packages/vaerion/
COPY sdks/typescript/package.json sdks/typescript/
COPY tools/package.json tools/

RUN bun install --frozen-lockfile

# ── Stage 2: minimal runtime ────────────────────────────────────────────
FROM oven/bun:1.3.14-slim AS runtime

# Non-root: a dedicated user owns the app tree (the engine never needs
# root — it is a local, per-user tool by design).
RUN useradd --create-home --uid 1000 vae
WORKDIR /app

# The engine resolves its runtime dependencies (ajv, hash-wasm, yaml)
# through the workspace node_modules; @vaerion/sdk reaches the engine via
# the workspace link it declares. Copy only what the CLI runs.
COPY --from=deps --chown=vae:vae /app/node_modules ./node_modules
COPY --chown=vae:vae packages/vaerion/package.json packages/vaerion/tsconfig.json packages/vaerion/
COPY --chown=vae:vae packages/vaerion/src packages/vaerion/src
COPY --chown=vae:vae sdks/typescript/package.json sdks/typescript/tsconfig.json sdks/typescript/
COPY --chown=vae:vae sdks/typescript/src sdks/typescript/src

USER vae

# Startup verification idea: `vae doctor` verifies config, journals, blobs,
# the audit chain, and the gateway matrix with NO network access and NO
# secret values (exit 0 healthy, exit 5 with Fix hints on failure). The
# image ships the engine, not a workspace, so doctor belongs to the
# workspace you mount, not to the image itself:
#
#   docker run --rm -v "$PWD":/work -w /work vaerion \
#     bun run /app/packages/vaerion/src/cli/vae.ts doctor
#
# (Measured on the release tree: doctor exits 0 on a healthy workspace and
# 5 with E1200 + Fix hints when no workspace is present.)

ENV PATH="/app/node_modules/.bin:${PATH}"
ENTRYPOINT ["bun", "run", "packages/vaerion/src/cli/vae.ts"]
# Help always teaches and never executes — the safest default surface.
CMD ["--help"]

LABEL org.opencontainers.image.title="Vaerion engine" \
      org.opencontainers.image.description="The local, deterministic, auditable substrate where developers, agents, and models do real work on a codebase (vae CLI)." \
      org.opencontainers.image.version="0.1.12-rc1" \
      org.opencontainers.image.licenses="Apache-2.0"
