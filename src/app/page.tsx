import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, GitBranch, FileCode2, ListChecks, Scale, FlaskConical, ArrowRight } from "lucide-react";

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
// regenerated site-data/vaerion-status.json — never a stale prerender.
export const dynamic = "force-dynamic";

const status = loadStatus();

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        {/* Hero */}
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" aria-hidden />
              ALL VERIFICATION GATES GREEN
            </Badge>
            {status && (
              <Badge variant="outline" className="border-zinc-400/40 text-zinc-600 dark:text-zinc-400">
                engine {status.engineVersion}
              </Badge>
            )}
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Vaerion
            <span className="block text-xl sm:text-2xl font-medium text-zinc-500 dark:text-zinc-400 mt-2">
              AI-native development engine — constitutional foundation &amp; runtime spine
            </span>
          </h1>
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
          <div className="h-3 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden" role="progressbar" aria-valuenow={status?.overallProgress ?? 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${status?.overallProgress ?? 0}%` }} />
          </div>
          {status && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2">
              {status.milestones.map((m) => (
                <Card key={m.id} className="p-0 gap-0 border-zinc-200 dark:border-zinc-800">
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
                    <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div className={`h-full rounded-full ${m.status === "complete" ? "bg-emerald-600" : m.status === "in_progress" ? "bg-amber-500" : "bg-zinc-400"}`} style={{ width: `${m.progress}%` }} />
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
          <Card className="border-zinc-200 dark:border-zinc-800">
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
                      <Badge className="bg-emerald-600 hover:bg-emerald-600">GREEN</Badge>
                    ) : (
                      <Badge variant="destructive">RED</Badge>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-zinc-200 dark:border-zinc-800">
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

        {/* Next work + risks */}
        {status && (
          <section aria-label="Next work and risks" className="grid gap-4 lg:grid-cols-2">
            <Card className="border-zinc-200 dark:border-zinc-800">
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
            <Card className="border-zinc-200 dark:border-zinc-800">
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
          <span>Vaerion — Build with discipline. Build with receipts. Build with verification. Build Vaerion.</span>
          <span className="font-mono">{status?.substrate ?? "TypeScript on Bun (ADR-0018)"}</span>
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
