# TorqTribe Social Agent

TikTok-first publishing operator for Codex-generated TorqTribe social posts.

Codex creates the creative package. This project imports it, syncs it to Supabase, lets you approve it from a dashboard, and sends approved TikTok photo carousels to TikTok using `MEDIA_UPLOAD`.

## Workflow

1. Ask Codex to create a TikTok carousel package in `inbox/<slug>/`.
2. Run `npm run scan` to validate local packages.
3. Run `npm run sync` to upload package metadata and media to the social Supabase project.
4. Open the hosted dashboard, review the post, and approve it.
5. Click "Send to TikTok" in the dashboard.
6. Finish the post inside TikTok after TikTok receives the media-upload inbox item.

## Local Setup

```bash
npm run worker -- init
cp .env.local.example .env.local
npm run scan
npm run sync
```

Required local `.env.local` values:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SOCIAL_OWNER_USER_ID=
```

The service role key stays only on your Mac. It is used by the local worker to upload media and create rows.

## Dashboard

The static dashboard lives in `apps/dashboard`. GitHub Pages builds `config.js` from repo variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

For local dashboard testing:

```bash
cp apps/dashboard/config.example.js apps/dashboard/config.js
npm run serve:dashboard
```

Then open `http://127.0.0.1:4177`.

## TikTok

V1 uses TikTok `MEDIA_UPLOAD`, not Direct Post. The dashboard sends the carousel to TikTok, then you complete the final publish step in TikTok.

TikTok Edge Function secrets:

```text
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=
SOCIAL_DASHBOARD_URL=
```

