import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Library, Film, Heart, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/archive")({
  component: ArchivePage,
});

const SEGMENTS = [
  { value: "record", label: "기록" },
  { value: "wish", label: "위시" },
] as const;
type Segment = (typeof SEGMENTS)[number]["value"];

const CATEGORIES = [
  { value: "all", label: "전체" },
  { value: "movie", label: "영화" },
] as const;
// Future categories can be appended here without layout changes:
// { value: "book", label: "책" },
// { value: "drama", label: "드라마" },
// { value: "show", label: "공연" },
// { value: "game", label: "게임" },
type Category = (typeof CATEGORIES)[number]["value"];

const EMPTY_STATES: Record<
  Segment,
  { icon: typeof Film; title: string; description: string }
> = {
  record: {
    icon: Film,
    title: "아직 기록된 콘텐츠가 없어요",
    description: "함께 본 영화와 앞으로 추가될 다양한 콘텐츠를 기록해보세요.",
  },
  wish: {
    icon: Heart,
    title: "아직 위시에 담긴 콘텐츠가 없어요",
    description: "보고 싶은 영화와 다양한 콘텐츠를 저장해보세요.",
  },
};

const FAB_LABELS: Record<Segment, string> = {
  record: "기록 추가",
  wish: "위시 추가",
};

function ArchivePage() {
  const [segment, setSegment] = useState<Segment>("record");
  const [category, setCategory] = useState<Category>("all");

  return (
    <div className="relative min-h-[calc(100vh-120px)] bg-[var(--app-bg)] text-[var(--app-text)]">
      {/* Top app bar */}
      <div className="flex items-center gap-3 pb-2 border-b border-[var(--app-divider)]">
        <Library className="w-6 h-6 text-[var(--app-pink)]" />
        <h1 className="text-lg font-bold">아카이브</h1>
      </div>

      <div className="space-y-4 py-4">
        {/* Segmented control */}
        <Tabs value={segment} onValueChange={(v) => setSegment(v as Segment)}>
          <TabsList className="grid w-full grid-cols-2">
            {SEGMENTS.map((s) => (
              <TabsTrigger key={s.value} value={s.value} className="text-sm">
                {s.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Category filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
          {CATEGORIES.map((c) => {
            const selected = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={
                  "shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors " +
                  (selected
                    ? "bg-[var(--app-pink)] text-white border-[var(--app-pink)]"
                    : "bg-transparent text-[var(--app-text)] border-[var(--app-border)] hover:border-[var(--app-pink)]")
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* Content list area */}
        <div className="space-y-3">
          <EmptyState segment={segment} />
        </div>
      </div>

      {/* Floating action button */}
      <button
        type="button"
        className="fixed bottom-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom)+1rem)] right-4 z-20 inline-flex items-center gap-2 pl-4 pr-5 h-12 rounded-full bg-[var(--app-pink)] text-white shadow-lg hover:bg-[var(--app-pink-hover)] transition-colors"
        aria-label={FAB_LABELS[segment]}
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm font-semibold">{FAB_LABELS[segment]}</span>
      </button>
    </div>
  );
}

function EmptyState({ segment }: { segment: Segment }) {
  const { icon: Icon, title, description } = EMPTY_STATES[segment];
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-6 p-5 rounded-full bg-[var(--app-surface)] border border-[var(--app-border)]">
        <Icon className="w-10 h-10 text-[var(--app-muted)] opacity-60" />
      </div>
      <p className="text-base font-semibold text-[var(--app-text)] mb-2">{title}</p>
      <p className="text-sm text-[var(--app-muted)] max-w-xs">{description}</p>
    </div>
  );
}
