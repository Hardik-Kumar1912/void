"use client";

type DownloadPromptProps = {
  onDownload: () => void;
  onReplace: () => void;
  onCancel: () => void;
};

export function DownloadPrompt({
  onDownload,
  onReplace,
  onCancel,
}: DownloadPromptProps) {
  return (
    <div className="modal-backdrop">
      <section className="modal-card">
        <p className="eyebrow text-amber-200">Existing project</p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-50">
          Download before replacing?
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          Starting a new command clears the current generated files for this session.
          Download the ZIP if you want to keep this project.
        </p>
        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <button className="modal-action modal-action-save" onClick={onDownload}>
            Download
          </button>
          <button className="modal-action modal-action-replace" onClick={onReplace}>
            Replace
          </button>
          <button className="modal-action" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
