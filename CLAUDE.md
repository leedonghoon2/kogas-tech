# 위험물 창고 재고관리 (kogas-tech) — 프로젝트 메모리

이 파일은 Claude Code가 이 폴더를 열 때 자동으로 읽는 프로젝트 메모리입니다.
2026-10-15 클라우드 세션에서 진행한 내용을 PC(로컬) Claude Code에서 이어서 작업하기 위해 정리했습니다.

## 사용자와 일하는 방식

- 사용자와는 **한국어**로 소통합니다. 명령을 실행할 때 무엇을 하는지 알리는 설명(진행 상황, Bash 명령 설명 포함)도 **한국어**로 씁니다.
- 사용자는 휴대폰과 PC를 함께 씁니다. 설정이나 배포 안내는 클릭할 메뉴 이름까지 단계별로 쉽게 설명합니다.
- 운영 환경(실제 Supabase/Cloudflare)에 영향을 주는 작업은 진행 전에 무엇을 할지 알리고 진행합니다.

## 무엇을 만드는가

위험물 창고의 기존 재고를 등록해 두고, **불출(사용) 시 불출대장과 사용량을 입력하면 재고가 자동 차감**되는 웹앱입니다. 입고하면 재고가 늘고, 모든 변동은 수불부에 남습니다.

- 프런트엔드: React 19 + Vite 7 + TypeScript SPA (`src/`). Cloudflare Workers 정적 자산으로 배포 (`wrangler.jsonc`, `public/_headers`)
- 백엔드: Supabase (Postgres + Auth + PostgREST). 스키마·RLS·함수는 `supabase/migrations/20261015000000_init.sql` 하나에 있습니다
- 화면: 대시보드, 재고 현황, 품목 상세(수불 이력), 불출 등록, 입고 등록, 불출대장/입고대장/전체 수불부(CSV·결재란 인쇄), 사용량 통계(품목별·부서별), 재고 일괄등록(엑셀 붙여넣기/CSV, 관리자), 사용자 관리(가입 승인, 관리자), 내 정보
- 자세한 사용·배포 설명은 `README.md`에 있습니다

## 핵심 설계 (바꾸기 전에 반드시 확인)

- **재고(`items.current_stock`)는 DB 함수로만 바뀝니다.** `issue_item`(불출), `receive_item`(입고), `adjust_stock`(재고조정, 관리자), `cancel_transaction`(취소)이 품목 행을 `FOR UPDATE`로 잠근 뒤 재고를 바꾸고 `transactions`에 `delta`와 `balance_after`를 남깁니다. 클라이언트에는 `current_stock` 수정 권한이 없습니다(컬럼 단위 GRANT). 동시에 불출해도 재고가 음수가 되지 않습니다.
- 품목 등록 시 입력한 현재 재고는 트리거가 `INIT`(기초재고) 기록으로 남깁니다.
- **권한**: `profiles.role` = `admin` / `staff` / `pending`. 시스템 **최초 가입자 1명만** 자동 관리자(advisory lock으로 동시 가입 직렬화). 이후 가입자는 `pending`이고 관리자가 승인합니다. 관리자를 모두 지워도 자동 재지정은 없습니다(README의 SQL로 복구).
  - `pending`과 비로그인(`anon`)은 어떤 데이터도 볼 수 없습니다.
  - `staff`는 조회와 입고·불출이 가능하고, 본인이 24시간 이내 등록한 건만 취소할 수 있습니다.
  - `admin`은 품목 등록·수정, 재고조정, 모든 입고/불출 취소, 사용자 승인을 합니다.
- **입력 검증은 DB가 최종 판단합니다.**
  - `valid_qty`는 NULL·NaN·음수·0·지나치게 큰 값을 거부합니다. Postgres numeric의 NaN은 `<= 0` 검사를 통과하므로 따로 막아야 합니다.
  - `valid_tx_date`는 미래 날짜와 30일보다 이전 날짜를 거부하고, NULL이면 서버의 한국 날짜를 씁니다.
  - 테이블 CHECK에도 NaN 차단이 있습니다.
- **사용중지 품목은 재고가 0이어야 합니다**(제약 `items_inactive_no_stock` + 트리거 `items_before_update`). 취소와 재고조정도 사용중지 품목이면 거부합니다.
- **취소는 삭제가 아닌 역분개입니다.** 원거래에 `canceled=true`를 표시하고 `CANCEL` 기록을 추가합니다. 클라이언트의 `canCancel()`(`src/lib/types.ts`)은 DB 규칙과 같아야 합니다.
- 재고조정은 조정 창을 열 때 읽은 재고(`p_expected_stock`)와 현재 재고가 다르면 거부합니다.
- 기록자(`created_by_name`)는 `이름 (이메일아이디)` 형식입니다. 이름은 사용자가 바꿀 수 있으므로 이메일 아이디를 같이 남깁니다.
- 대장은 **등록 순서(id)**로 정렬합니다. 날짜를 거슬러 입력한 기록이 있어도 잔여재고 열이 일관되게 하기 위해서입니다.
- **마이그레이션**: 아직 운영 DB에 적용 전이므로 `20261015000000_init.sql`을 직접 고쳐도 됩니다. **한 번 운영에 적용한 뒤에는** 새 마이그레이션 파일을 추가하는 방식으로 바꿔야 합니다(재실행하면 이미 존재한다는 오류가 납니다).

## 현재 상태 (2026-10-15 기준)

- 작업 브랜치: `claude/hazmat-warehouse-inventory-app-219jp1`. `main`에는 아직 커밋이 없습니다. PR은 만들지 않았습니다.
- 검증한 것
  - 로컬 Postgres 16 + Supabase auth 스텁으로 DB 시나리오, 입력 검증, 동시 불출 테스트 (`supabase/tests/`)
  - PostgREST v12 + Playwright로 브라우저 E2E 17개 시나리오: 가입, 일괄등록, 불출, 입고, 취소, 재고조정, 승인, 모바일 화면
  - 배포 전 다중 에이전트 코드 점검 2회. 확인된 문제는 모두 수정했습니다
- **아직 안 한 것: 운영 배포.** Supabase 프로젝트와 Cloudflare 계정에 아직 연결하지 않았습니다. 클라우드 세션에서는 토큰과 네트워크 설정이 번거로워 PC에서 진행하기로 했습니다.

## 다음 할 일: PC에서 배포

1. **Supabase** (supabase.com, 사용자가 직접 진행)
   1. 새 프로젝트를 만듭니다(리전 Northeast Asia (Seoul)).
   2. SQL Editor에서 `supabase/migrations/20261015000000_init.sql` 전체를 실행합니다.
   3. Project Settings → API Keys에서 Project URL과 Publishable key를 확인합니다.
2. 프로젝트 루트에 `.env.local`을 만듭니다(`.env.example` 참고).
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - 이 파일은 git에 올리지 않습니다.
3. `npm install`(Node.js **22 이상** 필요) → `npx wrangler login`(브라우저로 Cloudflare 로그인) → `npm run deploy`
4. 배포된 `https://hazmat-inventory.<계정>.workers.dev` 주소를 Supabase의 **Authentication → URL Configuration**에 등록합니다.
   - Site URL에 넣습니다.
   - Redirect URLs에는 그 주소와 `http://localhost:5173`을 넣습니다.
5. **사용자 본인이 배포 주소에서 가장 먼저 회원가입**합니다(첫 가입자 = 관리자).
   - ⚠️ Claude는 운영 환경에서 테스트 계정을 만들거나 가입하면 안 됩니다. 확인은 화면이 뜨는지와 비로그인 API가 막히는지 정도로만 합니다.
6. (선택) Cloudflare 대시보드에서 GitHub 저장소를 연결하면 push할 때마다 자동 배포됩니다(README 3-A).

## 사용자에게 확인이 필요한 결정

- **이메일 설정**: Supabase 기본 메일은 프로젝트 팀원 주소로만 발송됩니다. 동료가 가입하려면 둘 중 하나가 필요합니다.
  - 권장: 회사 SMTP를 연결합니다(Confirm email 켬).
  - 임시: Confirm email을 끕니다. 이 경우 이메일 주소가 검증되지 않으므로 승인 전에 본인 확인이 필요합니다.
  - README 1-4에 정리돼 있습니다.
- 기본값으로 정한 정책은 사용자가 원하면 바꿉니다.
  - 품목 등록은 관리자만 합니다.
  - 일반 사용자의 취소는 24시간 이내로 제한합니다.
  - 거래일자는 30일 이내만 허용합니다.

## 자주 쓰는 명령

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 개발 서버 (http://localhost:5173, `.env.local` 필요) |
| `npm run typecheck` | 타입 검사 |
| `npm run build` | 타입 검사 + 프로덕션 빌드 |
| `npm run deploy` | 빌드 후 Cloudflare 배포 (`wrangler login` 필요) |
| `supabase/tests/README.md` | 로컬 Postgres로 DB 로직 검증하는 방법 |

코드나 마이그레이션을 바꾼 뒤에는 최소한 `npm run build`를 통과시킵니다. DB를 바꿨다면 `supabase/tests/`의 시나리오도 다시 돌려 기대한 오류 수가 나오는지 확인합니다.
