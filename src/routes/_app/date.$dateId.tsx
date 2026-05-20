import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/date/$dateId")({
  component: DateDetailPage,
});

function DateDetailPage() {
  const { dateId } = Route.useParams();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">날짜 상세</h2>
      <p className="text-sm text-muted-foreground">Record ID: {dateId}</p>
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
        사진, 메모, 위치, 별점 표시 영역
      </div>
    </div>
  );
}