import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { searchPlaces } from "@/lib/places.functions";
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
type Photo = { file: File; preview: string };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function NewRecordPage() {
  const { date: dateParam } = Route.useSearch();
  const navigate = useNavigate();
  const placesFn = useServerFn(searchPlaces);

  const [date, setDate] = useState(dateParam || todayStr());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [tag, setTag] = useState<Tag>("데이트");
  const [memo, setMemo] = useState("");
  const [score, setScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragIdx = useRef<number | null>(null);

  const browserKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string | undefined;

  useEffect(() => {
    return () => photos.forEach((p) => URL.revokeObjectURL(p.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      URL.revokeObjectURL(prev[i].preview);
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
      const { data: me } = await supabase.from("users").select("couple_id").eq("id", user.id).maybeSingle();
      if (!me?.couple_id) throw new Error("커플 연결 필요");

      const { data: rec, error: recErr } = await supabase
        .from("records")
        .insert({
          couple_id: me.couple_id,
          author_id: user.id,
          date,
          memo: memo || null,
          tag,
          location_name: place?.name ?? null,
          lat: place?.lat ?? null,
          lng: place?.lng ?? null,
        })
        .select("id")
        .single();
      if (recErr || !rec) throw recErr ?? new Error("기록 생성 실패");

      // upload photos
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        const ext = p.file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${me.couple_id}/${rec.id}/${i}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("record-photos")
          .upload(path, p.file, { contentType: p.file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("record-photos").getPublicUrl(path);
        await supabase.from("photos").insert({
          record_id: rec.id,
          storage_url: pub.publicUrl,
          order: i,
        });
      }

      if (score > 0) {
        await supabase.from("ratings").insert({
          record_id: rec.id,
          user_id: user.id,
          score,
        });
      }

      toast.success("기록 저장 완료 💕");
      navigate({ to: "/date/$dateId", params: { dateId: rec.id } });
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
        새로운 기록
      </h2>

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
        <Label className="text-sm">내 별점 <span className="text-pink-500 font-semibold ml-1">{score.toFixed(1)}</span> / 10</Label>
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
  // 5 stars each worth 2 points; 0.5 step => each star has 4 quarters? No — 0.5 step means each star = 2 points,
  // so a star has 4 increments of 0.5 each. We split each star visually into left/right halves (1 pt each).
  // To support 0.5 step we use two clickable zones per half: that's 4 zones per star.
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3, 4].map((i) => {
        const base = i * 2;
        const filled = Math.min(Math.max(value - base, 0), 2);
        const pct = (filled / 2) * 100;
        return (
          <div key={i} className="relative w-10 h-10">
            <Star className="absolute inset-0 w-10 h-10 text-muted stroke-muted-foreground/40" />
            <div className="absolute inset-0 overflow-hidden" style={{ width: `${pct}%` }}>
              <Star className="w-10 h-10 text-pink-400 fill-pink-400" />
            </div>
            {[0.5, 1, 1.5, 2].map((step) => (
              <button
                key={step}
                type="button"
                aria-label={`${base + step}점`}
                onClick={() => onChange(base + step)}
                className="absolute top-0 h-full"
                style={{ left: `${((step - 0.5) / 2) * 100}%`, width: "25%" }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}