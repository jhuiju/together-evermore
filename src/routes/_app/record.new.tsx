import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  Pencil,
  Check,
  Star,
  X,
  GripVertical,
  Plus,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/_app/record/new")({
  validateSearch: (s: Record<string, unknown>) => ({ date: (s.date as string) ?? "" }),
  component: NewRecordPage,
});

const TAGS = ["데이트", "여행", "일상", "특별한날"] as const;
type Tag = (typeof TAGS)[number];

type Place = {
  id: string;
  name: string;
  address: string;
  category?: string;
  lat: number | null;
  lng: number | null;
};
type Photo = {
  uid: string;        // stable id for sortable
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
  const notifyFn = useServerFn(notifyPartnerOfNewRecord);
  const qc = useQueryClient();

  const [date, setDate] = useState(dateParam || todayStr());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [searched, setSearched] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [tag, setTag] = useState<Tag>("데이트");
  const [memo, setMemo] = useState("");
  // score is in STARS (0-5, step 0.5); saved as score*2 (0-10)
  const [score, setScore] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [existingRecordId, setExistingRecordId] = useState<string | null>(null);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [coupleId, setCoupleId] = useState<string | null>(null);
  const [favTogglingKey, setFavTogglingKey] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Load couple id once
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase
        .from("users").select("couple_id").eq("id", user.id).maybeSingle();
      if (me?.couple_id) setCoupleId(me.couple_id);
    })();
  }, []);

  type FavoritePlace = {
    id: string;
    location_name: string;
    lat: number | null;
    lng: number | null;
    created_at: string;
  };

  const { data: favorites = [] } = useQuery<FavoritePlace[]>({
    queryKey: ["favorite_places", coupleId],
    enabled: !!coupleId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("favorite_places")
        .select("id, location_name, lat, lng, created_at")
        .eq("couple_id", coupleId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FavoritePlace[];
    },
  });

  function favKey(name: string, lat: number | null, lng: number | null) {
    return `${name}::${lat ?? ""}::${lng ?? ""}`;
  }

  const currentFav = place
    ? favorites.find((f) =>
        favKey(f.location_name, f.lat, f.lng) === favKey(place.name, place.lat, place.lng),
      )
    : null;

  async function toggleFavorite() {
    if (!place || !coupleId) return;
    const key = favKey(place.name, place.lat, place.lng);
    setFavTogglingKey(key);
    try {
      if (currentFav) {
        const { error } = await (supabase as any)
          .from("favorite_places").delete().eq("id", currentFav.id);
        if (error) throw error;
        toast("즐겨찾는 장소에서 삭제했어요");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("로그인 필요");
        const { error } = await (supabase as any).from("favorite_places").insert({
          couple_id: coupleId,
          location_name: place.name,
          lat: place.lat,
          lng: place.lng,
          created_by: user.id,
        });
        if (error) throw error;
        toast.success("즐겨찾는 장소로 등록했어요 ⭐");
      }
      qc.invalidateQueries({ queryKey: ["favorite_places", coupleId] });
    } catch (e: any) {
      toast.error(e.message ?? "처리에 실패했어요");
    } finally {
      setFavTogglingKey(null);
    }
  }

  const kakaoKey = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;
  const mapRef = useRef<HTMLDivElement>(null);

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
          .select("id, tag, location_name, lat, lng")
          .eq("couple_id", me.couple_id)
          .eq("date", date)
          .maybeSingle();
        if (cancelled || !rec) return;
        setExistingRecordId(rec.id);
        if (rec.tag && (TAGS as readonly string[]).includes(rec.tag)) setTag(rec.tag as Tag);
        if (rec.location_name && rec.lat != null && rec.lng != null) {
          setPlace({ id: "existing", name: rec.location_name, address: "", lat: rec.lat, lng: rec.lng });
          setQuery("");
        } else if (rec.location_name) {
          setPlace({ id: "manual", name: rec.location_name, address: "", lat: null, lng: null });
        }
        const [{ data: ph }, { data: rt }, { data: mm }] = await Promise.all([
          supabase.from("photos").select("id, storage_url, order").eq("record_id", rec.id).order("order"),
          supabase.from("ratings").select("score").eq("record_id", rec.id).eq("user_id", user.id).maybeSingle(),
          supabase.from("memos").select("content").eq("record_id", rec.id).eq("user_id", user.id).maybeSingle(),
        ]);
        if (cancelled) return;
        const rows = ph ?? [];
        const urlMap = await getSignedPhotoUrls(rows.map((p) => p.storage_url));
        if (cancelled) return;
        setPhotos(rows.map((p) => ({
          uid: p.id,
          existingId: p.id,
          storageUrl: p.storage_url,
          preview: urlMap[p.storage_url] ?? "",
        })));
        if (rt && typeof (rt as any).score === "number") {
          setScore((rt as any).score / 2);
        }
        if (mm && typeof (mm as any).content === "string") {
          setMemo((mm as any).content);
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
      const next = arr.slice(0, room).map((file) => ({
        uid: `new-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file,
        preview: URL.createObjectURL(file),
      }));
      return [...prev, ...next];
    });
  }

  function removePhoto(i: number) {
    let removed: Photo | null = null;
    let removedIndex = i;
    setPhotos((prev) => {
      removed = prev[i] ?? null;
      removedIndex = i;
      return prev.filter((_, idx) => idx !== i);
    });
    if (!removed) return;
    const target = removed as Photo;
    // Show undo toast for 3s. Only finalize side effects (revoke blob URL,
    // mark existing photo for DB deletion) if undo isn't pressed.
    let undone = false;
    toast("사진이 삭제됐어요", {
      duration: 3000,
      action: {
        label: "취소",
        onClick: () => {
          undone = true;
          setPhotos((prev) => {
            const next = [...prev];
            const insertAt = Math.min(removedIndex, next.length);
            next.splice(insertAt, 0, target);
            return next;
          });
        },
      },
      onAutoClose: () => {
        if (undone) return;
        if (target.file) URL.revokeObjectURL(target.preview);
        if (target.existingId) {
          setRemovedPhotoIds((ids) => [...ids, target.existingId!]);
        }
      },
      onDismiss: () => {
        if (undone) return;
        if (target.file) URL.revokeObjectURL(target.preview);
        if (target.existingId) {
          setRemovedPhotoIds((ids) => [...ids, target.existingId!]);
        }
      },
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setPhotos((prev) => {
      const oldIdx = prev.findIndex((p) => p.uid === active.id);
      const newIdx = prev.findIndex((p) => p.uid === over.id);
      if (oldIdx < 0 || newIdx < 0) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  }

  // Debounced Kakao Local API search (via server proxy)
  useEffect(() => {
    if (place) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      const url = `/api/kakao/search?query=${encodeURIComponent(q)}&size=10`;
      console.log("[kakao search] GET", url);
      try {
        const res = await fetch(url);
        const json = await res.json().catch(() => ({}));
        console.log("[kakao search] status", res.status, "body", json);
        if (!res.ok) {
          throw new Error(
            `status ${res.status}: ${json?.error ?? "unknown error"}`,
          );
        }
        const docs = (json.documents ?? []) as Array<any>;
        setResults(
          docs.map((d) => ({
            id: d.id,
            name: d.place_name,
            address: d.road_address_name || d.address_name || "",
            category: d.category_group_name || "",
            lat: parseFloat(d.y),
            lng: parseFloat(d.x),
          })),
        );
        setSearched(true);
      } catch (e: any) {
        console.error("[kakao search] failed", e);
        toast.error("검색 중 오류가 발생했어요");
        setResults([]);
        setSearched(true);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, place]);

  // Load Kakao Maps JS SDK once
  function loadKakaoSdk(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!kakaoKey) return reject(new Error("no key"));
      const w = window as any;
      if (w.kakao?.maps) return resolve(w.kakao);
      const existing = document.getElementById("kakao-maps-sdk") as HTMLScriptElement | null;
      const onReady = () => w.kakao.maps.load(() => resolve(w.kakao));
      if (existing) {
        existing.addEventListener("load", onReady, { once: true });
        return;
      }
      const s = document.createElement("script");
      s.id = "kakao-maps-sdk";
      s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoKey}&autoload=false`;
      s.async = true;
      s.onload = onReady;
      s.onerror = () => reject(new Error("kakao sdk load failed"));
      document.head.appendChild(s);
    });
  }

  // Render Kakao map preview when a place with coords is selected
  useEffect(() => {
    if (!place || place.lat == null || place.lng == null || !mapRef.current) return;
    let cancelled = false;
    loadKakaoSdk().then((kakao) => {
      if (cancelled || !mapRef.current) return;
      const center = new kakao.maps.LatLng(place.lat, place.lng);
      const map = new kakao.maps.Map(mapRef.current, { center, level: 4 });
      new kakao.maps.Marker({ position: center, map });
    }).catch((e) => console.error("[kakao map]", e));
    return () => { cancelled = true; };
  }, [place?.lat, place?.lng]);

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

      // Personal memo: upsert on (record_id, user_id) so each partner
      // keeps their own memo independently.
      {
        const trimmed = memo.trim();
        if (trimmed.length > 0) {
          const { error: memoErr } = await supabase
            .from("memos")
            .upsert(
              { record_id: recId, user_id: user.id, content: trimmed },
              { onConflict: "record_id,user_id" },
            );
          if (memoErr) throw memoErr;
        } else {
          // Empty memo deletes my prior memo (if any).
          await supabase
            .from("memos")
            .delete()
            .eq("record_id", recId)
            .eq("user_id", user.id);
        }
      }

      toast.success(existingRecordId ? "기록이 업데이트 됐어요 ✓" : "기록 저장 완료 💕");
      clearDataCache();
      qc.invalidateQueries({ queryKey: ["records"] });
      qc.invalidateQueries({ queryKey: ["memos", recId] });
      qc.invalidateQueries({ queryKey: ["record", recId] });
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
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5 text-sm">
            <ImagePlus className="w-4 h-4 text-pink-500" />사진{" "}
            <span className="text-xs text-muted-foreground">{photos.length} / 10</span>
          </Label>
          {photos.length > 0 && (
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                editMode
                  ? "bg-pink-500 text-white"
                  : "bg-muted text-muted-foreground hover:bg-pink-100 dark:hover:bg-pink-950/30"
              }`}
            >
              {editMode ? "완료" : "편집"}
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`grid grid-cols-3 gap-2 rounded-xl transition-colors ${
            dragOver ? "ring-2 ring-pink-400 ring-offset-2 ring-offset-background" : ""
          }`}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={photos.map((p) => p.uid)}
              strategy={rectSortingStrategy}
            >
              {photos.map((p, i) => (
                <SortablePhoto
                  key={p.uid}
                  photo={p}
                  index={i}
                  editMode={editMode}
                  onRemove={() => removePhoto(i)}
                />
              ))}
            </SortableContext>
          </DndContext>
          {photos.length < 10 && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="relative aspect-square rounded-lg border-2 border-dashed border-pink-300/70 flex flex-col items-center justify-center text-pink-400 hover:border-pink-400 hover:bg-pink-50/60 dark:hover:bg-pink-950/30 transition-colors"
              aria-label="사진 추가"
            >
              <Plus className="w-6 h-6" />
              <span className="text-[10px] mt-1">사진 추가</span>
            </button>
          )}
        </div>
      </div>

      {/* Location */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5 text-sm"><MapPin className="w-4 h-4 text-purple-500" />장소</Label>
        {!place && (
          <>
            <div className="relative">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="장소를 검색해보세요 (카카오맵)"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {favorites.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] text-muted-foreground">즐겨찾는 장소</div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {favorites.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setPlace({
                          id: `fav-${f.id}`,
                          name: f.location_name,
                          address: "",
                          lat: f.lat,
                          lng: f.lng,
                        });
                        setQuery("");
                        setResults([]);
                        setSearched(false);
                      }}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-200 text-xs border border-purple-200/60 hover:bg-purple-100 dark:hover:bg-purple-950/50 transition-colors"
                    >
                      <MapPin className="w-3 h-3" />
                      <span className="whitespace-nowrap">{f.location_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {results.length > 0 && (
              <div className="rounded-lg border border-border divide-y max-h-60 overflow-auto">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setPlace(r);
                      setResults([]);
                      setQuery("");
                      setSearched(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-pink-50 dark:hover:bg-pink-950/30 text-sm"
                  >
                    <div className="font-medium flex items-center gap-2">
                      <span>{r.name}</span>
                      {r.category && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300">
                          {r.category}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{r.address}</div>
                  </button>
                ))}
              </div>
            )}
            {searched && !searching && results.length === 0 && !manualMode && (
              <div className="rounded-lg border border-dashed border-border p-3 text-center space-y-2">
                <p className="text-sm text-muted-foreground">검색 결과가 없어요</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setManualMode(true);
                    setPlace({ id: "manual", name: query.trim(), address: "", lat: null, lng: null });
                    setNameDraft(query.trim());
                    setEditingName(true);
                    setQuery("");
                    setResults([]);
                  }}
                >
                  장소 이름 직접 입력하기
                </Button>
              </div>
            )}
          </>
        )}
        {place && (
          <div className="rounded-xl overflow-hidden border border-purple-200/60">
            {place.lat != null && place.lng != null && (
              <div ref={mapRef} className="w-full h-40 bg-muted" />
            )}
            <div className="flex items-start justify-between gap-2 p-3 bg-purple-50/40 dark:bg-purple-950/20">
              <div className="min-w-0 flex-1">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const n = nameDraft.trim();
                          if (n) setPlace({ ...place, name: n });
                          setEditingName(false);
                        }
                      }}
                      className="h-8 text-sm"
                      placeholder="장소 이름"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const n = nameDraft.trim();
                        if (n) setPlace({ ...place, name: n });
                        setEditingName(false);
                      }}
                      className="text-purple-600 hover:text-purple-700"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-medium truncate">{place.name}</div>
                    <button
                      type="button"
                      onClick={() => { setNameDraft(place.name); setEditingName(true); }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label="장소 이름 수정"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={toggleFavorite}
                      disabled={!coupleId || favTogglingKey !== null}
                      className="shrink-0 text-yellow-500 hover:text-yellow-600 disabled:opacity-50"
                      aria-label={currentFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                    >
                      <Star
                        className={`w-4 h-4 ${currentFav ? "fill-yellow-400 text-yellow-500" : ""}`}
                      />
                    </button>
                  </div>
                )}
                {place.address && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{place.address}</div>
                )}
                <p className="text-[11px] text-muted-foreground mt-1">장소 이름을 직접 수정할 수 있어요</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPlace(null);
                  setQuery("");
                  setEditingName(false);
                  setManualMode(false);
                  setSearched(false);
                }}
                className="text-muted-foreground hover:text-foreground shrink-0"
                aria-label="장소 초기화"
              >
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
        <Label className="text-sm">나의 메모 <span className="text-xs text-muted-foreground">(선택)</span></Label>
        <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={4} placeholder="오늘의 이야기를 남겨보세요…" />
        <p className="text-[11px] text-muted-foreground">이 메모는 나만 작성/수정할 수 있어요. 파트너는 자신의 메모를 따로 작성해요.</p>
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

function SortablePhoto({
  photo,
  index,
  editMode,
  onRemove,
}: {
  photo: Photo;
  index: number;
  editMode: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: photo.uid,
    disabled: !editMode,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative aspect-square rounded-lg overflow-hidden bg-muted ${
        editMode ? "border-2 border-pink-300 shadow-sm" : "border border-pink-200/60"
      }`}
    >
      {photo.preview ? (
        <img src={photo.preview} alt="" className="w-full h-full object-cover" draggable={false} />
      ) : (
        <div className="w-full h-full bg-muted animate-pulse" />
      )}
      <span className="absolute bottom-1 left-1 text-[10px] bg-pink-500/90 text-white px-1.5 rounded-full">
        {index + 1}
      </span>
      {editMode && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute -top-1 -right-1 bg-black/80 text-white rounded-full p-1 shadow-md z-10"
            aria-label="사진 삭제"
          >
            <X className="w-3 h-3" />
          </button>
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(e) => e.preventDefault()}
            className="absolute bottom-1 right-1 bg-black/70 text-white rounded p-1 touch-none cursor-grab active:cursor-grabbing"
            aria-label="순서 변경"
          >
            <GripVertical className="w-3 h-3" />
          </button>
        </>
      )}
    </div>
  );
}