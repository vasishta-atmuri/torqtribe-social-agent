# Codex Package Format

Codex should save each TikTok carousel post as a folder under `inbox/`.

```text
inbox/tiktok-2026-05-30-consistency/
  post.json
  media/
    slide-01.png
    slide-02.png
    slide-03.png
```

`post.json`:

```json
{
  "type": "owned_post",
  "platform": "tiktok",
  "format": "photo_carousel",
  "title": "Stop letting one missed workout erase your week",
  "caption": "One missed workout should not reset your momentum...",
  "hashtags": ["#fitness", "#beginnerfitness", "#workoutplan"],
  "coverIndex": 0,
  "media": [
    "media/slide-01.png",
    "media/slide-02.png",
    "media/slide-03.png"
  ],
  "status": "needs_review"
}
```

Validation rules:

- `platform` must be `tiktok`.
- `format` must be `photo_carousel`.
- `media` must contain 2-35 local images.
- Images must be `.png`, `.jpg`, `.jpeg`, or `.webp`.
- `title` and `caption` are required.
- `status` should usually be `needs_review`. The dashboard moves it to `ready_to_post`, `scheduled_manually`, or `published_manually`.

## iCloud Export

Run this after creating a package if you want the slides available from your phone:

```bash
npm run export:icloud
```

The worker copies each valid package to:

```text
iCloud Drive/Photos/TorqTribe TikTok Carousels/<package-slug>/
  slide-01.png
  slide-02.png
  caption.txt
  post.json
```

`npm run sync` also performs this export automatically after uploading media to Supabase.
Set `ICLOUD_EXPORT_DIR` in `.env.local` if you want a different iCloud Drive folder.

## iPhone Photos Import

TikTok reads from the iPhone Photos library, not just the Files app. For phone posting, run:

```bash
npm run import:photos
```

This imports each valid, non-rejected carousel into macOS Photos as an album:

```text
TorqTribe TikTok - <package-slug>
```

If iCloud Photos is enabled on the Mac and iPhone, the slides will sync into the iPhone Photos app and become available in TikTok's photo picker. `npm run sync` also runs this import automatically.
