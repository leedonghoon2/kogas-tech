-- 사용중지 품목: 취소·재고조정으로 재고가 되살아나지 않는지 (테이블 제약 items_inactive_no_stock)
\set ON_ERROR_STOP 0
\set VERBOSITY terse
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'admin@x.com', '{"full_name":"관리자"}'),
 ('00000000-0000-0000-0000-00000000000b', 'staff@x.com', '{"full_name":"홍길동"}');
update public.profiles set role='staff' where email='staff@x.com';
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
insert into public.items (code, name, unit, current_stock) values ('T1', '톨루엔', 'L', 5) returning id as tid \gset
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select id as out_id from public.issue_item(:tid, 5, null, 'd', 'r') \gset
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
update public.items set is_active = false where id = :tid returning is_active;          -- 재고 0 → 사용중지 성공
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select public.cancel_transaction(:out_id, '실수');                                     -- 사용중지 품목 → 실패해야 함
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
select public.adjust_stock(:tid, 50, '실사', 0);                                       -- 사용중지 품목 → 실패해야 함
select public.adjust_stock(:tid, 0, '실사', 0);                                        -- 변화 없음 → 실패(동일)
reset role;
update public.items set current_stock = 3 where id = :tid;                            -- 테이블 제약 → 실패해야 함
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);
update public.items set is_active = true where id = :tid returning is_active;           -- 다시 사용
select tx_type, balance_after from public.cancel_transaction(:out_id, '실수');          -- 이제 성공 (5)
select current_stock, is_active from public.items where id = :tid;
