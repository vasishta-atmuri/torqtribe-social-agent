# TorqTribe Social Agent

TikTok-first publishing operator for Codex-generated TorqTribe social posts.

Codex creates the creative package. This project imports it, syncs it to Supabase, lets you approve it from a dashboard, and gives you a manual publishing kit for TikTok photo carousels.

## Workflow

1. Ask Codex to create a TikTok carousel package in `inbox/<slug>/`.
2. Run `npm run scan` to validate local packages.
3. Run `npm run sync` to upload package metadata and media to Supabase.
4. Open the hosted dashboard, review the post, and approve it.
5. Copy the caption and open/download the carousel slides.
6. Post the photo carousel manually in TikTok.
7. Mark the post as scheduled or published in the dashboard.

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

For the pilot, this project uses the existing TorqTribe Supabase project with isolated `social_*` tables and Edge Functions. A separate Supabase project can be restored later if the workflow gets traction.

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

The dashboard supports both Supabase magic-link login and password login. If emails do not arrive, create or update your admin user password in Supabase Auth, then use "Sign In With Password."

If the sign-in screen appears to do nothing, hard refresh the dashboard so GitHub Pages loads the newest JavaScript. The login panel now shows inline status messages for "signing in", Supabase auth errors, and successful post loading.

## TikTok

V1 is manual because TikTok API access requires a developer app. The dashboard prepares the carousel kit: slide links, caption copy, and status tracking. API publishing can be restored later if TikTok access becomes available.
