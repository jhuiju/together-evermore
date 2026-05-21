import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, Heart, Loader2 } from "lucide-react";
import confetti from "canvas-confetti";

export const Route = createFileRoute("/_app/connect")({
  component: ConnectPage,
});

function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function ConnectPage() {
  const navigate = useNavigate();
  const [myCode, setMyCode] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: existing } = await supabase
        .from("couples")
        .select("invite_code, user2_id")
        .eq("user1_id", user.id)
        .is("user2_id", null)
        .maybeSingle();
      if (existing) setMyCode(existing.invite_code);
    })();
  }, []);

  async function createCode() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const code = genCode();
    const { error } = await supabase.from("couples").insert({
      user1_id: user.id,
      invite_code: code,
      couple_name: "우리",
    });
    if (error) toast.error(error.message);
    else {
      setMyCode(code);
      try { await navigator.clipboard.writeText(code); toast.success("코드 복사됨"); } catch {}
    }
    setLoading(false);
  }

  async function joinByCode() {
    const code = input.trim();
    if (code.length !== 6) {
      toast.error("6자리 코드를 입력하세요");
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: couple, error: findErr } = await supabase
      .from("couples")
      .select("id, user1_id, user2_id")
      .eq("invite_code", code)
      .maybeSingle();
    if (findErr) {
      console.error("[connect] invite lookup query error:", findErr);
      toast.error("코드 조회 중 오류가 발생했어요");
      setLoading(false);
      return;
    }
    if (!couple) {
      console.warn("[connect] invite lookup returned no rows for code:", code);
      toast.error("코드를 찾을 수 없어요");
      setLoading(false);
      return;
    }
    if (couple.user2_id) {
      toast.error("이미 연결된 코드예요");
      setLoading(false);
      return;
    }
    if (couple.user1_id === user.id) {
      toast.error("본인 코드는 사용할 수 없어요");
      setLoading(false);
      return;
    }
    const { error: upErr } = await supabase.from("couples").update({ user2_id: user.id }).eq("id", couple.id);
    if (upErr) {
      toast.error(upErr.message);
      setLoading(false);
      return;
    }
    // link both users
    await supabase.from("users").update({ couple_id: couple.id }).in("id", [couple.user1_id, user.id]);
    toast.success("연결 완료! 💕");
    setCelebrating(true);
    fireCelebration();
    setTimeout(() => navigate({ to: "/calendar" }), 1800);
  }

  function fireCelebration() {
    const colors = ["#f9a8d4", "#c4b5fd", "#fbcfe8", "#a78bfa"];
    const end = Date.now() + 1200;
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 70, origin: { x: 0 }, colors, scalar: 0.9 });
      confetti({ particleCount: 4, angle: 120, spread: 70, origin: { x: 1 }, colors, scalar: 0.9 });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  return (
    <div className="space-y-6">
      {celebrating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur pointer-events-none">
          <Heart className="w-24 h-24 text-primary fill-primary animate-ping" />
        </div>
      )}
      <div className="text-center py-4">
        <Heart className="w-10 h-10 text-primary fill-primary mx-auto mb-2" />
        <h2 className="text-xl font-semibold">연인과 연결하기</h2>
        <p className="text-sm text-muted-foreground mt-1">한쪽이 코드를 만들고, 다른 한쪽이 입력해요</p>
      </div>

      <Card className="p-6 space-y-3">
        <h3 className="font-medium">새 커플 시작</h3>
        {myCode ? (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(myCode); toast.success("복사됨"); }}
                className="flex-1 text-3xl font-mono font-bold tracking-widest text-primary text-center py-3 bg-gradient-to-br from-primary/10 to-accent/10 rounded-lg hover:from-primary/15 hover:to-accent/15 transition-colors"
              >
                {myCode}
              </button>
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(myCode); toast.success("복사됨"); }}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>상대방이 코드를 입력하길 기다리는 중...</span>
            </div>
          </>
        ) : (
          <Button onClick={createCode} disabled={loading} className="w-full">코드 생성하기</Button>
        )}
      </Card>

      <Card className="p-6 space-y-3">
        <h3 className="font-medium">상대 코드 입력</h3>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="6자리 숫자"
          inputMode="numeric"
          className="text-center text-2xl font-mono tracking-widest"
        />
        <Button onClick={joinByCode} disabled={loading || input.length !== 6} className="w-full">
          연결하기
        </Button>
      </Card>
    </div>
  );
}