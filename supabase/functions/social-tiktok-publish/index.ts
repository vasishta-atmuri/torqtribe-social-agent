import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { authenticatedUser, isServiceRole, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const service = serviceClient();
  const serviceRole = isServiceRole(req);
  const user = serviceRole ? null : await authenticatedUser(req);
  if (!serviceRole && !user) return jsonResponse({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const postId = body.post_id;
  if (!postId) return jsonResponse({ error: "Missing post_id" }, 400);

  let postQuery = service.from("social_posts").select("*").eq("id", postId);
  if (!serviceRole) postQuery = postQuery.eq("owner_id", user!.id);
  const { data: post, error: postError } = await postQuery.maybeSingle();
  if (postError || !post) return jsonResponse({ error: "Post not found" }, 404);
  if (post.status !== "approved") return jsonResponse({ error: `Post must be approved first. Current status: ${post.status}` }, 409);

  const { data: assets, error: assetError } = await service
    .from("social_media_assets")
    .select("*")
    .eq("post_id", post.id)
    .order("sort_order", { ascending: true });
  if (assetError) return jsonResponse({ error: assetError.message }, 500);
  if (!assets || assets.length < 2 || assets.length > 35) return jsonResponse({ error: "TikTok photo carousel requires 2-35 images" }, 400);

  const { data: account, error: accountError } = await service
    .from("social_accounts")
    .select("*")
    .eq("owner_id", post.owner_id)
    .eq("platform", "tiktok")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (accountError || !account) return jsonResponse({ error: "TikTok account is not connected" }, 409);

  await service.from("social_posts").update({ status: "publishing", last_error: null }).eq("id", post.id);
  const requestJson = {
    post_info: {
      title: post.caption.slice(0, 2200)
    },
    post_mode: "MEDIA_UPLOAD",
    media_type: "PHOTO",
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: post.cover_index || 0,
      photo_images: assets.map((asset) => asset.public_url)
    }
  };
  const { data: attempt } = await service.from("social_publish_attempts").insert({
    post_id: post.id,
    owner_id: post.owner_id,
    platform: "tiktok",
    mode: "MEDIA_UPLOAD",
    status: "started",
    request_json: requestJson
  }).select("*").single();

  const tikTokResponse = await fetch("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      "Content-Type": "application/json; charset=UTF-8"
    },
    body: JSON.stringify(requestJson)
  });
  const responseJson = await tikTokResponse.json().catch(() => ({}));
  if (!tikTokResponse.ok || responseJson.error?.code) {
    const message = responseJson.error?.message || `TikTok API failed with HTTP ${tikTokResponse.status}`;
    await service.from("social_posts").update({ status: "failed", last_error: message }).eq("id", post.id);
    if (attempt) {
      await service.from("social_publish_attempts").update({
        status: "failed",
        response_json: responseJson,
        error_message: message
      }).eq("id", attempt.id);
    }
    return jsonResponse({ error: message, details: responseJson }, 502);
  }

  const publishId = responseJson.data?.publish_id || null;
  await service.from("social_posts").update({
    status: "uploaded",
    remote_publish_id: publishId,
    last_error: null
  }).eq("id", post.id);
  if (attempt) {
    await service.from("social_publish_attempts").update({
      status: "succeeded",
      response_json: responseJson
    }).eq("id", attempt.id);
  }
  return jsonResponse({ ok: true, publish_id: publishId, response: responseJson });
});

