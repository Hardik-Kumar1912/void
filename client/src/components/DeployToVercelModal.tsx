"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { VercelIcon } from "@/components/VercelIcon";
import { GeneratedFile } from "@/lib/coderBuddy";

type DeployToVercelModalProps = {
  files: GeneratedFile[];
  onClose: () => void;
};

export function DeployToVercelModal({ files, onClose }: DeployToVercelModalProps) {
  const [projectName, setProjectName] = useState("my-instant-app");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string; url?: string }>({
    type: "idle",
    message: "",
  });

  const handleDeploy = async () => {
    if (!token) {
      setStatus({ type: "error", message: "Vercel Personal Access Token is required." });
      return;
    }
    if (!projectName) {
      setStatus({ type: "error", message: "Project Name is required." });
      return;
    }

    const validFiles = files.filter((f) => f.exists && f.content);
    if (validFiles.length === 0) {
      setStatus({ type: "error", message: "No generated files found to deploy." });
      return;
    }

    setLoading(true);
    setStatus({ type: "idle", message: "Deploying to Vercel..." });

    try {
      const payloadFiles = validFiles.map((f) => ({
        file: f.path,
        data: f.content,
      }));

      const res = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          files: payloadFiles,
          projectSettings: {
            framework: null,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error?.message || res.statusText || "Deployment failed.");
      }

      setStatus({
        type: "success",
        message: "Successfully deployed!",
        url: `https://${data.url}`,
      });
    } catch (err: any) {
      setStatus({ type: "error", message: err.message || "An unexpected error occurred." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#0a0a0a] border border-zinc-800 rounded-lg shadow-2xl p-6 flex flex-col gap-6 text-zinc-100">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium flex items-center gap-2">
            <VercelIcon className="w-5 h-5" /> Deploy to Vercel
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
            disabled={loading}
          >
            &#x2715;
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-400">Project Name</label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={loading}
              className="w-full bg-[#111111] border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
              placeholder="my-instant-app"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-400">Vercel Personal Access Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={loading}
              className="w-full bg-[#111111] border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <p className="text-xs text-zinc-500">
              You can create one in your{" "}
              <a
                href="https://vercel.com/account/tokens"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline"
              >
                Vercel Account Settings
              </a>
              .
            </p>
          </div>
        </div>

        {status.message && (
          <div
            className={`text-sm p-3 rounded border flex flex-col gap-1 ${
              status.type === "error"
                ? "bg-red-950/30 border-red-900/50 text-red-400"
                : status.type === "success"
                ? "bg-green-950/30 border-green-900/50 text-green-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-300"
            }`}
          >
            <span>{status.message}</span>
            {status.url && (
              <a
                href={status.url}
                target="_blank"
                rel="noreferrer"
                className="text-green-300 hover:underline font-medium flex items-center gap-1"
              >
                {status.url}
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDeploy}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-950 text-sm font-medium rounded hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Deploy"}
          </button>
        </div>
      </div>
    </div>
  );
}
