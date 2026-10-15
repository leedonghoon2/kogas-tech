# ⚠️ 위험물 창고 재고관리

위험물 창고의 재고를 등록해 두고, **불출(사용) 시 불출대장과 사용량을 입력하면 재고가 자동으로 차감**되는 웹앱입니다.
입고 시에는 재고가 자동으로 늘어나며, 모든 입출고는 수불부에 남습니다.

- **프런트엔드**: React + Vite (TypeScript) → **Cloudflare Workers**(정적 자산)로 배포
- **백엔드**: **Supabase** (PostgreSQL, 인증, Row Level Security)

## 주요 기능

| 메뉴 | 내용 |
| --- | --- |
| 대시보드 | 등록 품목 수, 안전재고 이하 품목, 오늘/이번 달 불출 건수, 지정수량 배수 합계, 류별 현황, 최근 입출고 |
| 재고 현황 | 품명·코드·CAS·위치 검색, 류별 필터, 재고 부족 표시, 지정수량 배수, CSV 다운로드 |
| **불출 등록** | 품목 검색 → 수량·사용부서·사용자·사용목적·사용장소 입력 → **재고 자동 차감** (불출 후 예상 재고 미리보기, 재고 부족 시 차단) |
| **입고 등록** | 품목·수량·입고처·로트번호 입력 → **재고 자동 증가** |
| 불출대장 · 수불부 | 불출대장 / 입고대장 / 전체 수불부, 기간·품목·부서 필터, **엑셀(CSV) 다운로드, 결재란 포함 인쇄** |
| 사용량 통계 | 기간별 **품목별·부서별 사용량** 합계 (이번 달/지난 달/최근 3개월/올해) |
| 재고 일괄등록 (관리자) | 기존 창고 재고를 **엑셀에서 복사·붙여넣기 또는 CSV**로 한 번에 등록 (현재재고 → 기초재고로 기록) |
| 사용자 관리 (관리자) | 가입 승인, 관리자/사용자 권한 변경 |
| 품목 상세 | 품목 정보, 수불 이력(잔여 재고 포함), 정보 수정·재고조정·사용중지 (관리자) |

### 재고는 이렇게 관리됩니다

- 재고 수량은 화면에서 직접 고칠 수 없고 **입고 · 불출 · 재고조정 · 취소**를 통해서만 바뀝니다. 모든 변경은 수불부(`transactions`)에 *변경량*과 *처리 후 잔여 재고*가 함께 기록됩니다.
- 불출은 DB 함수 안에서 품목 행을 잠근 뒤 처리되므로, **여러 명이 동시에 불출해도 재고가 음수가 되지 않습니다.**
- 잘못 입력한 입고/불출은 **삭제 대신 「취소」** 합니다. 원래 기록은 취소 표시(취소선)로 남고, 재고를 되돌리는 취소 기록이 추가됩니다. 통계에서는 취소 건이 제외됩니다.
- 재고 실사 결과가 전산과 다르면 관리자가 **재고조정**(사유 필수)으로 맞춥니다. 조정 화면을 연 뒤 다른 사람이 입출고하면 조정이 거부되므로 다시 열어 확인합니다.
- 입고·불출 일자는 **오늘부터 30일 전까지**만 입력할 수 있습니다(미래 날짜 불가). 대장은 **등록 순서**로 정렬되어 잔여재고 열이 항상 일관됩니다.
- 수량은 숫자 검증(0 이하·숫자가 아닌 값·지나치게 큰 값 거부)을 DB에서 다시 한 번 합니다.
- 재고가 남아 있는 품목은 **사용중지할 수 없습니다** (위험물 현황·지정수량 배수에서 빠지지 않도록).
- 기록자는 `이름 (이메일 아이디)` 형식으로 남습니다. 이름은 사용자가 바꿀 수 있지만 이메일 아이디는 바꿀 수 없습니다.

### 권한

| 권한 | 할 수 있는 일 |
| --- | --- |
| 관리자 | 모든 기능 + 품목 등록·수정·사용중지, 재고조정, 모든 입고/불출 취소, 재고 일괄등록, 사용자 승인 |
| 사용자 | 재고 조회, 입고·불출 등록, 대장·통계 조회, **본인이 24시간 이내 등록한 건** 취소 |
| 승인 대기 | 로그인만 가능 (데이터 접근 불가) |

**시스템에 처음 가입한 한 사람만 자동으로 관리자**가 되고, 이후 가입자는 관리자가 승인해야 사용할 수 있습니다.
배포 직후 관리자가 될 사람이 **가장 먼저 가입**하세요. (관리자 계정을 모두 지워도 다음 가입자가 관리자가 되지는 않습니다. 복구 방법은 아래 참고)

---

## 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다. (Region: **Northeast Asia (Seoul)** 권장)
2. 왼쪽 메뉴 **SQL Editor** → New query → [`supabase/migrations/20261015000000_init.sql`](supabase/migrations/20261015000000_init.sql) 파일 내용을 **전부 붙여넣고 Run** 합니다.
   - Supabase CLI를 쓴다면: `npx supabase init` → `npx supabase link --project-ref <프로젝트ID>` → `npx supabase db push`
3. **Authentication → URL Configuration**
   - Site URL: 배포 후 주소 (예: `https://hazmat-inventory.<계정>.workers.dev`)
   - Redirect URLs: 위 주소와 `http://localhost:5173` 추가
4. **이메일 설정 (중요)** — Supabase 기본 메일 서버는 **프로젝트 팀원(Supabase 조직 구성원)의 주소로만** 메일을 보내고 발송량도 매우 적습니다. 그래서 동료가 가입 확인 메일이나 비밀번호 재설정 메일을 받으려면 다음 중 하나가 필요합니다.
   - **권장**: *Authentication → Emails → SMTP Settings* 에 회사(또는 Gmail·SendGrid 등) SMTP를 연결하고, *Confirm email* 은 **켜 둡니다.** 가입한 이메일이 실제 본인 것인지 확인된 뒤에만 로그인할 수 있습니다.
   - **임시**: *Authentication → Sign In / Providers → Email* 에서 *Confirm email* 을 끕니다. 이 경우 **누구나 아무 이메일 주소로 가입할 수 있으므로**(주소 확인 없음), 승인 대기 목록의 이름·이메일만 보고 승인하지 말고 본인에게 직접 확인한 뒤 승인하세요. 비밀번호 재설정 메일은 SMTP 없이는 팀원 외에게 발송되지 않습니다.
5. **Project Settings → API Keys** 에서 다음 두 값을 복사해 둡니다.
   - Project URL → `VITE_SUPABASE_URL`
   - Publishable key (`sb_publishable_...`, 또는 기존 anon key) → `VITE_SUPABASE_PUBLISHABLE_KEY`

> ⚠️ `service_role` / secret 키는 절대 프런트엔드 환경변수에 넣지 마세요.

## 2. 로컬에서 실행

Node.js 22 이상이 필요합니다 (Cloudflare 배포 도구 wrangler 요구사항).

```bash
npm install
cp .env.example .env.local   # 복사 후 위에서 복사한 URL/키 입력
npm run dev                  # http://localhost:5173
```

## 3. Cloudflare에 배포

빌드 결과물(`dist/`)을 Cloudflare Workers 정적 자산으로 배포합니다. 설정은 [`wrangler.jsonc`](wrangler.jsonc)에 있습니다.

> Vite 환경변수(`VITE_...`)는 **빌드할 때** 코드에 들어갑니다. 값을 바꾸면 다시 빌드·배포해야 합니다.

### 방법 A. GitHub 연동 (권장, push 하면 자동 배포)

1. Cloudflare 대시보드 → **Workers & Pages → Create → Import a repository** → 이 저장소 선택
2. 빌드 설정
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
3. **Settings → Build → Variables and secrets** 에 추가
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. 배포가 끝나면 나오는 `*.workers.dev` 주소를 Supabase **Site URL / Redirect URLs** 에 등록합니다. (회사 도메인을 쓰려면 Workers 설정 → Domains & Routes에서 연결)

### 방법 B. 내 PC에서 직접 배포

```bash
npx wrangler login
npm run deploy      # .env.local 값으로 빌드 후 배포
```

> Cloudflare **Pages**를 쓰고 싶다면 Pages 프로젝트에서 Build command `npm run build`, Output directory `dist`로 설정하고 같은 환경변수를 넣으면 됩니다.

## 4. 처음 사용하기

1. 배포된 주소에서 **회원가입** → 첫 가입자는 자동으로 **관리자**
2. **재고 일괄등록** → 「양식 내려받기」로 양식을 받아 기존 창고 재고를 채운 뒤, 엑셀에서 표를 복사해 붙여넣고 「미리보기 · 검증」→「등록」
   - 필수 열: `품명`, `단위` / 선택 열: `품목코드, 위험물류별, 위험물품명, CAS번호, UN번호, 규격, 지정수량, 보관위치, 안전재고, 현재재고, 비고`
   - 위험물류별은 `제4류`, `4류`, `4` 모두 인식합니다. 이미 있는 품목코드는 건너뜁니다.
3. 동료들이 가입하면 **사용자 관리**에서 「승인」
4. 이후 현장에서는 **불출 등록**(필요 시 휴대폰에서)으로 사용량을 입력하고, 정기적으로 **불출대장**을 인쇄·CSV로 보관합니다.

### 참고

- **지정수량 배수** = 현재 재고 ÷ 지정수량. 품목의 단위와 지정수량 단위(L 또는 kg)를 맞춰 입력해야 정확합니다. 대시보드에는 제1~6류 품목의 합계가 표시됩니다.
- 관리자 계정을 잃어버렸거나 관리자를 추가로 지정하려면 Supabase SQL Editor에서 실행합니다.
  ```sql
  update public.profiles set role = 'admin' where email = 'someone@example.com';
  ```
- 사용자 계정 삭제는 Supabase 대시보드 → Authentication → Users 에서 합니다.

---

## 구조

```
├── supabase/migrations/   DB 스키마, RLS 정책, 입고/불출/조정/취소 함수
├── src/
│   ├── lib/               Supabase 클라이언트, 인증, 타입, CSV, 포맷 유틸
│   ├── components/        레이아웃, 품목 검색, 모달(품목 등록·재고조정·취소)
│   └── pages/             대시보드, 재고현황, 품목상세, 불출, 입고, 대장, 통계, 일괄등록, 사용자관리
├── public/_headers        Cloudflare 보안 헤더
└── wrangler.jsonc         Cloudflare Workers 배포 설정
```

### 데이터베이스

| 테이블/함수 | 설명 |
| --- | --- |
| `profiles` | 사용자 이름·부서·권한 (`admin` / `staff` / `pending`) |
| `items` | 품목 마스터 + 현재 재고 (`current_stock`, 클라이언트 직접 수정 불가) |
| `transactions` | 수불 원장: `INIT`(기초재고) `IN`(입고) `OUT`(불출) `ADJUST`(재고조정) `CANCEL`(취소) |
| `transactions_view` | 수불 기록 + 품목명/단위 조회용 뷰 |
| `issue_item()` | 불출: 재고 확인 → 차감 → 불출대장 기록 |
| `receive_item()` | 입고: 재고 증가 → 입고 기록 |
| `adjust_stock()` | 재고조정 (관리자, 조정 화면을 연 뒤 재고가 바뀌었으면 거부) |
| `valid_qty()`, `valid_tx_date()` | 수량·거래일자 검증 (NaN·음수·미래/30일 이전 날짜 거부) |
| `cancel_transaction()` | 입고/불출 취소 (역분개) |
| `usage_by_item()`, `usage_by_department()` | 기간별 사용량 통계 |
| `set_user_role()` | 사용자 권한 변경 (관리자) |

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 + 프로덕션 빌드 |
| `npm run deploy` | 빌드 후 Cloudflare 배포 |
| `npm run cf:preview` | Cloudflare 런타임으로 로컬 미리보기 |
