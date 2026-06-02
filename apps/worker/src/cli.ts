import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

type Command = "init" | "scan" | "sync" | "export-icloud" | "import-photos" | "help";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SOCIAL_OWNER_USER_ID?: string;
  ICLOUD_EXPORT_DIR?: string;
}

interface PostPackage {
  type: "owned_post";
  platform: "tiktok";
  format: "photo_carousel";
  title: string;
  caption: string;
  hashtags?: string[];
  coverIndex?: number;
  media: string[];
  status?: string;
}

interface PackageScan {
  slug: string;
  dir: string;
  post?: PostPackage;
  ok: boolean;
  errors: string[];
  mediaPaths: string[];
}

const root = resolve(import.meta.dirname, "..", "..", "..");
const inboxDir = resolve(root, "inbox");
const archiveDir = resolve(root, "archive");

const [command = "help", ...argv] = process.argv.slice(2) as [Command, ...string[]];
const args = parseArgs(argv);

try {
  switch (command) {
    case "init":
      ensureDir(inboxDir);
      ensureDir(archiveDir);
      console.log(`Ready: ${inboxDir}`);
      break;
    case "scan":
      console.log(JSON.stringify(scanPackages(), null, 2));
      break;
    case "sync":
      await syncPackages();
      break;
    case "export-icloud":
      exportPackagesToIcloud();
      break;
    case "import-photos":
      importPackagesToPhotos();
      break;
    default:
      printHelp();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(values: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      index += 1;
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`TorqTribe Social Agent

Commands:
  init
  scan
  sync
  export-icloud
  import-photos
`);
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function loadEnv(): Env {
  const envPath = resolve(root, ".env.local");
  const fileEnv: Env = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      fileEnv[key as keyof Env] = rest.join("=").trim();
    }
  }
  return { ...fileEnv, ...process.env };
}

function requireEnv(): Required<Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "SOCIAL_OWNER_USER_ID">> {
  const env = loadEnv();
  const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SOCIAL_OWNER_USER_ID"].filter((key) => !env[key as keyof Env]);
  if (missing.length) throw new Error(`Missing .env.local values: ${missing.join(", ")}`);
  return env as Required<Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "SOCIAL_OWNER_USER_ID">>;
}

function scanPackages(): PackageScan[] {
  ensureDir(inboxDir);
  return readdirSync(inboxDir)
    .filter((item) => !item.startsWith("."))
    .map((slug) => scanPackage(slug, resolve(inboxDir, slug)))
    .filter(Boolean) as PackageScan[];
}

function scanPackage(slug: string, dir: string): PackageScan | null {
  if (!statSync(dir).isDirectory()) return null;
  const errors: string[] = [];
  const postPath = resolve(dir, "post.json");
  let post: PostPackage | undefined;
  if (!existsSync(postPath)) {
    errors.push("Missing post.json");
  } else {
    try {
      post = JSON.parse(readFileSync(postPath, "utf8")) as PostPackage;
    } catch {
      errors.push("post.json is not valid JSON");
    }
  }
  if (post) {
    if (post.type !== "owned_post") errors.push("type must be owned_post");
    if (post.platform !== "tiktok") errors.push("platform must be tiktok");
    if (post.format !== "photo_carousel") errors.push("format must be photo_carousel");
    if (!post.title?.trim()) errors.push("title is required");
    if (!post.caption?.trim()) errors.push("caption is required");
    if (!Array.isArray(post.media) || post.media.length < 2 || post.media.length > 35) errors.push("media must contain 2-35 images");
  }
  const mediaPaths = (post?.media || []).map((media) => resolve(dir, media));
  for (const mediaPath of mediaPaths) {
    if (!existsSync(mediaPath)) {
      errors.push(`Missing media: ${mediaPath}`);
      continue;
    }
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extname(mediaPath).toLowerCase())) {
      errors.push(`Unsupported media type: ${mediaPath}`);
    }
  }
  return { slug, dir, post, ok: errors.length === 0, errors, mediaPaths };
}

async function syncPackages(): Promise<void> {
  const env = requireEnv();
  const scans = scanPackages();
  const valid = scans.filter((scan) => scan.ok && scan.post);
  if (!valid.length) {
    console.log("No valid packages to sync.");
    console.log(JSON.stringify(scans, null, 2));
    return;
  }
  const client = supabaseClient(env);
  for (const scan of valid) {
    const post = scan.post!;
    const syncedPost = await client.upsertPost({
      source_package_id: scan.slug,
      owner_id: env.SOCIAL_OWNER_USER_ID,
      platform: "tiktok",
      format: "photo_carousel",
      title: post.title,
      caption: withHashtags(post.caption, post.hashtags || []),
      hashtags: post.hashtags || [],
      cover_index: post.coverIndex || 0,
      media_count: post.media.length,
      status: post.status || "needs_review"
    });
    for (let index = 0; index < scan.mediaPaths.length; index += 1) {
      const mediaPath = scan.mediaPaths[index];
      const objectPath = `${env.SOCIAL_OWNER_USER_ID}/${syncedPost.id}/${basename(mediaPath)}`;
      const publicUrl = await client.uploadMedia(objectPath, mediaPath);
      await client.upsertAsset({
        post_id: syncedPost.id,
        owner_id: env.SOCIAL_OWNER_USER_ID,
        sort_order: index,
        original_filename: basename(mediaPath),
        storage_bucket: "tiktok-carousel-media",
        storage_path: objectPath,
        public_url: publicUrl,
        mime_type: mimeType(mediaPath),
        size_bytes: statSync(mediaPath).size
      });
    }
    const iCloudExportDir = exportPackageToIcloud(scan, env);
    const photosAlbum = shouldImportToPhotos(scan) ? importPackageToPhotos(scan) : null;
    writeFileSync(resolve(scan.dir, "sync-result.json"), JSON.stringify({
      syncedAt: new Date().toISOString(),
      postId: syncedPost.id,
      mediaCount: scan.mediaPaths.length,
      iCloudExportDir,
      photosAlbum
    }, null, 2));
    console.log(`Synced ${scan.slug}: ${syncedPost.id}`);
    console.log(`iCloud export: ${iCloudExportDir}`);
    if (photosAlbum) console.log(`Photos album: ${photosAlbum}`);
  }
}

function exportPackagesToIcloud(): void {
  const env = loadEnv();
  const scans = scanPackages();
  const valid = scans.filter((scan) => scan.ok && scan.post);
  if (!valid.length) {
    console.log("No valid packages to export.");
    console.log(JSON.stringify(scans, null, 2));
    return;
  }
  for (const scan of valid) {
    const iCloudExportDir = exportPackageToIcloud(scan, env);
    console.log(`Exported ${scan.slug}: ${iCloudExportDir}`);
  }
}

function exportPackageToIcloud(scan: PackageScan, env: Env): string {
  if (!scan.post) throw new Error(`Cannot export invalid package: ${scan.slug}`);
  const exportDir = resolve(iCloudRoot(env), scan.slug);
  ensureDir(exportDir);
  for (let index = 0; index < scan.mediaPaths.length; index += 1) {
    copyFileSync(scan.mediaPaths[index], resolve(exportDir, `slide-${String(index + 1).padStart(2, "0")}${extname(scan.mediaPaths[index])}`));
  }
  writeFileSync(resolve(exportDir, "caption.txt"), withHashtags(scan.post.caption, scan.post.hashtags || []));
  writeFileSync(resolve(exportDir, "post.json"), JSON.stringify(scan.post, null, 2));
  writeFileSync(resolve(scan.dir, "icloud-export.json"), JSON.stringify({
    exportedAt: new Date().toISOString(),
    exportDir,
    mediaCount: scan.mediaPaths.length
  }, null, 2));
  return exportDir;
}

function iCloudRoot(env: Env): string {
  if (env.ICLOUD_EXPORT_DIR) return env.ICLOUD_EXPORT_DIR;
  return join(homedir(), "Library", "Mobile Documents", "com~apple~CloudDocs", "Photos", "TorqTribe TikTok Carousels");
}

function importPackagesToPhotos(): void {
  const scans = scanPackages();
  const valid = scans.filter((scan) => scan.ok && scan.post && shouldImportToPhotos(scan));
  if (!valid.length) {
    console.log("No valid, non-rejected packages to import to Photos.");
    console.log(JSON.stringify(scans, null, 2));
    return;
  }
  for (const scan of valid) {
    const album = importPackageToPhotos(scan);
    console.log(`Imported ${scan.slug} to Photos album: ${album}`);
  }
}

function shouldImportToPhotos(scan: PackageScan): boolean {
  return scan.post?.status !== "rejected";
}

function importPackageToPhotos(scan: PackageScan): string {
  if (!scan.post) throw new Error(`Cannot import invalid package: ${scan.slug}`);
  const markerPath = resolve(scan.dir, "photos-import.json");
  if (existsSync(markerPath)) {
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as { albumName?: string };
    return marker.albumName || photosAlbumName(scan.slug);
  }

  const albumName = photosAlbumName(scan.slug);
  const script = `
on run argv
  set albumName to item 1 of argv
  set imageFiles to {}
  repeat with i from 2 to count of argv
    set end of imageFiles to POSIX file (item i of argv)
  end repeat
  tell application "Photos"
    activate
    if exists album albumName then
      set targetAlbum to album albumName
    else
      set targetAlbum to make new album named albumName
    end if
    import imageFiles into targetAlbum skip check duplicates true
  end tell
end run
`;
  execFileSync("osascript", ["-e", script, albumName, ...scan.mediaPaths], { stdio: "pipe" });
  writeFileSync(markerPath, JSON.stringify({
    importedAt: new Date().toISOString(),
    albumName,
    mediaCount: scan.mediaPaths.length
  }, null, 2));
  return albumName;
}

function photosAlbumName(slug: string): string {
  return `TorqTribe TikTok - ${slug}`;
}

function withHashtags(caption: string, hashtags: string[]): string {
  const tags = hashtags.filter(Boolean).map((tag) => tag.startsWith("#") ? tag : `#${tag}`);
  return [caption.trim(), tags.join(" ")].filter(Boolean).join("\n\n");
}

function mimeType(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function supabaseClient(env: Required<Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "SOCIAL_OWNER_USER_ID">>) {
  const baseUrl = env.SUPABASE_URL.replace(/\/$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`
  };
  return {
    async upsertPost(body: Record<string, unknown>): Promise<{ id: string }> {
      const response = await fetch(`${baseUrl}/rest/v1/social_posts?on_conflict=source_package_id`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation"
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`Post sync failed: ${response.status} ${await response.text()}`);
      const rows = await response.json() as Array<{ id: string }>;
      return rows[0];
    },
    async uploadMedia(objectPath: string, filePath: string): Promise<string> {
      const bytes = readFileSync(filePath);
      const response = await fetch(`${baseUrl}/storage/v1/object/tiktok-carousel-media/${objectPath}`, {
        method: "PUT",
        headers: {
          ...headers,
          "Content-Type": mimeType(filePath),
          "x-upsert": "true"
        },
        body: bytes
      });
      if (!response.ok) throw new Error(`Media upload failed: ${response.status} ${await response.text()}`);
      return `${baseUrl}/storage/v1/object/public/tiktok-carousel-media/${objectPath}`;
    },
    async upsertAsset(body: Record<string, unknown>): Promise<void> {
      const response = await fetch(`${baseUrl}/rest/v1/social_media_assets?on_conflict=post_id,sort_order`, {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`Asset sync failed: ${response.status} ${await response.text()}`);
    }
  };
}
