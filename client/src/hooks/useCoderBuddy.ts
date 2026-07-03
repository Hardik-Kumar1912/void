"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  API_URL,
  FILE_ORDER,
  SESSION_STORAGE_KEY,
  ActivityLog,
  ChatMessage,
  GeneratedFile,
  ImplementationStep,
  ProjectSummary,
  RunState,
  asNumber,
  asString,
  createSessionId,
  describeChunk,
  emptyFiles,
  extractProjectSummary,
  extractSteps,
  isRecord,
  makeId,
  summarizeError,
} from "@/lib/coderBuddy";

export function useCoderBuddy() {
  const [prompt, setPrompt] = useState("");
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [files, setFiles] = useState<GeneratedFile[]>(emptyFiles);
  const [activePath, setActivePath] = useState("index.html");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [projectSummary, setProjectSummary] = useState<ProjectSummary | null>(null);
  const [steps, setSteps] = useState<ImplementationStep[]>([]);
  const [connectionError, setConnectionError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [showDownloadPrompt, setShowDownloadPrompt] = useState(false);

  // ── Chat / multi-turn conversation state ──────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // We use a ref for the "current turn's accumulating logs" so we can
  // append to them without stale-closure issues inside the streaming loop.
  const currentTurnLogsRef = useRef<ActivityLog[]>([]);

  const activeFile = useMemo(
    () => files.find((file) => file.path === activePath) || files[0],
    [activePath, files],
  );

  const completedFiles = files.filter((file) => file.exists).length;
  const hasGeneratedProject = files.some((file) => file.exists);
  const isProjectComplete = completedFiles === FILE_ORDER.length;
  const loading = runState === "running";
  const previewBaseUrl = sessionId
    ? `${API_URL}/generated/${sessionId}/index.html`
    : "";
  const previewSrc = previewBaseUrl ? `${previewBaseUrl}?v=${previewVersion}` : "";

  // Whether the UI should show Revision Mode (chat history) vs. New Project mode
  const isRevisionMode = messages.length > 0;

  const requestHeaders = useMemo(
    () => ({
      "x-coder-buddy-session": sessionId,
    }),
    [sessionId],
  );

  const refreshFiles = useCallback(async (bumpPreview = false) => {
    if (!sessionId) return;

    try {
      const response = await fetch(`${API_URL}/api/project-files`, {
        cache: "no-store",
        headers: requestHeaders,
      });

      if (!response.ok) {
        throw new Error(`File API returned ${response.status}`);
      }

      const data = (await response.json()) as unknown;
      if (!isRecord(data) || !Array.isArray(data.files)) return;

      const nextFiles = data.files.filter(isRecord).map((file) => ({
        path: asString(file.path),
        language: asString(file.language, "plaintext"),
        exists: Boolean(file.exists),
        size: asNumber(file.size),
        content: asString(file.content),
      }));

      setFiles(
        FILE_ORDER.map(
          (path) => nextFiles.find((file) => file.path === path) ||
            emptyFiles.find((file) => file.path === path)!,
        ),
      );
      setConnectionError("");

      if (bumpPreview) {
        setPreviewVersion((version) => version + 1);
      }
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Could not reach the backend.",
      );
    }
  }, [requestHeaders, sessionId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedSessionId = window.localStorage.getItem(SESSION_STORAGE_KEY);
      const nextSessionId = savedSessionId || createSessionId();

      window.localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
      setSessionId(nextSessionId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const timer = window.setTimeout(() => {
      void refreshFiles(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refreshFiles, sessionId]);

  // ── Shared SSE streaming loop ──────────────────────────────────────────────
  /**
   * Consumes the SSE stream from /api/generate and dispatches:
   * - setLogs updates (global)
   * - currentTurnLogsRef accumulation (for attaching to chat messages)
   * - refreshFiles on each chunk
   * Returns { hadError: boolean }
   */
  const consumeStream = useCallback(async (
    response: Response,
    onNewLog: (log: ActivityLog) => void,
  ): Promise<{ hadError: boolean }> => {
    if (!response.body) {
      throw new Error("The backend did not open a stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamHadError = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        const line = event
          .split("\n")
          .find((candidate) => candidate.startsWith("data: "));

        if (!line) continue;

        const rawJson = line.replace("data: ", "").trim();
        if (!rawJson) continue;

        const parsed = JSON.parse(rawJson) as unknown;

        if (isRecord(parsed) && typeof parsed.error === "string") {
          const errorMessage = summarizeError(
            asString(parsed.error, "Generation failed."),
          );
          streamHadError = true;
          const errorLog: ActivityLog = {
            id: makeId(),
            node: "SYSTEM ERROR",
            tone: "error",
            timestamp: new Date().toLocaleTimeString(),
            details: errorMessage,
          };
          onNewLog(errorLog);
          continue;
        }

        if (!isRecord(parsed)) continue;

        const [node, payload] = Object.entries(parsed)[0] || ["system", {}];
        const summary = extractProjectSummary(payload);
        const nextSteps = extractSteps(payload);

        if (summary) setProjectSummary(summary);
        if (nextSteps) setSteps(nextSteps);

        const newLog = describeChunk(node, payload);
        onNewLog(newLog);
        await refreshFiles(true);
      }
    }

    return { hadError: streamHadError };
  }, [refreshFiles]);

  // ── New project generation (Mode A) ───────────────────────────────────────
  const startGeneration = useCallback(async (skipDownloadCheck = false) => {
    if (!prompt.trim() || loading || !sessionId) return;

    if (hasGeneratedProject && !downloaded && !skipDownloadCheck) {
      setShowDownloadPrompt(true);
      return;
    }

    setRunState("running");
    setShowDownloadPrompt(false);
    setDownloaded(false);
    setLogs([]);
    setFiles(emptyFiles);
    setProjectSummary(null);
    setSteps([]);
    setConnectionError("");
    setPreviewVersion((version) => version + 1);

    // Reset conversation and start a fresh chat thread
    currentTurnLogsRef.current = [];

    // Immediately add the user's initial message to the chat
    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      text: prompt,
      logs: [],
      timestamp: new Date().toLocaleTimeString(),
    };

    // Placeholder assistant message that we'll populate as logs arrive
    const assistantMessageId = makeId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      text: "Building your project...",
      logs: [],
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages([userMessage, assistantMessage]);

    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ prompt, is_revision: false }),
      });

      if (!response.ok) {
        throw new Error(`Generation API returned ${response.status}`);
      }

      const onNewLog = (log: ActivityLog) => {
        currentTurnLogsRef.current = [...currentTurnLogsRef.current, log];
        setLogs((prev) => [...prev, log]);
        // Keep the assistant message's logs in sync
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, logs: currentTurnLogsRef.current }
              : msg,
          ),
        );
      };

      const { hadError } = await consumeStream(response, onNewLog);

      await refreshFiles(true);

      // Finalize the assistant message
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                text: hadError
                  ? "Generation completed with some errors."
                  : "Project generated successfully. Describe any changes you'd like to make.",
                logs: currentTurnLogsRef.current,
              }
            : msg,
        ),
      );

      setRunState(hadError ? "failed" : "complete");
    } catch (error) {
      const message =
        error instanceof Error
          ? summarizeError(error.message)
          : "Generation failed.";
      setConnectionError(message);
      setRunState("failed");
      const errorLog: ActivityLog = {
        id: makeId(),
        node: "SYSTEM ERROR",
        tone: "error",
        timestamp: new Date().toLocaleTimeString(),
        details: message,
      };
      setLogs((prev) => [...prev, errorLog]);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                text: "Generation failed. Please try again.",
                logs: [...currentTurnLogsRef.current, errorLog],
              }
            : msg,
        ),
      );
    }
  }, [
    consumeStream,
    downloaded,
    hasGeneratedProject,
    loading,
    prompt,
    refreshFiles,
    requestHeaders,
    sessionId,
  ]);

  // ── Revision (Mode B) ──────────────────────────────────────────────────────
  const startRevision = useCallback(async () => {
    if (!revisionPrompt.trim() || loading || !sessionId) return;

    const capturedPrompt = revisionPrompt;
    setRevisionPrompt(""); // Clear the input immediately for UX
    setRunState("running");
    setConnectionError("");
    currentTurnLogsRef.current = [];

    // Immediately append user bubble
    const userMessage: ChatMessage = {
      id: makeId(),
      role: "user",
      text: capturedPrompt,
      logs: [],
      timestamp: new Date().toLocaleTimeString(),
    };

    const assistantMessageId = makeId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      text: "Applying your changes...",
      logs: [],
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    // Grab the current file contents from in-memory state to send to the backend
    const currentFilesPayload = {
      html: files.find((f) => f.path === "index.html")?.content ?? "",
      css: files.find((f) => f.path === "styles.css")?.content ?? "",
      js: files.find((f) => f.path === "script.js")?.content ?? "",
    };

    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({
          prompt: capturedPrompt,
          is_revision: true,
          current_files: currentFilesPayload,
        }),
      });

      if (!response.ok) {
        throw new Error(`Generation API returned ${response.status}`);
      }

      const onNewLog = (log: ActivityLog) => {
        currentTurnLogsRef.current = [...currentTurnLogsRef.current, log];
        setLogs((prev) => [...prev, log]);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, logs: currentTurnLogsRef.current }
              : msg,
          ),
        );
      };

      const { hadError } = await consumeStream(response, onNewLog);

      await refreshFiles(true);

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                text: hadError
                  ? "Revision completed with some errors."
                  : "Done! Your project has been updated. Describe your next change.",
                logs: currentTurnLogsRef.current,
              }
            : msg,
        ),
      );

      setRunState(hadError ? "failed" : "complete");
    } catch (error) {
      const message =
        error instanceof Error
          ? summarizeError(error.message)
          : "Revision failed.";
      setConnectionError(message);
      setRunState("failed");
      const errorLog: ActivityLog = {
        id: makeId(),
        node: "SYSTEM ERROR",
        tone: "error",
        timestamp: new Date().toLocaleTimeString(),
        details: message,
      };
      setLogs((prev) => [...prev, errorLog]);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                text: "Revision failed. Please try again.",
                logs: [...currentTurnLogsRef.current, errorLog],
              }
            : msg,
        ),
      );
    }
  }, [
    consumeStream,
    files,
    loading,
    refreshFiles,
    requestHeaders,
    revisionPrompt,
    sessionId,
  ]);

  // ── Reset conversation + project (New Project button) ─────────────────────
  const resetConversation = useCallback(async () => {
    if (loading) return;

    // Clear server-side files
    try {
      if (sessionId) {
        await fetch(`${API_URL}/api/project-files`, {
          method: "DELETE",
          headers: requestHeaders,
        });
      }
    } catch {
      // Non-fatal — continue resetting the client state anyway
    }

    setMessages([]);
    setFiles(emptyFiles);
    setLogs([]);
    setSteps([]);
    setProjectSummary(null);
    setPrompt("");
    setRevisionPrompt("");
    setDownloaded(false);
    setRunState("idle");
    setConnectionError("");
    setPreviewVersion((version) => version + 1);
    currentTurnLogsRef.current = [];
  }, [loading, requestHeaders, sessionId]);

  const downloadProject = useCallback(async () => {
    if (!sessionId || !isProjectComplete) return;

    try {
      const response = await fetch(`${API_URL}/api/download-project`, {
        headers: requestHeaders,
      });

      if (!response.ok) {
        throw new Error(`Download API returned ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "coder-buddy-project.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setDownloaded(true);
      setShowDownloadPrompt(false);
      setConnectionError("");
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Could not download project.",
      );
    }
  }, [isProjectComplete, requestHeaders, sessionId]);

  const clearProject = useCallback(async () => {
    if (!sessionId || loading) return;

    try {
      const response = await fetch(`${API_URL}/api/project-files`, {
        method: "DELETE",
        headers: requestHeaders,
      });

      if (!response.ok) {
        throw new Error(`Clear API returned ${response.status}`);
      }

      setFiles(emptyFiles);
      setSteps([]);
      setLogs([]);
      setProjectSummary(null);
      setDownloaded(false);
      setRunState("idle");
      setConnectionError("");
      setPreviewVersion((version) => version + 1);
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : "Could not clear project.",
      );
    }
  }, [loading, requestHeaders, sessionId]);

  const reloadPreview = useCallback(() => {
    setPreviewVersion((version) => version + 1);
  }, []);

  const openPreview = useCallback(() => {
    if (!previewBaseUrl || !hasGeneratedProject) return;
    window.open(previewBaseUrl, "_blank", "noopener,noreferrer");
  }, [hasGeneratedProject, previewBaseUrl]);

  return {
    // Prompt state
    prompt,
    setPrompt,
    revisionPrompt,
    setRevisionPrompt,
    // Chat / conversation
    messages,
    isRevisionMode,
    // Run state
    runState,
    logs,
    files,
    activePath,
    setActivePath,
    activeFile,
    completedFiles,
    hasGeneratedProject,
    isProjectComplete,
    loading,
    previewSrc,
    projectSummary,
    steps,
    connectionError,
    sessionId,
    downloaded,
    showDownloadPrompt,
    setShowDownloadPrompt,
    // Actions
    startGeneration,
    startRevision,
    resetConversation,
    downloadProject,
    clearProject,
    refreshFiles,
    reloadPreview,
    openPreview,
  };
}
