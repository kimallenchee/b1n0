-- Comments table for event discussions
create table if not exists public.comments (
  id          uuid        primary key default gen_random_uuid(),
  event_id    text        not null,
  parent_id   uuid        references public.comments(id) on delete cascade,
  user_id     uuid        references auth.users(id) on delete set null,
  username    text        not null,
  text        text        not null,
  side        text        check (side in ('yes', 'no')),
  likes       integer     not null default 0,
  dislikes    integer     not null default 0,
  tier        smallint    not null default 1,
  created_at  timestamptz not null default now()
);

create index if not exists comments_event_id_idx  on public.comments(event_id);
create index if not exists comments_parent_id_idx on public.comments(parent_id);

alter table public.comments enable row level security;

create policy "read_comments"   on public.comments for select using (auth.role() = 'authenticated');
create policy "insert_comments" on public.comments for insert with check (auth.uid() = user_id);
create policy "update_votes"    on public.comments for update using (auth.role() = 'authenticated');
create policy "delete_own_comments" on public.comments for delete using (auth.uid() = user_id);
