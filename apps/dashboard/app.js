const config = window.SOCIAL_AGENT_CONFIG || {};
const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
const authPanel = document.querySelector("#authPanel");
const appPanel = document.querySelector("#appPanel");
const loginForm = document.querySelector("#loginForm");
const refreshButton = document.querySelector("#refresh");
const connectTikTokButton = document.querySelector("#connectTikTok");
const accountStatus = document.querySelector("#accountStatus");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#email").value;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split("?")[0] }
  });
  alert(error ? error.message : "Magic link sent. Open it, then return here.");
});

refreshButton.addEventListener("click", load);
connectTikTokButton.addEventListener("click", connectTikTok);

supabase.auth.onAuthStateChange(() => load());
load();

async function load() {
  const { data: { session } } = await supabase.auth.getSession();
  authPanel.classList.toggle("hidden", Boolean(session));
  appPanel.classList.toggle("hidden", !session);
  connectTikTokButton.classList.toggle("hidden", !session);
  if (!session) return;

  const [{ data: posts, error }, { data: status }] = await Promise.all([
    supabase
      .from("social_posts")
      .select("*, social_media_assets(*)")
      .order("created_at", { ascending: false }),
    supabase.functions.invoke("social-account-status", { body: { platform: "tiktok" } })
  ]);
  if (error) {
    alert(error.message);
    return;
  }
  accountStatus.textContent = status?.connected
    ? `TikTok connected${status.display_name ? ` as ${status.display_name}` : ""}.`
    : "TikTok not connected yet.";

  renderColumn("needsReview", posts.filter((post) => post.status === "needs_review"));
  renderColumn("approved", posts.filter((post) => post.status === "approved" || post.status === "publishing"));
  renderColumn("done", posts.filter((post) => ["uploaded", "failed", "rejected"].includes(post.status)));
}

function renderColumn(id, posts) {
  const container = document.querySelector(`#${id}`);
  container.innerHTML = "";
  if (!posts.length) {
    container.innerHTML = "<p>No posts.</p>";
    return;
  }
  for (const post of posts) container.append(renderPost(post));
}

function renderPost(post) {
  const template = document.querySelector("#postTemplate").content.cloneNode(true);
  template.querySelector(".meta").textContent = `${post.platform} - ${post.status} - ${post.media_count || 0} slides`;
  template.querySelector("h4").textContent = post.title;
  template.querySelector(".caption").textContent = post.caption;

  const mediaStrip = template.querySelector(".media-strip");
  const assets = [...(post.social_media_assets || [])].sort((a, b) => a.sort_order - b.sort_order);
  for (const asset of assets.slice(0, 6)) {
    const image = document.createElement("img");
    image.src = asset.public_url;
    image.alt = asset.original_filename || "Carousel slide";
    mediaStrip.append(image);
  }

  const actions = template.querySelector(".actions");
  if (post.status === "needs_review") {
    actions.append(button("Approve", () => setStatus(post.id, "approved")));
    actions.append(button("Reject", () => setStatus(post.id, "rejected")));
  }
  if (post.status === "approved") {
    actions.append(button("Send to TikTok", () => publishTikTok(post.id)));
  }
  return template;
}

function button(label, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

async function setStatus(id, status) {
  const { error } = await supabase.from("social_posts").update({ status }).eq("id", id);
  if (error) alert(error.message);
  await load();
}

async function connectTikTok() {
  const { data, error } = await supabase.functions.invoke("social-tiktok-auth-start", {
    body: { redirect_to: window.location.href.split("?")[0] }
  });
  if (error) {
    alert(error.message);
    return;
  }
  window.location.href = data.url;
}

async function publishTikTok(id) {
  const { data, error } = await supabase.functions.invoke("social-tiktok-publish", {
    body: { post_id: id }
  });
  if (error) {
    alert(error.message);
    await load();
    return;
  }
  alert(`Sent to TikTok. Publish ID: ${data.publish_id || "unknown"}`);
  await load();
}

