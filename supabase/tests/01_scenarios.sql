-- 역할별 기본 시나리오: 최초 가입자 관리자, 승인, 불출/입고/취소/재고조정, 권한 차단. "실패해야 함" 주석의 줄은 오류가 나야 정상
\set ON_ERROR_STOP 0
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'admin@x.com', '{"full_name":"관리자","department":"설비팀"}'),
 ('00000000-0000-0000-0000-00000000000b', 'staff@x.com', '{"full_name":"홍길동","department":"정비팀"}'),
 ('00000000-0000-0000-0000-00000000000c', 'new@x.com', '{}');
select email, role from public.profiles order by email;

-- 관리자로 전환
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select public.set_user_role('00000000-0000-0000-0000-00000000000b', 'staff') is not null as promoted;
insert into public.items (code, name, hazard_class, hazard_name, unit, designated_qty, location, safety_stock, current_stock)
values ('H-001', '톨루엔', '제4류', '제1석유류', 'L', 200, 'A-1', 20, 100),
       ('H-002', '아세톤', '제4류', '제1석유류', 'L', 400, 'A-2', 10, 0)
returning id, name, current_stock;
select tx_type, quantity, balance_after, created_by_name from public.transactions;
-- 관리자가 current_stock 직접 수정 시도 (실패해야 함)
update public.items set current_stock = 999 where code = 'H-001';

-- 일반 사용자로 전환
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select tx_type, quantity, delta, balance_after, department, receiver from public.issue_item(1, 30, null, '정비팀', '홍길동', '배관 세척', '2공장', '');
select public.issue_item(1, 80, null, '정비팀', '홍길동', '', '', '');  -- 재고 부족 (실패)
select public.issue_item(1, 5, null, '정비팀', '', '', '', '');       -- 수령자 없음 (실패)
select tx_type, balance_after from public.receive_item(2, 50, '2026-10-01', 'OO화학', 'LOT-1', '');
insert into public.items (name) values ('일반사용자 등록');                -- 실패해야 함
insert into public.transactions (item_id, tx_type, quantity, delta, balance_after) values (1,'IN',1,1,1); -- 실패해야 함
select public.adjust_stock(1, 50, '실사');                                -- 실패해야 함 (관리자 전용)
select tx_type, balance_after from public.cancel_transaction(2, '수량 오기입');  -- 본인 건 취소 → 재고 복구
select name, current_stock from public.items order by id;

-- 승인 대기 사용자: 아무것도 못 봐야 함
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c"}', false);
select count(*) as pending_sees_items from public.items;
select count(*) as pending_sees_tx from public.transactions_view;
select public.issue_item(1, 1, null, 'x', 'y', '', '', '');               -- 실패해야 함

-- 관리자: 재고조정, 통계
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select tx_type, quantity, delta, balance_after from public.adjust_stock(1, 95.5, '재고 실사 결과');
select public.cancel_transaction(5, '중복');  -- 조정 건 취소 시도 (실패)
select * from public.usage_by_item('2026-01-01', '2026-12-31');
select * from public.usage_by_department('2026-01-01', '2026-12-31');
select id, tx_type, item_name, quantity, delta, balance_after, canceled, ref_tx_id from public.transactions_view order by id;

-- anon 은 차단
reset role; set role anon;
select count(*) from public.items;
