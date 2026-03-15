import { supabase } from "@/integrations/supabase/client";

const WEB_PUSH_PUBLIC_KEY = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY ?? "";

function hasWindow() {
  return typeof window !== "undefined";
}

export function supportsPushNotifications() {
  return (
    hasWindow() &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined" &&
    Boolean(WEB_PUSH_PUBLIC_KEY)
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const normalized = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(normalized);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function getActiveServiceWorkerRegistration() {
  if (!supportsPushNotifications()) return null;
  return navigator.serviceWorker.ready;
}

function getSubscriptionKeys(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!p256dh || !auth) {
    throw new Error("Push subscription keys are missing.");
  }

  return { p256dh, auth };
}

export async function syncBrowserPushSubscription(userId: string) {
  const registration = await getActiveServiceWorkerRegistration();
  if (!registration || Notification.permission !== "granted") return false;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY),
    });
  }

  const { p256dh, auth } = getSubscriptionKeys(subscription);

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      user_agent: navigator.userAgent,
      disabled_at: null,
      last_error: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    throw error;
  }

  return true;
}

export async function disableBrowserPushSubscription() {
  const registration = await getActiveServiceWorkerRegistration();
  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await supabase
    .from("push_subscriptions")
    .update({
      disabled_at: new Date().toISOString(),
    })
    .eq("endpoint", subscription.endpoint);

  await subscription.unsubscribe();
}
