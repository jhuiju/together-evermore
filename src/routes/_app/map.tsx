import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSignedPhotoUrls } from "@/lib/photos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

export const Route = createFileRoute("/_app/map")({
  component: MapPage,
});

const BROWSER_KEY = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY as string;
const TRACKING_ID = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID as string;

const TAGS = ["전체", "데이트", "여행", "일상", "특별한날"] as const;

type Pin = {
  id: string;
  date: string;
  lat: number;
  lng: number;
  location_name: string | null;
  tag: string | null;
  thumb: string | null;
  avg: number | null;
};

let mapsLoading: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).google?.maps) return Promise.resolve();
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise<void>((resolve, reject) => {
    (window as any).__lovableInitMap = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&loading=async&callback=__lovableInitMap&channel=${TRACKING_ID}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Maps failed to load"));
    document.head.appendChild(s);
  });
  return mapsLoading;
}

function MapPage() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [tag, setTag] = useState<(typeof TAGS)[number]>("전체");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Load data
  useEffect(() => {
    (async () => {
      const { data: records } = await supabase
        .from("records")
        .select("id, date, lat, lng, location_name, tag")
        .not("lat", "is", null)
        .not("lng", "is", null);
      if (!records || records.length === 0) {
        setPins([]);
        setLoading(false);
        return;
      }
      const ids = records.map((r) => r.id);
      const [{ data: photos }, { data: ratings }] = await Promise.all([
        supabase.from("photos").select("record_id, storage_url, order").in("record_id", ids).order("order"),
        supabase.from("ratings").select("record_id, score").in("record_id", ids),
      ]);
      const firstPhoto = new Map<string, string>();
      (photos ?? []).forEach((p: any) => {
        if (!firstPhoto.has(p.record_id)) firstPhoto.set(p.record_id, p.storage_url);
      });
      const urlMap = await getSignedPhotoUrls(Array.from(firstPhoto.values()));
      const scores = new Map<string, number[]>();
      (ratings ?? []).forEach((r: any) => {
        const a = scores.get(r.record_id) ?? [];
        a.push(Number(r.score));
        scores.set(r.record_id, a);
      });
      setPins(
        records.map((r: any) => {
          const s = scores.get(r.id) ?? [];
          return {
            id: r.id,
            date: r.date,
            lat: r.lat,
            lng: r.lng,
            location_name: r.location_name,
            tag: r.tag,
            thumb: (() => {
              const u = firstPhoto.get(r.id);
              return u ? urlMap[u] ?? null : null;
            })(),
            avg: s.length ? s.reduce((a, b) => a + b, 0) / s.length : null,
          };
        }),
      );
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return pins.filter((p) => {
      if (tag !== "전체" && p.tag !== tag) return false;
      if (from && p.date < from) return false;
      if (to && p.date > to) return false;
      return true;
    });
  }, [pins, tag, from, to]);

  // Init map once
  useEffect(() => {
    let cancelled = false;
    loadMaps().then(() => {
      if (cancelled || !mapEl.current || mapRef.current) return;
      const g = (window as any).google;
      mapRef.current = new g.maps.Map(mapEl.current, {
        center: { lat: 37.5665, lng: 126.978 },
        zoom: 11,
        disableDefaultUI: true,
        zoomControl: true,
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
        ],
      });
      infoRef.current = new g.maps.InfoWindow();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Render markers when filtered changes
  useEffect(() => {
    const g = (window as any).google;
    if (!g?.maps || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (filtered.length === 0) return;
    const bounds = new g.maps.LatLngBounds();
    filtered.forEach((p) => {
      const marker = new g.maps.Marker({
        map: mapRef.current,
        position: { lat: p.lat, lng: p.lng },
        icon: {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#ec4899",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => {
        const thumb = p.thumb
          ? `<img src="${photoUrl(p.thumb)}" style="width:100%;height:88px;object-fit:cover;border-radius:8px;margin-bottom:8px"/>`
          : "";
        const avg = p.avg != null ? `⭐ ${p.avg.toFixed(1)}` : "평점 없음";
        const name = p.location_name ?? "장소";
        infoRef.current.setContent(
          `<div style="width:200px;font-family:inherit">
            ${thumb}
            <div style="font-size:12px;color:#888">${p.date}</div>
            <div style="font-weight:600;margin:2px 0">${name}</div>
            <div style="font-size:13px;margin-bottom:8px">${avg}</div>
            <a href="/date/${p.id}" style="color:#ec4899;font-weight:600;font-size:13px;text-decoration:none">자세히 보기 →</a>
          </div>`,
        );
        infoRef.current.open({ map: mapRef.current, anchor: marker });
      });
      markersRef.current.push(marker);
      bounds.extend({ lat: p.lat, lng: p.lng });
    });
    if (filtered.length === 1) {
      mapRef.current.setCenter({ lat: filtered[0].lat, lng: filtered[0].lng });
      mapRef.current.setZoom(14);
    } else {
      mapRef.current.fitBounds(bounds, 64);
    }
  }, [filtered]);

  return (
    <div className="-mx-4 -my-6 h-[calc(100vh-9rem)] relative">
      {/* Filter bar */}
      <div className="absolute top-3 inset-x-3 z-10 space-y-2">
        <div className="bg-card/95 backdrop-blur rounded-xl shadow-lg border border-border/60 p-2 flex gap-1.5 overflow-x-auto">
          {TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setTag(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                tag === t
                  ? "bg-gradient-to-r from-primary to-accent text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="bg-card/95 backdrop-blur rounded-xl shadow-lg border border-border/60 p-2 flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 text-xs flex-1"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 text-xs flex-1"
          />
          {(from || to) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              onClick={() => { setFrom(""); setTo(""); }}
            >
              초기화
            </Button>
          )}
        </div>
      </div>

      <div ref={mapEl} className="w-full h-full bg-muted" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="absolute bottom-6 inset-x-6 z-10 bg-card/95 backdrop-blur rounded-xl border border-border/60 shadow-lg p-4 text-center">
          <MapPin className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
          <p className="text-sm text-muted-foreground">표시할 장소가 없어요</p>
        </div>
      )}

      {/* Hidden Link to keep router type-aware */}
      <Link to="/date/$dateId" params={{ dateId: "_" }} className="hidden" />
    </div>
  );
}