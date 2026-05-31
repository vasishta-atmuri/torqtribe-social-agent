import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return jsonResponse({ error: "Missing TikTok code or state" }, 400);

  const service = serviceClient();
  const { data: oauthState, error: stateError } = await service
    .from("social_oauth_states")
    .select("*")
    .eq("state", state)
    .maybeSingle();
  if (stateError || !oauthState) return jsonResponse({ error: "Invalid OAuth state" }, 400);
  if (new Date(oauthState.expires_at).getTime() < Date.now()) return jsonResponse({ error: "OAuth state expired" }, 400);

  const clientKey = Deno.env.get("TIKTOK_CLIENT_KEY");
  const clientSecret = Deno.env.get("TIKTOK_CLIENT_SECRET");
  const redirectUri = Deno.env.get("TIKTOK_REDIRECT_URI");
  if (!clientKey || !clientSecret || !redirectUri) return jsonResponse({ error: "TikTok OAuth is not configured" }, 500);

  const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri
    })
  });
  const tokenJson = await tokenResponse.json();
  if (!tokenResponse.ok) return jsonResponse({ error: "TikTok token exchange failed", details: tokenJson }, 400);

  const accessToken = tokenJson.access_token;
  const userResponse = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const userJson = await userResponse.json().catch(() => ({}));
  const openId = tokenJson.open_id || userJson?.data?.user?.open_id || crypto.randomUUID();
  const displayName = userJson?.data?.user?.display_name || null;
  const tokenExpiresAt = tokenJson.expires_in
    ? new Date(Date.now() + Number(tokenJson.expires_in) * 1000).toISOString()
    : null;

  const { error: upsertError } = await service.from("social_accounts").upsert({
    owner_id: oauthState.owner_id,
    platform: "tiktok",
    provider_account_id: openId,
    display_name: displayName,
    access_token: accessToken,
    refresh_token: tokenJson.refresh_token || null,
    scopes: String(tokenJson.scope || "user.info.basic,video.upload").split(","),
    token_expires_at: tokenExpiresAt
  }, { onConflict: "owner_id,platform,provider_account_id" });
  if (upsertError) return jsonResponse({ error: upsertError.message }, 500);

  await service.from("social_oauth_states").delete().eq("state", state);
  const redirectTo = oauthState.redirect_to || Deno.env.get("SOCIAL_DASHBOARD_URL");
  if (redirectTo) return Response.redirect(`${redirectTo}?tiktok=connected`, 302);
  return jsonResponse({ connected: true });
});

