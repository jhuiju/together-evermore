import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  async function logout() {
    await supabase.auth.signOut();
    toast.success("로그아웃 되었습니다");
    navigate({ to: "/login" });
  }
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">설정</h2>
      <Card className="p-6 space-y-3">
        <p className="text-sm text-muted-foreground">프로필 · 기념일 · 커플 이름 편집 영역</p>
      </Card>
      <Button variant="outline" onClick={logout} className="w-full">로그아웃</Button>
    </div>
  );
}