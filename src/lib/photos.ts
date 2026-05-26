import { supabase } from "@/integrations/supabase/client";

const BUCKET = "record-photos";
const SIGNED_TTL = 60 * 60; // 1 hour

/**
 * Extract the storage path from either a raw path or a legacy public URL.
 * Legacy rows stored full public URLs like
 * `https://<project>.supabase.co/storage/v1/object/public/record-photos/<path>`
 */
export function getPhotoPath(storageUrl: string): string {
  if (!storageUrl) return storageUrl;
  const markers = [
    "/object/public/record-photos/",
    "/object/sign/record-photos/",
    "/object/record-photos/",
  ];
  for (const m of markers) {
    const idx = storageUrl.indexOf(m);
    if (idx >= 0) {
      const tail = storageUrl.slice(idx + m.length);
      // strip any query string (e.g. ?token=...)
      return tail.split("?")[0];
    }
  }
  return storageUrl;
}

export async function getSignedPhotoUrl(storageUrl: string): Promise<string> {
  const path = getPhotoPath(storageUrl);
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? "";
}

export async function getSignedPhotoUrls(storageUrls: string[]): Promise<Record<string, string>> {
  const paths = Array.from(new Set(storageUrls.map(getPhotoPath))).filter(Boolean);
  if (paths.length === 0) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
  const byPath: Record<string, string> = {};
  (data ?? []).forEach((d) => {
    if (d.path && d.signedUrl) byPath[d.path] = d.signedUrl;
  });
  const result: Record<string, string> = {};
  for (const url of storageUrls) {
    const p = getPhotoPath(url);
    if (byPath[p]) result[url] = byPath[p];
  }
  return result;
}