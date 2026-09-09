create or replace function public.update_fantasy_league_settings(p_league_id uuid,p_settings jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_league public.fantasy_leagues%rowtype; v_name text;
begin
  select * into v_league from public.fantasy_leagues where id=p_league_id for update;
  if not found or v_league.commissioner_id<>auth.uid() then raise exception 'Commissioner access required'; end if;
  v_name:=trim(coalesce(p_settings->>'name',v_league.name));
  if char_length(v_name) not between 1 and 60 then raise exception 'League name must be 1 to 60 characters'; end if;
  if v_league.status<>'setup' and (
    coalesce((p_settings->>'team_count')::smallint,v_league.team_count)<>v_league.team_count or
    coalesce(p_settings->>'scoring',v_league.scoring)<>v_league.scoring or
    coalesce((p_settings->>'has_kicker')::boolean,v_league.has_kicker)<>v_league.has_kicker or
    coalesce((p_settings->>'has_defense')::boolean,v_league.has_defense)<>v_league.has_defense or
    coalesce((p_settings->>'ir_slots')::smallint,v_league.ir_slots)<>v_league.ir_slots or
    coalesce((p_settings->>'draft_timer_seconds')::smallint,v_league.draft_timer_seconds)<>v_league.draft_timer_seconds or
    coalesce(p_settings->>'draft_order_method',v_league.draft_order_method)<>v_league.draft_order_method
  ) then raise exception 'Structural settings lock when the draft starts'; end if;
  update public.fantasy_leagues set name=v_name,
    team_count=coalesce((p_settings->>'team_count')::smallint,team_count),
    scoring=coalesce(p_settings->>'scoring',scoring),
    has_kicker=coalesce((p_settings->>'has_kicker')::boolean,has_kicker),
    has_defense=coalesce((p_settings->>'has_defense')::boolean,has_defense),
    ir_slots=coalesce((p_settings->>'ir_slots')::smallint,ir_slots),
    draft_timer_seconds=coalesce((p_settings->>'draft_timer_seconds')::smallint,draft_timer_seconds),
    draft_order_method=coalesce(p_settings->>'draft_order_method',draft_order_method)
    where id=p_league_id;
end;
$$;

create or replace function public.regenerate_fantasy_invite_code(p_league_id uuid)
returns text language plpgsql security definer set search_path=public as $$
declare v_code text;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  v_code:=upper(encode(gen_random_bytes(4),'hex'));
  update public.fantasy_leagues set invite_code=v_code where id=p_league_id;
  return v_code;
end;
$$;

revoke all on function public.update_fantasy_league_settings(uuid,jsonb) from public;
revoke all on function public.regenerate_fantasy_invite_code(uuid) from public;
grant execute on function public.update_fantasy_league_settings(uuid,jsonb) to authenticated;
grant execute on function public.regenerate_fantasy_invite_code(uuid) to authenticated;
