export type Role = 'admin' | 'staff' | 'pending';

export const ROLE_LABEL: Record<Role, string> = {
  admin: '관리자',
  staff: '사용자',
  pending: '승인 대기',
};

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  department: string;
  role: Role;
  created_at: string;
}

export const HAZARD_CLASSES = [
  { value: '제1류', label: '제1류 산화성고체' },
  { value: '제2류', label: '제2류 가연성고체' },
  { value: '제3류', label: '제3류 자연발화성·금수성' },
  { value: '제4류', label: '제4류 인화성액체' },
  { value: '제5류', label: '제5류 자기반응성' },
  { value: '제6류', label: '제6류 산화성액체' },
  { value: '기타', label: '기타 (비위험물)' },
] as const;

export type HazardClass = (typeof HAZARD_CLASSES)[number]['value'];

export const UNITS = ['L', 'mL', 'kg', 'g', 'EA', '병', '캔', '드럼', '통', '박스'];

export interface Item {
  id: number;
  code: string | null;
  name: string;
  hazard_class: HazardClass;
  hazard_name: string;
  cas_no: string;
  un_no: string;
  spec: string;
  unit: string;
  designated_qty: number | null;
  location: string;
  safety_stock: number;
  current_stock: number;
  note: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TxType = 'INIT' | 'IN' | 'OUT' | 'ADJUST' | 'CANCEL';

export const TX_LABEL: Record<TxType, string> = {
  INIT: '기초재고',
  IN: '입고',
  OUT: '불출',
  ADJUST: '재고조정',
  CANCEL: '취소',
};

export interface Tx {
  id: number;
  item_id: number;
  tx_type: TxType;
  quantity: number;
  delta: number;
  balance_after: number;
  tx_date: string;
  department: string;
  receiver: string;
  purpose: string;
  use_place: string;
  supplier: string;
  lot_no: string;
  note: string;
  ref_tx_id: number | null;
  canceled: boolean;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
}

export interface TxView extends Tx {
  item_code: string | null;
  item_name: string;
  item_spec: string;
  item_unit: string;
  item_hazard_class: HazardClass;
  item_location: string;
}

export interface UsageByItem {
  item_id: number;
  code: string | null;
  name: string;
  hazard_class: HazardClass;
  spec: string;
  unit: string;
  out_qty: number;
  out_count: number;
  in_qty: number;
  in_count: number;
}

export interface UsageByDepartment {
  department: string;
  item_id: number;
  name: string;
  unit: string;
  out_qty: number;
  out_count: number;
}

/** 지정수량 배수 (현재 재고 ÷ 지정수량). 지정수량이 없으면 null */
export function designatedMultiple(item: Pick<Item, 'current_stock' | 'designated_qty'>): number | null {
  if (!item.designated_qty) return null;
  return Number(item.current_stock) / Number(item.designated_qty);
}

export function isLowStock(item: Pick<Item, 'current_stock' | 'safety_stock'>): boolean {
  return Number(item.safety_stock) > 0 && Number(item.current_stock) <= Number(item.safety_stock);
}

/** DB의 cancel_transaction 규칙과 동일: 관리자는 모든 입고/불출, 사용자는 본인이 24시간 이내 등록한 건 */
export function canCancel(tx: Tx, isAdmin: boolean, userId: string | undefined): boolean {
  if (tx.canceled || (tx.tx_type !== 'IN' && tx.tx_type !== 'OUT')) return false;
  if (isAdmin) return true;
  return tx.created_by === userId && Date.now() - new Date(tx.created_at).getTime() < 24 * 3600 * 1000;
}
