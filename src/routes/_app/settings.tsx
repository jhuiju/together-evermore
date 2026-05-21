import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Camera, Heart, Loader2, LogOut, User as UserIcon } from "lucide-react";

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

  const [userId, setUserId] = useState<string | null>(null);
  const [coupleId, setCoupleId] = useState<string | null>(null);

  const [nickname, setNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coupleName, setCoupleName] = useState("");
  const [anniversary, setAnniversary] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingNickname, setSavingNickname] = useState(false);
  const [savingCouple, setSavingCouple] = useState(false);
  const [savingAnniv, setSavingAnniv] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
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
            .select("couple_name, anniversary")
            .eq("id", me.couple_id)
            .maybeSingle();
          if (cp) {
            setCoupleName(cp.couple_name ?? "우리");
            setAnniversary(cp.anniversary ?? "");
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

      <Button variant="outline" onClick={logout} className="w-full">
        <LogOut className="w-4 h-4 mr-2" /> 로그아웃
      </Button>
    </div>
  );
}