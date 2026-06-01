(async () => {
const config = window.SOCIAL_AGENT_CONFIG || {};
const authPanel = document.querySelector("#authPanel");
const appPanel = document.querySelector("#appPanel");
const loginForm = document.querySelector("#loginForm");
const magicLinkButton = document.querySelector("#magicLinkButton");
const passwordSignInButton = document.querySelector("#passwordSignInButton");
const authStatus = document.querySelector("#authStatus");
const appStatus = document.querySelector("#appStatus");
const sessionInfo = document.querySelector("#sessionInfo");
const refreshButton = document.querySelector("#refresh");
const signOutButton = document.querySelector("#signOut");
let supabaseClient;

boot();

async function boot() {
  if (!window.supabase?.createClient) {
    setAuthStatus("Supabase login script did not load. Refresh the page or disable blockers for this site.", "error");
    return;
  }
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    setAuthStatus("Dashboard config is missing. Check GitHub Pages config.js.", "error");
    return;
  }

  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  setAuthStatus("Dashboard script loaded. Ready to sign in.", "success");

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (getPassword()) await signInWithPassword();
    else await sendMagicLink();
  });

  magicLinkButton.addEventListener("click", sendMagicLink);
  passwordSignInButton.addEventListener("click", signInWithPassword);
  refreshButton.addEventListener("click", load);
  signOutButton.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    setAuthStatus("Signed out.", "success");
    await load();
  });

  supabaseClient.auth.onAuthStateChange(() => load());
  await load();
}

async function sendMagicLink() {
  const email = getEmail();
  if (!email) {
    setAuthStatus("Enter your email first.", "error");
    return;
  }
  setAuthBusy(true);
  setAuthStatus("Sending magic link...", "");
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split("?")[0] }
  });
  setAuthBusy(false);
  if (error) {
    setAuthStatus(error.message, "error");
    return;
  }
  setAuthStatus("Magic link sent. Open it from the same device/browser, then return here.", "success");
}

async function signInWithPassword() {
  const email = getEmail();
  const password = getPassword();
  if (!email) {
    setAuthStatus("Enter your email first.", "error");
    return;
  }
  if (!password) {
    setAuthStatus("Enter your password, then click Sign In With Password.", "error");
    return;
  }
  setAuthBusy(true);
  setAuthStatus("Signing in...", "");
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  setAuthBusy(false);
  if (error) {
    setAuthStatus(error.message, "error");
    return;
  }
  setAuthStatus(`Signed in as ${data.user.email}. Loading posts...`, "success");
  await load();
}

async function load() {
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) {
    setAuthStatus(sessionError.message, "error");
    return;
  }
  authPanel.classList.toggle("hidden", Boolean(session));
  appPanel.classList.toggle("hidden", !session);
  sessionInfo.textContent = session ? `Signed in as ${session.user.email}` : "";
  setAppStatus("", "");
  if (!session) return;

  const { data: posts, error } = await supabaseClient
    .from("social_posts")
    .select("*, social_media_assets(*)")
    .order("created_at", { ascending: false });
  if (error) {
    setAppStatus(`Could not load posts: ${error.message}`, "error");
    return;
  }

  const rows = posts || [];
  renderColumn("needsReview", rows.filter((post) => post.status === "needs_review"));
  renderColumn("approved", rows.filter((post) => ["approved", "ready_to_post"].includes(post.status)));
  renderColumn("done", rows.filter((post) => ["scheduled_manually", "published_manually", "rejected"].includes(post.status)));
  setAppStatus(rows.length ? `Loaded ${rows.length} post kit${rows.length === 1 ? "" : "s"}.` : "Signed in. No post kits have been synced for this user yet.", rows.length ? "success" : "");
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
  const { error } = await supabaseClient.from("social_posts").update({ status }).eq("id", id);
  if (error) {
    setAppStatus(error.message, "error");
    return;
  }
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
  const { error } = await supabaseClient.from("social_posts").update(payload).eq("id", id);
  if (error) {
    setAppStatus(error.message, "error");
    return;
  }
  await load();
}

function getEmail() {
  return document.querySelector("#email").value.trim();
}

function getPassword() {
  return document.querySelector("#password").value;
}

function setAuthBusy(isBusy) {
  loginForm.querySelectorAll("input, button").forEach((element) => {
    element.disabled = isBusy;
  });
}

function setAuthStatus(message, type) {
  setStatusText(authStatus, message, type);
}

function setAppStatus(message, type) {
  setStatusText(appStatus, message, type);
}

function setStatusText(element, message, type) {
  element.textContent = message;
  element.classList.remove("error", "success");
  if (type) element.classList.add(type);
}
})();
