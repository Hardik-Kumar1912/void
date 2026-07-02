"use client";

import { ActivityLog } from "@/lib/coderBuddy";

type ActivityFeedProps = {
  logs: ActivityLog[];
  loading: boolean;
};

function toneClass(tone: ActivityLog["tone"]) {
  if (tone === "success") return "bg-lime-300/15 text-lime-200";
  if (tone === "warning") return "bg-amber-300/15 text-amber-200";
  if (tone === "error") return "bg-red-300/15 text-red-200";
  return "bg-cyan-300/15 text-cyan-200";
}

export function ActivityFeed({ logs, loading }: ActivityFeedProps) {
  return (
    <div className="activity-feed">
      {logs.length === 0 ? (
        <div className="empty-state">
          <p className="text-sm font-semibold text-zinc-300">
            {loading ? "Starting the agent run" : "No run activity yet"}
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Planner, architect, coder, retries, and final status appear here.
          </p>
        </div>
      ) : (
        logs.map((log) => (
          <article key={log.id} className="activity-item">
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded px-2 py-1 text-[11px] font-bold ${toneClass(log.tone)}`}>
                {log.node}
              </span>
              <time className="shrink-0 text-[11px] text-zinc-500">
                {log.timestamp}
              </time>
            </div>
            <p className="mt-2 break-words text-sm leading-6 text-zinc-300">
              {log.details}
            </p>
          </article>
        ))
      )}
    </div>
  );
}
