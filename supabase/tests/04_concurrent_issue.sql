-- 01_scenarios.sql 실행 직후 같은 DB에서, 여러 창(세션)으로 동시에 실행: 재고가 음수가 되지 않고 재고 = 수불부 합계여야 함
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);
select balance_after from public.issue_item(1, 20, null, '정비팀', '홍길동', '동시성', '', '');
