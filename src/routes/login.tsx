import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useCallback, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Heart, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { checkEmailExists } from "@/lib/auth.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const checkEmail = useServerFn(checkEmailExists);

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  // Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Email check
  const [emailCheckStatus, setEmailCheckStatus] = useState<
    "idle" | "checking" | "taken" | "available"
  >("idle");
  const [emailTouched, setEmailTouched] = useState(false);

  const isValidEmail = (val: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const handleEmailBlur = useCallback(async () => {
    if (!email || !isValidEmail(email)) {
      setEmailCheckStatus("idle");
      return;
    }
    setEmailCheckStatus("checking");
    try {
      const result = await checkEmail({ data: { email } });
      setEmailCheckStatus(result.exists ? "taken" : "available");
    } catch {
      setEmailCheckStatus("idle");
    }
  }, [email, checkEmail]);

  // Password match
  const passwordMatch =
    confirmPassword.length > 0 && password === confirmPassword;
  const passwordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  // Signup button enablement
  const canSignUp =
    mode === "signup" &&
    isValidEmail(email) &&
    emailCheckStatus === "available" &&
    password.length >= 8 &&
    passwordMatch &&
    nickname.trim().length > 0;

  const canLogin =
    mode === "login" &&
    isValidEmail(email) &&
    password.length >= 1;

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

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    // Reset validation states
    setEmailCheckStatus("idle");
    setEmailTouched(false);
    setConfirmPassword("");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary to-accent/40 px-4">
      <Card className="w-full max-w-md p-8 shadow-xl border-border/60">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Heart className="w-7 h-7 text-primary fill-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Withlog</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "다시 만나서 반가워요" : "둘만의 캘린더를 시작해요"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="nickname">닉네임</Label>
              <Input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="상대가 부를 이름"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email">이메일</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailCheckStatus !== "idle") setEmailCheckStatus("idle");
              }}
              onBlur={() => {
                setEmailTouched(true);
                if (mode === "signup") handleEmailBlur();
              }}
            />
            {mode === "signup" && emailCheckStatus !== "idle" && (
              <div className="flex items-center gap-1.5 mt-1">
                {emailCheckStatus === "checking" && (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">확인 중...</span>
                  </>
                )}
                {emailCheckStatus === "taken" && (
                  <span className="text-xs text-destructive font-medium">
                    이미 사용 중인 이메일이에요
                  </span>
                )}
                {emailCheckStatus === "available" && (
                  <span className="text-xs text-green-600 font-medium">
                    사용 가능한 이메일이에요 ✓
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={mode === "signup" ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "8자 이상" : ""}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">비밀번호 확인</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호를 다시 입력하세요"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordMismatch && (
                <span className="text-xs text-destructive font-medium block mt-1">
                  비밀번호가 일치하지 않아요
                </span>
              )}
              {passwordMatch && (
                <span className="text-xs text-green-600 font-medium block mt-1">
                  비밀번호가 일치해요 ✓
                </span>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || (mode === "signup" ? !canSignUp : !canLogin)}
          >
            {loading ? "..." : mode === "login" ? "로그인" : "가입하기"}
          </Button>
        </form>

        <button
          onClick={switchMode}
          className="w-full mt-4 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          {mode === "login" ? "처음이신가요? 가입하기" : "이미 계정이 있어요"}
        </button>
      </Card>
    </main>
  );
}
