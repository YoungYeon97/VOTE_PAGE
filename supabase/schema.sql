create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.app_config (
  id boolean primary key default true check (id),
  title text not null default '우리의 투표',
  starts_at timestamptz not null,
  max_votes_per_voter integer not null check (max_votes_per_voter > 0 and max_votes_per_voter <= 20),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidates (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null default '',
  display_order integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.voter_codes (
  id bigint generated always as identity primary key,
  code text not null unique,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ballots (
  id bigint generated always as identity primary key,
  voter_code_id bigint not null unique references public.voter_codes (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.ballot_selections (
  ballot_id bigint not null references public.ballots (id) on delete cascade,
  candidate_id bigint not null references public.candidates (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (ballot_id, candidate_id)
);

create or replace function public.touch_app_config_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_app_config_updated_at on public.app_config;

create trigger touch_app_config_updated_at
before update on public.app_config
for each row
execute function public.touch_app_config_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

create or replace function public.has_admin_users()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users);
$$;

create or replace function public.bootstrap_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if exists (select 1 from public.admin_users where user_id = auth.uid()) then
    return true;
  end if;

  if exists (select 1 from public.admin_users) then
    raise exception '이미 관리자가 등록되어 있습니다.';
  end if;

  insert into public.admin_users (user_id)
  values (auth.uid());

  return true;
end;
$$;

create or replace function public.submit_vote(code_input text, candidate_ids_input bigint[])
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  config_row public.app_config%rowtype;
  voter_code_row public.voter_codes%rowtype;
  clean_candidate_ids bigint[];
  existing_candidate_count integer;
  ballot_id bigint;
begin
  if code_input is null or btrim(code_input) = '' then
    raise exception '참여코드를 입력해 주세요.';
  end if;

  select *
  into config_row
  from public.app_config
  where id = true;

  if not found then
    raise exception '투표가 아직 설정되지 않았습니다.';
  end if;

  if now() < config_row.starts_at then
    raise exception '투표 공개 시간 전입니다.';
  end if;

  select array_agg(candidate_id order by candidate_id)
  into clean_candidate_ids
  from (
    select distinct unnest(candidate_ids_input) as candidate_id
  ) deduped;

  if clean_candidate_ids is null or cardinality(clean_candidate_ids) = 0 then
    raise exception '최소 1명의 후보를 선택해 주세요.';
  end if;

  if cardinality(clean_candidate_ids) <> cardinality(candidate_ids_input) then
    raise exception '같은 후보를 중복 선택할 수 없습니다.';
  end if;

  if cardinality(clean_candidate_ids) > config_row.max_votes_per_voter then
    raise exception '최대 %명까지 선택할 수 있습니다.', config_row.max_votes_per_voter;
  end if;

  select count(*)
  into existing_candidate_count
  from public.candidates
  where id = any(clean_candidate_ids);

  if existing_candidate_count <> cardinality(clean_candidate_ids) then
    raise exception '존재하지 않는 후보가 포함되어 있습니다.';
  end if;

  select *
  into voter_code_row
  from public.voter_codes
  where upper(code) = upper(btrim(code_input));

  if not found then
    raise exception '유효하지 않은 참여코드입니다.';
  end if;

  if voter_code_row.used_at is not null then
    raise exception '이미 사용된 참여코드입니다.';
  end if;

  insert into public.ballots (voter_code_id)
  values (voter_code_row.id)
  returning id into ballot_id;

  insert into public.ballot_selections (ballot_id, candidate_id)
  select ballot_id, unnest(clean_candidate_ids);

  update public.voter_codes
  set used_at = now()
  where id = voter_code_row.id;

  return ballot_id;
exception
  when unique_violation then
    raise exception '이미 사용된 참여코드입니다.';
end;
$$;

create or replace function public.get_candidate_results()
returns table (
  candidate_id bigint,
  candidate_name text,
  description text,
  display_order integer,
  vote_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  return query
  select
    c.id as candidate_id,
    c.name as candidate_name,
    c.description,
    c.display_order,
    count(bs.ballot_id)::integer as vote_count
  from public.candidates c
  left join public.ballot_selections bs
    on c.id = bs.candidate_id
  group by c.id, c.name, c.description, c.display_order
  order by c.display_order asc, c.id asc;
end;
$$;

grant usage on schema public to anon, authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.app_config to anon, authenticated;
grant select on public.candidates to anon, authenticated;
grant select, insert, update, delete on public.app_config to authenticated;
grant select, insert, update, delete on public.candidates to authenticated;
grant select, insert, update, delete on public.voter_codes to authenticated;
grant select on public.ballots to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_admin_users() to authenticated;
grant execute on function public.bootstrap_admin() to authenticated;
grant execute on function public.get_candidate_results() to authenticated;
grant execute on function public.submit_vote(text, bigint[]) to anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.app_config enable row level security;
alter table public.candidates enable row level security;
alter table public.voter_codes enable row level security;
alter table public.ballots enable row level security;
alter table public.ballot_selections enable row level security;

drop policy if exists "Public can read config" on public.app_config;
create policy "Public can read config"
on public.app_config
for select
using (true);

drop policy if exists "Admins manage config" on public.app_config;
create policy "Admins manage config"
on public.app_config
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public can read candidates" on public.candidates;
create policy "Public can read candidates"
on public.candidates
for select
using (true);

drop policy if exists "Admins manage candidates" on public.candidates;
create policy "Admins manage candidates"
on public.candidates
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins read admin users" on public.admin_users;
create policy "Admins read admin users"
on public.admin_users
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins manage voter codes" on public.voter_codes;
create policy "Admins manage voter codes"
on public.voter_codes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins read ballots" on public.ballots;
create policy "Admins read ballots"
on public.ballots
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins read ballot selections" on public.ballot_selections;
create policy "Admins read ballot selections"
on public.ballot_selections
for select
to authenticated
using (public.is_admin());
