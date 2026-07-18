import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MovieSearchInput } from "@/components/archive/MovieSearchInput";
import type { TmdbMovie } from "@/lib/tmdb";
import { tmdbGenreNames, tmdbReleaseYear } from "@/lib/tmdb";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Calendar as CalIcon, Film, Star, Loader2, Link2 } from "lucide-react";

export const Route = createFileRoute("/_app/archive/record/new")({
  validateSearch: (s: Record<string, unknown>) => ({
    fromWish: typeof s.fromWish === "string" ? s.fromWish : undefined,
  }),
  component: NewArchiveRecordPage,
});

const WATCH_TYPES = [
  { value: "theater", label: "영화관" },
  { value: "ott", label: "OTT" },
  { value: "other", label: "기타" },
] as const;
type WatchType = (typeof WATCH_TYPES)[number]["value"];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type LinkedRecord = {
  id: string;
  date: string;
  tag: string | null;
  location_name: string | null;
};

function NewArchiveRecordPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { fromWish } = Route.useSearch();

  const [movie, setMovie] = useState<TmdbMovie | null>(null);
  const [watchedDate, setWatchedDate] = useState(todayStr());
  const [watchType, setWatchType] = useState<WatchType | null>(null);
  const [stars, setStars] = useState(0); // 0..5 in 0.5 steps
  const [comment, setComment] = useState("");
  const [linkToCalendar, setLinkToCalendar] = useState(false);
  const [matchedRecords, setMatchedRecords] = useState<LinkedRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Prefill from wish item
  useEffect(() => {
    if (!fromWish) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("archive_items")
        .select("*")
        .eq("id", fromWish)
        .maybeSingle();
      if (cancelled || !data) return;
      setMovie({
        id: data.tmdb_id ? Number(data.tmdb_id) : 0,
        title: data.title,
        original_title: data.title,
        poster_path: data.poster_url,
        release_date: data.release_year ? `${data.release_year}-01-01` : "",
        genre_ids: [],
      } as TmdbMovie);
    })();
    return () => { cancelled = true; };
  }, [fromWish]);

  // Fetch calendar records for the selected date when link toggle is on.
  useEffect(() => {
    if (!linkToCalendar) {
      setMatchedRecords([]);
      setSelectedRecordId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingMatches(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: me } = await supabase
          .from("users").select("couple_id").eq("id", user.id).maybeSingle();
        if (!me?.couple_id) return;
        const { data } = await supabase
          .from("records")
          .select("id, date, tag, location_name")
          .eq("couple_id", me.couple_id)
          .eq("date", watchedDate);
        if (cancelled) return;
        setMatchedRecords((data ?? []) as LinkedRecord[]);
        setSelectedRecordId((data && data[0]?.id) ?? null);
      } finally {
        if (!cancelled) setLoadingMatches(false);
      }
    })();
    return () => { cancelled = true; };
  }, [linkToCalendar, watchedDate]);

  const canSubmit = !!movie && !!watchedDate && !submitting;

  async function submit() {
    if (!canSubmit || !movie) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인이 필요해요");
      const { data: me } = await supabase
        .from("users").select("couple_id").eq("id", user.id).maybeSingle();
      if (!me?.couple_id) throw new Error("커플 연결이 필요해요");

      const genres = tmdbGenreNames(movie.genre_ids);
      const { data: item, error: itemErr } = await supabase
        .from("archive_items")
        .insert({
          couple_id: me.couple_id,
          added_by: user.id,
          type: "record",
          category: "movie",
          title: movie.title || movie.original_title,
          poster_url: movie.poster_path,
          release_year: tmdbReleaseYear(movie.release_date) || null,
          genre: genres.length ? genres.join(", ") : null,
          tmdb_id: String(movie.id),
          watch_type: watchType,
          watched_date: watchedDate,
        })
        .select("id")
        .single();
      if (itemErr || !item) throw itemErr ?? new Error("저장에 실패했어요");

      if (stars > 0) {
        const { error: rateErr } = await supabase
          .from("archive_ratings")
          .upsert(
            {
              archive_item_id: item.id,
              user_id: user.id,
              score: stars * 2,
              comment: comment.trim() ? comment.trim() : null,
            },
            { onConflict: "archive_item_id,user_id" },
          );
        if (rateErr) throw rateErr;
      }

      if (fromWish) {
        await supabase.from("archive_items").delete().eq("id", fromWish);
        toast.success("기록으로 이동됐어요 🎬");
      } else {
        toast.success("기록이 추가됐어요 🎬");
      }
      qc.invalidateQueries({ queryKey: ["archive_items"] });
      navigate({ to: "/archive" });
    } catch (e: any) {
      toast.error(e?.message ?? "저장에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pb-24 text-[var(--app-text)]">
      {/* Top bar */}
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--app-divider)]">
        <button
          type="button"
          onClick={() => navigate({ to: "/archive" })}
          aria-label="뒤로"
          className="p-1.5 -ml-1.5 rounded-full text-[var(--app-text)] hover:bg-[var(--app-surface)]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">기록 추가</h1>
      </div>

      <div className="space-y-6 py-5">
        {/* Movie search */}
        <Section
          icon={<Film className="w-4 h-4 text-[var(--app-pink)]" />}
          label="영화 검색"
          required
        >
          <MovieSearchInput value={movie} onChange={setMovie} autoFocus />
        </Section>

        {/* Watched date */}
        <Section
          icon={<CalIcon className="w-4 h-4 text-[var(--app-pink)]" />}
          label="언제 봤나요?"
        >
          <Input
            type="date"
            value={watchedDate}
            onChange={(e) => setWatchedDate(e.target.value)}
          />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-[var(--app-muted)]" />
              <span className="text-sm">캘린더 기록과 연결하기</span>
            </div>
            <Switch checked={linkToCalendar} onCheckedChange={setLinkToCalendar} />
          </div>
          {linkToCalendar && (
            <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-2">
              {loadingMatches ? (
                <div className="flex items-center justify-center py-4 text-[var(--app-muted)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : matchedRecords.length === 0 ? (
                <p className="text-xs text-[var(--app-muted)] text-center py-3">
                  이 날짜에 연결할 캘린더 기록이 없어요
                </p>
              ) : (
                <ul className="divide-y divide-[var(--app-divider)]">
                  {matchedRecords.map((r) => {
                    const selected = selectedRecordId === r.id;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedRecordId(r.id)}
                          className={
                            "w-full text-left px-2 py-2 rounded-md text-sm flex items-center justify-between " +
                            (selected ? "bg-[var(--app-bg)]" : "")
                          }
                        >
                          <span className="truncate">
                            {r.location_name || r.tag || r.date}
                          </span>
                          {selected && (
                            <span className="text-xs text-[var(--app-pink)] shrink-0 ml-2">
                              선택됨
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </Section>

        {/* Watch type */}
        <Section label="어떻게 봤나요?">
          <div className="flex flex-wrap gap-2">
            {WATCH_TYPES.map((w) => {
              const selected = watchType === w.value;
              return (
                <button
                  key={w.value}
                  type="button"
                  onClick={() =>
                    setWatchType((prev) => (prev === w.value ? null : w.value))
                  }
                  className={
                    "px-4 h-9 rounded-full text-sm font-medium border transition-colors " +
                    (selected
                      ? "bg-[var(--app-pink)] text-white border-[var(--app-pink)]"
                      : "bg-transparent text-[var(--app-text)] border-[var(--app-border)] hover:border-[var(--app-pink)]")
                  }
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Rating */}
        <Section
          icon={<Star className="w-4 h-4 text-[var(--app-pink)]" />}
          label="내 별점"
        >
          <StarRating value={stars} onChange={setStars} />
          <p className="text-xs text-[var(--app-muted)]">
            {stars > 0 ? `${(stars * 2).toFixed(1)} / 10` : "별을 눌러 평점을 남겨보세요"}
          </p>
        </Section>

        {/* Comment */}
        <Section label="한 줄 감상 (선택)">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="영화 한 줄 감상을 남겨보세요"
            maxLength={140}
          />
        </Section>
      </div>

      {/* Submit */}
      <div className="fixed left-0 right-0 bottom-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom))] z-20 px-4 py-3 bg-[var(--app-bg)] border-t border-[var(--app-divider)]">
        <div className="max-w-2xl mx-auto">
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="w-full h-12 bg-[var(--app-pink)] hover:bg-[var(--app-pink-hover)] text-white text-base font-semibold rounded-full disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "기록 저장하기"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  label,
  required,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-sm font-semibold">
        {icon}
        {label}
        {required && <span className="text-[var(--app-pink)]">*</span>}
      </Label>
      {children}
    </div>
  );
}

// 5-star rating in 0.5 increments. Click on left half = .5, right half = full.
function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => {
        const full = value >= i;
        const half = !full && value >= i - 0.5;
        return (
          <div key={i} className="relative w-8 h-8">
            {/* Base (empty) star */}
            <Star className="absolute inset-0 w-8 h-8 text-[var(--app-border)]" />
            {/* Filled overlay */}
            {(full || half) && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: full ? "100%" : "50%" }}
              >
                <Star className="w-8 h-8 fill-[var(--app-pink)] text-[var(--app-pink)]" />
              </div>
            )}
            {/* Click halves */}
            <button
              type="button"
              aria-label={`${i - 0.5}점`}
              onClick={() => onChange(value === i - 0.5 ? 0 : i - 0.5)}
              className="absolute inset-y-0 left-0 w-1/2"
            />
            <button
              type="button"
              aria-label={`${i}점`}
              onClick={() => onChange(value === i ? i - 0.5 : i)}
              className="absolute inset-y-0 right-0 w-1/2"
            />
          </div>
        );
      })}
    </div>
  );
}