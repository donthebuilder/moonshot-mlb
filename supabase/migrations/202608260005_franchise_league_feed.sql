create table if not exists public.fantasy_feed_posts (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table if not exists public.fantasy_feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.fantasy_feed_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default now()
);

create table if not exists public.fantasy_feed_reactions (
  post_id uuid not null references public.fantasy_feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('fire','trophy','laugh','smart')),
  created_at timestamptz not null default now(),
  primary key (post_id,user_id,reaction)
);

create index if not exists fantasy_feed_posts_league_idx on public.fantasy_feed_posts(league_id,created_at desc);
create index if not exists fantasy_feed_comments_post_idx on public.fantasy_feed_comments(post_id,created_at);

alter table public.fantasy_feed_posts enable row level security;
alter table public.fantasy_feed_comments enable row level security;
alter table public.fantasy_feed_reactions enable row level security;

create policy "members read feed posts" on public.fantasy_feed_posts
for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "members read feed comments" on public.fantasy_feed_comments
for select to authenticated using (exists(
  select 1 from public.fantasy_feed_posts p where p.id=post_id and public.is_fantasy_league_member(p.league_id)
));
create policy "members read feed reactions" on public.fantasy_feed_reactions
for select to authenticated using (exists(
  select 1 from public.fantasy_feed_posts p where p.id=post_id and public.is_fantasy_league_member(p.league_id)
));

create or replace function public.create_fantasy_feed_post(p_league_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_team uuid; v_post uuid; v_body text:=trim(coalesce(p_body,''));
begin
  select id into v_team from public.fantasy_teams where league_id=p_league_id and owner_id=auth.uid();
  if v_team is null then raise exception 'League team required'; end if;
  if char_length(v_body) not between 1 and 500 then raise exception 'Post must be 1 to 500 characters'; end if;
  insert into public.fantasy_feed_posts(league_id,author_id,team_id,body)
    values(p_league_id,auth.uid(),v_team,v_body) returning id into v_post;
  return v_post;
end;
$$;

create or replace function public.comment_fantasy_feed_post(p_post_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_league uuid; v_team uuid; v_comment uuid; v_body text:=trim(coalesce(p_body,''));
begin
  select league_id into v_league from public.fantasy_feed_posts where id=p_post_id;
  select id into v_team from public.fantasy_teams where league_id=v_league and owner_id=auth.uid();
  if v_team is null then raise exception 'League team required'; end if;
  if char_length(v_body) not between 1 and 280 then raise exception 'Comment must be 1 to 280 characters'; end if;
  insert into public.fantasy_feed_comments(post_id,author_id,team_id,body)
    values(p_post_id,auth.uid(),v_team,v_body) returning id into v_comment;
  return v_comment;
end;
$$;

create or replace function public.toggle_fantasy_feed_reaction(p_post_id uuid,p_reaction text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_league uuid;
begin
  select league_id into v_league from public.fantasy_feed_posts where id=p_post_id;
  if v_league is null or not public.is_fantasy_league_member(v_league) then raise exception 'League access required'; end if;
  if p_reaction not in ('fire','trophy','laugh','smart') then raise exception 'Invalid reaction'; end if;
  if exists(select 1 from public.fantasy_feed_reactions where post_id=p_post_id and user_id=auth.uid() and reaction=p_reaction) then
    delete from public.fantasy_feed_reactions where post_id=p_post_id and user_id=auth.uid() and reaction=p_reaction;
    return false;
  end if;
  insert into public.fantasy_feed_reactions(post_id,user_id,reaction) values(p_post_id,auth.uid(),p_reaction);
  return true;
end;
$$;

revoke all on function public.create_fantasy_feed_post(uuid,text) from public;
revoke all on function public.comment_fantasy_feed_post(uuid,text) from public;
revoke all on function public.toggle_fantasy_feed_reaction(uuid,text) from public;
grant execute on function public.create_fantasy_feed_post(uuid,text) to authenticated;
grant execute on function public.comment_fantasy_feed_post(uuid,text) to authenticated;
grant execute on function public.toggle_fantasy_feed_reaction(uuid,text) to authenticated;
