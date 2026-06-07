import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPhotoPath, getSignedPhotoUrls } from "@/lib/photos";
import { clearDataCache } from "@/lib/sw-cache";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, MapPin, Pencil, Star, Trash2 } from "lucide-react";
import { X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/date/$dateId")({
  component: DateDetailPage,
});

type RecordRow = {
  id: string;
  date: string;
  memo: string | null;
  tag: string | null;
  location_name: string | null;
  lat: number | null;
  lng: number | null;
  author_id: string;
  couple_id: string;
};
type PhotoRow = { id: string; storage_url: string; order: number };
type RatingRow = { id: string; user_id: string; score: number };
type UserRow = { id: string; nickname: string | null; avatar_url: string | null };

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;

function Stars({ score, size = 16 }: { score: number; size?: number }) {
  // score is stored 0-10; convert to 0-5 stars with half-step
  const stars = score / 2;
  const full = Math.floor(stars);
  const half = stars - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f${i}`} className="fill-primary text-primary" style={{ width: size, height: size }} />
      ))}
      {half === 1 && (
        <div className="relative" style={{ width: size, height: size }}>
          <Star className="absolute inset-0 text-primary" style={{ width: size, height: size }} />
          <div className="absolute inset-0 overflow-hidden" style={{ width: size / 2 }}>
            <Star className="fill-primary text-primary" style={{ width: size, height: size }} />
          </div>
        </div>
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} className="text-muted-foreground/40" style={{ width: size, height: size }} />
      ))}
    </div>
  );
}

// value/onChange are in STARS (0-5, step 0.5)
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const halfStar = i + 0.5;
        const fullStar = i + 1;
        const filled = display >= fullStar ? 2 : display >= halfStar ? 1 : 0;
        return (
          <div key={i} className="relative cursor-pointer" style={{ width: 28, height: 28 }}>
            <Star className={`absolute inset-0 w-7 h-7 ${filled === 0 ? "text-muted-foreground/40" : "text-primary"}`} />
            {filled > 0 && (
              <div className="absolute inset-0 overflow-hidden" style={{ width: filled === 1 ? 14 : 28 }}>
                <Star className="w-7 h-7 fill-primary text-primary" />
              </div>
            )}
            <button
              type="button"
              className="absolute inset-y-0 left-0 w-1/2"
              onMouseEnter={() => setHover(halfStar)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onChange(halfStar)}
              aria-label={`${halfStar}점 (${halfStar * 2}점/10)`}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 w-1/2"
              onMouseEnter={() => setHover(fullStar)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onChange(fullStar)}
              aria-label={`${fullStar}점 (${fullStar * 2}점/10)`}
            />
          </div>
        );
      })}
      <span className="ml-2 text-sm font-medium text-primary">
        {display.toFixed(1)} / 5 <span className="text-muted-foreground font-normal">({(display * 2).toFixed(0)}점/10)</span>
      </span>
    </div>
  );
}

function DateDetailPage() {
  const { dateId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [record, setRecord] = useState<RecordRow | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(0);
  const viewerTouchStart = useRef<number | null>(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [pendingScore, setPendingScore] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [myCoupleId, setMyCoupleId] = useState<string | null>(null);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    if (!viewerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewerOpen(false);
      if (e.key === "ArrowLeft") setViewerIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setViewerIdx((i) => Math.min(photos.length - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [viewerOpen, photos.length]);

  function openViewer(i: number) {
    setViewerIdx(i);
    setViewerOpen(true);
  }

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setMe(user?.id ?? null);
    if (user) {
      const { data: meRow } = await supabase
        .from("users")
        .select("couple_id")
        .eq("id", user.id)
        .maybeSingle();
      setMyCoupleId(meRow?.couple_id ?? null);
    }

    const { data: rec, error } = await supabase
      .from("records")
      .select("id, date, memo, tag, location_name, lat, lng, author_id, couple_id")
      .eq("id", dateId)
      .maybeSingle();
    if (error || !rec) {
      toast.error("기록을 불러올 수 없어요");
      setLoading(false);
      return;
    }
    setRecord(rec);

    const [{ data: ph }, { data: rt }, { data: us }] = await Promise.all([
      supabase.from("photos").select("id, storage_url, order").eq("record_id", dateId).order("order"),
      supabase.from("ratings").select("id, user_id, score").eq("record_id", dateId),
      supabase.from("users").select("id, nickname, avatar_url").eq("couple_id", rec.couple_id),
    ]);
    setPhotos(ph ?? []);
    const urls = await getSignedPhotoUrls((ph ?? []).map((p) => p.storage_url));
    setPhotoUrls(urls);
    setRatings(rt ?? []);
    setUsers(us ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateId]);

  const myRating = useMemo(() => ratings.find((r) => r.user_id === me) ?? null, [ratings, me]);
  const partner = useMemo(() => users.find((u) => u.id !== me) ?? null, [users, me]);
  const author = useMemo(() => users.find((u) => u.id === record?.author_id) ?? null, [users, record]);
  const myUser = useMemo(() => users.find((u) => u.id === me) ?? null, [users, me]);
  const partnerRating = useMemo(
    () => (partner ? ratings.find((r) => r.user_id === partner.id) ?? null : null),
    [ratings, partner],
  );
  const average = useMemo(() => {
    if (!myRating || !partnerRating) return null;
    return (myRating.score + partnerRating.score) / 2;
  }, [myRating, partnerRating]);

  function photoUrl(p: PhotoRow) {
    return photoUrls[p.storage_url] ?? "";
  }

  async function submitRating() {
    if (!me || !record || pendingScore <= 0) return;
    // Optimistic update: reflect the new rating immediately.
    const scoreToSave = pendingScore * 2;
    const prevRatings = ratings;
    const optimistic: RatingRow = {
      id: `optimistic-${me}`,
      user_id: me,
      score: scoreToSave,
    };
    setRatings((rs) => {
      const others = rs.filter((r) => r.user_id !== me);
      return [...others, optimistic];
    });
    setPendingScore(0);
    setSubmittingRating(true);
    const { error } = await supabase
      .from("ratings")
      .upsert(
        { record_id: record.id, user_id: me, score: scoreToSave },
        { onConflict: "record_id,user_id" },
      );
    setSubmittingRating(false);
    if (error) {
      // Roll back on failure.
      setRatings(prevRatings);
      toast.error(error.message);
      return;
    }
    toast.success("별점이 저장되었어요 ⭐");
    qc.invalidateQueries({ queryKey: ["records"] });
  }

  async function deleteRecord() {
    if (!record) return;
    // Optimistic navigation: leave the page right away and reconcile in the background.
    setDeleting(true);
    const snapshot = { record, photos, ratings };
    toast.success("기록이 삭제됐어요");
    navigate({ to: "/calendar" });
    try {
      const { error: rErr } = await supabase.from("ratings").delete().eq("record_id", record.id);
      if (rErr) throw rErr;

      const paths = photos
        .map((p) => getPhotoPath(p.storage_url))
        .filter(Boolean);
      if (paths.length > 0) {
        const { error: sErr } = await supabase.storage.from("record-photos").remove(paths);
        if (sErr) throw sErr;
      }
      const { error: pErr } = await supabase.from("photos").delete().eq("record_id", record.id);
      if (pErr) throw pErr;

      const { error: recErr } = await supabase.from("records").delete().eq("id", record.id);
      if (recErr) throw recErr;

      clearDataCache();
      qc.invalidateQueries({ queryKey: ["records"] });
    } catch (e) {
      console.error(e);
      toast.error("삭제 중 오류가 발생했어요. 다시 시도해주세요");
      // Restore local state so the user can retry if they navigate back.
      setRecord(snapshot.record);
      setPhotos(snapshot.photos);
      setRatings(snapshot.ratings);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!record) return <p className="text-center text-muted-foreground py-10">기록이 없어요</p>;

  const mapSrc =
    record.lat && record.lng && BROWSER_KEY
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${record.lat},${record.lng}&zoom=15&size=600x240&scale=2&markers=color:0xec4899%7C${record.lat},${record.lng}&key=${BROWSER_KEY}`
      : null;

  return (
    <div className="space-y-5 pb-32">
      {/* Carousel */}
      {photos.length > 0 ? (
        <div
          className="relative -mx-4 aspect-square bg-muted overflow-hidden"
          onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStart.current == null) return;
            const dx = e.changedTouches[0].clientX - touchStart.current;
            if (dx < -40) setCarouselIdx((i) => Math.min(photos.length - 1, i + 1));
            if (dx > 40) setCarouselIdx((i) => Math.max(0, i - 1));
            touchStart.current = null;
          }}
        >
          {photos.map((p, i) => (
            <img
              key={p.id}
              src={photoUrl(p)}
              alt={`사진 ${i + 1}`}
              onClick={() => i === carouselIdx && openViewer(i)}
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${i === carouselIdx ? "opacity-100 cursor-zoom-in" : "opacity-0 pointer-events-none"}`}
            />
          ))}
          {photos.length > 1 && (
            <>
              <button
                onClick={() => setCarouselIdx((i) => Math.max(0, i - 1))}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/70 backdrop-blur flex items-center justify-center disabled:opacity-30"
                disabled={carouselIdx === 0}
                aria-label="이전"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCarouselIdx((i) => Math.min(photos.length - 1, i + 1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/70 backdrop-blur flex items-center justify-center disabled:opacity-30"
                disabled={carouselIdx === photos.length - 1}
                aria-label="다음"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCarouselIdx(i)}
                    className={`h-1.5 rounded-full transition-all ${i === carouselIdx ? "w-6 bg-white" : "w-1.5 bg-white/60"}`}
                    aria-label={`사진 ${i + 1}로 이동`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="-mx-4 aspect-[2/1] bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center text-muted-foreground text-sm">
          사진이 없어요
        </div>
      )}

      {/* Location */}
      {record.location_name && (
        <Card className="overflow-hidden">
          <div className="p-4 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            <span className="font-medium">{record.location_name}</span>
          </div>
          {mapSrc && (
            <img src={mapSrc} alt="지도" className="w-full h-40 object-cover" loading="lazy" />
          )}
        </Card>
      )}

      {/* Ratings */}
      <div className="grid grid-cols-2 gap-3">
        <RatingCard
          label={myUser?.nickname || "나"}
          avatar={myUser?.avatar_url}
          score={myRating?.score ?? null}
          tone="me"
        />
        <RatingCard
          label={partner?.nickname || "파트너"}
          avatar={partner?.avatar_url}
          score={partnerRating?.score ?? null}
          tone="partner"
        />
      </div>
      {average !== null && (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground">평균 별점</p>
          <p className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            {(average / 2).toFixed(2)}
            <span className="text-sm text-muted-foreground font-normal"> / 5 ({average.toFixed(1)}점/10)</span>
          </p>
        </div>
      )}

      {/* Tag + memo */}
      <div className="space-y-3">
        {record.tag && (
          <Badge className="bg-gradient-to-r from-primary to-accent text-primary-foreground border-0">
            {record.tag}
          </Badge>
        )}
        {record.memo && (
          <Card className="p-4 whitespace-pre-wrap leading-relaxed text-sm">{record.memo}</Card>
        )}
      </div>

      {/* Edit (both partners) */}
      {myCoupleId && record.couple_id === myCoupleId && (
        <Button
          asChild
          variant="outline"
          className="w-full border-primary/30 text-primary hover:bg-primary/5"
        >
          <Link to="/record/new" search={{ date: record.date }}>
            <Pencil className="w-4 h-4 mr-1" /> 수정
          </Link>
        </Button>
      )}

      {/* Author info */}
      <Card className="p-3 flex items-center gap-3 bg-muted/30">
        <Avatar className="w-9 h-9">
          {author?.avatar_url && <AvatarImage src={author.avatar_url} />}
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {author?.nickname?.[0] ?? "?"}
          </AvatarFallback>
        </Avatar>
        <div className="text-sm">
          <div className="font-medium">{author?.nickname ?? "알 수 없음"}</div>
          <div className="text-xs text-muted-foreground">{record.date}</div>
        </div>
      </Card>

      {/* Delete (any couple member) */}
      {myCoupleId && record.couple_id === myCoupleId && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-1" />
              )}
              기록 삭제
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>기록을 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                기록을 삭제하면 사진, 장소, 메모, 별점이 모두 삭제돼요. 정말 삭제할까요?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteRecord}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                삭제할게요
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Floating rate bar */}
      {!myRating && (
        <div className="fixed bottom-16 inset-x-0 z-20 px-4 pointer-events-none">
          <Card className="max-w-2xl mx-auto p-3 flex items-center justify-between gap-3 shadow-lg border-primary/30 bg-card/95 backdrop-blur pointer-events-auto">
            <div>
              <p className="text-xs text-muted-foreground">내 별점</p>
              <StarPicker value={pendingScore} onChange={setPendingScore} />
            </div>
            <Button
              onClick={submitRating}
              disabled={pendingScore <= 0 || submittingRating}
              className="bg-gradient-to-r from-primary to-accent text-primary-foreground"
            >
              {submittingRating ? <Loader2 className="w-4 h-4 animate-spin" /> : "저장"}
            </Button>
          </Card>
        </div>
      )}

      {viewerOpen && photos.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/95 animate-fade-in flex items-center justify-center"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
            paddingLeft: "env(safe-area-inset-left)",
            paddingRight: "env(safe-area-inset-right)",
          }}
          onClick={() => setViewerOpen(false)}
          onTouchStart={(e) => (viewerTouchStart.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (viewerTouchStart.current == null) return;
            const dx = e.changedTouches[0].clientX - viewerTouchStart.current;
            if (dx < -40) setViewerIdx((i) => Math.min(photos.length - 1, i + 1));
            if (dx > 40) setViewerIdx((i) => Math.max(0, i - 1));
            viewerTouchStart.current = null;
          }}
          role="dialog"
          aria-modal="true"
          aria-label="사진 보기"
        >
          <div
            className="absolute top-0 inset-x-0 flex items-center justify-center pt-3 text-white text-sm select-none pointer-events-none"
            style={{ paddingTop: `calc(env(safe-area-inset-top) + 12px)` }}
          >
            {viewerIdx + 1} / {photos.length}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setViewerOpen(false);
            }}
            className="absolute top-0 right-0 m-3 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            style={{ marginTop: `calc(env(safe-area-inset-top) + 12px)` }}
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={photoUrl(photos[viewerIdx])}
            alt={`사진 ${viewerIdx + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full object-contain animate-fade-in"
          />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewerIdx((i) => Math.max(0, i - 1));
                }}
                disabled={viewerIdx === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white disabled:opacity-30"
                aria-label="이전 사진"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewerIdx((i) => Math.min(photos.length - 1, i + 1));
                }}
                disabled={viewerIdx === photos.length - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white disabled:opacity-30"
                aria-label="다음 사진"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RatingCard({
  label,
  avatar,
  score,
  tone,
}: {
  label: string;
  avatar: string | null | undefined;
  score: number | null;
  tone: "me" | "partner";
}) {
  const gradient =
    tone === "me"
      ? "from-primary/15 to-primary/5 border-primary/20"
      : "from-accent/15 to-accent/5 border-accent/20";
  return (
    <Card className={`p-4 bg-gradient-to-br ${gradient}`}>
      <div className="flex items-center gap-2 mb-2">
        <Avatar className="w-7 h-7">
          {avatar && <AvatarImage src={avatar} />}
          <AvatarFallback className="text-xs">{label[0]}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium truncate">{label}</span>
      </div>
      {score !== null ? (
        <>
          <Stars score={score} />
          <p className="mt-1 text-lg font-bold">
            {(score / 2).toFixed(1)}
            <span className="text-xs text-muted-foreground font-normal"> / 5 ({score.toFixed(1)}점/10)</span>
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground py-2">아직 미입력</p>
      )}
    </Card>
  );
}