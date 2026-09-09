create or replace function public.set_fantasy_draft_state(p_league_id uuid, p_state text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  if p_state not in ('live','paused') then raise exception 'Invalid draft state'; end if;
  select * into v_draft from public.fantasy_drafts where league_id = p_league_id for update;
  if not found or v_draft.status not in ('live','paused') then raise exception 'The draft cannot be paused or resumed right now'; end if;
  update public.fantasy_drafts set status = p_state,
    pick_deadline = case when p_state = 'live' then now() + make_interval(secs => timer_seconds) else null end
  where id = v_draft.id;
  return p_state;
end;
$$;

revoke all on function public.set_fantasy_draft_state(uuid,text) from public;
grant execute on function public.set_fantasy_draft_state(uuid,text) to authenticated;
