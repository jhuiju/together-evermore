import { supabase } from "@/integrations/supabase/client";

const BUCKET = "record-photos";
const SIGNED_TTL = 60 * 60; // 1 hour

export type PhotoTransform = {
  width?: number;
  height?: number;
  resize?: "cover" | "contain" | "fill";
  quality?: number;
};

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

export async function getSignedPhotoUrl(
  storageUrl: string,
  transform?: PhotoTransform,
): Promise<string> {
  const path = getPhotoPath(storageUrl);
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL, transform ? { transform } : undefined);
  return data?.signedUrl ?? "";
}

export async function getSignedPhotoUrls(
  storageUrls: string[],
  transform?: PhotoTransform,
): Promise<Record<string, string>> {
  const paths = Array.from(new Set(storageUrls.map(getPhotoPath))).filter(Boolean);
  if (paths.length === 0) return {};

  const byPath: Record<string, string> = {};
  if (transform) {
    // createSignedUrls (batch) does not accept transform options; call per-path.
    const results = await Promise.all(
      paths.map(async (p) => {
        const { data } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(p, SIGNED_TTL, { transform });
        return [p, data?.signedUrl ?? ""] as const;
      }),
    );
    for (const [p, u] of results) if (u) byPath[p] = u;
  } else {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL);
    (data ?? []).forEach((d) => {
      if (d.path && d.signedUrl) byPath[d.path] = d.signedUrl;
    });
  }

  const result: Record<string, string> = {};
  for (const url of storageUrls) {
    const p = getPhotoPath(url);
    if (byPath[p]) result[url] = byPath[p];
  }
  return result;
}