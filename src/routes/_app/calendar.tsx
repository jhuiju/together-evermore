import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls } from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LazyImage } from "@/components/lazy-image";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_app/calendar")({
  validateSearch: (search: Record<string, unknown>) => {
    const y = Number(search.year);
    const m = Number(search.month);
    return {
      year: Number.isFinite(y) ? y : undefined,
      month: Number.isFinite(m) ? m : undefined,
    } as { year?: number; month?: number };
  },
  component: CalendarPage,
});

type DayRecord = {
  id: string;
  date: string;
  thumb?: string;
  myScore?: number;
  partnerScore?: number;
};

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

async function fetchMonthRecords(
  coupleId: string,
  myId: string,
  year: number,
  month: number,
): Promise<DayRecord[]> {
  const { start, end } = monthRange(year, month);
  // Only fetch lightweight columns the calendar actually renders.
  // Limit inner photos to the first one (order = 0) — calendar only renders a thumbnail.
  const { data: recs } = await supabase
    .from("records")
    .select("id, date, photos(storage_url, order), ratings(user_id, score)")
    .eq("couple_id", coupleId)
    .gte("date", start)
    .lte("date", end);
  const mapped: DayRecord[] = (recs ?? []).map((r: any) => {
    const sortedPhotos = [...(r.photos ?? [])].sort((a, b) => a.order - b.order);
    const ratings = r.ratings ?? [];
    const mine = ratings.find((x: any) => x.user_id === myId)?.score;
    const partner = ratings.find((x: any) => x.user_id !== myId)?.score;
    return {
      id: r.id,
      date: r.date,
      thumb: sortedPhotos[0]?.storage_url,
      myScore: mine,
      partnerScore: partner,
    };
  });
  // Sign only the first thumbnail with a tiny 200x200 transform — way smaller payload than full photos.
  const thumbs = mapped.map((m) => m.thumb).filter((t): t is string => !!t);
  const urlMap = thumbs.length
    ? await getSignedPhotoUrls(thumbs, { width: 200, height: 200, resize: "cover", quality: 70 })
    : {};
  return mapped.map((m) => ({ ...m, thumb: m.thumb ? urlMap[m.thumb] : undefined }));
}

function recordsQueryOptions(coupleId: string, myId: string, year: number, month: number) {
  return queryOptions({
    queryKey: ["records", coupleId, year, month] as const,
    queryFn: () => fetchMonthRecords(coupleId, myId, year, month),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}

function CalendarPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => {
    if (search.year && search.month) {
      return new Date(search.year, search.month - 1, 1);
    }
    return new Date();
  });
  const [coupleName, setCoupleName] = useState("우리");
  const [anniversary, setAnniversary] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { year, month, days, firstDow } = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const daysIn = new Date(y, m + 1, 0).getDate();
    return {
      year: y,
      month: m,
      days: Array.from({ length: daysIn }, (_, i) => i + 1),
      firstDow: new Date(y, m, 1).getDay(),
    };
  }, [cursor]);

  // Keep URL search params in sync so browser back returns to the same month.
  useEffect(() => {
    if (search.year !== year || search.month !== month + 1) {
      navigate({
        to: "/calendar",
        search: { year, month: month + 1 },
        replace: true,
      });
    }
    // Also persist as a fallback for back navigation from detail pages.
    try {
      sessionStorage.setItem(
        "calendar:lastMonth",
        JSON.stringify({ year, month: month + 1 }),
      );
    } catch {}
  }, [year, month, search.year, search.month, navigate]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);
      const { data: u } = await supabase.from("users").select("couple_id").eq("id", user.id).maybeSingle();
      if (u?.couple_id) {
        setCoupleId(u.couple_id);
        const { data: c } = await supabase.from("couples").select("couple_name, anniversary").eq("id", u.couple_id).maybeSingle();
        if (c?.couple_name) setCoupleName(c.couple_name);
        if (c?.anniversary) setAnniversary(c.anniversary);
      }
    })();
  }, []);

  const enabled = !!myId && !!coupleId;
  const { data: records = [], isLoading } = useQuery({
    ...recordsQueryOptions(coupleId ?? "", myId ?? "", year, month),
    enabled,
  });

  // Prefetch previous + next month so navigation feels instant.
  useEffect(() => {
    if (!enabled) return;
    const prev = new Date(year, month - 1, 1);
    const next = new Date(year, month + 1, 1);
    qc.prefetchQuery(
      recordsQueryOptions(coupleId!, myId!, prev.getFullYear(), prev.getMonth()),
    );
    qc.prefetchQuery(
      recordsQueryOptions(coupleId!, myId!, next.getFullYear(), next.getMonth()),
    );
  }, [enabled, coupleId, myId, year, month, qc]);

  const recordByDay = useMemo(() => {
    const map = new Map<string, DayRecord>();
    records.forEach((r) => map.set(r.date, r));
    return map;
  }, [records]);

  const daysTogether = useMemo(() => {
    if (!anniversary) return null;
    const start = new Date(anniversary + "T00:00:00");
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
    return diff > 0 ? diff : null;
  }, [anniversary]);

  return (
    <div
      className="flex flex-col bg-[var(--app-bg)] text-[var(--app-text)] px-[0.7px]"
    >
      <div className="space-y-1 pb-4 px-4 border-b border-[var(--app-divider)] shrink-0">
        <p className="text-xs text-[var(--app-muted)]">우리들의 캘린더</p>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[var(--app-text)]">{coupleName}</h2>
          <div className="flex items-center gap-2">
            <Link to="/search">
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full text-[var(--app-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface)]"
              >
                <Search className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/record/new" search={{ date: "" }}>
              <Button size="icon" className="rounded-full bg-[var(--app-pink)] hover:bg-[var(--app-pink-hover)] text-white shadow-sm">
                <Plus className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
        {daysTogether != null && (
          <p className="text-xs text-[var(--app-pink)] font-medium">함께한 지 {daysTogether}일째 ♥</p>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 py-4 px-4 shrink-0">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1.5 text-[var(--app-muted)] hover:text-[var(--app-text)]">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-semibold text-[var(--app-text)]">
          {year}년 {month + 1}월
        </h2>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1.5 text-[var(--app-muted)] hover:text-[var(--app-text)]">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] shrink-0 px-[0.7px]">
        {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
          <div
            key={d}
            className={`py-1 font-medium ${
              i === 0 ? "text-[var(--app-pink)]" : i === 6 ? "text-[var(--app-purple)]" : "text-[var(--app-muted)]"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      <div
        className="grid grid-cols-7 px-[0.7px] gap-y-1.5"
      >
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`b-${i}`} className="flex flex-col">
            <span className="text-[11px] font-medium leading-none opacity-0">.</span>
            <div className="mt-0.5 w-full" style={{ aspectRatio: "1 / 1" }} aria-hidden />
          </div>
        ))}
        {isLoading && records.length === 0
          ? days.map((d) => (
              <div key={`s-${d}`} className="flex flex-col p-0.5">
                <span className="text-[11px] font-medium leading-none opacity-0">.</span>
                <Skeleton className="w-full rounded-[4px] mt-0.5" style={{ aspectRatio: "1 / 1" }} />
              </div>
            ))
          : days.map((d) => {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const rec = recordByDay.get(dateStr);
          const dow = (firstDow + d - 1) % 7;
          const dayColor =
            dow === 0 ? "text-[var(--app-pink)]" : dow === 6 ? "text-[var(--app-purple)]" : "text-[var(--app-text)]";
          const hasMine = rec?.myScore != null;
          const hasPartner = rec?.partnerScore != null;
          const bothRated = hasMine && hasPartner;

          return (
            <Link
              key={d}
              to={rec ? "/date/$dateId" : "/record/new"}
              params={rec ? { dateId: rec.id } : (undefined as never)}
              search={!rec ? { date: dateStr } : (undefined as never)}
              className={`relative flex flex-col p-0.5 ${
                rec
                  ? "bg-[var(--app-surface)] rounded-[8px] border border-[var(--app-cell-border)] overflow-hidden"
                  : ""
              }`}
            >
              <span className={`text-[11px] font-medium leading-none ${rec ? "text-[var(--app-pink)]" : dayColor}`}>
                {d}
              </span>

              {rec ? (
                <div className="mt-0.5 relative w-full" style={{ aspectRatio: "1 / 1" }}>
                  {rec.thumb && (
                    <LazyImage
                      src={rec.thumb}
                      alt=""
                      loading="lazy"
                      wrapperClassName="absolute inset-0 rounded-[4px] bg-[var(--app-border)]"
                    />
                  )}
                </div>
              ) : (
                <div className="mt-0.5 w-full" style={{ aspectRatio: "1 / 1" }} aria-hidden />
              )}

              {rec && (hasMine || hasPartner) && (
                <div className="mt-0.5 flex gap-0.5">
                  {bothRated ? (
                    <>
                      <span className="flex-1 px-1 flex items-center justify-center rounded-[3px] bg-[var(--app-pink-badge-bg)] text-[var(--app-pink-badge-text)] py-[1px] font-medium">
                        <span className="text-[11px] leading-none">{rec.myScore}</span>
                      </span>
                      <span className="flex-1 px-1 flex items-center justify-center rounded-[3px] bg-[var(--app-purple-badge-bg)] text-[var(--app-purple-badge-text)] py-[1px] font-medium">
                        <span className="text-[11px] leading-none">{rec.partnerScore}</span>
                      </span>
                    </>
                  ) : (
                    <span className="flex-1 px-1 flex items-center justify-center rounded-[3px] bg-[var(--app-pink-badge-bg)] text-[var(--app-pink-badge-text)] py-[1px] font-medium">
                      <span className="text-[11px] leading-none">{hasMine ? rec.myScore : rec.partnerScore}</span>
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}