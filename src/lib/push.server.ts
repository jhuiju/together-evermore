import { supabaseAdmin } from "@/integrations/supabase/client.server";
import webPushModule from "web-push";

const webPush: any = (webPushModule as any).default ?? webPushModule;

export async function sendPartnerNotification(opts: {
  supabase: any;
  userId: string;
  recordId: string;
}) {
  const { supabase, userId, recordId } = opts;

  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:noreply@withlog.app";
  if (!vapidPublic || !vapidPrivate) {
    console.error("[push] VAPID keys missing");
    return { sent: 0 };
  }
  webPush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const { data: rec } = await supabase
    .from("records")
    .select("id, date, location_name, author_id, couple_id")
    .eq("id", recordId)
    .maybeSingle();
  if (!rec) return { sent: 0 };
  if (rec.author_id !== userId) return { sent: 0 };

  const [{ data: author }, { data: rating }, { data: couple }] = await Promise.all([
    supabase.from("users").select("nickname").eq("id", userId).maybeSingle(),
    supabase
      .from("ratings")
      .select("score")
      .eq("record_id", rec.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("couples")
      .select("user1_id, user2_id")
      .eq("id", rec.couple_id)
      .maybeSingle(),
  ]);
  if (!couple) return { sent: 0 };
  const partnerId =
    couple.user1_id === userId ? couple.user2_id : couple.user1_id;
  if (!partnerId) return { sent: 0 };

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, subscription, endpoint")
    .eq("user_id", partnerId);
  if (!subs || subs.length === 0) return { sent: 0 };

  const nickname = author?.nickname || "파트너";
  const ratingStr =
    rating && typeof (rating as any).score === "number"
      ? `♥${((rating as any).score / 2).toFixed(1)}`
      : "";
  const bodyParts = [rec.date, rec.location_name, ratingStr].filter(Boolean);
  const payload = JSON.stringify({
    title: `${nickname}님이 새 기록을 남겼어요 💌`,
    body: bodyParts.join(" · "),
    url: `/date/${rec.id}`,
  });

  let sent = 0;
  const staleIds: string[] = [];
  await Promise.all(
    subs.map(async (row: any) => {
      try {
        await webPush.sendNotification(row.subscription, payload);
        sent++;
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) staleIds.push(row.id);
        else console.error("[push] send error", code, err?.body ?? err?.message);
      }
    }),
  );
  if (staleIds.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
  }
  return { sent };
}