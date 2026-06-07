import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { searchPlaces } from "@/lib/places.functions";
import { notifyPartnerOfNewRecord } from "@/lib/push.functions";
import { getSignedPhotoUrls } from "@/lib/photos";
import { compressImage } from "@/lib/image-compress";
import { clearDataCache } from "@/lib/sw-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Calendar as CalIcon,
  ImagePlus,
  Loader2,
  MapPin,
  Search,
  Star,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_app/record/new")({
  validateSearch: (s: Record<string, unknown>) => ({ date: (s.date as string) ?? "" }),
  component: NewRecordPage,
});

const TAGS = ["데이트", "여행", "일상", "특별한날"] as const;
type Tag = (typeof TAGS)[number];

type Place = { id: string; name: string; address: string; lat: number; lng: number };
type Photo = {
  preview: string;
  file?: File;        // present for newly added photos
  existingId?: string; // present for photos already in DB
  storageUrl?: string; // present for existing photos
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function NewRecordPage() {
  const { date: dateParam } = Route.useSearch();
  const navigate = useNavigate();
  const placesFn = useServerFn(searchPlaces);
  const notifyFn = useServerFn(notifyPartnerOfNewRecord);
  const qc = useQueryClient();

  const [date, setDate] = useState(dateParam || todayStr());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [tag, setTag] = useState<Tag>("데이트");
  const [memo, setMemo] = useState("");
  // score is in STARS (0-5, step 0.5); saved as score*2 (0-10)
  const [score, setScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [existingRecordId, setExistingRecordId] = useState<string | null>(null);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragIdx = useRef<number | null>(null);

  const browserKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;

  useEffect(() => {
    return () => photos.forEach((p) => { if (p.file) URL.revokeObjectURL(p.preview); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load existing record for this date (if any), so a second user editing the
  // same date sees the already-saved photos/location/tag/memo and their own rating.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingExisting(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: me } = await supabase
          .from("users").select("couple_id").eq("id", user.id).maybeSingle();
        if (!me?.couple_id) return;
        const { data: rec } = await supabase
          .from("records")
          .select("id, memo, tag, location_name, lat, lng")
          .eq("couple_id", me.couple_id)
          .eq("date", date)
          .maybeSingle();
        if (cancelled || !rec) return;
        setExistingRecordId(rec.id);
        setMemo(rec.memo ?? "");
        if (rec.tag && (TAGS as readonly string[]).includes(rec.tag)) setTag(rec.tag as Tag);
        if (rec.location_name && rec.lat != null && rec.lng != null) {
          setPlace({ id: "existing", name: rec.location_name, address: "", lat: rec.lat, lng: rec.lng });
          setQuery(rec.location_name);
        }
        const [{ data: ph }, { data: rt }] = await Promise.all([
          supabase.from("photos").select("id, storage_url, order").eq("record_id", rec.id).order("order"),
          supabase.from("ratings").select("score").eq("record_id", rec.id).eq("user_id", user.id).maybeSingle(),
        ]);
        if (cancelled) return;
        const rows = ph ?? [];
        const urlMap = await getSignedPhotoUrls(rows.map((p) => p.storage_url));
        if (cancelled) return;
        setPhotos(rows.map((p) => ({
          existingId: p.id,
          storageUrl: p.storage_url,
          preview: urlMap[p.storage_url] ?? "",
        })));
        if (rt && typeof (rt as any).score === "number") {
          setScore((rt as any).score / 2);
        }
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [date]);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    setPhotos((prev) => {
      const room = 10 - prev.length;
      if (room <= 0) {
        toast.error("사진은 최대 10장까지");
        return prev;
      }
      const next = arr.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }));
      return [...prev, ...next];
    });
  }

  function removePhoto(i: number) {
    setPhotos((prev) => {
      const target = prev[i];
      if (target.file) URL.revokeObjectURL(target.preview);
      if (target.existingId) setRemovedPhotoIds((ids) => [...ids, target.existingId!]);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function onPhotoDragStart(i: number) {
    dragIdx.current = i;
  }
  function onPhotoDrop(i: number) {
    const from = dragIdx.current;
    if (from == null || from === i) return;
    setPhotos((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
    dragIdx.current = null;
  }

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const r = await placesFn({ data: { query: query.trim() } });
      setResults(r);
    } catch (e: any) {
      toast.error(e.message ?? "검색 실패");
    } finally {
      setSearching(false);
    }
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("로그인 필요");
      console.log("[record save] auth.uid() =", user.id);
      const { data: me } = await supabase.from("users").select("couple_id").eq("id", user.id).maybeSingle();
      if (!me?.couple_id) throw new Error("커플 연결 필요");

      const updatableFields = {
        date,
        memo: memo || null,
        tag,
        location_name: place?.name ?? null,
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
      };

      let recId: string;
      let isNewRecord = false;

      if (existingRecordId) {
        // Editing an existing record: always UPDATE by id, never insert.
        // If the date changed, make sure no other record already exists on the new date.
        const { data: conflict } = await supabase
          .from("records")
          .select("id")
          .eq("couple_id", me.couple_id)
          .eq("date", date)
          .neq("id", existingRecordId)
          .maybeSingle();
        if (conflict) {
          toast.error("해당 날짜에 이미 기록이 있어요. 날짜를 다시 확인해주세요");
          setSubmitting(false);
          return;
        }
        const { error: updErr } = await supabase
          .from("records")
          .update(updatableFields)
          .eq("id", existingRecordId);
        if (updErr) throw updErr;
        recId = existingRecordId;
      } else {
        // New record: check for conflict on this date, then insert.
        const { data: conflict } = await supabase
          .from("records")
          .select("id")
          .eq("couple_id", me.couple_id)
          .eq("date", date)
          .maybeSingle();
        if (conflict) {
          toast.error("해당 날짜에 이미 기록이 있어요. 날짜를 다시 확인해주세요");
          setSubmitting(false);
          return;
        }
        const { data: rec, error: recErr } = await supabase
          .from("records")
          .insert({ couple_id: me.couple_id, author_id: user.id, ...updatableFields })
          .select("id")
          .single();
        if (recErr || !rec) throw recErr ?? new Error("기록 저장 실패");
        recId = rec.id;
        isNewRecord = true;
      }

      // Delete removed existing photos
      if (removedPhotoIds.length > 0) {
        await supabase.from("photos").delete().in("id", removedPhotoIds);
      }

      // Upload only new photos; keep existing rows untouched.
      // Re-number order so the final array reflects current UI order.
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        if (p.existingId) {
          await supabase.from("photos").update({ order: i }).eq("id", p.existingId);
          continue;
        }
        if (!p.file) continue;
        const compressed = await compressImage(p.file, { maxEdge: 1200, quality: 0.8 });
        const ext = compressed.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${me.couple_id}/${recId}/${i}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("record-photos")
          .upload(path, compressed, { contentType: compressed.type, upsert: false });
        if (upErr) throw upErr;
        await supabase.from("photos").insert({
          record_id: recId,
          storage_url: path,
          order: i,
        });
      }

      // Personal rating: upsert on (record_id, user_id) so it never overwrites
      // the partner's rating.
      if (score > 0) {
        const { error: rateErr } = await supabase
          .from("ratings")
          .upsert(
            { record_id: recId, user_id: user.id, score: score * 2 },
            { onConflict: "record_id,user_id" },
          );
        if (rateErr) throw rateErr;
      }

      toast.success(existingRecordId ? "기록이 업데이트 됐어요 ✓" : "기록 저장 완료 💕");
      clearDataCache();
      qc.invalidateQueries({ queryKey: ["records"] });
      if (isNewRecord) {
        notifyFn({ data: { recordId: recId } }).catch((e) =>
          console.error("[push] notify failed", e),
        );
      }
      navigate({ to: "/date/$dateId", params: { dateId: recId } });
    } catch (e: any) {
      toast.error(e.message ?? "저장 실패");
    } finally {
      setSubmitting(false);
    }
  }

  const staticMapUrl =
    place && browserKey
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${place.lat},${place.lng}&zoom=15&size=640x240&scale=2&markers=color:0xec4899%7C${place.lat},${place.lng}&key=${browserKey}`
      : null;

  return (
    <div className="space-y-6 pb-8">
      <h2 className="text-xl font-semibold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
        {existingRecordId ? "기록 편집" : "새로운 기록"}
      </h2>
      {existingRecordId && !loadingExisting && (
        <p className="text-xs text-muted-foreground -mt-3">
          이 날짜의 기록이 이미 있어요. 함께 채워나가 보세요 💕
        </p>
      )}

      {/* Date */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-sm"><CalIcon className="w-4 h-4 text-pink-500" />날짜</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {/* Photos */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-sm">
          <ImagePlus className="w-4 h-4 text-pink-500" />사진 <span className="text-xs text-muted-foreground">({photos.length}/10)</span>
        </Label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInput.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragOver ? "border-pink-400 bg-pink-50/60 dark:bg-pink-950/30" : "border-border hover:border-pink-300"
          }`}
        >
          <ImagePlus className="w-8 h-8 mx-auto text-pink-400 mb-2" />
          <p className="text-sm text-muted-foreground">탭하거나 드래그해서 사진 추가</p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <div
                key={p.preview}
                draggable
                onDragStart={() => onPhotoDragStart(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onPhotoDrop(i)}
                className="relative aspect-square rounded-lg overflow-hidden border border-pink-200/60 group cursor-move"
              >
                <img src={p.preview} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                >
                  <X className="w-3 h-3" />
                </button>
                <span className="absolute bottom-1 left-1 text-[10px] bg-pink-500/90 text-white px-1.5 rounded-full">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-sm"><MapPin className="w-4 h-4 text-purple-500" />장소</Label>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
            placeholder="장소를 검색해보세요"
          />
          <Button type="button" variant="outline" onClick={runSearch} disabled={searching}>
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
        {results.length > 0 && !place && (
          <div className="rounded-lg border border-border divide-y max-h-60 overflow-auto">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setPlace(r); setResults([]); setQuery(r.name); }}
                className="w-full text-left px-3 py-2 hover:bg-pink-50 dark:hover:bg-pink-950/30 text-sm"
              >
                <div className="font-medium">{r.name}</div>
                <div className="text-xs text-muted-foreground truncate">{r.address}</div>
              </button>
            ))}
          </div>
        )}
        {place && (
          <div className="rounded-xl overflow-hidden border border-purple-200/60">
            {staticMapUrl && (
              <img src={staticMapUrl} alt={place.name} className="w-full h-32 object-cover" />
            )}
            <div className="flex items-center justify-between p-3 bg-purple-50/40 dark:bg-purple-950/20">
              <div>
                <div className="text-sm font-medium">{place.name}</div>
                <div className="text-xs text-muted-foreground">{place.address}</div>
              </div>
              <button type="button" onClick={() => { setPlace(null); setQuery(""); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tag */}
      <div className="space-y-2">
        <Label className="text-sm">태그</Label>
        <div className="flex flex-wrap gap-2">
          {TAGS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                tag === t
                  ? "bg-gradient-to-r from-pink-400 to-purple-400 text-white shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-pink-100 dark:hover:bg-pink-950/30"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Memo */}
      <div className="space-y-2">
        <Label className="text-sm">메모 <span className="text-xs text-muted-foreground">(선택)</span></Label>
        <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={4} placeholder="오늘의 이야기를 남겨보세요…" />
      </div>

      {/* Rating */}
      <div className="space-y-2">
        <Label className="text-sm">
          내 별점{" "}
          <span className="text-pink-500 font-semibold ml-1">{score.toFixed(1)}</span> / 5
          <span className="text-xs text-muted-foreground ml-2">({(score * 2).toFixed(0)}점 / 10점)</span>
        </Label>
        <StarRating value={score} onChange={setScore} />
      </div>

      <Button
        onClick={submit}
        disabled={submitting}
        className="w-full h-12 text-base bg-gradient-to-r from-pink-400 to-purple-400 hover:from-pink-500 hover:to-purple-500 text-white shadow-md"
      >
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "기록 저장하기"}
      </Button>
    </div>
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // value is in STARS (0-5), step 0.5 (half-star). Two click zones per star.
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => {
        const halfStar = i + 0.5;
        const fullStar = i + 1;
        const filled = value >= fullStar ? 2 : value >= halfStar ? 1 : 0;
        const pct = (filled / 2) * 100;
        return (
          <div key={i} className="relative w-10 h-10">
            <Star className="absolute inset-0 w-10 h-10 text-muted stroke-muted-foreground/40" />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
              <Star className="w-10 h-10 text-pink-400 fill-pink-400" />
            </div>
            <button
              type="button"
              aria-label={`${halfStar}점`}
              onClick={() => onChange(halfStar)}
              className="absolute top-0 left-0 w-1/2 h-full"
            />
            <button
              type="button"
              aria-label={`${fullStar}점`}
              onClick={() => onChange(fullStar)}
              className="absolute top-0 right-0 w-1/2 h-full"
            />
          </div>
        );
      })}
    </div>
  );
}