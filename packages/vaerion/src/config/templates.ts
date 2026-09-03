/**
 * Vaerion — the init template registry (ASCENSION XVIII Phase 5; constitution
 * v1.3 A3, D-M′ template face; P2 determinism, L0 config-adjacent).
 *
 * Law: there is exactly ONE source of scaffold intent. Every template is a
 * static, byte-stable document parameterized ONLY by the project name; no
 * wall-clock, no ambient state, no computed content. Bare `vae init` is
 * EXACTLY `--template minimal` — the pre-A3 default bytes, preserved. Every
 * rendered template must validate against the strict schema-0.1 config law
 * (unknown keys are rejected by law), and every template sets
 * `telemetry.enabled: false` — zero telemetry is structural (P10).
 *
 * This module is the single source of truth for the template surface; the
 * CLI porcelain only resolves names and renders bytes.
 */

import { VaerionError } from "../kernel/errors.ts";

export interface InitTemplate {
  /** Registry name (`^[a-z][a-z0-9-]{0,62}$`), the `--template` value. */
  readonly name: string;
  /** One honest sentence: what this scaffold is for. */
  readonly description: string;
  /** The byte-stable body; the single `{{NAME}}` token receives the project name. */
  readonly body: string;
}

const minimalTemplate: string = `# Vaerion project configuration (schema 0.1)
# Unknown keys are rejected by law — see spec/schemas/vaerion-yaml.schema.json
schemaVersion: "0.1"
project:
  name: {{NAME}}
  description: "Vaerion project"
research:
  capabilities:
    - name: project-docs
      sources:
        - { kind: local, path: "./docs" }
      fencing: untrusted
      maxItems: 100
# Broker policy rules (MS-2) — first match wins; unmatched requests deny fail-closed.
# Every rule must state its rationale:
# policy:
#   rules:
#     - id: deny-secret-read
#       principalKinds: [agent]
#       domain: secret.read
#       scope: "*"
#       effect: deny
#       rationale: "agents never read secrets; humans use the keychain directly"
telemetry:
  enabled: false
`;

const demoTemplate: string = `# Vaerion demo workspace (schema 0.1) — ready for 'vae run demo'
# Unknown keys are rejected by law — see spec/schemas/vaerion-yaml.schema.json
schemaVersion: "0.1"
project:
  name: {{NAME}}
  description: "A Vaerion demo workspace: a scaffolded local source, journaled research runs"
research:
  capabilities:
    - name: sources
      sources:
        - { kind: local, path: "./sources" }
      fencing: untrusted
      maxItems: 32
# Try: vae run demo --query "event spine journal deterministic"
#      (no --sources needed: the run derives its paths from the declared
#       capabilities above — the workspace config is the only authority)
# Or be explicit: vae run demo --sources ./sources --query "..."
telemetry:
  enabled: false
`;

/**
 * The scaffold files a template installs BESIDES its vaerion.yaml (D-B: the
 * registry of record is the only authority on what a template creates — the
 * declared capabilities and the scaffolded files can never disagree, because
 * both derive from this registry; XX-D6: the demo journey must work as
 * taught on an empty machine, D-Y).
 */
export const TEMPLATE_SCAFFOLD_FILES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  demo: {
    "sources/demo.md": [
      "# Demo source",
      "",
      "The journal is an append-only hash chain: every record carries the blake3",
      "hash of its predecessor, so verification is deterministic and replay is",
      "faithful. Damaged tails are recovered; corrupted chains are refused.",
      "",
      "Every run closes with a receipt — evidence, not branding.",
      "",
    ].join("\n"),
  },
};

const agentTemplate: string = `# Vaerion agent workspace (schema 0.1) — the supervised agent loop, wired
# Unknown keys are rejected by law — see spec/schemas/vaerion-yaml.schema.json
schemaVersion: "0.1"
project:
  name: {{NAME}}
  description: "A Vaerion agent workspace: declared tools, a planner model, fail-closed grants"
research:
  capabilities:
    - name: project-docs
      sources:
        - { kind: local, path: "./docs" }
      fencing: untrusted
      maxItems: 100
gateway:
  providers:
    mockbrain:
      enabled: true
      models:
        - mock-1
  budgets:
    tokensPerRun: 100000
agents:
  maxSteps: 24
  plannerModel: mockbrain/mock-1
tools:
  - name: echo
    description: "Echoes its input back (the hermetic builtin)"
policy:
  rules:
    - id: agent-inline-planning
      principalKinds: [agent]
      domain: model.invoke
      scope: "mockbrain/mock-1"
      effect: allow
      rationale: "the declared planner model is the only model agents may invoke"
telemetry:
  enabled: false
`;

/** The registry of record. Sorted output derives from this object's keys. */
export const INIT_TEMPLATES: Readonly<Record<string, InitTemplate>> = {
  minimal: {
    name: "minimal",
    description: "the default scaffold: declared project docs, policy examples in comments",
    body: minimalTemplate,
  },
  demo: {
    name: "demo",
    description: "a demo workspace: a scaffolded ./sources capability, ready for 'vae run demo'",
    body: demoTemplate,
  },
  agent: {
    name: "agent",
    description: "an agent workspace: mockbrain planner, declared tools, explicit grants",
    body: agentTemplate,
  },
};

/** Deterministic template names (sorted). */
export function initTemplateNames(): string[] {
  return Object.keys(INIT_TEMPLATES).sort();
}

/** The default template name — bare `vae init` is exactly this template. */
export const DEFAULT_INIT_TEMPLATE = "minimal";

/** Render a template deterministically: the ONLY parameter is the name. */
export function renderInitTemplate(templateName: string, projectName: string): string {
  const template = INIT_TEMPLATES[templateName];
  if (template === undefined) {
    throw new VaerionError(
      "E1203",
      `unknown init template "${templateName}" (available: ${initTemplateNames().join(", ")})`,
      { template: templateName, available: initTemplateNames() },
    );
  }
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(projectName)) {
    throw new VaerionError("E1600", `invalid project name "${projectName}" (must match ^[a-z][a-z0-9-]{1,62}$)`, { name: projectName });
  }
  return template.body.replace("{{NAME}}", projectName);
}
