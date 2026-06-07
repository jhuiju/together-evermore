import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PushSubscriptionJSON = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
  expirationTime?: number | null;
};

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { subscription: PushSubscriptionJSON }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const sub = data.subscription;
    if (!sub?.endpoint) throw new Error("Invalid subscription");

    // Upsert by (user_id, endpoint)
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          subscription: sub as any,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,endpoint" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint?: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const q = supabase.from("push_subscriptions").delete().eq("user_id", userId);
    if (data.endpoint) q.eq("endpoint", data.endpoint);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

export const notifyPartnerOfNewRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { recordId: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { sendPartnerNotification } = await import("./push.server");
    return sendPartnerNotification({ supabase, userId, recordId: data.recordId });
  });