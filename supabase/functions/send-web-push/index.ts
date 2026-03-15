import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

interface PushRequestBody {
  notification_id?: string;
}

interface UserNotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  week_start: string | null;
  push_sent_at: string | null;
}

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const triggerToken = Deno.env.get("WEB_PUSH_TRIGGER_TOKEN") ?? "";
const vapidSubject = Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ?? "";
const vapidPublicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") ?? "";
const vapidPrivateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ?? "";

if (vapidSubject && vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  if (!triggerToken || request.headers.get("x-web-push-trigger") !== triggerToken) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  if (!supabaseUrl || !serviceRoleKey || !vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return jsonResponse(500, { error: "Missing required push notification environment variables" });
  }

  let body: PushRequestBody;
  try {
    body = (await request.json()) as PushRequestBody;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  if (!body.notification_id) {
    return jsonResponse(400, { error: "notification_id is required" });
  }

  const { data: notification, error: notificationError } = await supabase
    .from("user_notifications")
    .select("id, user_id, title, body, week_start, push_sent_at")
    .eq("id", body.notification_id)
    .single<UserNotificationRow>();

  if (notificationError || !notification) {
    return jsonResponse(404, { error: "Notification not found" });
  }

  if (notification.push_sent_at) {
    return jsonResponse(200, { status: "already_sent" });
  }

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", notification.user_id)
    .is("disabled_at", null)
    .returns<PushSubscriptionRow[]>();

  if (subscriptionsError) {
    await supabase
      .from("user_notifications")
      .update({ push_error: subscriptionsError.message })
      .eq("id", notification.id);

    return jsonResponse(500, { error: subscriptionsError.message });
  }

  if (!subscriptions || subscriptions.length === 0) {
    await supabase
      .from("user_notifications")
      .update({
        push_sent_at: new Date().toISOString(),
        push_error: "no_active_subscriptions",
      })
      .eq("id", notification.id);

    return jsonResponse(200, { status: "no_active_subscriptions" });
  }

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    url: "/",
    tag: `schedule-update-${notification.week_start ?? notification.id}`,
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
        );

        return { endpoint: subscription.endpoint, delivered: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : null;

        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .update({
              disabled_at: new Date().toISOString(),
              last_error: message,
            })
            .eq("endpoint", subscription.endpoint);
        } else {
          await supabase
            .from("push_subscriptions")
            .update({
              last_error: message,
            })
            .eq("endpoint", subscription.endpoint);
        }

        throw new Error(message);
      }
    }),
  );

  const deliveredCount = results.filter((result) => result.status === "fulfilled").length;

  await supabase
    .from("user_notifications")
    .update({
      push_sent_at: deliveredCount > 0 ? new Date().toISOString() : null,
      push_error:
        deliveredCount > 0
          ? null
          : results
              .filter((result): result is PromiseRejectedResult => result.status === "rejected")
              .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason))
              .join(" | ")
              .slice(0, 1000),
    })
    .eq("id", notification.id);

  return jsonResponse(200, {
    status: deliveredCount > 0 ? "sent" : "failed",
    delivered_count: deliveredCount,
    subscription_count: subscriptions.length,
  });
});
