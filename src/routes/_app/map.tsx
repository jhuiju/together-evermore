import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/map")({
  component: MapPage,
});

function MapPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">함께 다닌 곳</h2>
      <div className="rounded-lg border border-dashed border-border aspect-square flex items-center justify-center text-muted-foreground">
        지도에 방문한 장소 핀 표시
      </div>
    </div>
  );
}