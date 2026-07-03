"use client";

import { GeneratedFile, ImplementationStep, ProjectSummary } from "@/lib/coderBuddy";

type InspectorTab = "preview" | "plan";

type PreviewPanelProps = {
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  previewSrc: string;
  hasGeneratedProject: boolean;
  projectSummary: ProjectSummary | null;
  steps: ImplementationStep[];
  files: GeneratedFile[];
  onReload: () => void;
  onOpenPreview: () => void;
};

export function PreviewPanel({
  tab,
  onTabChange,
  previewSrc,
  hasGeneratedProject,
  projectSummary,
  steps,
  files,
  onReload,
  onOpenPreview,
}: PreviewPanelProps) {
  const hasSteps = steps.length > 0;
  const hasSummary = projectSummary !== null;

  return (
    <aside className="workspace-panel min-w-0">
      <div className="panel-header">
        <div className="segmented">
          <button
            className={tab === "preview" ? "segmented-active" : ""}
            onClick={() => onTabChange("preview")}
          >
            Preview
          </button>
          <button
            className={tab === "plan" ? "segmented-active" : ""}
            onClick={() => onTabChange("plan")}
          >
            Plan
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="ghost-button" onClick={onReload} disabled={!hasGeneratedProject}>
            Reload
          </button>
          <button className="ghost-button ghost-button-strong" onClick={onOpenPreview} disabled={!hasGeneratedProject}>
            Open
          </button>
        </div>
      </div>

      {tab === "preview" ? (
        <div className="preview-area">
          {hasGeneratedProject && previewSrc ? (
            <iframe
              key={previewSrc}
              title="Generated project preview"
              src={previewSrc}
              className="h-full w-full bg-white"
            />
          ) : (
            <div className="preview-empty">
              <p className="text-sm font-semibold text-zinc-700">Preview waiting</p>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                The site appears as soon as index.html is written.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="panel-body overflow-y-auto">
          {!hasSummary && !hasSteps ? (
            <div className="preview-empty">
              <p className="text-sm font-semibold text-zinc-600">No plan yet</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                The architect&apos;s implementation plan will appear here once generation starts.
              </p>
            </div>
          ) : (
            <>
              {hasSummary && (
                <section className="summary-block">
                  <h3 className="text-base font-semibold text-zinc-100">
                    {projectSummary!.name}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {projectSummary!.description}
                  </p>
                  {projectSummary!.features.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {projectSummary!.features.slice(0, 6).map((feature) => (
                        <span key={feature} className="feature-pill">
                          {feature}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </section>
              )}

              {hasSteps && (
                <div className="plan-list">
                  {steps.map((step, index) => {
                    const fileReady = files.find((file) => file.path === step.filepath)?.exists;
                    return (
                      <article key={`${step.filepath}-${index}`} className="plan-item">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-semibold text-zinc-100">
                            {index + 1}. {step.filepath}
                          </span>
                          <span className={fileReady ? "text-xs text-lime-300" : "text-xs text-zinc-500"}>
                            {fileReady ? "done" : "pending"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">
                          {step.task_description}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </aside>
  );
}
