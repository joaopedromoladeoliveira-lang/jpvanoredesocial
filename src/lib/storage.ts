import { supabase } from "@/integrations/supabase/client";

export async function uploadToMedia(file: File, userId: string, folder = "posts"): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

export async function uploadVerificationDoc(file: File, userId: string): Promise<string> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("verification-docs").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return path;
}

const signedUrlCache = new Map<string, { url: string; expires: number }>();

export async function getSignedUrl(bucket: string, path: string, ttl = 3600): Promise<string> {
  const key = `${bucket}/${path}`;
  const cached = signedUrlCache.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.url;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
  if (!data?.signedUrl) return "";
  signedUrlCache.set(key, { url: data.signedUrl, expires: Date.now() + ttl * 1000 });
  return data.signedUrl;
}

export async function signedUrlsBatch(bucket: string, paths: string[], ttl = 3600): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(paths.map(async (p) => { out[p] = await getSignedUrl(bucket, p, ttl); }));
  return out;
}

/** Resolve any string: full url passes through, storage path becomes signed url. */
export async function resolveMedia(pathOrUrl: string | null | undefined): Promise<string> {
  if (!pathOrUrl) return "";
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return getSignedUrl("media", pathOrUrl);
}
