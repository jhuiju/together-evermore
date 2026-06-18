import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Bell, BellOff, Camera, Eye, EyeOff, Heart, Link2, Loader2, LogOut, Shield, Star, Trash2, User as UserIcon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { deletePushSubscription, getVapidPublicKey, savePushSubscription } from "@/lib/push.functions";
import { ensurePushSubscribed } from "@/components/push-permission-prompt";
import { Switch } from "@/components/ui/switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function daysSince(date: string | null) {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  return diff;
}

function SettingsPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const getKey = useServerFn(getVapidPublicKey);
  const saveSub = useServerFn(savePushSubscription);
  const deleteSub = useServerFn(deletePushSubscription);

  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const [notifSubscribed, setNotifSubscribed] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setNotifSubscribed(!!sub))
      .catch(() => setNotifSubscribed(false));
  }, []);

  async function toggleNotifications(next: boolean) {
    setNotifBusy(true);
    try {
      if (next) {
        if (!("Notification" in window)) {
          toast.error("이 브라우저는 알림을 지원하지 않아요");
          return;
        }
        let perm = Notification.permission;
        if (perm === "default") perm = await Notification.requestPermission();
        setNotifPermission(perm);
        if (perm !== "granted") {
          toast.error("알림 권한이 필요해요");
          return;
        }
        await ensurePushSubscribed(
          getKey as any,
          saveSub as any,
        );
        setNotifSubscribed(true);
        toast.success("알림이 켜졌어요 🔔");
      } else {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe().catch(() => {});
          await deleteSub({ data: { endpoint } }).catch(() => {});
        }
        setNotifSubscribed(false);
        toast.success("알림을 껐어요");
      }
    } catch (e: any) {
      console.error(e);
      toast.error("알림 설정에 실패했어요");
    } finally {
      setNotifBusy(false);
    }
  }

  const [userId, setUserId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);

  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coupleName, setCoupleName] = useState("");
  const [anniversary, setAnniversary] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [user2Id, setUser2Id] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingNickname, setSavingNickname] = useState(false);
  const [savingCouple, setSavingCouple] = useState(false);
  const [savingAnniv, setSavingAnniv] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setUserEmail(user.email ?? null);
      const { data: me } = await supabase
        .from("users")
        .select("nickname, avatar_url, couple_id")
        .eq("id", user.id)
        .maybeSingle();
      if (me) {
        setNickname(me.nickname ?? "");
        setAvatarUrl(me.avatar_url ?? null);
        setCoupleId(me.couple_id ?? null);
        if (me.couple_id) {
          const { data: cp } = await supabase
            .from("couples")
            .select("couple_name, anniversary, invite_code, user2_id")
            .eq("id", me.couple_id)
            .maybeSingle();
          if (cp) {
            setCoupleName(cp.couple_name ?? "우리");
            setAnniversary(cp.anniversary ?? "");
            setInviteCode(cp.invite_code ?? "");
            setUser2Id(cp.user2_id ?? null);
          }
        }
      }
      setLoading(false);
    })();
  }, []);

  async function saveNickname() {
    if (!userId) return;
    if (!nickname.trim()) {
      toast.error("닉네임을 입력해주세요");
      return;
    }
    setSavingNickname(true);
    const { error } = await supabase
      .from("users")
      .update({ nickname: nickname.trim() })
      .eq("id", userId);
    setSavingNickname(false);
    if (error) toast.error("저장 실패: " + error.message);
    else toast.success("저장됐어요 ✓");
  }

  async function saveCoupleName() {
    if (!coupleId) return;
    setSavingCouple(true);
    const { error } = await supabase
      .from("couples")
      .update({ couple_name: coupleName.trim() || "우리" })
      .eq("id", coupleId);
    setSavingCouple(false);
    if (error) toast.error("저장 실패: " + error.message);
    else toast.success("저장됐어요 ✓");
  }

  async function saveAnniversary() {
    if (!coupleId) return;
    setSavingAnniv(true);
    const { error } = await supabase
      .from("couples")
      .update({ anniversary: anniversary || null })
      .eq("id", coupleId);
    setSavingAnniv(false);
    if (error) toast.error("저장 실패: " + error.message);
    else toast.success("저장됐어요 ✓");
  }

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드 가능해요");
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase
        .from("users")
        .update({ avatar_url: url })
        .eq("id", userId);
      if (updErr) throw updErr;
      setAvatarUrl(url);
      toast.success("저장됐어요 ✓");
    } catch (err: any) {
      toast.error("업로드 실패: " + (err.message ?? "알 수 없는 오류"));
    } finally {
      setUploadingAvatar(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function validatePasswords(): string | null {
    if (!currentPassword.trim()) return "현재 비밀번호를 입력해주세요";
    if (newPassword.length < 8) return "비밀번호는 8자 이상이어야 해요";
    if (newPassword !== confirmPassword) return "새 비밀번호가 일치하지 않아요";
    return null;
  }

  async function changePassword() {
    const err = validatePasswords();
    if (err) {
      setPasswordError(err);
      return;
    }
    if (!userEmail) {
      setPasswordError("사용자 정보를 불러오지 못했어요");
      return;
    }
    setPasswordError("");
    setChangingPassword(true);
    try {
      // Verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });
      if (signInError) {
        setPasswordError("현재 비밀번호가 올바르지 않아요");
        setChangingPassword(false);
        return;
      }
      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) {
        setPasswordError("비밀번호 변경 중 오류가 발생했어요");
        setChangingPassword(false);
        return;
      }
      toast.success("비밀번호가 변경됐어요 ✓");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setPasswordError("비밀번호 변경 중 오류가 발생했어요");
    } finally {
      setChangingPassword(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    toast.success("로그아웃 되었습니다");
    navigate({ to: "/login" });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const dday = daysSince(anniversary);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
        설정
      </h2>

      {/* Profile */}
      <Card className="p-6 space-y-5">
        <h3 className="font-medium flex items-center gap-2">
          <UserIcon className="w-4 h-4 text-pink-500" /> 내 프로필
        </h3>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploadingAvatar}
            className="relative group"
          >
            <Avatar className="w-24 h-24 ring-2 ring-pink-200/60 ring-offset-2 ring-offset-card">
              {avatarUrl && <AvatarImage src={avatarUrl} alt="avatar" />}
              <AvatarFallback className="bg-gradient-to-br from-pink-100 to-purple-100 text-pink-500 text-2xl">
                {nickname.slice(0, 1) || "💖"}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
              {uploadingAvatar ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white" />
              )}
            </div>
            {uploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onAvatarChange}
          />
        </div>
        <p className="text-xs text-center text-muted-foreground -mt-3">
          사진을 탭해서 변경하세요
        </p>

        <div className="space-y-2">
          <Label htmlFor="nickname" className="text-sm">닉네임</Label>
          <div className="flex gap-2">
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="닉네임을 입력하세요"
              maxLength={20}
            />
            <Button onClick={saveNickname} disabled={savingNickname} className="bg-gradient-to-r from-pink-400 to-purple-400 hover:from-pink-500 hover:to-purple-500 text-white">
              {savingNickname ? <Loader2 className="w-4 h-4 animate-spin" /> : "저장"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Couple name */}
      <Card className="p-6 space-y-3">
        <h3 className="font-medium flex items-center gap-2">
          <Heart className="w-4 h-4 text-pink-500 fill-pink-500" /> 커플 이름
        </h3>
        <div className="flex gap-2">
          <Input
            value={coupleName}
            onChange={(e) => setCoupleName(e.target.value)}
            placeholder="우리"
            maxLength={30}
          />
          <Button onClick={saveCoupleName} disabled={savingCouple} className="bg-gradient-to-r from-pink-400 to-purple-400 hover:from-pink-500 hover:to-purple-500 text-white">
            {savingCouple ? <Loader2 className="w-4 h-4 animate-spin" /> : "저장"}
          </Button>
        </div>
      </Card>

      {/* Anniversary */}
      <Card className="p-6 space-y-3">
        <h3 className="font-medium flex items-center gap-2">
          <Heart className="w-4 h-4 text-purple-500 fill-purple-500" /> 기념일
        </h3>
        <div className="flex gap-2">
          <Input
            type="date"
            value={anniversary}
            onChange={(e) => setAnniversary(e.target.value)}
          />
          <Button onClick={saveAnniversary} disabled={savingAnniv} className="bg-gradient-to-r from-pink-400 to-purple-400 hover:from-pink-500 hover:to-purple-500 text-white">
            {savingAnniv ? <Loader2 className="w-4 h-4 animate-spin" /> : "저장"}
          </Button>
        </div>
        {dday != null && dday >= 0 && (
          <div className="text-center py-3 bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/30 dark:to-purple-950/30 rounded-lg">
            <p className="text-sm text-muted-foreground">
              함께한 지 <span className="font-bold text-pink-500 text-base">{dday + 1}</span>일째 🎉
            </p>
          </div>
        )}
        {dday != null && dday < 0 && (
          <div className="text-center py-3 bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/30 dark:to-purple-950/30 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <span className="font-bold text-purple-500 text-base">D{dday}</span> 💕
            </p>
          </div>
        )}
      </Card>

      {/* Couple invite code */}
      {coupleId && inviteCode && (
        <Card className="p-6 space-y-4">
          <h3 className="font-medium flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" /> 커플 연결 코드
            {user2Id && (
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                연결됨 ✓
              </span>
            )}
          </h3>

          <div className="flex items-center justify-center gap-1.5">
            {inviteCode.split("").map((char, i) => (
              <div
                key={i}
                className="w-9 h-11 flex items-center justify-center rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] text-lg font-bold tracking-wider"
              >
                {char}
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(inviteCode).then(() => {
                toast.success("코드가 복사됐어요 ✓");
              });
            }}
            className="w-full"
          >
            코드 복사하기
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            상대방에게 이 코드를 공유하면 커플로 연결할 수 있어요
          </p>
        </Card>
      )}

      {/* Notifications */}
      <Card className="p-6 space-y-3">
        <h3 className="font-medium flex items-center gap-2">
          {notifSubscribed && notifPermission === "granted" ? (
            <Bell className="w-4 h-4 text-[var(--app-pink)]" />
          ) : (
            <BellOff className="w-4 h-4 text-muted-foreground" />
          )}
          알림
          <span
            className={`ml-auto text-xs font-semibold rounded-full px-2 py-0.5 ${
              notifPermission === "granted" && notifSubscribed
                ? "bg-emerald-100 text-emerald-700"
                : notifPermission === "denied"
                ? "bg-red-100 text-red-700"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {notifPermission === "unsupported"
              ? "지원 안 함"
              : notifPermission === "denied"
              ? "거부됨"
              : notifSubscribed && notifPermission === "granted"
              ? "허용됨"
              : "꺼짐"}
          </span>
        </h3>
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            파트너의 새 기록 알림
          </p>
          <Switch
            checked={notifSubscribed && notifPermission === "granted"}
            disabled={notifBusy || notifPermission === "denied" || notifPermission === "unsupported"}
            onCheckedChange={toggleNotifications}
          />
        </div>
        {notifPermission === "denied" && (
          <p className="text-xs text-muted-foreground">
            브라우저 설정에서 이 사이트의 알림을 허용해주세요
          </p>
        )}
      </Card>

      {/* Password change */}
      <Card className="p-6 space-y-4">
        <h3 className="font-medium flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> 계정 보안
        </h3>

        <div className="space-y-2">
          <Label htmlFor="current-password" className="text-sm">현재 비밀번호</Label>
          <div className="relative">
            <Input
              id="current-password"
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(""); }}
              placeholder="현재 비밀번호"
              maxLength={128}
            />
            <button
              type="button"
              onClick={() => setShowCurrent((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password" className="text-sm">새 비밀번호</Label>
          <div className="relative">
            <Input
              id="new-password"
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); }}
              placeholder="새 비밀번호"
              maxLength={128}
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password" className="text-sm">새 비밀번호 확인</Label>
          <div className="relative">
            <Input
              id="confirm-password"
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); }}
              placeholder="새 비밀번호 확인"
              maxLength={128}
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
        </div>

        {passwordError && (
          <p className="text-sm text-destructive font-medium">{passwordError}</p>
        )}

        <Button
          onClick={changePassword}
          disabled={changingPassword}
          className="w-full bg-gradient-to-r from-pink-400 to-purple-400 hover:from-pink-500 hover:to-purple-500 text-white"
        >
          {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : "비밀번호 변경"}
        </Button>
      </Card>

      <Button variant="outline" onClick={logout} className="w-full">
        <LogOut className="w-4 h-4 mr-2" /> 로그아웃
      </Button>
    </div>
  );
}