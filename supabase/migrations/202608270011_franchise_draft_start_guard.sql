create or replace function public.start_fantasy_draft(p_league_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_draft public.fantasy_drafts%rowtype;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  select * into v_draft from public.fantasy_drafts where league_id=p_league_id for update;
  if not found then raise exception 'Prepare the draft order first'; end if;
  if v_draft.status<>'setup' then raise exception 'The draft has already started'; end if;
  if not exists(select 1 from public.fantasy_draft_picks where draft_id=v_draft.id) then raise exception 'The draft board is empty'; end if;
  update public.fantasy_drafts set status='live',current_overall_pick=1,started_at=now(),
    pick_deadline=now()+make_interval(secs=>timer_seconds) where id=v_draft.id;
  update public.fantasy_leagues set status='drafting' where id=p_league_id;
  return v_draft.id;
end;
$$;

revoke all on function public.start_fantasy_draft(uuid) from public;
grant execute on function public.start_fantasy_draft(uuid) to authenticated;
