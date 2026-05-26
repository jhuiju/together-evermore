/**
 * Tell the active service worker to drop cached HTML/data so the next
 * navigation always re-fetches fresh content. Call after any write
 * (create / update / delete) so the PWA shell never serves stale pages.
 */
export function clearDataCache() {
  if (typeof navigator === "undefined") return;
  const sw = navigator.serviceWorker;
  if (!sw) return;
  // Notify the controlling SW (if any) and any waiting/active registrations.
  sw.controller?.postMessage({ type: "CLEAR_DATA_CACHE" });
  sw.ready
    .then((reg) => {
      reg.active?.postMessage({ type: "CLEAR_DATA_CACHE" });
    })
    .catch(() => {});
}