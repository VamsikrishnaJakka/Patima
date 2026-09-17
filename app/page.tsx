"use client";

import { useMemo, useState } from "react";
import { Search, ShieldCheck, ChevronRight, FileCheck2, BriefcaseBusiness } from "lucide-react";
import { candidates, demoCandidate, hiringRequirements } from "@/lib/data";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(demoCandidate.handle);

  const visibleCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((candidate) =>
      [candidate.name, candidate.headline, candidate.location, ...candidate.capabilities.map((c) => c.capability)]
        .some((value) => value.toLowerCase().includes(q)),
    );
  }, [query]);

  const candidate = candidates.find((item) => item.handle === selected) ?? demoCandidate;

  return (
    <main className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <div className="text-lg font-semibold tracking-tight text-white">PATIMA</div>
            <div className="text-xs text-slate-500">Evidence-first professional ecosystem</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4" /> Inspectable evidence
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 py-8 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="mb-5 flex items-center gap-2 text-sm font-medium text-white">
            <BriefcaseBusiness className="h-4 w-4" /> Hiring Inspector
          </div>
          <label className="mb-2 block text-xs text-slate-500">Required capabilities</label>
          <div className="space-y-2">
            {hiringRequirements.map((requirement) => (
              <div key={requirement} className="rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300">
                {requirement}
              </div>
            ))}
          </div>

          <div className="my-6 h-px bg-slate-800" />
          <label className="mb-2 block text-xs text-slate-500" htmlFor="candidate-search">Search evidence</label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-600" />
            <input
              id="candidate-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Capability, role, location"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-slate-600"
            />
          </div>

          <div className="mt-5 space-y-1">
            {visibleCandidates.map((item) => (
              <button
                key={item.handle}
                onClick={() => setSelected(item.handle)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left ${selected === item.handle ? "bg-slate-800" : "hover:bg-slate-900"}`}
              >
                <span>
                  <span className="block text-sm text-slate-200">{item.name}</span>
                  <span className="block text-xs text-slate-500">{item.headline}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            ))}
          </div>
        </aside>

        <section className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/30">
          <div className="border-b border-slate-800 px-6 py-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-600">Candidate dossier</p>
                <h1 className="text-2xl font-semibold tracking-tight text-white">{candidate.name}</h1>
                <p className="mt-1 text-sm text-slate-400">{candidate.headline} · {candidate.location}</p>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400">/{candidate.handle}</span>
            </div>
          </div>

          <div className="divide-y divide-slate-800">
            {candidate.capabilities.map((evidence) => (
              <article key={evidence.id} className="px-6 py-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-slate-500" />
                    <h2 className="font-medium text-slate-200">{evidence.capability}</h2>
                  </div>
                  <div className="flex gap-2 text-[11px] uppercase tracking-wide">
                    <span className="rounded border border-slate-700 px-2 py-1 text-slate-400">{evidence.state}</span>
                    <span className="rounded border border-slate-700 px-2 py-1 text-slate-500">{evidence.verification}</span>
                  </div>
                </div>
                <dl className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div><dt className="text-xs text-slate-600">Observed</dt><dd className="mt-1 text-sm text-slate-400">{evidence.observedAt}</dd></div>
                  <div><dt className="text-xs text-slate-600">Context</dt><dd className="mt-1 text-sm text-slate-400">{evidence.context}</dd></div>
                  <div><dt className="text-xs text-slate-600">Artifact</dt><dd className="mt-1 font-mono text-sm text-slate-400">{evidence.artifact}</dd></div>
                </dl>
              </article>
            ))}
          </div>

          <div className="border-t border-slate-800 px-6 py-5 text-xs leading-5 text-slate-600">
            PATIMA does not convert this dossier into a hidden match score. Each capability remains inspectable as a separate claim, observation, verification state, context, date, and artifact.
          </div>
        </section>
      </div>
    </main>
  );
}
