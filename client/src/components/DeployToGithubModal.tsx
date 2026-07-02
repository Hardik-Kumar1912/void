"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { GithubIcon } from "@/components/GithubIcon";
import { GeneratedFile } from "@/lib/coderBuddy";

type DeployToGithubModalProps = {
  files: GeneratedFile[];
  onClose: () => void;
};

export function DeployToGithubModal({ files, onClose }: DeployToGithubModalProps) {
  const [repoName, setRepoName] = useState("coder-buddy-app");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "idle" | "success" | "error"; message: string }>({
    type: "idle",
    message: "",
  });

  const handleDeploy = async () => {
    if (!token) {
      setStatus({ type: "error", message: "Personal Access Token is required." });
      return;
    }
    if (!repoName) {
      setStatus({ type: "error", message: "Repository Name is required." });
      return;
    }

    setLoading(true);
    setStatus({ type: "idle", message: "Fetching user..." });

    try {
      // Step 1: Fetch user login
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!userRes.ok) {
        const err = await userRes.json().catch(() => ({}));
        throw new Error(`Authentication failed: ${err.message || userRes.statusText}`);
      }

      const userData = await userRes.json();
      const owner = userData.login;

      // Step 2: Create Repository
      setStatus({ type: "idle", message: "Creating repository..." });
      const createRepoRes = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: repoName,
          auto_init: true,
          private: false,
        }),
      });

      // 422 usually means the repository already exists. We can gracefully handle it by just continuing to upload.
      if (!createRepoRes.ok && createRepoRes.status !== 422) {
        const errorData = await createRepoRes.json().catch(() => ({}));
        // A 404 here often means the token lacks permissions to create repos.
        if (createRepoRes.status === 404) {
          throw new Error("Repository creation failed (404 Not Found). This usually means your token lacks the 'repo' scope (Classic Token) or 'Administration/Contents' permissions (Fine-grained Token).");
        }
        throw new Error(`Repository creation failed: ${errorData.message || createRepoRes.statusText}`);
      }

      // Step 3: Upload files
      setStatus({ type: "idle", message: "Uploading files..." });
      const validFiles = files.filter((f) => f.exists && f.content);

      if (validFiles.length === 0) {
        throw new Error("No generated files found to deploy.");
      }

      for (const file of validFiles) {
        // Encode content as Base64 safely
        const base64Content = btoa(unescape(encodeURIComponent(file.content)));
        
        // We first need to check if the file already exists to get its SHA (required for updating)
        const fileCheckRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${file.path}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        
        let sha;
        if (fileCheckRes.ok) {
           const fileCheckData = await fileCheckRes.json();
           sha = fileCheckData.sha;
        }

        const uploadRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${file.path}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: `Deploy ${file.path} via Coder Buddy`,
            content: base64Content,
            sha: sha, // Include sha if updating an existing file
          }),
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          throw new Error(`Failed to upload ${file.path}: ${errData.message || uploadRes.statusText}`);
        }
      }

      setStatus({ type: "success", message: `Successfully deployed to github.com/${owner}/${repoName}!` });
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
            <GithubIcon className="w-5 h-5" /> Deploy to GitHub
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
            <label className="text-sm font-medium text-zinc-400">Repository Name</label>
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              disabled={loading}
              className="w-full bg-[#111111] border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
              placeholder="coder-buddy-app"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-400">Personal Access Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={loading}
              className="w-full bg-[#111111] border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-500 transition-colors"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            />
            <p className="text-xs text-zinc-500">
              Requires "repo" scope to create and push. You can generate one in your{" "}
              <a
                href="https://github.com/settings/tokens/new"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline"
              >
                GitHub Developer Settings
              </a>
              .
            </p>
          </div>
        </div>

        {status.message && (
          <div
            className={`text-sm p-3 rounded border ${
              status.type === "error"
                ? "bg-red-950/30 border-red-900/50 text-red-400"
                : status.type === "success"
                ? "bg-green-950/30 border-green-900/50 text-green-400"
                : "bg-zinc-900 border-zinc-800 text-zinc-300"
            }`}
          >
            {status.message}
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
