import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Heart } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { nickname: nickname || email.split("@")[0] },
            emailRedirectTo: `${window.location.origin}/calendar`,
          },
        });
        if (error) throw error;
        toast.success("가입 완료! 이메일을 확인해 주세요.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("환영합니다 💕");
        navigate({ to: "/calendar" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "오류가 발생했습니다";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary to-accent/40 px-4">
      <Card className="w-full max-w-md p-8 shadow-xl border-border/60">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Heart className="w-7 h-7 text-primary fill-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">우리의 기록</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "다시 만나서 반가워요" : "둘만의 캘린더를 시작해요"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="nickname">닉네임</Label>
              <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="상대가 부를 이름" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "..." : mode === "login" ? "로그인" : "가입하기"}
          </Button>
        </form>

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="w-full mt-4 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          {mode === "login" ? "처음이신가요? 가입하기" : "이미 계정이 있어요"}
        </button>
      </Card>
    </main>
  );
}