-- homer_feed_posts: allow kind 'receipt' (THE NIGHT RECEIPT, X overhaul stage 3 piece 5, 2026-10-09).
--
-- THE NIGHT RECEIPT is one cross-sport post the morning after that grades the day's named players (the Slate's
-- and the write-ups'), and replaces accountability + recap + board_results. Its claim row is (day, 'receipt') in
-- homer_feed_posts; a night where nobody cashed keeps a 'skipped' row (the counts the weekly / monthly total).
-- Until this runs, the claim fails the kind check (Postgres 23514) and the receipt cannot post. The old kinds
-- (accountability, recap, board_results, weekly, monthly ...) stay in the check on purpose: their history rows
-- remain valid. 'weekly' and 'monthly' are already in the check.
--
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS (CLAUDE.md: SQL first), then run the PROBES. Idempotent.
-- Appends one alternative to the LIVE constraint (does not restate the list), like
-- 202610091400_homer_feed_posts_kind_slate.sql did for 'slate'. Run that one first if it has not run.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  if position('''receipt''' in d) = 0 then
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
      || regexp_replace(d, '^CHECK ', '')
      || ') or kind = ''receipt'')';
  end if;
end $$;

-- PROBES (run after):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect the old list ... OR (kind = 'slate'::text) OR (kind = 'receipt'::text)
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'receipt', '{}');   -- expect OK
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind = 'receipt';                  -- expect DELETE 1
