import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/calendar")({
  component: CalendarPage,
});

type Record = { id: string; date: string };

function CalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [records, setRecords] = useState<Record[]>([]);

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
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const end = `${year}-${String(month + 1).padStart(2, "0")}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, "0")}`;
    supabase
      .from("records")
      .select("id, date")
      .gte("date", start)
      .lte("date", end)
      .then(({ data }) => setRecords(data ?? []));
  }, [year, month]);

  const recordByDay = useMemo(() => {
    const map = new Map<string, Record>();
    records.forEach((r) => map.set(r.date, r));
    return map;
  }, [records]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 hover:bg-muted rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold">
          {year}년 {month + 1}월
        </h2>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 hover:bg-muted rounded-lg">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} className="py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`b-${i}`} />
        ))}
        {days.map((d) => {
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const rec = recordByDay.get(dateStr);
          return (
            <Link
              key={d}
              to={rec ? "/date/$dateId" : "/record/new"}
              params={rec ? { dateId: rec.id } : undefined as never}
              search={!rec ? { date: dateStr } : undefined as never}
              className={`aspect-square rounded-lg border flex items-center justify-center text-sm transition-colors ${
                rec ? "bg-primary/15 border-primary/40 text-primary font-semibold" : "border-border hover:bg-muted"
              }`}
            >
              {d}
            </Link>
          );
        })}
      </div>

      <Link to="/record/new" className="fixed bottom-24 right-6">
        <Button size="lg" className="rounded-full w-14 h-14 shadow-lg">
          <Plus className="w-6 h-6" />
        </Button>
      </Link>
    </div>
  );
}