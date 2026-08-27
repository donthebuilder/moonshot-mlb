create table if not exists public.fantasy_power_rankings (
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  season smallint not null,
  week smallint not null check (week between 1 and 22),
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  rank smallint not null,
  previous_rank smallint,
  power_score numeric(8,2) not null,
  explanation text not null default '',
  generated_at timestamptz not null default now(),
  primary key (league_id,season,week,team_id),
  unique (league_id,season,week,rank)
);

create table if not exists public.fantasy_weekly_awards (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  season smallint not null,
  week smallint not null check (week between 1 and 22),
  award_type text not null check (award_type in ('high_score','closest_win','blowout','player_mvp')),
  team_id uuid references public.fantasy_teams(id) on delete cascade,
  player_id uuid references public.nfl_players(id) on delete set null,
  title text not null,
  detail text not null,
  value numeric(8,2),
  created_at timestamptz not null default now(),
  unique (league_id,season,week,award_type)
);

create table if not exists public.fantasy_weekly_recaps (
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  season smallint not null,
  week smallint not null check (week between 1 and 22),
  headline text not null,
  summary text not null,
  generated_at timestamptz not null default now(),
  primary key (league_id,season,week)
);

alter table public.fantasy_power_rankings enable row level security;
alter table public.fantasy_weekly_awards enable row level security;
alter table public.fantasy_weekly_recaps enable row level security;
create policy "members read power rankings" on public.fantasy_power_rankings for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "members read weekly awards" on public.fantasy_weekly_awards for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "members read weekly recaps" on public.fantasy_weekly_recaps for select to authenticated using (public.is_fantasy_league_member(league_id));

create or replace function public.generate_fantasy_weekly_content(p_league_id uuid,p_season smallint,p_week smallint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_high_team uuid; v_high_score numeric; v_close_team uuid; v_close_margin numeric; v_blowout_team uuid; v_blowout_margin numeric; v_rank_count integer; v_award_count integer;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  if not exists(select 1 from public.fantasy_matchups where league_id=p_league_id and season=p_season and week=p_week and status='final')
    then raise exception 'Finalize at least one matchup before generating the weekly recap'; end if;
  delete from public.fantasy_power_rankings where league_id=p_league_id and season=p_season and week=p_week;
  with team_results as (
    select t.id team_id,
      count(*) filter(where g.pf>g.pa) wins,
      count(*) filter(where g.pf<g.pa) losses,
      count(*) filter(where g.pf=g.pa) ties,
      coalesce(sum(g.pf),0) points_for,
      coalesce(max(g.pf) filter(where g.week=p_week),0) week_score
    from public.fantasy_teams t left join lateral (
      select m.week,case when m.home_team_id=t.id then m.home_score else m.away_score end pf,
        case when m.home_team_id=t.id then m.away_score else m.home_score end pa
      from public.fantasy_matchups m where m.league_id=p_league_id and m.season=p_season and m.week<=p_week
        and m.status='final' and (m.home_team_id=t.id or m.away_team_id=t.id)
    ) g on true where t.league_id=p_league_id group by t.id
  ), scored as (
    select r.*,round((r.wins*25+r.ties*10+r.points_for/greatest(p_week,1)*0.35+r.week_score*0.25)::numeric,2) score
    from team_results r
  ), ordered as (
    select s.*,row_number() over(order by score desc,points_for desc,team_id)::smallint new_rank from scored s
  )
  insert into public.fantasy_power_rankings(league_id,season,week,team_id,rank,previous_rank,power_score,explanation)
    select p_league_id,p_season,p_week,o.team_id,o.new_rank,prev.rank,o.score,
      o.wins||'-'||o.losses||'-'||o.ties||' · '||round(o.points_for,1)||' PF · Week '||p_week||' score '||round(o.week_score,1)
    from ordered o left join public.fantasy_power_rankings prev on prev.league_id=p_league_id and prev.season=p_season and prev.week=p_week-1 and prev.team_id=o.team_id;
  get diagnostics v_rank_count=row_count;

  delete from public.fantasy_weekly_awards where league_id=p_league_id and season=p_season and week=p_week;
  select x.team_id,x.score into v_high_team,v_high_score from (
    select home_team_id team_id,home_score score from public.fantasy_matchups where league_id=p_league_id and season=p_season and week=p_week and status='final'
    union all select away_team_id,away_score from public.fantasy_matchups where league_id=p_league_id and season=p_season and week=p_week and status='final'
  ) x order by x.score desc limit 1;
  insert into public.fantasy_weekly_awards(league_id,season,week,award_type,team_id,title,detail,value)
    values(p_league_id,p_season,p_week,'high_score',v_high_team,'High Score','Set the pace with '||round(v_high_score,2)||' points.',v_high_score);

  select case when home_score>away_score then home_team_id else away_team_id end team_id,abs(home_score-away_score) margin
    into v_close_team,v_close_margin from public.fantasy_matchups where league_id=p_league_id and season=p_season and week=p_week and status='final' and home_score<>away_score
    order by abs(home_score-away_score) asc limit 1;
  if v_close_team is not null then insert into public.fantasy_weekly_awards(league_id,season,week,award_type,team_id,title,detail,value)
    values(p_league_id,p_season,p_week,'closest_win',v_close_team,'Photo Finish','Survived the closest matchup by '||round(v_close_margin,2)||' points.',v_close_margin); end if;

  select case when home_score>away_score then home_team_id else away_team_id end team_id,abs(home_score-away_score) margin
    into v_blowout_team,v_blowout_margin from public.fantasy_matchups where league_id=p_league_id and season=p_season and week=p_week and status='final' and home_score<>away_score
    order by abs(home_score-away_score) desc limit 1;
  if v_blowout_team is not null then insert into public.fantasy_weekly_awards(league_id,season,week,award_type,team_id,title,detail,value)
    values(p_league_id,p_season,p_week,'blowout',v_blowout_team,'Statement Win','Delivered the week''s largest margin at '||round(v_blowout_margin,2)||' points.',v_blowout_margin); end if;

  insert into public.fantasy_weekly_recaps(league_id,season,week,headline,summary)
    select p_league_id,p_season,p_week,t.name||' owns Week '||p_week,
      t.name||' posted the league''s high score at '||round(v_high_score,2)||'. '||
      case when v_close_team is not null then (select name from public.fantasy_teams where id=v_close_team)||' escaped the closest finish, while '||(select name from public.fantasy_teams where id=v_blowout_team)||' delivered the biggest statement.' else 'The week ended without a decided head-to-head margin.' end
    from public.fantasy_teams t where t.id=v_high_team
    on conflict(league_id,season,week) do update set headline=excluded.headline,summary=excluded.summary,generated_at=now();
  select count(*) into v_award_count from public.fantasy_weekly_awards where league_id=p_league_id and season=p_season and week=p_week;
  return jsonb_build_object('rankings',v_rank_count,'awards',v_award_count);
end;
$$;

revoke all on function public.generate_fantasy_weekly_content(uuid,smallint,smallint) from public;
grant execute on function public.generate_fantasy_weekly_content(uuid,smallint,smallint) to authenticated;
