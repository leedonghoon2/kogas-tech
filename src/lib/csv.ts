type Cell = string | number | boolean | null | undefined;

function escapeCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // 엑셀 수식 주입 방지
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: Cell[][]): string {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');
}

/** UTF-8 BOM을 붙여 엑셀에서 한글이 깨지지 않게 저장 */
export function downloadCSV(filename: string, rows: Cell[][]): void {
  const blob = new Blob(['﻿' + toCSV(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 따옴표로 감싼 셀(셀 안의 쉼표·탭·줄바꿈 포함)을 지원하는 구분자 파서 */
export function parseDelimited(text: string, delimiter: ',' | '\t'): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const isEnd = (ch: string | undefined) => ch === undefined || ch === delimiter || ch === '\n' || ch === '\r';

  // 셀 맨 앞의 따옴표가 '감싸는 따옴표'인지 확인: 닫는 따옴표 바로 뒤가 구분자·줄바꿈·끝이어야 한다.
  // 아니면(예: "A"급 같은 일반 글자) 따옴표를 글자 그대로 취급해 행이 합쳐지지 않게 한다.
  const closingQuote = (start: number): number => {
    for (let j = start + 1; j < src.length; j++) {
      if (src[j] !== '"') continue;
      if (src[j + 1] === '"') {
        j++;
        continue;
      }
      return isEnd(src[j + 1]) ? j : -1;
    }
    return -1;
  };

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let cellStart = true;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' && cellStart) {
      const end = closingQuote(i);
      if (end >= 0) {
        cell = src.slice(i + 1, end).replace(/""/g, '"');
        i = end;
        cellStart = false;
        continue;
      }
    }
    if (c === delimiter) {
      row.push(cell);
      cell = '';
      cellStart = true;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      cellStart = true;
    } else {
      cell += c;
      cellStart = false;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function parseCSV(text: string): string[][] {
  return parseDelimited(text, ',');
}

/** 엑셀에서 저장한 CSV는 CP949(EUC-KR)인 경우가 많아 UTF-8 실패 시 EUC-KR로 읽는다. */
export async function readTextFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('euc-kr').decode(buf);
  }
}
