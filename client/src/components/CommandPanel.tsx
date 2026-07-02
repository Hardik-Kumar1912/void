"use client";

import { FILE_ORDER, GeneratedFile, RunState, formatBytes } from "@/lib/coderBuddy";

type CommandPanelProps = {
  prompt: string;
  runState: RunState;
  loading: boolean;
  sessionReady: boolean;
  hasGeneratedProject: boolean;
  downloaded: boolean;
  isProjectComplete: boolean;
  connectionError: string;
  files: GeneratedFile[];
  activePath: string;
  onPromptChange: (value: string) => void;
  onStart: () => void;
  onDownload: () => void;
  onClear: () => void;
  onSelectFile: (path: string) => void;
};

export function CommandPanel({
  prompt,
  runState,
  loading,
  sessionReady,
  hasGeneratedProject,
  downloaded,
  isProjectComplete,
  connectionError,
  files,
  activePath,
  onPromptChange,
  onStart,
  onDownload,
  onClear,
  onSelectFile,
}: CommandPanelProps) {
  const progress = Math.round(
    (files.filter((file) => file.exists).length / FILE_ORDER.length) * 100,
  );

  return (
    <aside className="workspace-panel command-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Command</p>
          <h2 className="panel-title">Project request</h2>
        </div>
        <span className="text-xs text-zinc-500">{progress}%</span>
      </div>

      <div className="panel-body gap-4">
        <textarea
          className="prompt-box"
          placeholder="Build a polished portfolio, arcade game, calculator, launch page..."
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              onStart();
            }
          }}
          disabled={loading}
        />

        <button
          className="primary-action"
          onClick={onStart}
          disabled={loading || !prompt.trim() || !sessionReady}
        >
          {loading
            ? "Generating"
            : hasGeneratedProject
              ? "Start new project"
              : "Run command"}
        </button>

        <div className="artifact-actions">
          <button
            className="artifact-button artifact-button-download"
            onClick={onDownload}
            disabled={!isProjectComplete || loading}
          >
            {downloaded ? "Downloaded" : isProjectComplete ? "Download ZIP" : "ZIP pending"}
          </button>
          <button
            className="artifact-button"
            onClick={onClear}
            disabled={!hasGeneratedProject || loading}
          >
            Clear
          </button>
        </div>

        {hasGeneratedProject && !downloaded ? (
          <div className="notice notice-warn">
            Download before replacing this project. A new command clears the current session files.
          </div>
        ) : null}

        {connectionError ? (
          <div className="notice notice-error">{connectionError}</div>
        ) : null}

        <section>
          <div className="section-row">
            <h3 className="section-title">Files</h3>
            <span className="text-xs text-zinc-500">{runState}</span>
          </div>
          <div className="file-stack">
            {files.map((file) => (
              <button
                key={file.path}
                className={`file-row ${activePath === file.path ? "file-row-active" : ""}`}
                onClick={() => onSelectFile(file.path)}
              >
                <span className="truncate text-sm font-semibold">{file.path}</span>
                <span className={file.exists ? "text-lime-300" : "text-zinc-500"}>
                  {file.exists ? formatBytes(file.size) : "waiting"}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
}
