create or replace function public.delete_fantasy_league(p_league_id uuid,p_confirmation text)
returns void language plpgsql security definer set search_path=public as $$
declare v_league public.fantasy_leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into v_league from public.fantasy_leagues where id=p_league_id for update;
  if not found or v_league.commissioner_id<>auth.uid() then raise exception 'Commissioner access required'; end if;
  if trim(coalesce(p_confirmation,''))<>v_league.name then raise exception 'Type the league name exactly to confirm'; end if;
  delete from public.fantasy_leagues where id=p_league_id;
end;
$$;

revoke all on function public.delete_fantasy_league(uuid,text) from public;
grant execute on function public.delete_fantasy_league(uuid,text) to authenticated;
