"use client";

import { RunState } from "@/lib/coderBuddy";

type TopBarProps = {
  runState: RunState;
};

function statusClass(runState: RunState) {
  if (runState === "running") return "border-amber-300/35 bg-amber-300/12 text-amber-100";
  if (runState === "complete") return "border-lime-300/35 bg-lime-300/12 text-lime-100";
  if (runState === "failed") return "border-red-300/35 bg-red-300/12 text-red-100";
  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

export function TopBar({
  runState,
}: TopBarProps) {
  return (
    <header className="workspace-topbar">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-200">
          Void
        </p>
        <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-zinc-50">
          Build, inspect, preview, ship
        </h1>
      </div>

      <div className="topbar-controls">
        <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClass(runState)}`}>
          {runState}
        </span>
        <span className="topbar-hint">Drag panel edges to resize the workspace</span>
      </div>
    </header>
  );
}
