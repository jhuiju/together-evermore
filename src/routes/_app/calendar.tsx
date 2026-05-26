import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls } from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus, Heart } from "lucide-react";

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
        const { data: c } = await supabase.from("couples").select("couple_name").eq("id", u.couple_id).maybeSingle();
        if (c?.couple_name) setCoupleName(c.couple_name);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-gradient-to-r from-pink-100/60 to-purple-100/60 dark:from-pink-950/30 dark:to-purple-950/30 rounded-2xl px-4 py-3 border border-pink-200/50 dark:border-pink-900/30">
        <div>
          <p className="text-xs text-muted-foreground">우리들의 캘린더</p>
          <h2 className="text-base font-semibold text-foreground">{coupleName}</h2>
        </div>
        <Link to="/record/new">
          <Button size="icon" className="rounded-full bg-gradient-to-br from-pink-400 to-purple-400 hover:from-pink-500 hover:to-purple-500 text-white shadow-md">
            <Plus className="w-5 h-5" />
          </Button>
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 hover:bg-pink-50 dark:hover:bg-pink-950/40 rounded-lg text-pink-500">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
          {year}년 {month + 1}월
        </h2>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg text-purple-500">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground">
        {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
          <div key={d} className={`py-1 font-medium ${i === 0 ? "text-pink-500" : i === 6 ? "text-purple-500" : ""}`}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`b-${i}`} />
        ))}
        {days.map((d) => {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const rec = recordByDay.get(dateStr);
          const bothLove = rec && (rec.myScore ?? 0) > 8 && (rec.partnerScore ?? 0) > 8;
          return (
            <Link
              key={d}
              to={rec ? "/date/$dateId" : "/record/new"}
              params={rec ? { dateId: rec.id } : undefined as never}
              search={!rec ? { date: dateStr } : undefined as never}
              className={`relative aspect-square rounded-xl border overflow-hidden flex flex-col transition-all ${
                rec
                  ? "border-pink-300/60 dark:border-pink-800/50 bg-gradient-to-br from-pink-50/80 to-purple-50/80 dark:from-pink-950/30 dark:to-purple-950/30 shadow-sm hover:shadow-md"
                  : "border-border/60 hover:border-pink-200 hover:bg-pink-50/40 dark:hover:bg-pink-950/20"
              }`}
            >
              {rec?.thumb && (
                <img
                  src={rec.thumb}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-60"
                />
              )}
              {rec?.thumb && <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />}

              <div className="relative flex items-start justify-between p-1">
                <span className={`text-xs font-semibold ${rec ? "text-foreground" : "text-muted-foreground"}`}>{d}</span>
                {bothLove && <Heart className="w-3 h-3 text-pink-500 fill-pink-500" />}
              </div>

              {rec && (rec.myScore != null || rec.partnerScore != null) && (
                <div className="relative mt-auto flex gap-0.5 p-0.5">
                  {rec.myScore != null && (
                    <span className="flex-1 text-[9px] leading-tight rounded bg-pink-400/90 text-white text-center py-0.5 font-medium">
                      {rec.myScore}
                    </span>
                  )}
                  {rec.partnerScore != null && (
                    <span className="flex-1 text-[9px] leading-tight rounded bg-purple-400/90 text-white text-center py-0.5 font-medium">
                      {rec.partnerScore}
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