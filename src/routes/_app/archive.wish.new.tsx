import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MovieSearchInput } from "@/components/archive/MovieSearchInput";
import type { TmdbMovie } from "@/lib/tmdb";
import { tmdbGenreNames, tmdbReleaseYear } from "@/lib/tmdb";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Film, Heart, Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_app/archive/wish/new")({
  component: NewArchiveWishPage,
});

const PRIORITIES = [
  { value: "must", label: "❤️ 꼭 보고 싶어요" },
  { value: "maybe", label: "👍 기회되면 봐요" },
] as const;
type Priority = (typeof PRIORITIES)[number]["value"];

function NewArchiveWishPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [movie, setMovie] = useState<TmdbMovie | null>(null);
  const [priority, setPriority] = useState<Priority>("must");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = !!movie && !submitting;

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
      const { error: itemErr } = await supabase
        .from("archive_items")
        .insert({
          couple_id: me.couple_id,
          added_by: user.id,
          type: "wish",
          category: "movie",
          title: movie.title || movie.original_title,
          poster_url: movie.poster_path,
          release_year: tmdbReleaseYear(movie.release_date) || null,
          genre: genres.length ? genres.join(", ") : null,
          tmdb_id: String(movie.id),
          priority,
          reason: reason.trim() ? reason.trim() : null,
        });
      if (itemErr) throw itemErr;

      toast.success("위시에 추가됐어요 ⭐");
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
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--app-divider)]">
        <button
          type="button"
          onClick={() => navigate({ to: "/archive" })}
          aria-label="뒤로"
          className="p-1.5 -ml-1.5 rounded-full text-[var(--app-text)] hover:bg-[var(--app-surface)]"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">위시 추가</h1>
      </div>

      <div className="space-y-6 py-5">
        <Section
          icon={<Film className="w-4 h-4 text-[var(--app-pink)]" />}
          label="영화 검색"
          required
        >
          <MovieSearchInput value={movie} onChange={setMovie} autoFocus />
        </Section>

        <Section
          icon={<Heart className="w-4 h-4 text-[var(--app-pink)]" />}
          label="얼마나 보고 싶어요?"
        >
          <div className="flex flex-wrap gap-2">
            {PRIORITIES.map((p) => {
              const selected = priority === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={
                    "px-4 h-9 rounded-full text-sm font-medium border transition-colors " +
                    (selected
                      ? "bg-[var(--app-pink)] text-white border-[var(--app-pink)]"
                      : "bg-transparent text-[var(--app-text)] border-[var(--app-border)] hover:border-[var(--app-pink)]")
                  }
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section
          icon={<Sparkles className="w-4 h-4 text-[var(--app-pink)]" />}
          label="추천 이유 (선택)"
        >
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="왜 보고 싶은지 남겨보세요"
            maxLength={140}
          />
        </Section>
      </div>

      <div className="fixed left-0 right-0 bottom-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom))] z-20 px-4 py-3 bg-[var(--app-bg)] border-t border-[var(--app-divider)]">
        <div className="max-w-2xl mx-auto">
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="w-full h-12 bg-[var(--app-pink)] hover:bg-[var(--app-pink-hover)] text-white text-base font-semibold rounded-full disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "위시에 추가하기"}
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