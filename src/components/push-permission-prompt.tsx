import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getVapidPublicKey, savePushSubscription } from "@/lib/push.functions";

const SESSION_DISMISS_KEY = "withlog:push-prompt-dismissed-session";
const LATER_KEY = "withlog:push-prompt-later-at";
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type GetVapidFn = () => Promise<{ publicKey: string }>;
type SaveSubFn = (args: { data: { subscription: any } }) => Promise<unknown>;

export async function ensurePushSubscribed(
  getVapidPublicKeyFn: GetVapidFn,
  saveSubscriptionFn: SaveSubFn,
) {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  if (Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await getVapidPublicKeyFn();
    if (!publicKey) return;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await saveSubscriptionFn({ data: { subscription: sub.toJSON() as any } });
}

export function PushPermissionPrompt() {
  const [visible, setVisible] = useState(false);
  const getKey = useServerFn(getVapidPublicKey);
  const saveSub = useServerFn(savePushSubscription);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;

    // If already granted, just sync the subscription silently.
    if (Notification.permission === "granted") {
      ensurePushSubscribed(getKey as unknown as GetVapidFn, saveSub as unknown as SaveSubFn).catch(() => {});
      return;
    }
    if (Notification.permission === "denied") return;

    if (sessionStorage.getItem(SESSION_DISMISS_KEY)) return;
    const laterAt = Number(localStorage.getItem(LATER_KEY) || 0);
    if (laterAt && Date.now() - laterAt < THREE_DAYS) return;

    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, [getKey, saveSub]);

  async function allow() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
        setVisible(false);
        if (perm === "denied") toast.error("알림이 차단됐어요");
        return;
      }
      await ensurePushSubscribed(getKey as unknown as GetVapidFn, saveSub as unknown as SaveSubFn);
      toast.success("알림이 켜졌어요 🔔");
      localStorage.removeItem(LATER_KEY);
      setVisible(false);
    } catch (e: any) {
      console.error(e);
      toast.error("알림 설정에 실패했어요");
      setVisible(false);
    }
  }

  function later() {
    localStorage.setItem(LATER_KEY, String(Date.now()));
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-24 z-50 px-4 pointer-events-none">
      <div className="max-w-2xl mx-auto pointer-events-auto rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-lg p-4 flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-full bg-[var(--app-pink)]/15 flex items-center justify-center">
          <Bell className="w-5 h-5 text-[var(--app-pink)]" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-[var(--app-text)] leading-snug">
            파트너가 새 기록을 남기면 알림을 받을 수 있어요.<br />알림을 허용할까요?
          </p>
          <div className="mt-3 flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={later}>나중에</Button>
            <Button
              size="sm"
              onClick={allow}
              className="bg-[var(--app-pink)] hover:bg-[var(--app-pink)]/90 text-white"
            >
              허용하기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}