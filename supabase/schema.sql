create extension if not exists pgcrypto;

drop view if exists public.candidate_results;
drop table if exists public.admin_users cascade;

drop function if exists public.is_admin();
drop function if exists public.has_admin_users();
drop function if exists public.bootstrap_admin();
drop function if exists public.get_candidate_results();
drop function if exists public.verify_admin_password(text);
drop function if exists public.get_admin_dashboard(text);
drop function if exists public.save_admin_config(text, text, timestamptz, integer);
drop function if exists public.replace_candidates(text, jsonb);
drop function if exists public.create_voter_codes(text, text[]);
drop function if exists public.admin_password_matches(text);

create table if not exists public.admin_settings (
  id boolean primary key default true check (id),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

insert into public.admin_settings (id, password_hash)
values (true, crypt('1111', gen_salt('bf')))
on conflict (id) do nothing;

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

create or replace function public.admin_password_matches(admin_password text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_settings
    where id = true
      and password_hash = crypt(coalesce(admin_password, ''), password_hash)
  );
$$;

create or replace function public.verify_admin_password(admin_password text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.admin_password_matches(admin_password);
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

create or replace function public.get_admin_dashboard(admin_password text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  if not public.admin_password_matches(admin_password) then
    raise exception '관리자 비밀번호가 올바르지 않습니다.';
  end if;

  select jsonb_build_object(
    'config',
    (
      select to_jsonb(ac)
      from public.app_config ac
      where ac.id = true
    ),
    'candidates',
    coalesce(
      (
        select jsonb_agg(to_jsonb(candidate_rows) order by candidate_rows.display_order, candidate_rows.id)
        from (
          select id, name, description, display_order
          from public.candidates
          order by display_order asc, id asc
        ) candidate_rows
      ),
      '[]'::jsonb
    ),
    'codes',
    coalesce(
      (
        select jsonb_agg(to_jsonb(code_rows) order by code_rows.created_at desc)
        from (
          select id, code, used_at, created_at
          from public.voter_codes
          order by created_at desc
          limit 100
        ) code_rows
      ),
      '[]'::jsonb
    ),
    'results',
    coalesce(
      (
        select jsonb_agg(to_jsonb(result_rows) order by result_rows.display_order, result_rows.candidate_id)
        from (
          select
            c.id as candidate_id,
            c.name as candidate_name,
            c.description,
            c.display_order,
            count(bs.ballot_id)::integer as vote_count
          from public.candidates c
          left join public.ballot_selections bs
            on bs.candidate_id = c.id
          group by c.id, c.name, c.description, c.display_order
          order by c.display_order asc, c.id asc
        ) result_rows
      ),
      '[]'::jsonb
    ),
    'ballot_count',
    (
      select count(*)::integer
      from public.ballots
    )
  )
  into payload;

  return payload;
end;
$$;

create or replace function public.save_admin_config(
  admin_password text,
  title_input text,
  starts_at_input timestamptz,
  max_votes_input integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_password_matches(admin_password) then
    raise exception '관리자 비밀번호가 올바르지 않습니다.';
  end if;

  if title_input is null or btrim(title_input) = '' then
    raise exception '투표 제목을 입력해 주세요.';
  end if;

  if starts_at_input is null then
    raise exception '공개 시작 시각을 입력해 주세요.';
  end if;

  if max_votes_input is null or max_votes_input < 1 or max_votes_input > 20 then
    raise exception '최대 선택 수는 1 이상 20 이하만 가능합니다.';
  end if;

  if exists (select 1 from public.ballots) then
    raise exception '이미 투표가 들어와 기본 설정을 변경할 수 없습니다.';
  end if;

  insert into public.app_config (id, title, starts_at, max_votes_per_voter)
  values (true, btrim(title_input), starts_at_input, max_votes_input)
  on conflict (id) do update
  set
    title = excluded.title,
    starts_at = excluded.starts_at,
    max_votes_per_voter = excluded.max_votes_per_voter;

  return true;
end;
$$;

create or replace function public.replace_candidates(admin_password text, candidates_input jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if not public.admin_password_matches(admin_password) then
    raise exception '관리자 비밀번호가 올바르지 않습니다.';
  end if;

  if jsonb_typeof(candidates_input) <> 'array' then
    raise exception '후보 목록 형식이 올바르지 않습니다.';
  end if;

  if exists (select 1 from public.ballots) then
    raise exception '이미 투표가 들어와 후보를 변경할 수 없습니다.';
  end if;

  delete from public.candidates;

  insert into public.candidates (name, description, display_order)
  select
    btrim(coalesce(candidate_value->>'name', '')),
    btrim(coalesce(candidate_value->>'description', '')),
    ordinality::integer
  from jsonb_array_elements(candidates_input) with ordinality as items(candidate_value, ordinality)
  where btrim(coalesce(candidate_value->>'name', '')) <> '';

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    raise exception '최소 1명의 후보를 입력해 주세요.';
  end if;

  return true;
end;
$$;

create or replace function public.create_voter_codes(admin_password text, codes_input text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  if not public.admin_password_matches(admin_password) then
    raise exception '관리자 비밀번호가 올바르지 않습니다.';
  end if;

  if codes_input is null or cardinality(codes_input) = 0 then
    raise exception '생성할 참여코드가 없습니다.';
  end if;

  insert into public.voter_codes (code)
  select distinct upper(btrim(code_value))
  from unnest(codes_input) as code_value
  where btrim(code_value) <> '';

  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    raise exception '생성할 참여코드가 없습니다.';
  end if;

  return inserted_count;
end;
$$;

grant usage on schema public to anon, authenticated;
grant select on public.app_config to anon, authenticated;
grant select on public.candidates to anon, authenticated;
grant execute on function public.verify_admin_password(text) to anon, authenticated;
grant execute on function public.get_admin_dashboard(text) to anon, authenticated;
grant execute on function public.save_admin_config(text, text, timestamptz, integer) to anon, authenticated;
grant execute on function public.replace_candidates(text, jsonb) to anon, authenticated;
grant execute on function public.create_voter_codes(text, text[]) to anon, authenticated;
grant execute on function public.submit_vote(text, bigint[]) to anon, authenticated;

alter table public.admin_settings enable row level security;
alter table public.app_config enable row level security;
alter table public.candidates enable row level security;
alter table public.voter_codes enable row level security;
alter table public.ballots enable row level security;
alter table public.ballot_selections enable row level security;

drop policy if exists "Admins manage config" on public.app_config;
drop policy if exists "Public can read config" on public.app_config;
drop policy if exists "Admins manage candidates" on public.candidates;
drop policy if exists "Public can read candidates" on public.candidates;
drop policy if exists "Admins manage voter codes" on public.voter_codes;
drop policy if exists "Admins read ballots" on public.ballots;
drop policy if exists "Admins read ballot selections" on public.ballot_selections;

create policy "Public can read config"
on public.app_config
for select
using (true);

create policy "Public can read candidates"
on public.candidates
for select
using (true);
