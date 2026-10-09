-- X POLLS BACK + FUN FORMATS (2026-10-09, X overhaul stage 3 piece 2). RUN THIS BEFORE THE CODE SHIPS.
--
-- homer_feed_posts holds one row per scheduled post, (day, kind). The new poll kinds carry the sport
-- (MLB bare, the others prefixed, like nfl_board / nhl_longshots):
--     poll_pick poll_over poll_guess poll_streak poll_board poll_result          (MLB)
--     nfl_poll_*  nhl_poll_*  nba_poll_*                                          (same six each)
-- Without them in the kind whitelist the claim is refused (Postgres 23514) and the poll silently
-- never posts. The whitelist is APPENDED to, not retyped (the live definition is read and the
-- pattern OR'd onto it, so no kind added by an earlier widen can be lost). Idempotent.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  if position('poll_(pick|over|guess|streak|board|result)' in d) = 0 then
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
      || regexp_replace(d, '^CHECK ', '')
      || ') or kind ~ ''^((nfl|nhl|nba)_)?poll_(pick|over|guess|streak|board|result)$'')';
  end if;
end $$;

-- PROBES (run after):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect the old list ... OR (kind ~ '^((nfl|nhl|nba)_)?poll_(pick|over|guess|streak|board|result)$'::text)
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'nfl_poll_result', '{}');   -- expect OK
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind = 'nfl_poll_result';                -- expect DELETE 1
