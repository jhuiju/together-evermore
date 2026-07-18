import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { tmdbPosterUrl } from "@/lib/tmdb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft, Film, Star, Trash2, Pencil } from "lucide-react";

export const Route = createFileRoute("/_app/archive/item/$itemId")({
  component: ArchiveItemDetail,
});

const WATCH_TYPE_LABEL: Record<string, string> = { theater: "영화관", ott: "OTT", other: "기타" };
const PRIORITY_LABEL: Record<string, string> = { must: "❤️ 꼭 보고 싶어요", someday: "👍 기회되면 봐요" };

function ArchiveItemDetail() {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [editingRating, setEditingRating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: item, isLoading } = useQuery({
    queryKey: ["archive_item", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("archive_items")
        .select("*, archive_ratings(id, user_id, score, comment), author:users!archive_items_added_by_fkey(id, nickname)")
        .eq("id", itemId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function handleDelete() {
    try {
      await supabase.from("archive_ratings").delete().eq("archive_item_id", itemId);
      const { error } = await supabase.from("archive_items").delete().eq("id", itemId);
      if (error) throw error;
      toast.success("삭제됐어요");
      qc.invalidateQueries({ queryKey: ["archive_items"] });
      navigate({ to: "/archive" });
    } catch (e: any) {
      toast.error(e?.message ?? "삭제에 실패했어요");
    }
  }

  if (isLoading) {
    return <div className="py-12 text-center text-[var(--app-muted)] text-sm">불러오는 중…</div>;
  }
  if (!item) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--app-muted)] text-sm mb-3">항목을 찾을 수 없어요</p>
        <Button onClick={() => navigate({ to: "/archive" })} variant="outline">아카이브로</Button>
      </div>
    );
  }

  const ratings: any[] = item.archive_ratings ?? [];
  const mine = ratings.find((r) => r.user_id === user?.id);
  const partner = ratings.find((r) => r.user_id !== user?.id);
  const posterUrl = tmdbPosterUrl(item.poster_url, "w342");

  return (
    <div className="pb-28 text-[var(--app-text)]">
      <div className="flex items-center gap-2 pb-2 border-b border-[var(--app-divider)] sticky top-0 bg-[var(--app-bg)] z-10">
        <button type="button" onClick={() => navigate({ to: "/archive" })} aria-label="뒤로"
          className="p-1.5 -ml-1.5 rounded-full hover:bg-[var(--app-surface)]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold truncate">{item.type === "wish" ? "위시" : "기록"}</h1>
      </div>

      <div className="flex flex-col items-center py-5">
        {posterUrl ? (
          <img src={posterUrl} alt={`${item.title} 포스터`}
            className="w-[220px] max-w-[70vw] aspect-[2/3] object-cover rounded-lg bg-[var(--app-surface)]" />
        ) : (
          <div className="w-[220px] max-w-[70vw] aspect-[2/3] rounded-lg bg-[var(--app-surface)] border border-[var(--app-border)] flex items-center justify-center">
            <Film className="w-8 h-8 text-[var(--app-muted)]" />
          </div>
        )}
        <h2 className="mt-4 text-lg font-bold text-center px-4">{item.title}</h2>
        {(item.release_year || item.genre) && (
          <p className="text-xs text-[var(--app-muted)] mt-1">
            {[item.release_year, item.genre].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {item.type === "record" ? (
        <div className="space-y-5">
          <div className="flex items-center gap-2 justify-center">
            {item.watched_date && (
              <span className="text-sm text-[var(--app-muted)]">관람일 {item.watched_date.replaceAll("-", ".")}</span>
            )}
            {item.watch_type && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--app-surface)] border border-[var(--app-border)]">
                {WATCH_TYPE_LABEL[item.watch_type] ?? item.watch_type}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <RatingCard label="나의 별점" color="var(--app-pink)" rating={mine}
              editable onEdit={() => setEditingRating(true)} />
            <RatingCard label="파트너 별점" color="#A78BFA" rating={partner} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setEditingRating(true)}>
              <Pencil className="w-4 h-4 mr-1" /> 수정
            </Button>
            <Button variant="outline" className="flex-1 text-red-500 border-red-200 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-4 h-4 mr-1" /> 삭제
            </Button>
          </div>

          {!mine && (
            <div className="fixed left-0 right-0 bottom-[calc(var(--app-bottom-nav-h)+env(safe-area-inset-bottom))] z-20 px-4 py-3 bg-[var(--app-bg)] border-t border-[var(--app-divider)]">
              <Button onClick={() => setEditingRating(true)}
                className="w-full h-12 bg-[var(--app-pink)] hover:bg-[var(--app-pink-hover)] text-white text-base font-semibold rounded-full">
                별점 남기기
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center">
            {item.priority && (
              <span className="text-sm px-3 py-1 rounded-full bg-[var(--app-surface)] border border-[var(--app-border)]">
                {PRIORITY_LABEL[item.priority] ?? item.priority}
              </span>
            )}
          </div>
          <p className="text-sm text-center text-[var(--app-muted)]">
            {item.author?.nickname ?? "파트너"}이 추천했어요
          </p>
          {item.reason && (
            <p className="text-sm text-center italic text-[var(--app-muted)] px-6">"{item.reason}"</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 bg-[var(--app-pink)] hover:bg-[var(--app-pink-hover)] text-white"
              onClick={() => navigate({ to: "/archive/record/new", search: { fromWish: item.id } as any })}>
              기록으로 이동
            </Button>
            <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {editingRating && user && (
        <RatingEditor
          itemId={item.id}
          userId={user.id}
          initial={mine}
          onClose={() => setEditingRating(false)}
          onSaved={() => {
            setEditingRating(false);
            qc.invalidateQueries({ queryKey: ["archive_item", itemId] });
            qc.invalidateQueries({ queryKey: ["archive_items"] });
          }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 기록을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>별점과 감상도 함께 삭제돼요.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RatingCard({
  label, color, rating, editable, onEdit,
}: {
  label: string; color: string; rating?: any; editable?: boolean; onEdit?: () => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--app-muted)]">{label}</p>
        {editable && rating && (
          <button type="button" onClick={onEdit} aria-label="수정"
            className="p-1 text-[var(--app-muted)] hover:text-[var(--app-text)]">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {rating ? (
        <>
          <div className="flex items-center gap-1 text-lg font-bold" style={{ color }}>
            <Star className="w-4 h-4 fill-current" />
            {rating.score}
          </div>
          {rating.comment && (
            <p className="text-xs text-[var(--app-muted)] italic">{rating.comment}</p>
          )}
        </>
      ) : (
        <p className="text-sm text-[var(--app-muted)]">미입력</p>
      )}
    </div>
  );
}

function RatingEditor({
  itemId, userId, initial, onClose, onSaved,
}: {
  itemId: string;
  userId: string;
  initial?: { id?: string; score: number; comment: string | null } | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stars, setStars] = useState(initial ? initial.score / 2 : 0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (stars <= 0) {
      toast.error("별점을 선택해주세요");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("archive_ratings").upsert(
        { archive_item_id: itemId, user_id: userId, score: stars * 2, comment: comment.trim() || null },
        { onConflict: "archive_item_id,user_id" },
      );
      if (error) throw error;
      toast.success("저장됐어요");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "저장에 실패했어요");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg bg-[var(--app-bg)] rounded-t-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold">나의 별점</h3>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => {
            const full = stars >= i;
            const half = !full && stars >= i - 0.5;
            return (
              <div key={i} className="relative w-8 h-8">
                <Star className="absolute inset-0 w-8 h-8 text-[var(--app-border)]" />
                {(full || half) && (
                  <div className="absolute inset-0 overflow-hidden" style={{ width: full ? "100%" : "50%" }}>
                    <Star className="w-8 h-8 fill-[var(--app-pink)] text-[var(--app-pink)]" />
                  </div>
                )}
                <button type="button" aria-label={`${i - 0.5}점`}
                  onClick={() => setStars(stars === i - 0.5 ? 0 : i - 0.5)}
                  className="absolute inset-y-0 left-0 w-1/2" />
                <button type="button" aria-label={`${i}점`}
                  onClick={() => setStars(stars === i ? i - 0.5 : i)}
                  className="absolute inset-y-0 right-0 w-1/2" />
              </div>
            );
          })}
          <span className="ml-2 text-sm text-[var(--app-muted)]">
            {stars > 0 ? `${(stars * 2).toFixed(1)} / 10` : "선택"}
          </span>
        </div>
        <Input value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="한 줄 감상 (선택)" maxLength={140} />
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>취소</Button>
          <Button className="flex-1 bg-[var(--app-pink)] hover:bg-[var(--app-pink-hover)] text-white"
            disabled={saving} onClick={save}>저장</Button>
        </div>
      </div>
    </div>
  );
}