-- T-Rex Runner global leaderboard schema.
-- Reads are public via the anon key; writes are denied at the RLS layer
-- and only happen through /api/submit-score (service role).

create extension if not exists "pgcrypto";

create table if not exists public.scores (
  id           uuid primary key default gen_random_uuid(),
  nickname     text not null check (char_length(nickname) between 3 and 12),
  score        integer not null check (score >= 0 and score <= 99999),
  duration_ms  integer not null check (duration_ms >= 1000),
  input_count  integer not null check (input_count >= 0),
  session_id   text,
  ip_hash      text,
  created_at   timestamptz not null default now()
);

create index if not exists scores_score_desc_created_asc
  on public.scores (score desc, created_at asc);

create index if not exists scores_created_at_desc
  on public.scores (created_at desc);

-- Row-Level Security: anon can read; only service role can insert.
alter table public.scores enable row level security;

drop policy if exists "scores_select_public" on public.scores;
create policy "scores_select_public"
  on public.scores
  for select
  using (true);

-- No insert/update/delete policy → all writes from anon/auth roles are denied.
-- Service role bypasses RLS, so /api/submit-score still works.

-- Optional realtime publication: enable INSERT events for the channel
-- subscribed to in src/leaderboard.js.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'scores'
  ) then
    alter publication supabase_realtime add table public.scores;
  end if;
end $$;
