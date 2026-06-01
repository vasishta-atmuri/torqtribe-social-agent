alter table public.social_posts drop constraint if exists social_posts_status_check;

alter table public.social_posts add constraint social_posts_status_check
check (status in ('needs_review', 'approved', 'ready_to_post', 'scheduled_manually', 'published_manually', 'rejected'));

