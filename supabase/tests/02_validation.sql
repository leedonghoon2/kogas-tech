-- 입력값 검증: NaN·무한대·과대값·0 수량, 미래/30일 이전 날짜, 재고조정 충돌, 재고 남은 품목 사용중지 차단, 관리자 재지정 방지
\set ON_ERROR_STOP 0
\set VERBOSITY terse
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'admin@x.com', '{"full_name":"관리자"}'),
 ('00000000-0000-0000-0000-00000000000b', 'staff@x.com', '{"full_name":"홍길동"}');
select email, role from public.profiles order by email;
-- 관리자 삭제 후 새 가입자는 관리자가 되면 안 됨
delete from auth.users where email='admin@x.com';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'new@x.com');
select email, role from public.profiles order by email;
update public.profiles set role='admin' where email='new@x.com';
update public.profiles set role='staff' where email='staff@x.com';

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
insert into public.items (name, unit, current_stock) values ('NaN테스트', 'L', 'NaN');           -- 실패해야 함
insert into public.items (name, unit, safety_stock) values ('NaN안전', 'L', 'NaN');              -- 실패해야 함
insert into public.items (name, unit, designated_qty) values ('NaN지정', 'L', 'NaN');            -- 실패해야 함
insert into public.items (code, name, unit, current_stock) values ('T1', '톨루엔', 'L', 10) returning id as tid \gset
select :tid as item_id;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select public.receive_item(:tid, 'NaN');                                  -- 실패해야 함
select public.issue_item(:tid, 'NaN', null, 'd', 'r');                    -- 실패해야 함
select public.issue_item(:tid, 'Infinity', null, 'd', 'r');               -- 실패해야 함
select public.issue_item(:tid, 0.0004, null, 'd', 'r');                   -- 반올림 0 → 실패
select public.receive_item(:tid, 1e12);                                   -- 너무 큼 → 실패
select public.issue_item(:tid, 1, (now() at time zone 'Asia/Seoul')::date + 1, 'd', 'r');   -- 미래 → 실패
select public.issue_item(:tid, 1, (now() at time zone 'Asia/Seoul')::date - 31, 'd', 'r');  -- 31일 전 → 실패
select tx_type, balance_after, tx_date = (now() at time zone 'Asia/Seoul')::date - 30 as d30, created_by_name
  from public.issue_item(:tid, 2.5, (now() at time zone 'Asia/Seoul')::date - 30, 'd', 'r');
select tx_type, balance_after, tx_date = (now() at time zone 'Asia/Seoul')::date as today
  from public.receive_item(:tid, 5, null);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select public.adjust_stock(:tid, 'NaN', '실사');                           -- 실패해야 함
select public.adjust_stock(:tid, 10, '실사', 7.5);                         -- 기대 재고 불일치 → 실패
select tx_type, balance_after from public.adjust_stock(:tid, 10, '실사', 12.5);
select tx_type, balance_after from public.adjust_stock(:tid, 0, '폐기', 10);
update public.items set is_active = false where id = :tid returning is_active;   -- 재고 0 → 성공
update public.items set is_active = true where id = :tid;
select public.receive_item(:tid, 3);
update public.items set is_active = false where id = :tid;                -- 재고 남음 → 실패
select current_stock, current_stock = 'NaN' as is_nan from public.items where id = :tid;
-- 직접 RPC 로 NaN 을 넣어도 테이블 제약이 막는지 (함수 우회 불가 확인용, 슈퍼유저로)
reset role;
update public.items set current_stock = 'NaN' where id = :tid;            -- 제약조건으로 실패해야 함
