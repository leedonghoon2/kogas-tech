-- =====================================================================
-- 위험물 창고 재고관리 - 초기 스키마
--
-- 재고(current_stock)는 클라이언트가 직접 수정할 수 없고, 아래 함수를 통해서만
-- 변경됩니다. 각 함수는 품목 행을 잠근(FOR UPDATE) 뒤 재고를 갱신하고 수불 기록을
-- 남기므로, 동시에 여러 명이 불출해도 재고가 음수가 되지 않습니다.
--
--   issue_item          불출 (재고 차감 + 불출대장 기록)
--   receive_item        입고 (재고 증가 + 입고 기록)
--   adjust_stock        재고조정 (실사 결과 반영, 관리자)
--   cancel_transaction  입고/불출 취소 (역분개 기록)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 사용자 프로필
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null default '',
  full_name   text not null default '',
  department  text not null default '',
  -- admin: 관리자, staff: 일반 사용자(입고/불출), pending: 승인 대기
  role        text not null default 'pending' check (role in ('admin', 'staff', 'pending')),
  created_at  timestamptz not null default now()
);

-- 가입 시 프로필 자동 생성. 시스템 최초 가입자만 관리자, 이후 가입자는 승인 대기.
-- (관리자 계정이 모두 삭제돼도 다음 가입자가 자동으로 관리자가 되지 않습니다. 복구는 README 참고)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := 'pending';
begin
  -- 동시에 여러 명이 가입해도 관리자는 한 명만 생기도록 직렬화
  perform pg_advisory_xact_lock(hashtext('public.handle_new_user'));
  if not exists (select 1 from public.profiles) then
    v_role := 'admin';
  end if;

  insert into public.profiles (id, email, full_name, department, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'department', ''),
    v_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 권한 확인 함수 (RLS 재귀를 피하기 위해 security definer)
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() in ('admin', 'staff'), false)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

-- ---------------------------------------------------------------------
-- 품목 (재고 마스터)
-- ---------------------------------------------------------------------
create table public.items (
  id              bigint generated always as identity primary key,
  code            text unique,                         -- 품목코드 (선택)
  name            text not null check (length(trim(name)) > 0),
  hazard_class    text not null default '기타'
                  check (hazard_class in ('제1류', '제2류', '제3류', '제4류', '제5류', '제6류', '기타')),
  hazard_name     text not null default '',            -- 위험물 품명 (예: 제1석유류, 알코올류)
  cas_no          text not null default '',
  un_no           text not null default '',
  spec            text not null default '',            -- 규격/용기 (예: 18L 캔)
  unit            text not null default 'L',
  designated_qty  numeric(14, 3) check (designated_qty is null or (designated_qty > 0 and designated_qty <> 'NaN')), -- 지정수량
  location        text not null default '',            -- 보관위치
  safety_stock    numeric(14, 3) not null default 0 check (safety_stock >= 0 and safety_stock <> 'NaN'),
  current_stock   numeric(14, 3) not null default 0 check (current_stock >= 0 and current_stock <> 'NaN'),
  note            text not null default '',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- 사용중지 품목에는 재고가 남아 있을 수 없다 (취소·재고조정 등 모든 경로에 적용)
  constraint items_inactive_no_stock check (is_active or current_stock = 0)
);

create index items_name_idx on public.items (name);

create or replace function public.items_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 재고가 남아 있는 위험물이 현황·지정수량 배수에서 빠지지 않도록 사용중지를 막는다
  if old.is_active and not new.is_active and new.current_stock > 0 then
    raise exception '재고가 남아 있는 품목은 사용중지할 수 없습니다. (현재 % %) 재고를 모두 불출하거나 재고조정 후 사용중지하세요.',
      trim_scale(new.current_stock), new.unit;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_before_update
  before update on public.items
  for each row execute function public.items_before_update();

-- ---------------------------------------------------------------------
-- 수불 기록 (입고/불출/조정/취소 원장)
-- ---------------------------------------------------------------------
create table public.transactions (
  id               bigint generated always as identity primary key,
  item_id          bigint not null references public.items (id),
  -- INIT: 기초재고, IN: 입고, OUT: 불출, ADJUST: 재고조정, CANCEL: 취소
  tx_type          text not null check (tx_type in ('INIT', 'IN', 'OUT', 'ADJUST', 'CANCEL')),
  quantity         numeric(14, 3) not null check (quantity > 0 and quantity <> 'NaN'),  -- 입력 수량 (항상 양수)
  delta            numeric(14, 3) not null check (delta <> 'NaN'),  -- 재고 증감 (부호 포함)
  balance_after    numeric(14, 3) not null check (balance_after >= 0 and balance_after <> 'NaN'),
  tx_date          date not null default ((now() at time zone 'Asia/Seoul')::date),
  department       text not null default '',  -- 사용부서 (불출)
  receiver         text not null default '',  -- 사용자/수령자 (불출)
  purpose          text not null default '',  -- 사용목적 (불출) / 사유 (조정·취소)
  use_place        text not null default '',  -- 사용장소 (불출)
  supplier         text not null default '',  -- 입고처 (입고)
  lot_no           text not null default '',  -- 로트번호 (입고)
  note             text not null default '',
  ref_tx_id        bigint references public.transactions (id),  -- 취소 대상 원거래
  canceled         boolean not null default false,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name  text not null default '',
  created_at       timestamptz not null default now()
);

create index transactions_item_idx on public.transactions (item_id, id desc);
create index transactions_type_date_idx on public.transactions (tx_type, tx_date desc);
create index transactions_date_idx on public.transactions (tx_date desc);

create or replace function public.current_user_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- 이름은 사용자가 바꿀 수 있으므로, 바꿀 수 없는 이메일 아이디를 함께 기록한다
  select case
           when full_name <> '' then full_name || ' (' || split_part(email, '@', 1) || ')'
           else email
         end
  from public.profiles where id = auth.uid()
$$;

-- 품목 등록 시 입력한 현재 재고를 기초재고(INIT)로 기록
create or replace function public.record_initial_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.current_stock > 0 then
    insert into public.transactions
      (item_id, tx_type, quantity, delta, balance_after, purpose, created_by, created_by_name)
    values
      (new.id, 'INIT', new.current_stock, new.current_stock, new.current_stock,
       '기초재고 등록', auth.uid(), coalesce(public.current_user_name(), ''));
  end if;
  return new;
end;
$$;

create trigger items_record_initial_stock
  after insert on public.items
  for each row execute function public.record_initial_stock();

-- ---------------------------------------------------------------------
-- 입력값 검증
-- ---------------------------------------------------------------------
-- 수량: NULL·NaN·음수·0(허용 시 제외)·너무 큰 값 거부, 소수점 3자리로 반올림
create or replace function public.valid_qty(p_value numeric, p_label text, p_allow_zero boolean default false)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  -- numeric 의 NaN 은 모든 수보다 크게 취급되어 '<= 0' 검사를 통과하므로 따로 막는다
  if p_value is null or p_value = 'NaN'::numeric then
    raise exception '%: 올바른 숫자를 입력하세요.', p_label;
  end if;
  v := round(p_value, 3);
  if v < 0 or (v = 0 and not p_allow_zero) then
    raise exception '%: %', p_label, case when p_allow_zero then '0 이상이어야 합니다.' else '0보다 커야 합니다.' end;
  end if;
  if v >= 10000000000 then
    raise exception '%: 값이 너무 큽니다.', p_label;
  end if;
  return v;
end;
$$;

-- 거래일자: 비우면 오늘(한국시간). 미래 날짜와 30일보다 이전 날짜는 거부
create or replace function public.valid_tx_date(p_date date)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_date is null then
    return v_today;
  end if;
  if p_date > v_today then
    raise exception '미래 날짜(%)는 입력할 수 없습니다.', p_date;
  end if;
  if p_date < v_today - 30 then
    raise exception '30일보다 이전 날짜(%)는 입력할 수 없습니다. 필요하면 관리자에게 재고조정을 요청하세요.', p_date;
  end if;
  return p_date;
end;
$$;

-- ---------------------------------------------------------------------
-- 불출
-- ---------------------------------------------------------------------
create or replace function public.issue_item(
  p_item_id    bigint,
  p_quantity   numeric,
  p_tx_date    date default null,
  p_department text default '',
  p_receiver   text default '',
  p_purpose    text default '',
  p_use_place  text default '',
  p_note       text default ''
)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.items;
  v_qty  numeric;
  v_date date;
  v_tx   public.transactions;
begin
  if not public.is_staff() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  v_qty := public.valid_qty(p_quantity, '불출 수량');
  v_date := public.valid_tx_date(p_tx_date);
  if coalesce(trim(p_receiver), '') = '' then
    raise exception '사용자(수령자)를 입력하세요.';
  end if;

  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    raise exception '품목을 찾을 수 없습니다.';
  end if;
  if not v_item.is_active then
    raise exception '사용 중지된 품목입니다: %', v_item.name;
  end if;
  if v_item.current_stock < v_qty then
    raise exception '재고가 부족합니다. (%: 현재 % %, 요청 % %)',
      v_item.name, trim_scale(v_item.current_stock), v_item.unit, trim_scale(v_qty), v_item.unit;
  end if;

  update public.items
     set current_stock = current_stock - v_qty
   where id = p_item_id
  returning * into v_item;

  insert into public.transactions
    (item_id, tx_type, quantity, delta, balance_after, tx_date,
     department, receiver, purpose, use_place, note, created_by, created_by_name)
  values
    (p_item_id, 'OUT', v_qty, -v_qty, v_item.current_stock, v_date,
     coalesce(trim(p_department), ''), trim(p_receiver), coalesce(trim(p_purpose), ''),
     coalesce(trim(p_use_place), ''), coalesce(trim(p_note), ''),
     auth.uid(), coalesce(public.current_user_name(), ''))
  returning * into v_tx;

  return v_tx;
end;
$$;

-- ---------------------------------------------------------------------
-- 입고
-- ---------------------------------------------------------------------
create or replace function public.receive_item(
  p_item_id  bigint,
  p_quantity numeric,
  p_tx_date  date default null,
  p_supplier text default '',
  p_lot_no   text default '',
  p_note     text default ''
)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.items;
  v_qty  numeric;
  v_date date;
  v_tx   public.transactions;
begin
  if not public.is_staff() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  v_qty := public.valid_qty(p_quantity, '입고 수량');
  v_date := public.valid_tx_date(p_tx_date);

  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    raise exception '품목을 찾을 수 없습니다.';
  end if;
  if not v_item.is_active then
    raise exception '사용 중지된 품목입니다: %', v_item.name;
  end if;

  update public.items
     set current_stock = current_stock + v_qty
   where id = p_item_id
  returning * into v_item;

  insert into public.transactions
    (item_id, tx_type, quantity, delta, balance_after, tx_date,
     supplier, lot_no, note, created_by, created_by_name)
  values
    (p_item_id, 'IN', v_qty, v_qty, v_item.current_stock, v_date,
     coalesce(trim(p_supplier), ''), coalesce(trim(p_lot_no), ''), coalesce(trim(p_note), ''),
     auth.uid(), coalesce(public.current_user_name(), ''))
  returning * into v_tx;

  return v_tx;
end;
$$;

-- ---------------------------------------------------------------------
-- 재고조정 (재고 실사 결과 반영) - 관리자
-- ---------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_item_id        bigint,
  p_new_stock      numeric,
  p_reason         text,
  p_expected_stock numeric default null  -- 조정 화면을 열 때의 재고 (그 사이 입출고가 있으면 거부)
)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item  public.items;
  v_new   numeric;
  v_delta numeric;
  v_tx    public.transactions;
begin
  if not public.is_admin() then
    raise exception '관리자만 재고를 조정할 수 있습니다.' using errcode = '42501';
  end if;
  v_new := public.valid_qty(p_new_stock, '실사 재고', true);
  if coalesce(trim(p_reason), '') = '' then
    raise exception '조정 사유를 입력하세요.';
  end if;

  select * into v_item from public.items where id = p_item_id for update;
  if not found then
    raise exception '품목을 찾을 수 없습니다.';
  end if;
  if p_expected_stock is not null and v_item.current_stock is distinct from round(p_expected_stock, 3) then
    raise exception '조정 화면을 연 뒤 재고가 바뀌었습니다. (현재 % %) 다시 열어 확인 후 조정하세요.',
      trim_scale(v_item.current_stock), v_item.unit;
  end if;

  if not v_item.is_active and v_new > 0 then
    raise exception '사용 중지된 품목입니다: % (다시 사용으로 바꾼 뒤 조정하세요)', v_item.name;
  end if;

  v_delta := v_new - v_item.current_stock;
  if v_delta = 0 then
    raise exception '현재 재고와 동일합니다.';
  end if;

  update public.items set current_stock = v_new where id = p_item_id;

  insert into public.transactions
    (item_id, tx_type, quantity, delta, balance_after, purpose, created_by, created_by_name)
  values
    (p_item_id, 'ADJUST', abs(v_delta), v_delta, v_new, trim(p_reason),
     auth.uid(), coalesce(public.current_user_name(), ''))
  returning * into v_tx;

  return v_tx;
end;
$$;

-- ---------------------------------------------------------------------
-- 입고/불출 취소 - 관리자 또는 본인이 24시간 이내 등록한 건
-- 원거래는 canceled 로 표시하고, 재고를 되돌리는 CANCEL 기록을 남깁니다.
-- ---------------------------------------------------------------------
create or replace function public.cancel_transaction(
  p_tx_id  bigint,
  p_reason text
)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orig public.transactions;
  v_item public.items;
  v_new  numeric;
  v_tx   public.transactions;
begin
  if not public.is_staff() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception '취소 사유를 입력하세요.';
  end if;

  select * into v_orig from public.transactions where id = p_tx_id for update;
  if not found then
    raise exception '기록을 찾을 수 없습니다.';
  end if;
  if v_orig.tx_type not in ('IN', 'OUT') then
    raise exception '입고/불출 기록만 취소할 수 있습니다.';
  end if;
  if v_orig.canceled then
    raise exception '이미 취소된 기록입니다.';
  end if;
  if not public.is_admin()
     and (v_orig.created_by is distinct from auth.uid()
          or v_orig.created_at < now() - interval '24 hours') then
    raise exception '본인이 24시간 이내에 등록한 기록만 취소할 수 있습니다. 관리자에게 요청하세요.'
      using errcode = '42501';
  end if;

  select * into v_item from public.items where id = v_orig.item_id for update;
  v_new := v_item.current_stock - v_orig.delta;
  if not v_item.is_active and v_new > 0 then
    raise exception '사용 중지된 품목의 기록은 취소할 수 없습니다: % (관리자가 다시 사용으로 바꾼 뒤 취소하세요)', v_item.name;
  end if;
  if v_new < 0 then
    raise exception '취소하면 재고가 음수가 됩니다. (현재 % %)',
      trim_scale(v_item.current_stock), v_item.unit;
  end if;

  update public.items set current_stock = v_new where id = v_item.id;
  update public.transactions set canceled = true where id = v_orig.id;

  insert into public.transactions
    (item_id, tx_type, quantity, delta, balance_after, purpose, ref_tx_id, created_by, created_by_name)
  values
    (v_item.id, 'CANCEL', v_orig.quantity, -v_orig.delta, v_new, trim(p_reason), v_orig.id,
     auth.uid(), coalesce(public.current_user_name(), ''))
  returning * into v_tx;

  return v_tx;
end;
$$;

-- ---------------------------------------------------------------------
-- 사용자 권한 변경 - 관리자
-- ---------------------------------------------------------------------
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception '관리자만 권한을 변경할 수 있습니다.' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'staff', 'pending') then
    raise exception '알 수 없는 권한입니다: %', p_role;
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception '본인의 관리자 권한은 해제할 수 없습니다.';
  end if;

  update public.profiles set role = p_role where id = p_user_id returning * into v_profile;
  if not found then
    raise exception '사용자를 찾을 수 없습니다.';
  end if;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------
-- 사용량 통계
-- ---------------------------------------------------------------------
create or replace function public.usage_by_item(p_from date, p_to date)
returns table (
  item_id      bigint,
  code         text,
  name         text,
  hazard_class text,
  spec         text,
  unit         text,
  out_qty      numeric,
  out_count    bigint,
  in_qty       numeric,
  in_count     bigint
)
language sql
stable
set search_path = ''
as $$
  select i.id, i.code, i.name, i.hazard_class, i.spec, i.unit,
         coalesce(sum(t.quantity) filter (where t.tx_type = 'OUT'), 0),
         count(*) filter (where t.tx_type = 'OUT'),
         coalesce(sum(t.quantity) filter (where t.tx_type = 'IN'), 0),
         count(*) filter (where t.tx_type = 'IN')
    from public.transactions t
    join public.items i on i.id = t.item_id
   where t.tx_date between p_from and p_to
     and t.tx_type in ('IN', 'OUT')
     and not t.canceled
   group by i.id
   order by 7 desc, i.name
$$;

create or replace function public.usage_by_department(p_from date, p_to date)
returns table (
  department text,
  item_id    bigint,
  name       text,
  unit       text,
  out_qty    numeric,
  out_count  bigint
)
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(t.department, ''), '(미입력)'), i.id, i.name, i.unit,
         sum(t.quantity), count(*)
    from public.transactions t
    join public.items i on i.id = t.item_id
   where t.tx_date between p_from and p_to
     and t.tx_type = 'OUT'
     and not t.canceled
   group by 1, i.id
   order by 1, 5 desc
$$;

-- ---------------------------------------------------------------------
-- 조회용 뷰 (호출자 권한/RLS 적용)
-- ---------------------------------------------------------------------
create view public.transactions_view
with (security_invoker = true)
as
select t.*,
       i.code         as item_code,
       i.name         as item_name,
       i.spec         as item_spec,
       i.unit         as item_unit,
       i.hazard_class as item_hazard_class,
       i.location     as item_location
  from public.transactions t
  join public.items i on i.id = t.item_id;

-- ---------------------------------------------------------------------
-- Row Level Security & 권한
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.transactions enable row level security;

revoke all on public.profiles, public.items, public.transactions, public.transactions_view
  from anon, authenticated;

-- profiles: 본인 또는 승인된 사용자는 조회, 본인은 이름/부서만 수정
grant select on public.profiles to authenticated;
grant update (full_name, department) on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- items: 승인된 사용자는 조회, 관리자만 등록/수정. 재고(current_stock)는 등록 시에만 입력 가능
grant select on public.items to authenticated;
grant insert (code, name, hazard_class, hazard_name, cas_no, un_no, spec, unit,
              designated_qty, location, safety_stock, current_stock, note)
  on public.items to authenticated;
grant update (code, name, hazard_class, hazard_name, cas_no, un_no, spec, unit,
              designated_qty, location, safety_stock, note, is_active)
  on public.items to authenticated;

create policy items_select on public.items
  for select to authenticated
  using ((select public.is_staff()));

create policy items_insert on public.items
  for insert to authenticated
  with check ((select public.is_admin()));

create policy items_update on public.items
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- transactions: 조회만 허용. 기록은 위 함수로만 생성
grant select on public.transactions to authenticated;
grant select on public.transactions_view to authenticated;

create policy transactions_select on public.transactions
  for select to authenticated
  using ((select public.is_staff()));

-- 함수 실행 권한
revoke execute on function
  public.handle_new_user(),
  public.record_initial_stock(),
  public.items_before_update(),
  public.valid_qty(numeric, text, boolean),
  public.valid_tx_date(date),
  public.issue_item(bigint, numeric, date, text, text, text, text, text),
  public.receive_item(bigint, numeric, date, text, text, text),
  public.adjust_stock(bigint, numeric, text, numeric),
  public.cancel_transaction(bigint, text),
  public.set_user_role(uuid, text),
  public.usage_by_item(date, date),
  public.usage_by_department(date, date),
  public.app_role(),
  public.is_staff(),
  public.is_admin(),
  public.current_user_name()
  from public, anon;

grant execute on function
  public.issue_item(bigint, numeric, date, text, text, text, text, text),
  public.receive_item(bigint, numeric, date, text, text, text),
  public.adjust_stock(bigint, numeric, text, numeric),
  public.cancel_transaction(bigint, text),
  public.set_user_role(uuid, text),
  public.usage_by_item(date, date),
  public.usage_by_department(date, date),
  public.app_role(),
  public.is_staff(),
  public.is_admin(),
  public.current_user_name()
  to authenticated;
