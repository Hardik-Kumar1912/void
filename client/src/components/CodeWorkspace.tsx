"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ActivityLog, GeneratedFile } from "@/lib/coderBuddy";
import { DeployToGithubModal } from "@/components/DeployToGithubModal";
import { GithubIcon } from "@/components/GithubIcon";
import { DeployToVercelModal } from "@/components/DeployToVercelModal";
import { VercelIcon } from "@/components/VercelIcon";

type WorkspaceTab = "code" | "activity";

type CodeWorkspaceProps = {
  tab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  activeFile: GeneratedFile;
  files: GeneratedFile[];
  activePath: string;
  completedFiles: number;
  editorFontSize: number;
  logs: ActivityLog[];
  loading: boolean;
  onEditorFontSizeChange: (value: number) => void;
  onSelectFile: (path: string) => void;
  onRefresh: () => void;
};

export function CodeWorkspace({
  tab,
  onTabChange,
  activeFile,
  files,
  activePath,
  completedFiles,
  editorFontSize,
  logs,
  loading,
  onEditorFontSizeChange,
  onSelectFile,
  onRefresh,
}: CodeWorkspaceProps) {
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [showVercelModal, setShowVercelModal] = useState(false);

  const decreaseFontSize = () => {
    onEditorFontSizeChange(Math.max(12, editorFontSize - 1));
  };

  const increaseFontSize = () => {
    onEditorFontSizeChange(Math.min(18, editorFontSize + 1));
  };

  return (
    <section className="workspace-panel min-w-0">
      <div className="panel-header flex-wrap gap-y-2 min-h-[48px] h-auto py-2">
        <div className="segmented shrink-0">
          <button
            className={tab === "code" ? "segmented-active" : ""}
            onClick={() => onTabChange("code")}
          >
            Code
          </button>
          <button
            className={tab === "activity" ? "segmented-active" : ""}
            onClick={() => onTabChange("activity")}
          >
            Activity
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-zinc-400 flex-wrap justify-end flex-1 min-w-0">
          {tab === "code" ? (
            <div className="font-stepper shrink-0" aria-label="Code font size">
              <button onClick={decreaseFontSize} disabled={editorFontSize <= 12}>
                A-
              </button>
              <span>{editorFontSize}px</span>
              <button onClick={increaseFontSize} disabled={editorFontSize >= 18}>
                A+
              </button>
            </div>
          ) : null}
          <span className="shrink-0 text-zinc-500">{completedFiles}/3</span>
          {/* Deploy buttons — show icon+text when space, icon-only when tight */}
          <button
            className="ghost-button flex items-center gap-1 text-zinc-300 hover:text-white transition-colors shrink-0"
            onClick={() => setShowDeployModal(true)}
            title="Deploy to GitHub"
          >
            <GithubIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">GitHub</span>
          </button>
          <button
            className="ghost-button flex items-center gap-1 text-zinc-300 hover:text-white transition-colors shrink-0"
            onClick={() => setShowVercelModal(true)}
            title="Deploy to Vercel"
          >
            <VercelIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Vercel</span>
          </button>
          <button className="ghost-button shrink-0" onClick={onRefresh} title="Refresh preview">
            ↺
          </button>
        </div>
      </div>

      {tab === "code" ? (
        <>
          <div className="file-tabs">
            {files.map((file) => (
              <button
                key={file.path}
                className={`file-tab ${activePath === file.path ? "file-tab-active" : ""}`}
                onClick={() => onSelectFile(file.path)}
              >
                <span>{file.path}</span>
                <span className={file.exists ? "file-dot file-dot-ready" : "file-dot"} />
              </button>
            ))}
          </div>
          <div className="editor-shell">
            <Editor
              height="100%"
              theme="vs-dark"
              language={activeFile?.language || "plaintext"}
              value={
                activeFile?.content ||
                `/* ${activeFile?.path || "file"} has not been generated yet. */`
              }
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: editorFontSize,
                lineHeight: Math.round(editorFontSize * 1.6),
                padding: { top: 18, bottom: 18 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                fontFamily: "Consolas, Menlo, Monaco, monospace",
              }}
            />
          </div>
        </>
      ) : (
        <div className="panel-body overflow-y-auto">
          <ActivityFeed logs={logs} loading={loading} />
        </div>
      )}
      {showDeployModal && (
        <DeployToGithubModal files={files} onClose={() => setShowDeployModal(false)} />
      )}
      {showVercelModal && (
        <DeployToVercelModal files={files} onClose={() => setShowVercelModal(false)} />
      )}
    </section>
  );
}
