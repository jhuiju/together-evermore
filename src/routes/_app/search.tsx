import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls } from "@/lib/photos";
import { Skeleton } from "@/components/ui/skeleton";
import { LazyImage } from "@/components/lazy-image";
import { Slider } from "@/components/ui/slider";
import { ChevronLeft, Search, SlidersHorizontal, X } from "lucide-react";

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

type FetchOpts = {
  q: string;
  tag: string; // "전체" or specific
  startDate: string; // yyyy-mm-dd or ""
  endDate: string;
};

async function searchRecords(
  coupleId: string,
  myId: string,
  opts: FetchOpts,
): Promise<SearchResult[]> {
  let query = supabase
    .from("records")
    .select("id, date, location_name, tag, memo, photos(storage_url, order), ratings(user_id, score)")
    .eq("couple_id", coupleId);

  if (opts.q.trim()) {
    const pattern = `%${opts.q.trim()}%`;
    query = query.or(`location_name.ilike.${pattern},memo.ilike.${pattern}`);
  }
  if (opts.tag && opts.tag !== "전체") {
    query = query.eq("tag", opts.tag);
  }
  if (opts.startDate) query = query.gte("date", opts.startDate);
  if (opts.endDate) query = query.lte("date", opts.endDate);

  const { data: recs } = await query.order("date", { ascending: false });

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

const TAGS = ["전체", "데이트", "여행", "일상", "특별한 날"] as const;
type RatingTarget = "mine" | "partner" | "avg";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [myId, setMyId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  // Filters
  const [showFilters, setShowFilters] = useState(true);
  const [tag, setTag] = useState<string>("전체");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [ratingTarget, setRatingTarget] = useState<RatingTarget>("mine");
  const [ratingRange, setRatingRange] = useState<[number, number]>([0, 10]);

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

  const tagActive = tag !== "전체";
  const dateActive = !!startDate || !!endDate;
  const ratingActive = ratingRange[0] !== 0 || ratingRange[1] !== 10;
  const activeFilterCount =
    (tagActive ? 1 : 0) + (dateActive ? 1 : 0) + (ratingActive ? 1 : 0);
  const anyFilterActive = activeFilterCount > 0;

  const enabled = !!myId && !!coupleId && (hasQuery || anyFilterActive);

  const { data: rawResults = [], isLoading } = useQuery({
    queryKey: ["search", coupleId ?? "", debouncedQuery, tag, startDate, endDate],
    queryFn: () =>
      searchRecords(coupleId!, myId!, {
        q: debouncedQuery,
        tag,
        startDate,
        endDate,
      }),
    enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Rating filter (client side)
  const results = useMemo(() => {
    if (!ratingActive) return rawResults;
    const [mn, mx] = ratingRange;
    return rawResults.filter((r) => {
      let v: number | undefined;
      if (ratingTarget === "mine") v = r.myScore;
      else if (ratingTarget === "partner") v = r.partnerScore;
      else {
        const vals = [r.myScore, r.partnerScore].filter(
          (x): x is number => typeof x === "number",
        );
        v = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
      }
      if (v == null) return false;
      return v >= mn && v <= mx;
    });
  }, [rawResults, ratingActive, ratingRange, ratingTarget]);

  const resultCount = results.length;
  const hasSearchInput = hasQuery || anyFilterActive;

  const showEmptyBefore = !hasSearchInput && !isLoading;
  const showNoResults = hasSearchInput && !isLoading && resultCount === 0;
  const showResults = hasSearchInput && !isLoading && resultCount > 0;

  const resetFilters = () => {
    setTag("전체");
    setStartDate("");
    setEndDate("");
    setRatingTarget("mine");
    setRatingRange([0, 10]);
  };

  const applyPreset = (preset: "month" | "3months" | "year" | "all") => {
    const now = new Date();
    if (preset === "all") {
      setStartDate("");
      setEndDate("");
      return;
    }
    if (preset === "month") {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(fmt(s));
      setEndDate(todayStr());
    } else if (preset === "3months") {
      const s = new Date(now);
      s.setMonth(s.getMonth() - 3);
      setStartDate(fmt(s));
      setEndDate(todayStr());
    } else if (preset === "year") {
      const s = new Date(now.getFullYear(), 0, 1);
      setStartDate(fmt(s));
      setEndDate(todayStr());
    }
  };

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

      {/* Filter header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--app-text)]"
        >
          <SlidersHorizontal className="w-4 h-4" />
          필터
          {anyFilterActive && (
            <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-[#D4537E] text-white text-[10px] font-semibold">
              {activeFilterCount}
            </span>
          )}
        </button>
        {anyFilterActive && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-xs text-[var(--app-muted)] hover:text-[var(--app-pink)] underline-offset-2 hover:underline"
          >
            필터 초기화
          </button>
        )}
      </div>

      {showFilters && (
        <div className="space-y-4 p-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
          {/* Tag chips */}
          <div>
            <p className="text-xs font-medium text-[var(--app-muted)] mb-2">태그</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {TAGS.map((t) => {
                const selected = tag === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTag(t)}
                    className={
                      "shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors " +
                      (selected
                        ? "bg-[#D4537E] text-white border-[#D4537E]"
                        : "bg-transparent text-[var(--app-text)] border-[var(--app-border)] hover:border-[#D4537E]")
                    }
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date range */}
          <div>
            <p className="text-xs font-medium text-[var(--app-muted)] mb-2">날짜 범위</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 h-9 px-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-xs text-[var(--app-text)]"
                aria-label="시작일"
              />
              <span className="text-xs text-[var(--app-muted)]">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 h-9 px-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] text-xs text-[var(--app-text)]"
                aria-label="종료일"
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { k: "month" as const, label: "이번 달" },
                { k: "3months" as const, label: "최근 3개월" },
                { k: "year" as const, label: "올해" },
                { k: "all" as const, label: "전체" },
              ].map((p) => (
                <button
                  key={p.k}
                  type="button"
                  onClick={() => applyPreset(p.k)}
                  className="px-2.5 h-7 rounded-full text-[11px] border border-[var(--app-border)] text-[var(--app-muted)] hover:border-[#D4537E] hover:text-[var(--app-text)]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rating */}
          <div>
            <p className="text-xs font-medium text-[var(--app-muted)] mb-2">별점</p>
            <div className="flex gap-1 mb-3 p-0.5 rounded-lg bg-[var(--app-bg)] border border-[var(--app-border)]">
              {([
                { v: "mine", label: "내 별점" },
                { v: "partner", label: "파트너 별점" },
                { v: "avg", label: "평균 별점" },
              ] as { v: RatingTarget; label: string }[]).map((o) => {
                const selected = ratingTarget === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setRatingTarget(o.v)}
                    className={
                      "flex-1 h-7 rounded-md text-[11px] font-medium transition-colors " +
                      (selected
                        ? "bg-[#D4537E] text-white"
                        : "text-[var(--app-muted)] hover:text-[var(--app-text)]")
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-[var(--app-muted)] w-6 text-center">
                {ratingRange[0]}
              </span>
              <Slider
                value={ratingRange}
                min={0}
                max={10}
                step={1}
                onValueChange={(v) => setRatingRange([v[0], v[1]] as [number, number])}
                className="flex-1"
              />
              <span className="text-[11px] text-[var(--app-muted)] w-6 text-center">
                {ratingRange[1]}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Result count */}
      {showResults && (
        <p className="text-xs text-[var(--app-muted)]">총 {resultCount}개의 기록</p>
      )}

      {/* Results list */}
      {isLoading && hasSearchInput ? (
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
