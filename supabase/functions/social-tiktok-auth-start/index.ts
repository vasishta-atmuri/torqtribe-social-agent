import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { authenticatedUser, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const user = await authenticatedUser(req);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const redirectUri = Deno.env.get("TIKTOK_REDIRECT_URI");
  if (!clientKey || !redirectUri) return jsonResponse({ error: "TikTok OAuth is not configured" }, 500);

  const body = await req.json().catch(() => ({}));
  const state = crypto.randomUUID();
  const service = serviceClient();
  const { error } = await service.from("social_oauth_states").insert({
    state,
    owner_id: user.id,
    platform: "tiktok",
    redirect_to: body.redirect_to || Deno.env.get("SOCIAL_DASHBOARD_URL") || null,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  });
  if (error) return jsonResponse({ error: error.message }, 500);

  const params = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: "user.info.basic,video.upload",
    redirect_uri: redirectUri,
    state
  });
  return jsonResponse({ url: `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}` });
});

