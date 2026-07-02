export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const FILE_ORDER = ["index.html", "styles.css", "script.js"];
export const SESSION_STORAGE_KEY = "coder-buddy-session-id";

export type GeneratedFile = {
  path: string;
  language: string;
  exists: boolean;
  size: number;
  content: string;
};

export type ActivityLog = {
  id: string;
  node: string;
  tone: "info" | "success" | "warning" | "error";
  timestamp: string;
  details: string;
};

export type ImplementationStep = {
  filepath: string;
  task_description: string;
};

export type ProjectSummary = {
  name: string;
  description: string;
  features: string[];
};

export type RunState = "idle" | "running" | "complete" | "failed";
export type RecordValue = Record<string, unknown>;

export const emptyFiles: GeneratedFile[] = FILE_ORDER.map((path) => ({
  path,
  language: path.endsWith(".html")
    ? "html"
    : path.endsWith(".css")
      ? "css"
      : "javascript",
  exists: false,
  size: 0,
  content: "",
}));

export function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${makeId()}`;
}

export function formatBytes(size: number) {
  if (size <= 0) return "0 B";
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(1)} KB`;
}

export function summarizeError(error: string) {
  if (
    error.includes("repo_browser.open_file") ||
    error.includes("not in request.tools")
  ) {
    return "The coder tried an unavailable repo-browser tool. The backend will retry with the correct file tools.";
  }

  const firstLine = error.split("\n").find(Boolean) || error;
  return firstLine.length > 280 ? `${firstLine.slice(0, 280)}...` : firstLine;
}

export function describeChunk(node: string, payload: unknown): ActivityLog {
  const data = isRecord(payload) ? payload : {};
  const status = asString(data.status);
  const coderState = isRecord(data.coder_state) ? data.coder_state : undefined;
  const lastError = coderState ? asString(coderState.last_error) : "";

  let details = "Step completed.";
  let tone: ActivityLog["tone"] = "info";

  if (isRecord(data.plan)) {
    const plan = data.plan;
    const name = asString(plan.name, "Project plan");
    const files = Array.isArray(plan.files) ? plan.files.length : 3;
    details = `${name} planned with ${files} files.`;
  }

  if (isRecord(data.task_plan)) {
    const taskPlan = data.task_plan;
    const steps = Array.isArray(taskPlan.implementation_steps)
      ? taskPlan.implementation_steps.length
      : 3;
    details = `${steps} implementation steps queued.`;
  }

  if (coderState) {
    const taskPlan = isRecord(coderState.task_plan)
      ? coderState.task_plan
      : undefined;
    const steps = Array.isArray(taskPlan?.implementation_steps)
      ? taskPlan.implementation_steps
      : [];
    const currentStepIdx = asNumber(coderState.current_step_idx);
    const finishedIndex = Math.max(0, currentStepIdx - 1);
    const finishedStep = isRecord(steps[finishedIndex])
      ? steps[finishedIndex]
      : undefined;
    const path = asString(finishedStep?.filepath);

    if (status === "DONE") {
      details = "All three files are generated.";
      tone = "success";
    } else if (status === "CONTINUE") {
      details = path
        ? `${path} written. Moving to step ${currentStepIdx + 1} of ${steps.length}.`
        : `Step ${currentStepIdx} complete.`;
    } else if (status === "RETRY") {
      details = `Retrying step ${currentStepIdx + 1}.`;
      tone = "warning";
    } else if (status === "ERROR" || lastError) {
      details = lastError ? summarizeError(lastError) : "The agent reported an error.";
      tone = "error";
    }
  }

  if (status === "CLEANED") {
    details = "Previous generated files were cleared for this session.";
    tone = "warning";
  }

  return {
    id: makeId(),
    node: node.replaceAll("_", " ").toUpperCase(),
    tone,
    timestamp: new Date().toLocaleTimeString(),
    details,
  };
}

export function extractProjectSummary(payload: unknown): ProjectSummary | null {
  if (!isRecord(payload) || !isRecord(payload.plan)) return null;

  const plan = payload.plan;
  return {
    name: asString(plan.name, "Generated project"),
    description: asString(plan.description, ""),
    features: Array.isArray(plan.features)
      ? plan.features.filter((feature): feature is string => typeof feature === "string")
      : [],
  };
}

export function extractSteps(payload: unknown): ImplementationStep[] | null {
  if (!isRecord(payload)) return null;

  const directTaskPlan = isRecord(payload.task_plan) ? payload.task_plan : undefined;
  const coderState = isRecord(payload.coder_state) ? payload.coder_state : undefined;
  const taskPlan =
    directTaskPlan ||
    (isRecord(coderState?.task_plan) ? coderState?.task_plan : undefined);

  if (!taskPlan || !Array.isArray(taskPlan.implementation_steps)) return null;

  return taskPlan.implementation_steps
    .filter(isRecord)
    .map((step) => ({
      filepath: asString(step.filepath),
      task_description: asString(step.task_description),
    }))
    .filter((step) => step.filepath);
}
