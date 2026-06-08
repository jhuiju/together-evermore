import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls } from "@/lib/photos";
import { Skeleton } from "@/components/ui/skeleton";
import { LazyImage } from "@/components/lazy-image";
import { ChevronLeft, Search, X } from "lucide-react";

export const Route = createFileRoute("/_app/search")({
  component: SearchPage,
});

type SearchResult = {
  id: string;
  date: string;
  location_name: string | null;
  tag: string | null;
  thumb?: string;
  myScore?: number;
  partnerScore?: number;
};

function formatDateKr(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

async function searchRecords(
  coupleId: string,
  myId: string,
  q: string,
): Promise<SearchResult[]> {
  const pattern = `%${q}%`;
  const { data: recs } = await supabase
    .from("records")
    .select("id, date, location_name, tag, photos(storage_url, order), ratings(user_id, score)")
    .eq("couple_id", coupleId)
    .or(`location_name.ilike.${pattern},memo.ilike.${pattern}`);

  const mapped: SearchResult[] = (recs ?? []).map((r: any) => {
    const sortedPhotos = [...(r.photos ?? [])].sort((a: any, b: any) => a.order - b.order);
    const ratings = r.ratings ?? [];
    const mine = ratings.find((x: any) => x.user_id === myId)?.score;
    const partner = ratings.find((x: any) => x.user_id !== myId)?.score;
    return {
      id: r.id,
      date: r.date,
      location_name: r.location_name,
      tag: r.tag,
      thumb: sortedPhotos[0]?.storage_url,
      myScore: mine,
      partnerScore: partner,
    };
  });

  const thumbs = mapped.map((m) => m.thumb).filter((t): t is string => !!t);
  const urlMap = thumbs.length
    ? await getSignedPhotoUrls(thumbs, { width: 200, height: 200, resize: "cover", quality: 70 })
    : {};

  return mapped.map((m) => ({
    ...m,
    thumb: m.thumb ? urlMap[m.thumb] : undefined,
  }));
}

function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [myId, setMyId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);
      const { data: u } = await supabase
        .from("users")
        .select("couple_id")
        .eq("id", user.id)
        .maybeSingle();
      if (u?.couple_id) setCoupleId(u.couple_id);
    })();
  }, []);

  const hasQuery = debouncedQuery.trim().length > 0;
  const enabled = !!myId && !!coupleId && hasQuery;

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["search", coupleId ?? "", debouncedQuery],
    queryFn: () => searchRecords(coupleId!, myId!, debouncedQuery),
    enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const resultCount = results.length;

  const showEmptyBefore = !hasQuery && !isLoading;
  const showNoResults = hasQuery && !isLoading && resultCount === 0;
  const showResults = hasQuery && !isLoading && resultCount > 0;

  return (
    <div className="space-y-4 bg-[var(--app-bg)] text-[var(--app-text)] min-h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2 border-b border-[var(--app-divider)]">
        <button
          onClick={() => navigate({ to: "/calendar" })}
          className="p-1 text-[var(--app-muted)] hover:text-[var(--app-text)]"
          aria-label="뒤로"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold">검색</h1>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--app-muted)]" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="장소, 메모로 검색해보세요"
          className="w-full h-10 pl-9 pr-9 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] text-sm text-[var(--app-text)] placeholder:text-[var(--app-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--app-pink)]"
        />
        {query.length > 0 && (
          <button
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--app-muted)] hover:text-[var(--app-text)]"
            aria-label="지우기"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Result count */}
      {showResults && (
        <p className="text-xs text-[var(--app-muted)]">총 {resultCount}개의 기록</p>
      )}

      {/* Results list */}
      {isLoading && hasQuery ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-3 p-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]"
            >
              <Skeleton className="w-20 h-20 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-5 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : showEmptyBefore ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--app-muted)]">
          <Search className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">검색어를 입력해주세요</p>
        </div>
      ) : showNoResults ? (
        <div className="flex flex-col items-center justify-center py-20 text-[var(--app-muted)]">
          <Search className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">찾을 수 없어요 🔍</p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((rec) => (
            <Link
              key={rec.id}
              to="/date/$dateId"
              params={{ dateId: rec.id }}
              className="flex gap-3 p-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] hover:border-[var(--app-pink)] transition-colors"
            >
              {/* Thumbnail */}
              <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 bg-[var(--app-border)]">
                {rec.thumb ? (
                  <LazyImage
                    src={rec.thumb}
                    alt=""
                    wrapperClassName="w-full h-full"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--app-muted)] text-xs">
                    사진 없음
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div className="space-y-1">
                  <p className="text-[11px] text-[var(--app-muted)]">{formatDateKr(rec.date)}</p>
                  <p className="text-sm font-medium truncate">
                    {rec.location_name ?? "장소 없음"}
                  </p>
                  {rec.tag && (
                    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-[var(--app-pink)] to-[var(--app-purple)] text-white font-medium">
                      {rec.tag}
                    </span>
                  )}
                </div>

                {/* Ratings */}
                <div className="flex gap-1.5 mt-1">
                  {rec.myScore != null && (
                    <span className="text-[10px] leading-tight rounded bg-[var(--app-pink-badge-bg)] text-[var(--app-pink-badge-text)] px-1.5 py-0.5 font-medium">
                      ♥{rec.myScore}
                    </span>
                  )}
                  {rec.partnerScore != null && (
                    <span className="text-[10px] leading-tight rounded bg-[var(--app-purple-badge-bg)] text-[var(--app-purple-badge-text)] px-1.5 py-0.5 font-medium">
                      ♥{rec.partnerScore}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
