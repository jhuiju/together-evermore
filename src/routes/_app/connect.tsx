import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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

function fireCelebration() {
  const colors = ["#f9a8d4", "#c4b5fd", "#fbcfe8", "#a78bfa"];
  const end = Date.now() + 1500;
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 70, origin: { x: 0 }, colors, scalar: 0.9 });
    confetti({ particleCount: 5, angle: 120, spread: 70, origin: { x: 1 }, colors, scalar: 0.9 });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

function ConnectPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [myCoupleId, setMyCoupleId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [checkingInitial, setCheckingInitial] = useState(true);
  const redirected = useRef(false);

  // Celebrate + redirect (used by both paths)
  function celebrateAndRedirect() {
    if (redirected.current) return;
    redirected.current = true;
    setCelebrating(true);
    fireCelebration();
    toast.success("연결 완료! 💕");
    setTimeout(() => navigate({ to: "/calendar" }), 1800);
  }

  // Initial load: if already linked, skip waiting screen entirely
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCheckingInitial(false);
        return;
      }
      setUserId(user.id);

      const { data: me } = await supabase
        .from("users")
        .select("couple_id")
        .eq("id", user.id)
        .maybeSingle();

      if (me?.couple_id) {
        // Already linked — go straight to calendar (no celebration on revisit)
        redirected.current = true;
        navigate({ to: "/calendar" });
        return;
      }

      // Check for existing pending invite created by this user
      const { data: existing } = await supabase
        .from("couples")
        .select("id, invite_code, user2_id")
        .eq("user1_id", user.id)
        .is("user2_id", null)
        .maybeSingle();
      if (existing) {
        setMyCode(existing.invite_code);
        setMyCoupleId(existing.id);
      }
      setCheckingInitial(false);
    })();
  }, [navigate]);

  // Realtime + polling on my pending couple row
  useEffect(() => {
    if (!myCoupleId || !userId) return;

    let stopped = false;

    const onLinked = async () => {
      if (stopped) return;
      // Ensure my own users row is linked (trigger should have done it)
      await supabase.from("users").update({ couple_id: myCoupleId }).eq("id", userId);
      celebrateAndRedirect();
    };

    // Realtime subscription
    const channel = supabase
      .channel(`couple-${myCoupleId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "couples",
          filter: `id=eq.${myCoupleId}`,
        },
        (payload) => {
          const row = payload.new as { user2_id: string | null };
          if (row.user2_id) {
            stopped = true;
            onLinked();
          }
        },
      )
      .subscribe();

    // Polling fallback every 3s
    const interval = setInterval(async () => {
      if (stopped) return;
      const { data } = await supabase
        .from("couples")
        .select("user2_id")
        .eq("id", myCoupleId)
        .maybeSingle();
      if (data?.user2_id) {
        stopped = true;
        clearInterval(interval);
        onLinked();
      }
    }, 3000);

    return () => {
      stopped = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [myCoupleId, userId]);

  async function createCode() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const code = genCode();
    const { data, error } = await supabase
      .from("couples")
      .insert({ user1_id: user.id, invite_code: code, couple_name: "우리" })
      .select("id, invite_code")
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "코드 생성 실패");
    } else {
      setMyCode(data.invite_code);
      setMyCoupleId(data.id);
      try {
        await navigator.clipboard.writeText(data.invite_code);
        toast.success("코드가 복사됐어요");
      } catch {}
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
    if (!user) {
      setLoading(false);
      return;
    }
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
    const { error: upErr } = await supabase
      .from("couples")
      .update({ user2_id: user.id })
      .eq("id", couple.id);
    if (upErr) {
      toast.error(upErr.message);
      setLoading(false);
      return;
    }
    // DB trigger handles linking both users' couple_id. Ensure my own row too.
    await supabase.from("users").update({ couple_id: couple.id }).eq("id", user.id);
    celebrateAndRedirect();
  }

  if (checkingInitial) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {celebrating && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur pointer-events-none animate-fade-in">
          <div className="relative">
            <Heart className="w-24 h-24 text-primary fill-primary animate-ping absolute inset-0" />
            <Heart className="w-24 h-24 text-primary fill-primary relative" />
          </div>
          <p className="mt-6 text-lg font-semibold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
            연결 완료!
          </p>
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
              <span>상대방이 코드를 입력할 때까지 기다려주세요...</span>
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