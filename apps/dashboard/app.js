const config = window.SOCIAL_AGENT_CONFIG || {};
const supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
const authPanel = document.querySelector("#authPanel");
const appPanel = document.querySelector("#appPanel");
const loginForm = document.querySelector("#loginForm");
const refreshButton = document.querySelector("#refresh");

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

supabase.auth.onAuthStateChange(() => load());
load();

async function load() {
  const { data: { session } } = await supabase.auth.getSession();
  authPanel.classList.toggle("hidden", Boolean(session));
  appPanel.classList.toggle("hidden", !session);
  if (!session) return;

  const { data: posts, error } = await supabase
    .from("social_posts")
    .select("*, social_media_assets(*)")
    .order("created_at", { ascending: false });
  if (error) {
    alert(error.message);
    return;
  }

  renderColumn("needsReview", posts.filter((post) => post.status === "needs_review"));
  renderColumn("approved", posts.filter((post) => ["approved", "ready_to_post"].includes(post.status)));
  renderColumn("done", posts.filter((post) => ["scheduled_manually", "published_manually", "rejected"].includes(post.status)));
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
  const slideList = document.createElement("div");
  slideList.className = "slide-list";
  for (const asset of assets) {
    const link = document.createElement("a");
    link.href = asset.public_url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.download = asset.original_filename || "";
    link.textContent = `Slide ${asset.sort_order + 1}: ${asset.original_filename || "open image"}`;
    slideList.append(link);
  }
  mediaStrip.after(slideList);

  const actions = template.querySelector(".actions");
  if (post.status === "needs_review") {
    actions.append(button("Approve Kit", () => setStatus(post.id, "ready_to_post")));
    actions.append(button("Reject", () => setStatus(post.id, "rejected")));
  }
  if (["approved", "ready_to_post"].includes(post.status)) {
    actions.append(button("Copy Caption", () => copyCaption(post.caption)));
    actions.append(button("Open Slides", () => openSlides(assets)));
    actions.append(button("Mark Scheduled", () => setStatus(post.id, "scheduled_manually")));
    actions.append(button("Mark Posted", () => showManualForm(template, post.id)));
  }
  const form = template.querySelector(".manual-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = form.querySelector(".manual-url").value.trim();
    await markPosted(post.id, url);
  });
  if (post.remote_url) {
    const link = document.createElement("a");
    link.href = post.remote_url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Open TikTok post";
    actions.append(link);
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

async function copyCaption(caption) {
  await navigator.clipboard.writeText(caption);
  alert("Caption copied. Open TikTok, create a photo post, add these slides, then paste the caption.");
}

function openSlides(assets) {
  for (const asset of assets) window.open(asset.public_url, "_blank", "noreferrer");
}

function showManualForm(template, id) {
  const form = template.querySelector(".manual-form");
  form.classList.remove("hidden");
  form.querySelector(".manual-url").focus();
}

async function markPosted(id, remoteUrl) {
  const payload = { status: "published_manually", remote_url: remoteUrl || null };
  const { error } = await supabase.from("social_posts").update(payload).eq("id", id);
  if (error) alert(error.message);
  await load();
}
