import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/record/new")({
  validateSearch: (s: Record<string, unknown>) => ({ date: (s.date as string) ?? "" }),
  component: NewRecordPage,
});

function NewRecordPage() {
  const { date } = Route.useSearch();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">새 기록</h2>
      {date && <p className="text-sm text-muted-foreground">{date}</p>}
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
        사진 업로드 · 위치 · 메모 · 별점 입력 폼
      </div>
    </div>
  );
}