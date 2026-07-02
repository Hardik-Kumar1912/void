"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  API_URL,
  FILE_ORDER,
  SESSION_STORAGE_KEY,
  ActivityLog,
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

    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Generation API returned ${response.status}`);
      }

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
            setLogs((previous) => [
              ...previous,
              {
                id: makeId(),
                node: "SYSTEM ERROR",
                tone: "error",
                timestamp: new Date().toLocaleTimeString(),
                details: errorMessage,
              },
            ]);
            continue;
          }

          if (!isRecord(parsed)) continue;

          const [node, payload] = Object.entries(parsed)[0] || ["system", {}];
          const summary = extractProjectSummary(payload);
          const nextSteps = extractSteps(payload);

          if (summary) setProjectSummary(summary);
          if (nextSteps) setSteps(nextSteps);

          setLogs((previous) => [...previous, describeChunk(node, payload)]);
          await refreshFiles(true);
        }
      }

      await refreshFiles(true);
      setRunState(streamHadError ? "failed" : "complete");
    } catch (error) {
      const message =
        error instanceof Error
          ? summarizeError(error.message)
          : "Generation failed.";
      setConnectionError(message);
      setRunState("failed");
      setLogs((previous) => [
        ...previous,
        {
          id: makeId(),
          node: "SYSTEM ERROR",
          tone: "error",
          timestamp: new Date().toLocaleTimeString(),
          details: message,
        },
      ]);
    }
  }, [
    downloaded,
    hasGeneratedProject,
    loading,
    prompt,
    refreshFiles,
    requestHeaders,
    sessionId,
  ]);

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
    prompt,
    setPrompt,
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
    startGeneration,
    downloadProject,
    clearProject,
    refreshFiles,
    reloadPreview,
    openPreview,
  };
}
