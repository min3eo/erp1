/* Browser-only demo transaction rules. No server or external service calls. */
import { defaultAdmin, withDefaultRules, type Admin } from './admin';
import { emptyBooks, type Books } from './books';
import { emptyHr, seedEmployees, type Employee, type Hr } from './hr';
import { emptyInv, type Inv } from './inventory';
import type { Collab } from './collab';
import type { Payment, Quote } from './finance';
import type { PayrollRun, Salary } from './payroll';
import type { Bom, WorkOrder } from './production';

/** [code, name, type, warehouse, stock, safetyStock, price] — tuple kept for localStorage compatibility. */
export type Item = [code: string, name: string, type: string, warehouse: string, stock: number, safety: number, price: number];
export type Unit = 'kg' | 'EA';

export type OrderStatus = '승인 대기' | '승인 완료' | '발주 완료' | '부분 입고' | '입고 완료' | '취소' | '반려';
export type SaleStatus = '출고 대기' | '부분 출고' | '출고 완료';

export interface Order {
  id: string; itemCode: string; name: string; vendor: string; qty: number; price: number;
  received: number; status: OrderStatus; date: string; cancelReason?: string; cancelDate?: string;
}
export interface Sale {
  id: string; itemCode: string; name: string; customer: string; qty: number; price: number;
  shipped: number; status: SaleStatus; date: string; quoteId?: string;
  /** 납기 (requested delivery date). */
  due?: string;
}
export interface Movement {
  id: string; date: string; type: string; code: string; name: string; warehouse: string;
  qty: number; before: number; after: number; ref: string; note: string; unit: Unit;
  stockType?: '정상' | '불량'; cancelled?: boolean; cancelledBy?: string; originalId?: string;
  /** 제조번호 · 유통기한 of stock coming in (receipts, production). */
  lot?: string; expiry?: string;
  /** 택배사 · 송장번호 on shipments. */
  carrier?: string; tracking?: string;
}
export type ReturnKind = '판매 반품' | '구매 반품';
export interface ReturnRecord {
  id: string; date: string; kind: ReturnKind; ref: string; code: string; name: string;
  qty: number; unit: Unit; grade: '정상' | '불량'; reason: string;
}
export interface Adjustment {
  id: string; date: string; code: string; name: string; warehouse: string; expected: number;
  actual: number; delta: number; unit: Unit; reason: string; status: '승인 대기' | '승인 완료' | '반려';
}
export interface Leave { name: string; dept: string; date: string; type: string; days: number; status: string }
export interface Modules { erp: boolean; hr: boolean; manufacturing: boolean; collab: boolean }

export interface ErpState {
  items: Item[]; orders: Order[]; sales: Sale[]; leaves: Leave[]; movements: Movement[];
  returns: ReturnRecord[]; adjustments: Adjustment[]; quarantine: Record<string, number>;
  clock: string | null; clockOut?: string; modules: Modules; flowVersion?: number;
  /** Filled by the app's loader (lib/seed.ts); absent in pure flow tests. */
  collab: Collab;
  quotes: Quote[];
  payments: Payment[];
  boms: Bom[];
  workOrders: WorkOrder[];
  salaries: Salary[];
  payrolls: PayrollRun[];
  /** 회계 · 자금 · 세무 records (lib/books.ts). */
  books: Books;
  /** Employee master and HR records (lib/hr.ts). */
  employees: Employee[];
  hr: Hr;
  /** Users, permissions, approval rules, change history and the month-close lock (lib/admin.ts). */
  admin: Admin;
  /** Item extras, warehouses, transfers and inspections (lib/inventory.ts). */
  inv: Inv;
}

/** Older saved data and seeds may lack the flow fields; normalize fills them in. */
export type ErpStateInput = Partial<Omit<ErpState, 'orders'>> & {
  items: Item[];
  orders: (Omit<Order, 'itemCode' | 'received'> & Partial<Pick<Order, 'itemCode' | 'received'>>)[];
};

type FormValue = string | number | undefined;

export const unit = (item: Item): Unit => (['원료', '반제품'].includes(item[2]) ? 'kg' : 'EA');
export const round = (n: number) => Math.round(n * 1000) / 1000;
export const id = (prefix: string) => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
export const date = () => new Date().toLocaleDateString('sv-SE');

function itemFor(state: ErpState, code: string) {
  const item = state.items.find(i => i[0] === code);
  if (!item) throw Error('연결된 품목이 없습니다. 품목을 먼저 등록해 주세요.');
  return item;
}

function quantity(value: FormValue, item: Item) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || (unit(item) === 'EA' && !Number.isInteger(n)) || round(n) !== n) {
    throw Error(unit(item) === 'EA' ? '수량은 1 이상의 정수로 입력해 주세요.' : '수량은 0보다 크게, 소수 셋째 자리까지 입력해 주세요.');
  }
  return n;
}

export function normalize(input: ErpStateInput): ErpState {
  const state = input as ErpState;
  state.movements ||= [];
  state.sales ||= [];
  state.returns ||= [];
  state.adjustments ||= [];
  state.quotes ||= [];
  state.payments ||= [];
  state.boms ||= [];
  state.workOrders ||= [];
  state.salaries ||= [];
  state.payrolls ||= [];
  state.books = { ...emptyBooks(), ...state.books };
  state.employees ||= seedEmployees();
  state.admin = withDefaultRules({ ...defaultAdmin(), ...state.admin });
  state.inv = { ...emptyInv(), ...state.inv };
  state.hr = { ...emptyHr(), ...state.hr, settings: { ...emptyHr().settings, ...state.hr?.settings } };
  state.quarantine ||= {};
  state.leaves ||= [];
  state.clock ??= null;
  state.modules ||= { erp: true, hr: true, manufacturing: true, collab: true };
  state.modules.collab ??= true;
  state.orders.forEach(o => {
    o.itemCode ||= state.items.find(i => i[1] === o.name)?.[0] || '';
    if (o.received == null) o.received = o.status === '입고 완료' ? o.qty : 0;
  });
  if (!state.flowVersion) {
    // Opening stock is dated to the start of the year so every later move is valued after it.
    state.items.forEach(i => state.movements.push({ id: id('ST'), date: date().slice(0, 4) + '-01-01', type: '기초 재고', code: i[0], name: i[1], warehouse: i[3], qty: i[4], before: 0, after: i[4], ref: 'OPENING', note: '시안 시작 시 보유 수량', unit: unit(i) }));
    state.flowVersion = 1;
  }
  return state;
}

export function addItem(state: ErpState, f: { name: string; type: string; stock: FormValue }) {
  const item: Item = ['IT-' + id('N'), f.name, f.type, '본사 창고', Number(f.stock), 50, 1000];
  state.items.push(item);
  state.movements.unshift({ id: id('ST'), date: date(), type: '기초 재고', code: item[0], name: item[1], warehouse: item[3], qty: item[4], before: 0, after: item[4], ref: 'OPENING', note: '신규 품목 초기 수량', unit: unit(item) });
  return item;
}

export function purchase(state: ErpState, f: { itemCode: string; vendor?: string; qty: FormValue; price: FormValue }) {
  const item = itemFor(state, f.itemCode), qty = quantity(f.qty, item), price = Number(f.price);
  if (!f.vendor?.trim()) throw Error('거래처를 입력해 주세요.');
  if (!Number.isFinite(price) || price < 0) throw Error('단가는 0 이상의 숫자로 입력해 주세요.');
  const order: Order = { id: id('PO'), itemCode: item[0], name: item[1], vendor: f.vendor.trim(), qty, price, received: 0, status: '승인 대기', date: date() };
  state.orders.unshift(order);
  return order;
}

export function approve(state: ErpState, orderId: string) {
  const o = state.orders.find(o => o.id === orderId);
  if (!o || o.status !== '승인 대기') throw Error('승인 대기 중인 구매 요청만 승인할 수 있어요.');
  o.status = '승인 완료';
  return o;
}

export function place(state: ErpState, orderId: string) {
  const o = state.orders.find(o => o.id === orderId);
  if (!o || o.status !== '승인 완료') throw Error('승인 완료된 요청만 발주할 수 있어요.');
  itemFor(state, o.itemCode);
  o.status = '발주 완료';
  return o;
}

function movement(state: ErpState, item: Item, qty: number, ref: string, note: string, token: string) {
  const before = item[4], after = round(before + qty);
  if (after < 0) throw Error('보유 재고보다 많은 수량을 출고할 수 없어요.');
  const row: Movement = { id: token, date: date(), type: qty > 0 ? '구매 입고' : '판매 출고', code: item[0], name: item[1], warehouse: item[3], qty, before, after, ref, note, unit: unit(item) };
  item[4] = after;
  state.movements.unshift(row);
  return row;
}

export function receipt(state: ErpState, orderId: string, amount: FormValue, token: string) {
  if (!token || state.movements.some(m => m.id === token)) throw Error('이미 처리한 입고입니다. 목록을 다시 확인해 주세요.');
  const o = state.orders.find(o => o.id === orderId);
  if (!o || !['발주 완료', '부분 입고'].includes(o.status)) throw Error('발주된 미입고 내역만 입고할 수 있어요.');
  const item = itemFor(state, o.itemCode), qty = quantity(amount, item);
  if (qty > round(o.qty - o.received)) throw Error('입고 수량이 남은 발주 수량을 초과합니다.');
  const row = movement(state, item, qty, o.id, o.vendor, token);
  o.received = round(o.received + qty);
  o.status = o.received === o.qty ? '입고 완료' : '부분 입고';
  return row;
}

export function sale(state: ErpState, f: { itemCode: string; customer?: string; qty: FormValue; price: FormValue; quoteId?: string; due?: string }) {
  const item = itemFor(state, f.itemCode), qty = quantity(f.qty, item), price = Number(f.price);
  if (!['완제품', '상품'].includes(item[2])) throw Error('판매 주문은 완제품 또는 상품으로 등록해 주세요.');
  if (!f.customer?.trim()) throw Error('고객사를 입력해 주세요.');
  if (!Number.isFinite(price) || price < 0) throw Error('판매 단가를 확인해 주세요.');
  const s: Sale = { id: id('SO'), itemCode: item[0], name: item[1], customer: f.customer.trim(), qty, price, shipped: 0, status: '출고 대기', date: date(), ...(f.quoteId && { quoteId: f.quoteId }), ...(f.due && { due: f.due }) };
  state.sales.unshift(s);
  return s;
}

export function ship(state: ErpState, saleId: string, amount: FormValue, token: string) {
  if (!token || state.movements.some(m => m.id === token)) throw Error('이미 처리한 출고입니다. 목록을 다시 확인해 주세요.');
  const s = state.sales.find(s => s.id === saleId);
  if (!s || !['출고 대기', '부분 출고'].includes(s.status)) throw Error('출고 대기 중인 주문만 처리할 수 있어요.');
  const item = itemFor(state, s.itemCode), qty = quantity(amount, item);
  if (qty > round(s.qty - s.shipped)) throw Error('출고 수량이 남은 주문 수량을 초과합니다.');
  const row = movement(state, item, -qty, s.id, s.customer, token);
  s.shipped = round(s.shipped + qty);
  s.status = s.shipped === s.qty ? '출고 완료' : '부분 출고';
  return row;
}

const reason = (value?: string) => {
  if (!value?.trim()) throw Error('처리 사유를 입력해 주세요.');
  return value.trim();
};

function addChange(state: ErpState, item: Item, amount: number, type: string, ref: string, note: string, token: string, stockType: '정상' | '불량' = '정상') {
  if (!token || state.movements.some(m => m.id === token)) throw Error('이미 처리한 내역입니다.');
  const before = stockType === '불량' ? state.quarantine[item[0]] || 0 : item[4];
  const after = round(before + amount);
  if (after < 0) throw Error('현재 재고가 부족하여 처리할 수 없어요.');
  const row: Movement = { id: token, date: date(), type, code: item[0], name: item[1], warehouse: item[3], qty: amount, before, after, ref, note, unit: unit(item), stockType };
  if (stockType === '불량') state.quarantine[item[0]] = after;
  else item[4] = after;
  state.movements.unshift(row);
  return row;
}

export function cancelOrder(state: ErpState, orderId: string, note?: string) {
  const text = reason(note);
  const o = state.orders.find(o => o.id === orderId);
  if (!o || !['승인 대기', '승인 완료', '발주 완료'].includes(o.status) || o.received > 0) throw Error('입고 전 요청·발주만 취소할 수 있어요. 입고된 물건은 반품 또는 입고 취소로 처리해 주세요.');
  o.status = '취소';
  o.cancelReason = text;
  o.cancelDate = date();
  return o;
}

export function cancelMovement(state: ErpState, movementId: string, note: string | undefined, token: string) {
  const text = reason(note);
  const m = state.movements.find(m => m.id === movementId);
  if (!m || !['구매 입고', '판매 출고'].includes(m.type) || m.cancelled) throw Error('취소할 수 있는 입출고 내역이 아닙니다.');
  if (state.returns.some(r => r.ref === m.ref)) throw Error('반품 이력이 있는 거래는 입출고 취소가 제한됩니다.');
  const item = itemFor(state, m.code);
  const isReceipt = m.type === '구매 입고';
  const doc = isReceipt ? state.orders.find(d => d.id === m.ref) : state.sales.find(d => d.id === m.ref);
  if (!doc) throw Error('관련 문서를 찾을 수 없어요.');
  const row = addChange(state, item, -m.qty, isReceipt ? '입고 취소' : '출고 취소', m.ref, text, token);
  row.originalId = m.id;
  m.cancelled = true;
  m.cancelledBy = row.id;
  if (isReceipt) {
    const o = doc as Order;
    o.received = round(o.received - m.qty);
    o.status = o.received > 0 ? '부분 입고' : '발주 완료';
  } else {
    const s = doc as Sale;
    s.shipped = round(s.shipped + m.qty);
    s.status = s.shipped > 0 ? '부분 출고' : '출고 대기';
  }
  return row;
}

export function returnAvailable(state: ErpState, doc: Order | Sale, kind: ReturnKind) {
  const done = kind === '판매 반품' ? (doc as Sale).shipped : (doc as Order).received;
  return round(done - state.returns.filter(r => r.ref === doc.id).reduce((sum, r) => sum + r.qty, 0));
}

export function returnGoods(state: ErpState, f: { kind: string; ref: string; qty: FormValue; reason?: string; grade?: string }, token: string) {
  const note = reason(f.reason), kind = f.kind;
  if (kind !== '판매 반품' && kind !== '구매 반품') throw Error('반품 유형을 확인해 주세요.');
  const doc = kind === '판매 반품' ? state.sales.find(d => d.id === f.ref) : state.orders.find(d => d.id === f.ref);
  if (!doc) throw Error('반품할 거래를 선택해 주세요.');
  const item = itemFor(state, doc.itemCode), qty = quantity(f.qty, item);
  if (qty > returnAvailable(state, doc, kind)) throw Error('반품 수량이 실제 거래 수량을 초과합니다.');
  const stockType = kind === '판매 반품' && f.grade === '불량' ? '불량' : '정상';
  const row = addChange(state, item, kind === '판매 반품' ? qty : -qty, kind, doc.id, note, token, stockType);
  state.returns.unshift({ id: row.id, date: date(), kind, ref: doc.id, code: item[0], name: item[1], qty, unit: unit(item), grade: stockType, reason: note });
  return row;
}

export function requestAdjustment(state: ErpState, f: { itemCode: string; actual: FormValue; reason?: string }) {
  const item = itemFor(state, f.itemCode), actual = Number(f.actual), note = reason(f.reason);
  if (!Number.isFinite(actual) || actual < 0 || round(actual) !== actual || (unit(item) === 'EA' && !Number.isInteger(actual))) throw Error('실제 수량은 0 이상으로, 품목 단위에 맞게 입력해 주세요.');
  const a: Adjustment = { id: id('ADJ'), date: date(), code: item[0], name: item[1], warehouse: item[3], expected: item[4], actual, delta: round(actual - item[4]), unit: unit(item), reason: note, status: '승인 대기' };
  state.adjustments.unshift(a);
  return a;
}

export function decideAdjustment(state: ErpState, adjustmentId: string, approved: boolean) {
  const a = state.adjustments.find(a => a.id === adjustmentId);
  if (!a || a.status !== '승인 대기') throw Error('이미 처리한 조정 요청입니다.');
  if (!approved) {
    a.status = '반려';
    return a;
  }
  const item = itemFor(state, a.code);
  if (item[4] !== a.expected) throw Error('요청 후 재고가 바뀌었어요. 이 요청을 반려하고 다시 실사해 주세요.');
  addChange(state, item, a.delta, '재고 조정', a.id, a.reason, id('TX'));
  a.status = '승인 완료';
  return a;
}

/** Stock change for other modules (production, etc.): same duplicate-token and negative-stock guards as receipts and shipments. */
export function recordStockChange(state: ErpState, code: string, amount: number, type: string, ref: string, note: string, token: string) {
  return addChange(state, itemFor(state, code), round(amount), type, ref, note, token);
}

/** Validates a quantity against an item's unit (EA = whole numbers, kg = up to 3 decimals). */
export function checkQuantity(value: FormValue, code: string, state: ErpState) {
  return quantity(value, itemFor(state, code));
}
