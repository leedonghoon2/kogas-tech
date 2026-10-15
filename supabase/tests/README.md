# DB 시나리오 테스트

마이그레이션(`../migrations/`)의 권한·재고 로직을 **로컬 Postgres 15 이상**에서 확인하는 스크립트입니다.
결과는 눈으로 확인합니다: 주석에 `실패해야 함`이라고 적힌 줄은 오류가 나야 정상입니다.

> ⚠️ 실제 Supabase 프로젝트에는 실행하지 마세요. `00_auth_stub.sql`은 Supabase의 `auth` 스키마를 흉내 낸 것입니다.

| 파일 | 확인 내용 | 정상일 때 오류 수 |
| --- | --- | --- |
| `01_scenarios.sql` | 최초 가입자 관리자, 승인, 불출·입고·취소·재고조정, 권한 차단 | 9 |
| `02_validation.sql` | NaN·과대값·0 수량, 미래/30일 이전 날짜, 재고조정 충돌, 사용중지 차단, 관리자 재지정 방지 | 14 |
| `03_inactive_item.sql` | 사용중지 품목에 취소·재고조정으로 재고가 되살아나지 않음 | 4 |
| `04_concurrent_issue.sql` | `01` 실행 후 같은 DB에서 여러 세션으로 동시에 실행 → 재고 = 수불부 합계 | 재고 부족 거부 몇 건 |

## 실행 (각 파일마다 새 DB)

```bash
createdb hazmat_test
psql -d hazmat_test -v ON_ERROR_STOP=1 -q -f supabase/tests/00_auth_stub.sql -f supabase/migrations/20261015000000_init.sql
psql -d hazmat_test -X -f supabase/tests/01_scenarios.sql
dropdb hazmat_test
```

동시성 확인(bash): `01` 실행 직후 같은 DB에서

```bash
for i in 1 2 3 4 5 6; do psql -d hazmat_test -qAt -f supabase/tests/04_concurrent_issue.sql & done; wait
psql -d hazmat_test -c "select current_stock, (select sum(delta) from transactions where item_id = 1) from items where id = 1"
```

두 값이 같아야 합니다.
