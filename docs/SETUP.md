# Setup

## 1. Create local config

```bash
cp .env.local.example .env.local
```

Fill in:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SOCIAL_OWNER_USER_ID`

`SOCIAL_OWNER_USER_ID` is your Supabase Auth user id in the existing TorqTribe Supabase project.

## 2. Configure dashboard variables in GitHub

Repository variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 3. Sign in to the dashboard

The dashboard supports two Supabase Auth methods:

- Magic link: easiest when Supabase email delivery works.
- Password login: recommended fallback if magic links do not arrive.

To use password login, open Supabase Dashboard > Authentication > Users, create or select your admin user, and set a password. Then sign in on the dashboard with that email and password.

## 4. Manual TikTok publishing

TikTok API publishing is disabled in V1 because it requires a TikTok developer app. Use the dashboard to approve a kit, copy the caption, open/download slides, and mark the post as scheduled or published after uploading it in TikTok.

## Supabase Project Choice

For the pilot, this project uses the existing TorqTribe Supabase project to avoid an extra monthly project cost. The social tables are isolated with `social_*` names and RLS.
