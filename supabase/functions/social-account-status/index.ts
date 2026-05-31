import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { authenticatedUser, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const user = await authenticatedUser(req);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({ platform: "tiktok" }));
  const service = serviceClient();
  const { data, error } = await service
    .from("social_accounts")
    .select("platform, display_name, connected_at, token_expires_at")
    .eq("owner_id", user.id)
    .eq("platform", body.platform || "tiktok")
    .maybeSingle();
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({
    connected: Boolean(data),
    platform: data?.platform || body.platform || "tiktok",
    display_name: data?.display_name || null,
    connected_at: data?.connected_at || null,
    token_expires_at: data?.token_expires_at || null
  });
});

