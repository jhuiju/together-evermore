import { createFileRoute } from "@tanstack/react-router";
import { Library } from "lucide-react";

export const Route = createFileRoute("/_app/archive")({
  component: ArchivePage,
});

function ArchivePage() {
  return (
    <div className="min-h-[calc(100vh-120px)] bg-[var(--app-bg)] text-[var(--app-text)]">
      {/* Top app bar */}
      <div className="flex items-center gap-3 pb-2 border-b border-[var(--app-divider)]">
        <Library className="w-6 h-6 text-[var(--app-pink)]" />
        <h1 className="text-lg font-bold">Archive</h1>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="mb-6 p-5 rounded-full bg-[var(--app-surface)] border border-[var(--app-border)]">
          <Library className="w-10 h-10 text-[var(--app-muted)] opacity-60" />
        </div>
        <p className="text-base font-semibold text-[var(--app-text)] mb-2">
          Your shared collections will appear here.
        </p>
        <p className="text-sm text-[var(--app-muted)] max-w-xs">
          Save movies, books, dramas, and more to build your shared archive.
        </p>
      </div>
    </div>
  );
}
