# ADR-0005: Tiered intelligence L0/L1/L2 progressive enhancement

| | |
|---|---|
| Status | Accepted |
| Date | 2026-08-29 |
| Supersedes | none |
| Superseded by | none |

## Context

Project intelligence (indexing, symbol and graph extraction, chunking,
retrieval) must work on polyglot repositories. Tree-sitter grammar coverage
is uneven across languages, and attempting uniform high-precision analysis
for every language either stalls the indexer or produces a maze of
per-language special cases. The engine's doctrine is that unsupported
languages must never be an error: mixed repositories must still function.

## Decision

1. Language coverage is tiered:
   - Tier-1a: first-class grammars shipped with the engine (TypeScript,
     JavaScript, TSX, Python, Go, Rust, CSS, JSON, HTML, Markdown, Bash,
     TOML/YAML). High graph precision: imports plus callsite heuristics,
     rich chunking, symbol grid.
   - Tier-1b: additional shipped grammars (Java, Kotlin, C#, C++, Ruby, PHP,
     HCL, Dockerfile). Medium precision via standard chunking.
   - Tier-2: everything else, community or later. Progressive enhancement
     with graceful fallback.
2. Tier-2 languages degrade to line-window chunking plus BM25 retrieval;
   they never error, never block the index pipeline, and are reported as
   degraded in intelligence status output.
3. Incremental updates are cursor-based and cost proportional to edits, so a
   watch-mode indexer stays within the indexing performance budget regardless
   of tier.
4. Mixed-tier repositories are the normal case; ranking combines lexical,
   vector, and graph signals with tier-appropriate weights.

## Consequences

- Positive: the engine is useful on day one for arbitrary repositories;
  precision improves as grammars land without contract changes.
- Positive: a missing grammar is a quality statement, not a crash; the
  retrieval path is always available.
- Negative: users on Tier-2 languages get weaker structural answers; the
  degradation must be visible and honest, not silent.
- Negative: two chunking/ranking paths must be maintained and both tested
  against golden fixtures.
