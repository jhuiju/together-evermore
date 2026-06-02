import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls } from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

type DayRecord = {
  id: string;
  date: string;
  thumb?: string;
  myScore?: number;
  partnerScore?: number;
};

function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [coupleName, setCoupleName] = useState("우리");
  const [anniversary, setAnniversary] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

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

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);
      const { data: u } = await supabase.from("users").select("couple_id").eq("id", user.id).maybeSingle();
      if (u?.couple_id) {
        const { data: c } = await supabase.from("couples").select("couple_name, anniversary").eq("id", u.couple_id).maybeSingle();
        if (c?.couple_name) setCoupleName(c.couple_name);
        if (c?.anniversary) setAnniversary(c.anniversary);
      }
    })();
  }, []);

  useEffect(() => {
    if (!myId) return;
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`;
    (async () => {
      const { data: recs } = await supabase
        .from("records")
        .select("id, date, photos(storage_url, order), ratings(user_id, score)")
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
      const thumbs = mapped.map((m) => m.thumb).filter((t): t is string => !!t);
      const urlMap = await getSignedPhotoUrls(thumbs);
      setRecords(mapped.map((m) => ({ ...m, thumb: m.thumb ? urlMap[m.thumb] : undefined })));
    })();
  }, [year, month, myId]);

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
    <div className="space-y-5 bg-[var(--app-bg)] text-[var(--app-text)]">
      <div className="space-y-1 pb-4 border-b border-[var(--app-divider)]">
        <p className="text-xs text-[var(--app-muted)]">우리들의 캘린더</p>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-[var(--app-text)]">{coupleName}</h2>
          <Link to="/record/new">
            <Button size="icon" className="rounded-full bg-[var(--app-pink)] hover:bg-[var(--app-pink-hover)] text-white shadow-sm">
              <Plus className="w-5 h-5" />
            </Button>
          </Link>
        </div>
        {daysTogether != null && (
          <p className="text-xs text-[var(--app-pink)] font-medium">함께한 지 {daysTogether}일째 ♥</p>
        )}
      </div>

      <div className="flex items-center justify-center gap-6">
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

      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px]">
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

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`b-${i}`} />
        ))}
        {days.map((d) => {
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
              className={`relative aspect-[3/4] flex flex-col p-1 ${
                rec
                  ? "bg-[var(--app-surface)] rounded-lg border border-[var(--app-cell-border)] overflow-hidden"
                  : ""
              }`}
            >
              <span className={`text-[11px] font-medium leading-none ${rec ? "text-[var(--app-pink)]" : dayColor}`}>
                {d}
              </span>

              {rec?.thumb && (
                <div className="mt-1 flex-1 rounded-[4px] overflow-hidden bg-[var(--app-border)]">
                  <img src={rec.thumb} alt="" className="w-full h-full object-cover" />
                </div>
              )}

              {rec && (hasMine || hasPartner) && (
                <div className="mt-1 flex gap-0.5">
                  {bothRated ? (
                    <>
                      <span className="flex-1 text-[10px] leading-tight rounded bg-[var(--app-pink-badge-bg)] text-[var(--app-pink-badge-text)] text-center py-0.5 font-medium">
                        ♥{rec.myScore}
                      </span>
                      <span className="flex-1 text-[10px] leading-tight rounded bg-[var(--app-purple-badge-bg)] text-[var(--app-purple-badge-text)] text-center py-0.5 font-medium">
                        ♥{rec.partnerScore}
                      </span>
                    </>
                  ) : (
                    <span className="flex-1 text-[10px] leading-tight rounded bg-[var(--app-pink-badge-bg)] text-[var(--app-pink-badge-text)] text-center py-0.5 font-medium">
                      ♥{hasMine ? rec.myScore : rec.partnerScore}
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