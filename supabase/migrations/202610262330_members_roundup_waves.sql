-- #MEMBERS ROUNDUP BEFORE THE GAMES (2026-10-26): the first roundup is still members_roundup_<sport>; games that lock later get a follow-up,
-- members_roundup_<sport>_2 .. _6 (lib/dash/membersFolds.js postRoundup). Widens the kind check by one OR. Safe to re-run.
do $$
declare def text; tail text := '';
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.homer_feed_posts'::regclass and conname = 'homer_feed_posts_kind_check';
  if def is null or position('members_roundup_(nhl|nfl|nba)_[2-6]' in def) > 0 then return; end if;
  -- the stored rule ends "... )) NOT VALID": keep that suffix, add the OR inside the last parenthesis
  if def ~ '\s+NOT VALID\s*$' then tail := ' NOT VALID'; def := regexp_replace(def, '\s+NOT VALID\s*$', ''); end if;
  execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
  execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check '
    || regexp_replace(def, '\)\s*$', $r$ OR (kind ~ '^members_roundup_(nhl|nfl|nba)_[2-6]$'::text))$r$) || tail;
end $$;
