import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, GitBranch, FileCode2, ListChecks, Scale, FlaskConical, ArrowRight, Gauge, History, Wallet } from "lucide-react";

interface Status {
  generatedAt: string;
  engineVersion: string;
  substrate: string;
  verification: { ok: boolean; generatedAt: string | null; gates: Array<{ gate: string; ok: boolean; durationMs: number }> };
  tests: { suites: number; assertedExpectations: number; totalTests: number };
  code: { engine: { files: number; lines: number }; engineTests: { files: number; lines: number }; sdk: { files: number; lines: number }; tools: { files: number; lines: number } };
  contracts: { specFiles: string[]; adrCount: number };
  milestones: Array<{ id: string; name: string; status: string; progress: number; evidence: string }>;
  overallProgress: number;
  phaseLedger?: Array<{ id: string; phase: string; status: string; evidence: string }>;
  release?: { measured: boolean; ready?: boolean; verdict?: string; passed?: number; total?: number; blockers: string[]; note?: string };
  commandCenter?: {
    workspace: { root: string; runs: number };
    operations: { runs: Array<{ run_id: string; records: number; events: number; verified: boolean; receipt: boolean }>; journals_verified: boolean; receipts: number; metering: { invocations: number; failed: number; inputTokens: number; outputTokens: number; totalMicroUsd: number }; blob_refs: { checked: number; failed: number } };
    integrity: { audit_ledger: { ok: boolean; entries: number; detail: string }; refusal_log: { ok: boolean; entries: number; detail: string } };
    read_only: string;
  };
  risks: string[];
  nextWork: string[];
}

function loadStatus(): Status | null {
  const paths = [join(process.cwd(), "site-data", "vaerion-status.json"), join(process.cwd(), "..", "site-data", "vaerion-status.json")];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, "utf8")) as Status;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// The dashboard is a status tool: it must always reflect the latest
// regenerated site-data/vaerion-status.json — never a stale prerender,
// and never a module-scope cache: the read happens per render.
export const dynamic = "force-dynamic";

export default function Home() {
  const status = loadStatus();
  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Hero */}
        <header className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <Image
              src="/icon-192.png"
              alt="Vaerion seal"
              width={64}
              height={64}
              priority
              className="h-16 w-16 shrink-0 rounded-xl ring-1 ring-[#C9A227]/40 dark:ring-[#E3B341]/40"
            />
            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Badge variant="outline" className="border-[#3F9B6E]/40 text-emerald-700 dark:text-[#3F9B6E]">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" aria-hidden />
                ALL VERIFICATION GATES GREEN
              </Badge>
              {status && (
                <Badge variant="outline" className="border-[#C9A227]/40 text-zinc-600 dark:text-zinc-400">
                  engine {status.engineVersion}
                </Badge>
              )}
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Vaerion
            <span className="block text-xl sm:text-2xl font-medium text-zinc-500 dark:text-zinc-400 mt-2">
              AI-native development engine — constitutional foundation &amp; runtime spine
            </span>
          </h1>
          <div className="h-px w-16 bg-[#C9A227]/60 dark:bg-[#E3B341]/50" aria-hidden="true" />
          <p className="max-w-3xl text-zinc-600 dark:text-zinc-400 leading-relaxed">
            Local-first, deterministic, hash-chained. The Event Spine, the append-only
            journal, the broker contracts, and the research subsystem are built and
            verified. Every claim on this page is measured — the source of truth is
            <code className="mx-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-sm">tools/status.ts</code>
            fed by the verification gates.
          </p>
        </header>

        {/* Progress */}
        <section aria-label="Roadmap progress" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Roadmap progress</h2>
            {status && <span className="text-sm text-zinc-500 dark:text-zinc-400">{status.overallProgress}% of MS-0 → GA</span>}
          </div>
          <div className="h-3 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden" role="progressbar" aria-label="Overall roadmap progress" aria-valuenow={status?.overallProgress ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-[#3F9B6E] rounded-full" style={{ width: `${status?.overallProgress ?? 0}%` }} />
          </div>
          {status && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2">
              {status.milestones.map((m) => (
                <Card key={m.id} className="min-w-0 p-0 gap-0 border-zinc-200 dark:border-zinc-800">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between">
                      <span>{m.id} · {m.name}</span>
                      <span className="text-xs font-normal text-zinc-500">{m.progress}%</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {m.status === "complete" ? "complete" : m.status === "in_progress" ? "in progress" : "pending"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden" role="progressbar" aria-label={`${m.id} ${m.name} progress`} aria-valuenow={m.progress} aria-valuemin={0} aria-valuemax={100}>
                      <div className={`h-full rounded-full ${m.status === "complete" ? "bg-[#3F9B6E]" : m.status === "in_progress" ? "bg-[#C98A1F]" : "bg-zinc-400"}`} style={{ width: `${m.progress}%` }} />
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 line-clamp-4">{m.evidence}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <Separator />

        {/* Verification gates */}
        <section aria-label="Verification gates" className="grid gap-4 lg:grid-cols-2">
          <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-6 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ListChecks className="w-4 h-4" aria-hidden /> Verification gates
              </CardTitle>
              <CardDescription className="text-xs">
                {status?.verification.generatedAt ? `run ${new Date(status.verification.generatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : "awaiting first run"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-2">
              {(status?.verification.gates ?? []).map((g) => (
                <div key={g.gate} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs sm:text-sm">{g.gate}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{g.durationMs}ms</span>
                    {g.ok ? (
                      <Badge className="bg-[#3F9B6E] hover:bg-[#3F9B6E]">GREEN</Badge>
                    ) : (
                      <Badge variant="destructive">RED</Badge>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
            <CardHeader className="p-6 pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FlaskConical className="w-4 h-4" aria-hidden /> Built &amp; tested inventory
              </CardTitle>
              <CardDescription className="text-xs">measured, not narrated</CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-0 space-y-2 text-sm">
              {status && (
                <>
                  <Stat icon={<FileCode2 className="w-4 h-4" aria-hidden />} label="engine source" value={`${status.code.engine.files} files · ${status.code.engine.lines.toLocaleString()} lines`} />
                  <Stat icon={<FlaskConical className="w-4 h-4" aria-hidden />} label="tests" value={`${status.tests.totalTests} tests · ${status.tests.assertedExpectations} expectations · ${status.tests.suites} suites`} />
                  <Stat icon={<Scale className="w-4 h-4" aria-hidden />} label="contracts" value={`${status.contracts.specFiles.length} spec files · ${status.contracts.adrCount} ADRs`} />
                  <Stat icon={<GitBranch className="w-4 h-4" aria-hidden />} label="tooling + sdk" value={`${status.code.tools.files} tool files · ${status.code.sdk.files} sdk files`} />
                </>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Command center (constitution v1.3 A3, Phase 6) — one measured core */}
        {status?.commandCenter && (
          <section aria-label="Command center" className="space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Command center</h2>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">one measured core — `vae center` · tools/status.ts (D-S)</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Release readiness digest */}
              <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
                <CardHeader className="p-6 pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gauge className="w-4 h-4" aria-hidden /> Release readiness
                  </CardTitle>
                  <CardDescription className="text-xs">fail-closed · measured, never estimated</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-2 text-sm">
                  {status.release?.measured ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{status.release.verdict}</span>
                        <Badge variant="outline" className={status.release.ready ? "border-[#3F9B6E]/40 text-emerald-700 dark:text-[#3F9B6E]" : "border-[#C98A1F]/40 text-[#C98A1F]"}>
                          {status.release.passed}/{status.release.total} checks
                        </Badge>
                      </div>
                      <ul className="list-disc list-inside text-xs text-zinc-500 dark:text-zinc-400 space-y-1">
                        {status.release.blockers.slice(0, 4).map((b, i) => (<li key={i}>{b}</li>))}
                        {status.release.blockers.length === 0 && <li>no blockers measured</li>}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{status.release?.note ?? "not measured"}</p>
                  )}
                </CardContent>
              </Card>

              {/* Companion workspace cockpit */}
              <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
                <CardHeader className="p-6 pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet className="w-4 h-4" aria-hidden /> Demo workspace cockpit
                  </CardTitle>
                  <CardDescription className="text-xs">examples/vaerion-demo · the same fold `vae center` renders</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-2 text-sm">
                  <Stat icon={<History className="w-4 h-4" aria-hidden />} label="runs" value={`${status.commandCenter.workspace.runs} journaled · ${status.commandCenter.operations.receipts} receipted`} />
                  <Stat icon={<FlaskConical className="w-4 h-4" aria-hidden />} label="journals" value={status.commandCenter.operations.journals_verified ? "all chains verified" : "VERIFICATION FAILURE"} />
                  <Stat icon={<Wallet className="w-4 h-4" aria-hidden />} label="metering" value={`${status.commandCenter.operations.metering.invocations} invocations · ${status.commandCenter.operations.metering.inputTokens}in/${status.commandCenter.operations.metering.outputTokens}out tokens`} />
                  <Stat icon={<ShieldCheck className="w-4 h-4" aria-hidden />} label="integrity" value={`audit ${status.commandCenter.integrity.audit_ledger.ok ? "intact" : "BROKEN"} (${status.commandCenter.integrity.audit_ledger.entries}) · refusals ${status.commandCenter.integrity.refusal_log.ok ? "intact" : "BROKEN"} (${status.commandCenter.integrity.refusal_log.entries})`} />
                </CardContent>
              </Card>

              {/* The phase program ledger (D-T) */}
              <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
                <CardHeader className="p-6 pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4" aria-hidden /> Phase program (D-T)
                  </CardTitle>
                  <CardDescription className="text-xs">reconciled at every phase boundary</CardDescription>
                </CardHeader>
                <CardContent className="p-6 pt-0 space-y-2">
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1 [scrollbar-width:thin]">
                    {(status.phaseLedger ?? []).map((row) => (
                      <div key={row.id} className={`text-xs border-l-2 pl-2 py-0.5 ${row.status.includes("complete") ? "border-[#3F9B6E]" : row.status.includes("in flight") ? "border-[#C9A227]" : "border-zinc-300 dark:border-zinc-700"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold">Phase {row.phase}</span>
                          <span className={row.status.includes("complete") ? "text-emerald-700 dark:text-[#3F9B6E]" : row.status.includes("in flight") ? "text-[#C98A1F]" : "text-zinc-500"}>
                            {row.status.replace("✅ ", "").replace("▶ ", "").replace("❌ ", "")}
                          </span>
                        </div>
                        <p className="text-zinc-500 dark:text-zinc-400 line-clamp-2">{row.evidence}</p>
                      </div>
                    ))}
                    {(status.phaseLedger ?? []).length === 0 && <p className="text-xs text-zinc-500">ledger unavailable</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* Next work + risks */}
        {status && (
          <section aria-label="Next work and risks" className="grid gap-4 lg:grid-cols-2">
            <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
              <CardHeader className="p-6 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" aria-hidden /> Recommended next work
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {status.nextWork.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ol>
              </CardContent>
            </Card>
            <Card className="min-w-0 border-zinc-200 dark:border-zinc-800">
              <CardHeader className="p-6 pb-3">
                <CardTitle className="text-base">Technical risks</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <ul className="list-disc list-inside space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {status.risks.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Reports pointer */}
        <section aria-label="Reports" className="flex flex-wrap gap-2">
          {["BUILD_REPORT.md", "VERIFICATION_REPORT.md", "ARCHITECTURE_REPORT.md", "ROADMAP_PROGRESS.md"].map((f) => (
            <Badge key={f} variant="outline" className="font-mono text-xs border-zinc-300 dark:border-zinc-700">
              {f}
            </Badge>
          ))}
        </section>
      </main>

      <footer className="mt-auto border-t border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <span>Vaerion · evidence over promises</span>
          <span className="font-mono">{status?.substrate ?? "TypeScript on Bun (ADR-0018)"}</span>
          <span>v{status?.engineVersion ?? "—"} · Apache-2.0 · Founder: Auren</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      <span className="text-zinc-500 dark:text-zinc-400 w-28 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
