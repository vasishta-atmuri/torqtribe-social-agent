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
