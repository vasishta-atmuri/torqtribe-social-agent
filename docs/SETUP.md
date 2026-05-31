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

`SOCIAL_OWNER_USER_ID` is your Supabase Auth user id for the social project.

## 2. Configure dashboard variables in GitHub

Repository variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 3. Configure Supabase Edge Function secrets

```bash
supabase secrets set TIKTOK_CLIENT_KEY=...
supabase secrets set TIKTOK_CLIENT_SECRET=...
supabase secrets set TIKTOK_REDIRECT_URI=...
supabase secrets set SOCIAL_DASHBOARD_URL=...
```

## 4. TikTok redirect URI

Set TikTok's redirect URI to:

```text
https://<project-ref>.supabase.co/functions/v1/social-tiktok-auth-callback
```

