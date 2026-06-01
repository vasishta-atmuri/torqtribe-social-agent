create extension if not exists pgcrypto;

create table if not exists public.social_posts (
  id uuid primary key default gen_random_uuid(),
  source_package_id text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform = 'tiktok'),
  format text not null check (format = 'photo_carousel'),
  title text not null,
  caption text not null,
  hashtags text[] not null default '{}',
  cover_index integer not null default 0,
  media_count integer not null default 0,
  status text not null default 'needs_review' check (status in ('needs_review', 'approved', 'ready_to_post', 'scheduled_manually', 'published_manually', 'rejected')),
  remote_publish_id text,
  remote_url text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_media_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  sort_order integer not null,
  original_filename text not null,
  storage_bucket text not null,
  storage_path text not null,
  public_url text not null,
  mime_type text not null,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  unique (post_id, sort_order)
);

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform = 'tiktok'),
  provider_account_id text not null,
  display_name text,
  access_token text not null,
  refresh_token text,
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, platform, provider_account_id)
);

create table if not exists public.social_oauth_states (
  state text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform = 'tiktok'),
  redirect_to text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.social_publish_attempts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform = 'tiktok'),
  mode text not null default 'MEDIA_UPLOAD',
  status text not null check (status in ('started', 'succeeded', 'failed')),
  request_json jsonb,
  response_json jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists social_posts_set_updated_at on public.social_posts;
create trigger social_posts_set_updated_at
before update on public.social_posts
for each row execute function public.set_updated_at();

drop trigger if exists social_accounts_set_updated_at on public.social_accounts;
create trigger social_accounts_set_updated_at
before update on public.social_accounts
for each row execute function public.set_updated_at();

alter table public.social_posts enable row level security;
alter table public.social_media_assets enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_oauth_states enable row level security;
alter table public.social_publish_attempts enable row level security;

drop policy if exists "Users can read own social posts" on public.social_posts;
create policy "Users can read own social posts"
on public.social_posts for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "Users can update own social posts" on public.social_posts;
create policy "Users can update own social posts"
on public.social_posts for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check
check (status in ('needs_review', 'approved', 'ready_to_post', 'scheduled_manually', 'published_manually', 'rejected'));

drop policy if exists "Users can read own social media assets" on public.social_media_assets;
create policy "Users can read own social media assets"
on public.social_media_assets for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists "Users can read own publish attempts" on public.social_publish_attempts;
create policy "Users can read own publish attempts"
on public.social_publish_attempts for select
to authenticated
using (owner_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tiktok-carousel-media',
  'tiktok-carousel-media',
  true,
  15728640,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read TikTok carousel media" on storage.objects;
create policy "Public can read TikTok carousel media"
on storage.objects for select
to public
using (bucket_id = 'tiktok-carousel-media');
