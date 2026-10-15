const qtyFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 3 });
const multFormat = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtQty(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '-';
  return qtyFormat.format(Number(n));
}

export function fmtMultiple(n: number | null): string {
  return n === null ? '-' : multFormat.format(n);
}

/** 한국 시간 기준 YYYY-MM-DD */
export function todayKST(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

export function monthStartKST(monthsAgo = 0): string {
  const [y, m] = todayKST().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - monthsAgo, 1));
  return d.toISOString().slice(0, 10);
}

export function monthEndKST(monthsAgo = 0): string {
  const [y, m] = todayKST().split('-').map(Number);
  const d = new Date(Date.UTC(y, m - monthsAgo, 0));
  return d.toISOString().slice(0, 10);
}

export function yearStartKST(): string {
  return `${todayKST().slice(0, 4)}-01-01`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** 입력 문자열을 숫자로. 쉼표 허용. 잘못된 값이면 NaN */
export function parseQty(s: string): number {
  const t = s.replace(/,/g, '').trim();
  if (t === '') return NaN;
  return Number(t);
}

/** 부동소수 오차 없이 소수점 3자리 계산 */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
