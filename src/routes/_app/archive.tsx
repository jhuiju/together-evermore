import { createFileRoute, useNavigate, Outlet } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { tmdbPosterUrl } from "@/lib/tmdb";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Library, Film, Heart, Plus, Star, Film as FilmIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/archive")({
  component: ArchiveLayout,
});

function ArchiveLayout() {
  return <Outlet />;
}

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

export function ArchivePage() {
  const [segment, setSegment] = useState<Segment>("record");
  const [category, setCategory] = useState<Category>("all");
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: items, isLoading } = useQuery({
    queryKey: ["archive_items", segment, category, user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: me } = await supabase
        .from("users").select("couple_id").eq("id", user!.id).maybeSingle();
      if (!me?.couple_id) return [];
      let q = supabase
        .from("archive_items")
        .select("*, archive_ratings(user_id, score, comment), author:users!archive_items_added_by_fkey(id, nickname)")
        .eq("couple_id", me.couple_id)
        .eq("type", segment);
      if (category !== "all") q = q.eq("category", category);
      q = segment === "record"
        ? q.order("watched_date", { ascending: false, nullsFirst: false })
        : q.order("created_at", { ascending: false });
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

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
          {isLoading ? (
            <ListSkeleton />
          ) : !items || items.length === 0 ? (
            <EmptyState segment={segment} />
          ) : segment === "record" ? (
            <div className="space-y-3">
              {items.map((it: any) => (
                <RecordCard key={it.id} item={it} currentUserId={user?.id} onOpen={() => navigate({ to: "/archive/item/$itemId", params: { itemId: it.id } })} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((it: any) => (
                <WishCard key={it.id} item={it} onOpen={() => navigate({ to: "/archive/item/$itemId", params: { itemId: it.id } })} onConvert={() => navigate({ to: "/archive/record/new", search: { fromWish: it.id } as any })} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating action button */}
      <button
        type="button"
        onClick={() => {
          if (segment === "record") {
            navigate({ to: "/archive/record/new" });
          } else {
            navigate({ to: "/archive/wish/new" });
          }
        }}
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

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3 p-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
          <div className="w-[92px] h-[138px] rounded bg-[var(--app-bg)] animate-pulse" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 rounded bg-[var(--app-bg)] animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-[var(--app-bg)] animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-[var(--app-bg)] animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Poster({ path, title, size = "w154", className }: { path: string | null; title: string; size?: "w92" | "w154" | "w185" | "w342"; className?: string }) {
  const url = tmdbPosterUrl(path, size);
  if (!url) {
    return (
      <div className={"shrink-0 flex items-center justify-center bg-[var(--app-bg)] border border-[var(--app-border)] rounded " + (className ?? "")}
        aria-label={`${title} 포스터 없음`}>
        <FilmIcon className="w-5 h-5 text-[var(--app-muted)]" />
      </div>
    );
  }
  return <img src={url} alt={`${title} 포스터`} loading="lazy" className={"shrink-0 object-cover bg-[var(--app-bg)] rounded " + (className ?? "")} />;
}

const WATCH_TYPE_LABEL: Record<string, string> = { theater: "영화관", ott: "OTT", other: "기타" };
const PRIORITY_LABEL: Record<string, string> = { must: "❤️ 꼭 보고 싶어요", someday: "👍 기회되면 봐요" };

function formatDate(d?: string | null) {
  if (!d) return "";
  return d.replaceAll("-", ".");
}

function RecordCard({ item, currentUserId, onOpen }: { item: any; currentUserId?: string; onOpen: () => void }) {
  const ratings: any[] = item.archive_ratings ?? [];
  const mine = ratings.find((r) => r.user_id === currentUserId);
  const partner = ratings.find((r) => r.user_id !== currentUserId);
  return (
    <button type="button" onClick={onOpen} className="w-full text-left flex gap-3 p-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-pink)] transition-colors">
      <Poster path={item.poster_url} title={item.title} className="w-[92px] h-[138px]" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-bold text-[var(--app-text)] truncate">{item.title}</p>
        <p className="text-xs text-[var(--app-muted)] truncate">
          {[item.release_year, item.genre].filter(Boolean).join(" · ")}
        </p>
        {item.watched_date && (
          <p className="text-xs text-[var(--app-muted)]">관람일: {formatDate(item.watched_date)}</p>
        )}
        {item.watch_type && (
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-[var(--app-bg)] border border-[var(--app-border)] text-[var(--app-muted)]">
            {WATCH_TYPE_LABEL[item.watch_type] ?? item.watch_type}
          </span>
        )}
        <div className="flex items-center gap-3 pt-1 text-xs">
          <RatingChip label="나" score={mine?.score} color="var(--app-pink)" />
          <RatingChip label="파트너" score={partner?.score} color="#A78BFA" />
        </div>
        {mine?.comment && (
          <p className="text-xs text-[var(--app-muted)] italic truncate">{mine.comment}</p>
        )}
      </div>
    </button>
  );
}

function RatingChip({ label, score, color }: { label: string; score?: number; color: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[var(--app-muted)]">{label}</span>
      {typeof score === "number" ? (
        <span className="inline-flex items-center gap-0.5 font-semibold" style={{ color }}>
          <Star className="w-3 h-3 fill-current" />
          {score}
        </span>
      ) : (
        <span className="text-[var(--app-muted)]">미입력</span>
      )}
    </span>
  );
}

function WishCard({ item, onOpen, onConvert }: { item: any; onOpen: () => void; onConvert: () => void }) {
  const nickname = item.author?.nickname ?? "파트너";
  return (
    <div className="flex gap-3 p-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
      <button type="button" onClick={onOpen} className="shrink-0" aria-label={`${item.title} 자세히`}>
        <Poster path={item.poster_url} title={item.title} className="w-[92px] h-[138px]" />
      </button>
      <div className="flex-1 min-w-0 space-y-1">
        <button type="button" onClick={onOpen} className="text-left w-full">
          <p className="text-sm font-bold text-[var(--app-text)] truncate">{item.title}</p>
          <p className="text-xs text-[var(--app-muted)] truncate">
            {[item.release_year, item.genre].filter(Boolean).join(" · ")}
          </p>
        </button>
        {item.priority && (
          <span className="inline-block text-[11px] px-2 py-0.5 rounded-full bg-[var(--app-bg)] border border-[var(--app-border)]">
            {PRIORITY_LABEL[item.priority] ?? item.priority}
          </span>
        )}
        <p className="text-xs text-[var(--app-muted)]">{nickname}이 추천했어요</p>
        {item.reason && (
          <p className="text-xs text-[var(--app-muted)] italic truncate">{item.reason}</p>
        )}
        <button
          type="button"
          onClick={onConvert}
          className="mt-1 inline-flex items-center h-8 px-3 rounded-full text-xs font-semibold border border-[var(--app-pink)] text-[var(--app-pink)] hover:bg-[var(--app-pink)] hover:text-white transition-colors"
        >
          기록으로 이동
        </button>
      </div>
    </div>
  );
}
