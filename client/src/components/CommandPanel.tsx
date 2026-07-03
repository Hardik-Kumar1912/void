"use client";

import { useEffect, useRef, useState } from "react";
import {
  RotateCcw, Send, ChevronDown, ChevronRight,
  Zap, Sparkles, CheckCircle2, AlertCircle,
  AlertTriangle, Info, Cpu, Loader2,
} from "lucide-react";
import {
  FILE_ORDER, GeneratedFile, RunState,
  ChatMessage, ActivityLog, formatBytes,
} from "@/lib/coderBuddy";

type CommandPanelProps = {
  // Shared
  runState: RunState;
  loading: boolean;
  sessionReady: boolean;
  hasGeneratedProject: boolean;
  downloaded: boolean;
  isProjectComplete: boolean;
  connectionError: string;
  files: GeneratedFile[];
  activePath: string;
  logs: ActivityLog[];
  onDownload: () => void;
  onClear: () => void;
  onSelectFile: (path: string) => void;
  // Mode A (new project)
  prompt: string;
  onPromptChange: (value: string) => void;
  onStart: () => void;
  // Mode B (revision)
  messages: ChatMessage[];
  isRevisionMode: boolean;
  revisionPrompt: string;
  onRevisionPromptChange: (value: string) => void;
  onStartRevision: () => void;
  onResetConversation: () => void;
};

// ── Quick templates ────────────────────────────────────────────────────────────
const TEMPLATES = [
  { label: "Portfolio site with animated hero", prompt: "Portfolio site with dark theme and animated hero section" },
  { label: "Arcade browser game with score", prompt: "Arcade-style browser game with score tracking and lives" },
  { label: "Calculator with history log", prompt: "Create a sleek calculator with a scrollable calculation history" },
  { label: "To-do list with priorities", prompt: "Create a to-do list app with priority levels, filters, and local storage" },
];

// ── Tone config for live status icons ─────────────────────────────────────────
const TONE_ICON = {
  info:    <Info className="w-3 h-3 text-zinc-400" />,
  success: <CheckCircle2 className="w-3 h-3 text-lime-400" />,
  warning: <AlertTriangle className="w-3 h-3 text-amber-400" />,
  error:   <AlertCircle className="w-3 h-3 text-red-400" />,
};

const TONE_LABEL_COLOR = {
  info:    "text-zinc-400",
  success: "text-lime-300",
  warning: "text-amber-300",
  error:   "text-red-300",
};

// ── Node label → friendly name map ────────────────────────────────────────────
function friendlyNode(node: string): string {
  const map: Record<string, string> = {
    "SYSTEM": "System",
    "PLANNER": "Planner",
    "ARCHITECT": "Architect",
    "CODER STEP": "Coder",
    "ERROR HANDLER": "Error Handler",
    "SYSTEM ERROR": "Error",
  };
  return map[node] ?? node;
}

// ── Pipeline step labels shown in the header progress tracker ─────────────────
const PIPELINE = ["Planner", "Architect", "Coder"];

function detectStage(logs: ActivityLog[]): number {
  for (let i = logs.length - 1; i >= 0; i--) {
    const n = logs[i].node;
    if (n.includes("CODER")) return 2;
    if (n.includes("ARCHITECT")) return 1;
    if (n.includes("PLANNER")) return 0;
  }
  return -1;
}

// ── Live Build Status Panel ────────────────────────────────────────────────────
/**
 * Shown inside the chat history while loading=true.
 * Displays a pipeline progress bar and a live streaming log list with the
 * most recent entry highlighted and pulsing.
 */
function LiveStatusPanel({
  logs,
  isRevision,
}: {
  logs: ActivityLog[];
  isRevision: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const stage = detectStage(logs);
  const latest = logs[logs.length - 1] ?? null;

  // Auto-scroll as new log entries arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="live-status-panel">
      {/* ── Header row ───────────────────────────────────────────────── */}
      <div className="live-status-header">
        <div className="flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 text-cyan-400 live-spin" />
          <span className="live-status-title">
            {isRevision ? "Applying revision…" : "Building project…"}
          </span>
        </div>
        {/* pipeline tracker */}
        <div className="live-pipeline">
          {PIPELINE.map((step, i) => (
            <div key={step} className="live-pipeline-item">
              <div
                className={`live-pipeline-dot ${
                  i < stage
                    ? "live-pipeline-dot-done"
                    : i === stage
                      ? "live-pipeline-dot-active"
                      : "live-pipeline-dot-pending"
                }`}
              />
              <span
                className={`live-pipeline-label ${
                  i < stage
                    ? "text-lime-400"
                    : i === stage
                      ? "text-cyan-300"
                      : "text-zinc-600"
                }`}
              >
                {step}
              </span>
              {i < PIPELINE.length - 1 && (
                <div
                  className={`live-pipeline-line ${
                    i < stage ? "live-pipeline-line-done" : "live-pipeline-line-pending"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Current active step callout ──────────────────────────────── */}
      {latest && (
        <div className={`live-current-step live-current-step-${latest.tone}`}>
          <div className="flex items-center gap-1.5 shrink-0">
            {TONE_ICON[latest.tone]}
            <span className="live-current-node">{friendlyNode(latest.node)}</span>
          </div>
          <span className="live-current-detail">{latest.details}</span>
          <span className="live-current-time">{latest.timestamp}</span>
        </div>
      )}

      {/* ── Scrollable log stream ────────────────────────────────────── */}
      {logs.length > 0 && (
        <div className="live-log-stream">
          {logs.map((log, idx) => {
            const isLatest = idx === logs.length - 1;
            return (
              <div
                key={log.id}
                className={`live-log-row ${isLatest ? "live-log-row-latest" : ""}`}
              >
                <span className="shrink-0 mt-0.5">{TONE_ICON[log.tone]}</span>
                <div className="flex-1 min-w-0">
                  <span className={`live-log-node-tag ${TONE_LABEL_COLOR[log.tone]}`}>
                    {friendlyNode(log.node)}
                  </span>
                  <span className="live-log-detail-text">{log.details}</span>
                </div>
                <span className="live-log-time-tag">{log.timestamp}</span>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* If no logs yet, show a "waiting for agent" message */}
      {logs.length === 0 && (
        <div className="live-log-empty">
          <span className="chat-thinking-dot" />
          <span className="chat-thinking-dot" />
          <span className="chat-thinking-dot" />
          <span className="text-zinc-600 text-xs ml-1">Connecting to agent…</span>
        </div>
      )}
    </div>
  );
}

// ── Log accordion inside each COMPLETED assistant bubble ──────────────────────
function LogAccordion({ logs }: { logs: ActivityLog[] }) {
  const [open, setOpen] = useState(false);

  if (logs.length === 0) return null;

  return (
    <div className="log-accordion">
      <button className="log-accordion-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span>{logs.length} agent step{logs.length !== 1 ? "s" : ""}</span>
      </button>
      {open && (
        <div className="log-accordion-body">
          {logs.map((log) => (
            <div key={log.id} className={`log-entry log-entry-${log.tone}`}>
              <span className="log-node">{friendlyNode(log.node)}</span>
              <span className="log-detail">{log.details}</span>
              <span className="log-time">{log.timestamp}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Individual chat bubble ─────────────────────────────────────────────────────
function ChatBubble({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";

  return (
    <div className={`chat-bubble-wrap ${isUser ? "chat-bubble-wrap-user" : "chat-bubble-wrap-assistant"}`}>
      {!isUser && (
        <div className={`chat-avatar ${isStreaming ? "chat-avatar-active" : ""}`}>
          <Sparkles className="w-3 h-3 text-cyan-400" />
        </div>
      )}
      <div className={`chat-bubble ${isUser ? "chat-bubble-user" : "chat-bubble-assistant"}`}>
        {/* Only show text when NOT streaming (streaming shows LiveStatusPanel instead) */}
        {(!isStreaming) && <p className="chat-bubble-text">{message.text}</p>}
        {/* Completed assistant bubbles show collapsed log accordion */}
        {!isUser && !isStreaming && <LogAccordion logs={message.logs} />}
        <span className="chat-timestamp">{message.timestamp}</span>
      </div>
    </div>
  );
}

// ── Mode A: New Project View ───────────────────────────────────────────────────
function NewProjectView({
  prompt,
  loading,
  sessionReady,
  hasGeneratedProject,
  downloaded,
  isProjectComplete,
  connectionError,
  files,
  activePath,
  runState,
  logs,
  onPromptChange,
  onStart,
  onDownload,
  onClear,
  onSelectFile,
}: Pick<
  CommandPanelProps,
  | "prompt" | "loading" | "sessionReady" | "hasGeneratedProject"
  | "downloaded" | "isProjectComplete" | "connectionError"
  | "files" | "activePath" | "runState" | "logs"
  | "onPromptChange" | "onStart" | "onDownload" | "onClear" | "onSelectFile"
>) {
  const progress = Math.round(
    (files.filter((f) => f.exists).length / FILE_ORDER.length) * 100,
  );

  return (
    <>
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
          placeholder="Describe the application you want to build..."
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onStart();
          }}
          disabled={loading}
        />

        {/* Quick templates */}
        <div>
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Quick start</p>
          <div className="template-grid">
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                className="template-chip"
                onClick={() => onPromptChange(t.prompt)}
                disabled={loading}
              >
                <Zap className="w-3 h-3 shrink-0 text-cyan-400" />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          className="primary-action"
          onClick={onStart}
          disabled={loading || !prompt.trim() || !sessionReady}
        >
          {loading
            ? "Generating..."
            : hasGeneratedProject
              ? "Start new project"
              : "Initialize Build"}
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

        {/* Live build status — shown while generation is running */}
        {loading && (
          <LiveStatusPanel logs={logs} isRevision={false} />
        )}

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
    </>
  );
}

// ── Mode B: Chat / Revision View ───────────────────────────────────────────────
function RevisionView({
  messages,
  revisionPrompt,
  loading,
  sessionReady,
  connectionError,
  isProjectComplete,
  downloaded,
  onRevisionPromptChange,
  onStartRevision,
  onResetConversation,
  onDownload,
}: Pick<
  CommandPanelProps,
  | "messages" | "revisionPrompt" | "loading" | "sessionReady"
  | "connectionError" | "isProjectComplete" | "downloaded"
  | "onRevisionPromptChange" | "onStartRevision"
  | "onResetConversation" | "onDownload"
>) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages or logs arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !loading) {
      onStartRevision();
    }
  };

  // The last message is the one currently streaming (if loading=true)
  const lastMsg = messages[messages.length - 1] ?? null;
  const isLastAssistantStreaming =
    loading && lastMsg?.role === "assistant";

  // Determine if this is a new-project build or a revision
  // (first time there are exactly 2 messages = the initial build turn)
  const isRevision = messages.length > 2;

  return (
    <div className="revision-view">
      {/* Header */}
      <div className="panel-header">
        <div>
          <p className="eyebrow">Revision Studio</p>
          <h2 className="panel-title">Chat</h2>
        </div>
        <div className="flex items-center gap-2">
          {isProjectComplete && (
            <button
              className="artifact-button artifact-button-download"
              style={{ minHeight: 32, fontSize: 12, padding: "0 10px" }}
              onClick={onDownload}
              disabled={loading}
              title="Download ZIP"
            >
              {downloaded ? "Downloaded" : "ZIP"}
            </button>
          )}
          <button
            className="new-project-btn"
            onClick={onResetConversation}
            disabled={loading}
            title="Start a new project"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Scrollable chat history */}
      <div className="chat-history">
        {messages.map((msg, idx) => {
          const isThisStreaming =
            loading && idx === messages.length - 1 && msg.role === "assistant";
          return (
            <ChatBubble
              key={msg.id}
              message={msg}
              isStreaming={isThisStreaming}
            />
          );
        })}

        {/* Live status panel — shown between the last user bubble and bottom */}
        {isLastAssistantStreaming && (
          <LiveStatusPanel
            logs={lastMsg.logs}
            isRevision={isRevision}
          />
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Error notice */}
      {connectionError && (
        <div className="notice notice-error mx-3 mb-2">{connectionError}</div>
      )}

      {/* Pinned revision input bar */}
      <div className="revision-input-bar">
        <textarea
          className="revision-input"
          placeholder="Describe your changes… (⌘ Enter to send)"
          value={revisionPrompt}
          onChange={(e) => onRevisionPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          rows={2}
        />
        <button
          className="revision-send-btn"
          onClick={onStartRevision}
          disabled={loading || !revisionPrompt.trim() || !sessionReady}
          title="Apply changes (⌘ Enter)"
        >
          {loading ? (
            <span className="revision-spinner" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Main CommandPanel ─────────────────────────────────────────────────────────
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
  logs,
  onPromptChange,
  onStart,
  onDownload,
  onClear,
  onSelectFile,
  messages,
  isRevisionMode,
  revisionPrompt,
  onRevisionPromptChange,
  onStartRevision,
  onResetConversation,
}: CommandPanelProps) {
  if (isRevisionMode) {
    return (
      <aside className="workspace-panel command-panel" style={{ overflow: "hidden" }}>
        <RevisionView
          messages={messages}
          revisionPrompt={revisionPrompt}
          loading={loading}
          sessionReady={sessionReady}
          connectionError={connectionError}
          isProjectComplete={isProjectComplete}
          downloaded={downloaded}
          onRevisionPromptChange={onRevisionPromptChange}
          onStartRevision={onStartRevision}
          onResetConversation={onResetConversation}
          onDownload={onDownload}
        />
      </aside>
    );
  }

  return (
    <aside className="workspace-panel command-panel">
      <NewProjectView
        prompt={prompt}
        loading={loading}
        sessionReady={sessionReady}
        hasGeneratedProject={hasGeneratedProject}
        downloaded={downloaded}
        isProjectComplete={isProjectComplete}
        connectionError={connectionError}
        files={files}
        activePath={activePath}
        runState={runState}
        logs={logs}
        onPromptChange={onPromptChange}
        onStart={onStart}
        onDownload={onDownload}
        onClear={onClear}
        onSelectFile={onSelectFile}
      />
    </aside>
  );
}
