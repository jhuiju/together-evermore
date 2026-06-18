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

const TAG_COLORS: Record<string, string> = {
  "데이트": "#D4537E",
  "여행": "#7F77DD",
  "일상": "#1D9E75",
  "특별한날": "#E8A838",
  "": "#B4B2A9",
};

function getTagColor(tag: string | null): string {
  if (!tag) return "#B4B2A9";
  return TAG_COLORS[tag] ?? "#B4B2A9";
}

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

type PinGroup = {
  key: string;
  lat: number;
  lng: number;
  location_name: string | null;
  pins: Pin[];
};

// Haversine distance in meters
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function groupPins(pins: Pin[]): PinGroup[] {
  const groups: PinGroup[] = [];
  for (const p of pins) {
    // Group strictly by proximity (~30m) to catch same-building, different-unit cases
    const matched = groups.find((g) => distanceMeters(g, p) <= 30);
    if (matched) {
      matched.pins.push(p);
      // Update centroid
      const n = matched.pins.length;
      matched.lat = (matched.lat * (n - 1) + p.lat) / n;
      matched.lng = (matched.lng * (n - 1) + p.lng) / n;
    } else {
      groups.push({
        key: p.id,
        lat: p.lat,
        lng: p.lng,
        location_name: p.location_name,
        pins: [p],
      });
    }
  }
  return groups;
}

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

  const groups = useMemo(() => groupPins(filtered), [filtered]);

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

  // Render markers when groups change
  useEffect(() => {
    const g = (window as any).google;
    if (!g?.maps || !mapRef.current) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (groups.length === 0) return;
    const bounds = new g.maps.LatLngBounds();
    groups.forEach((grp) => {
      const count = grp.pins.length;
      // Dominant tag color: most common, fallback to first
      const tagCount = new Map<string, number>();
      grp.pins.forEach((p) => {
        const key = p.tag ?? "";
        tagCount.set(key, (tagCount.get(key) ?? 0) + 1);
      });
      let dominantTag: string | null = grp.pins[0].tag;
      let max = 0;
      tagCount.forEach((v, k) => {
        if (v > max) { max = v; dominantTag = k || null; }
      });
      const color = getTagColor(dominantTag);

      let icon: any;
      if (count > 1) {
        // SVG marker with count badge in top-right
        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <circle cx="18" cy="26" r="10" fill="${color}" stroke="#fff" stroke-width="2"/>
  <circle cx="32" cy="12" r="9" fill="#fff" stroke="${color}" stroke-width="2"/>
  <text x="32" y="15" text-anchor="middle" font-size="11" font-weight="700" font-family="-apple-system,system-ui,sans-serif" fill="#2C2C2A">${count}</text>
</svg>`.trim();
        icon = {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
          scaledSize: new g.maps.Size(44, 44),
          anchor: new g.maps.Point(18, 36),
        };
      } else {
        icon = {
          path: g.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        };
      }

      const marker = new g.maps.Marker({
        map: mapRef.current,
        position: { lat: grp.lat, lng: grp.lng },
        icon,
      });

      marker.addListener("click", () => {
        if (count === 1) {
          const p = grp.pins[0];
          const c = getTagColor(p.tag);
          const thumb = p.thumb
            ? `<img src="${p.thumb}" style="width:100%;height:88px;object-fit:cover;border-radius:8px;margin-bottom:8px"/>`
            : "";
          const avg = p.avg != null ? `⭐ ${p.avg.toFixed(1)}` : "평점 없음";
          const name = p.location_name ?? "장소";
          const tagLabel = p.tag ?? "태그 없음";
          infoRef.current.setContent(
            `<div style="width:200px;font-family:inherit">
              <div style="display:inline-block;padding:3px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:#fff;background:${c};margin-bottom:6px">${tagLabel}</div>
              ${thumb}
              <div style="font-size:12px;color:#888">${p.date}</div>
              <div style="font-weight:600;margin:2px 0">${name}</div>
              <div style="font-size:13px;margin-bottom:8px">${avg}</div>
              <a href="/date/${p.id}" style="color:#ec4899;font-weight:600;font-size:13px;text-decoration:none">자세히 보기 →</a>
            </div>`,
          );
        } else {
          const name = grp.location_name ?? "이 장소";
          const sorted = [...grp.pins].sort((a, b) => (a.date < b.date ? 1 : -1));
          const items = sorted.map((p) => {
            const c = getTagColor(p.tag);
            const tagLabel = p.tag ?? "태그 없음";
            const avg = p.avg != null ? `⭐ ${p.avg.toFixed(1)}` : "평점 없음";
            const thumb = p.thumb
              ? `<img src="${p.thumb}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0"/>`
              : `<div style="width:44px;height:44px;border-radius:6px;background:#eee;flex-shrink:0"></div>`;
            return `
              <a href="/date/${p.id}" style="display:flex;align-items:center;gap:8px;padding:6px;border-radius:8px;text-decoration:none;color:inherit;border-bottom:1px solid #f0f0f0">
                ${thumb}
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
                    <span style="display:inline-block;padding:1px 6px;border-radius:9999px;font-size:10px;font-weight:600;color:#fff;background:${c}">${tagLabel}</span>
                    <span style="font-size:11px;color:#888">${p.date}</span>
                  </div>
                  <div style="font-size:12px;color:#2C2C2A">${avg}</div>
                </div>
              </a>`;
          }).join("");
          infoRef.current.setContent(
            `<div style="width:240px;font-family:inherit">
              <div style="font-weight:600;margin-bottom:6px;font-size:13px">${name} <span style="color:#888;font-weight:400">· ${count}개의 기록</span></div>
              <div style="max-height:280px;overflow-y:auto">${items}</div>
            </div>`,
          );
        }
        infoRef.current.open({ map: mapRef.current, anchor: marker });
      });
      markersRef.current.push(marker);
      bounds.extend({ lat: grp.lat, lng: grp.lng });
    });
    if (groups.length === 1) {
      mapRef.current.setCenter({ lat: groups[0].lat, lng: groups[0].lng });
      mapRef.current.setZoom(14);
    } else {
      mapRef.current.fitBounds(bounds, 64);
    }
  }, [groups]);

  return (
    <div className="-mx-4 -my-6 h-[calc(100vh-9rem)] relative">
      {/* Filter bar */}
      <div className="absolute top-3 inset-x-3 z-10 space-y-2">
        <div className="bg-card/95 backdrop-blur rounded-xl shadow-lg border border-border/60 p-2 flex gap-1.5 overflow-x-auto">
          {TAGS.map((t) => {
            const color = getTagColor(t === "전체" ? null : t);
            const isActive = tag === t;
            return (
              <button
                key={t}
                onClick={() => setTag(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors flex items-center gap-1 ${
                  isActive
                    ? "text-white"
                    : "text-muted-foreground hover:bg-muted"
                }`}
                style={isActive ? { backgroundColor: color } : undefined}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                {t}
              </button>
            );
          })}
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

      {/* Legend */}
      {!loading && filtered.length > 0 && (
        <div className="absolute bottom-6 left-4 z-10 bg-[var(--app-surface)]/90 backdrop-blur rounded-lg border border-[var(--app-border)] shadow-md p-2.5 space-y-1.5">
          <p className="text-[10px] font-semibold text-[var(--app-muted)] mb-1">범례</p>
          {["데이트", "여행", "일상", "특별한날"].map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: TAG_COLORS[t] }}
              />
              <span className="text-[11px] text-[var(--app-text)]">{t}</span>
            </div>
          ))}
        </div>
      )}

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
