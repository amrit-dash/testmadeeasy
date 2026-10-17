import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

function resolveSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  return { url, serviceRoleKey };
}

let supabaseClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const { url, serviceRoleKey } = resolveSupabaseConfig();
    if (!url) {
      throw new Error("Supabase URL not configured (set SUPABASE_URL or VITE_SUPABASE_URL)");
    }
    supabaseClient = createClient(url, serviceRoleKey);
  }
  return supabaseClient;
}

const { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey } = resolveSupabaseConfig();

if (!supabaseUrl) {
  console.warn("Supabase URL not configured");
}
if (!supabaseServiceRoleKey) {
  console.warn("SUPABASE_SERVICE_ROLE_KEY not set — server storage uploads require the service role key");
}

export async function uploadImageToSupabase(buffer: Buffer, fileName: string, authHeader?: string): Promise<string> {
  const { url, serviceRoleKey } = resolveSupabaseConfig();
  if (!url) {
    throw new Error("Supabase URL not configured");
  }

  // Convert to WebP
  const webpBuffer = await sharp(buffer)
    .webp({ quality: 75, effort: 6 })
    .toBuffer();

  const bucket = "paprrr-images";
  const path = `uploads/${Date.now()}-${fileName}.webp`;

  // If we have an auth header (JWT), use it to authenticate the upload so RLS allows it
  const uploadOptions: any = {
    contentType: "image/webp",
    upsert: false,
    cacheControl: "31536000",
  };

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set for server-side uploads");
  }

  let client = getSupabase();
  if (authHeader) {
    client = createClient(url, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } }
    });
  }

  const { data, error } = await client.storage
    .from(bucket)
    .upload(path, webpBuffer, uploadOptions);

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data: publicData } = client.storage.from(bucket).getPublicUrl(data.path);
  return publicData.publicUrl;
}
