/* Inventory costing (이동평균), warehouses and transfers, LOT · 유통기한 (FEFO), inspection, 수불부 and stock analysis. */
import { addMonths, lastDay } from './books';
import { date, id, recordStockChange, receipt, round, unit, type ErpState, type Movement } from './flow-core';
import { importUnitCost } from './forex';

export interface ItemMeta { barcode?: string; shelfLifeDays?: number; pack?: { unit: string; per: number }; inspect?: boolean }
export type WarehouseType = '자가' | '외부 위탁' | '외주 가공';
export interface WarehouseDef { name: string; type: WarehouseType; owner: string }
export interface Transfer { id: string; code: string; name: string; from: string; to: string; qty: number; status: '이동 중' | '이동 완료'; date: string; doneAt?: string }
export interface Inspection { id: string; orderId: string; code: string; name: string; date: string; passed: number; rejected: number; reason: string; lot: string }
export interface Inv { meta: Record<string, ItemMeta>; warehouses: WarehouseDef[]; transfers: Transfer[]; inspections: Inspection[] }

export const emptyInv = (): Inv => ({ meta: {}, warehouses: [], transfers: [], inspections: [] });
export const IN_TRANSIT = '이동 중';

type Value = string | number | undefined;

/* ───────── Costing: moving average per item ───────── */

/** Movements oldest first: by date, then in the order they were recorded (the array is newest-first). */
export function chronological(movements: Movement[]) {
  return movements.map((m, i) => ({ m, seq: movements.length - 1 - i })).sort((a, b) => a.m.date.localeCompare(b.m.date) || a.seq - b.seq).map(x => x.m);
}

export interface CostLine { id: string; code: string; date: string; type: string; qty: number; unitCost: number; exact?: number; amount: number; balanceQty: number; balanceValue: number }

/**
 * Walks every stock movement in time order and values it:
 * purchases at the order price, production output at the materials issued to its work order,
 * everything else (sales, adjustments, transfers, returns) at the running moving average.
 */
export function costLedger(state: ErpState) {
  const pools = new Map<string, { qty: number; value: number }>();
  const byMovement = new Map<string, CostLine>();
  const woIssued = new Map<string, number>();
  const std = (code: string) => state.items.find(i => i[0] === code)?.[6] ?? 0;
  for (const m of chronological(state.movements)) {
    const pool = pools.get(m.code) ?? { qty: 0, value: 0 };
    const avg = pool.qty > 0 ? pool.value / pool.qty : std(m.code);
    const order = state.orders.find(o => o.id === m.ref);
    const wo = state.workOrders.find(w => w.id === m.ref);
    let unitCost = avg;
    if (m.type === '기초 재고') unitCost = std(m.code);
    else if ((m.type === '구매 입고' || m.type === '입고 취소' || m.type === '구매 반품') && order) unitCost = order.price;
    else if ((m.type === '출고 취소' || m.type === '수입 취소') && m.originalId && byMovement.has(m.originalId)) unitCost = byMovement.get(m.originalId)!.exact ?? byMovement.get(m.originalId)!.unitCost;
    else if (m.type === '수입 입고') {
      const deal = state.books.fxDeals?.find(x => x.id === m.ref);
      if (deal) unitCost = importUnitCost(deal);
    }
    else if (m.type === '생산 입고' && wo) unitCost = (wo.qty ? (woIssued.get(wo.id) ?? 0) / wo.qty : avg) + (wo.conversion ?? 0);
    let amount = Math.round(unitCost * m.qty);
    // Output = its share of the materials issued + 가공비, each rounded so the journal's 가공비배부 matches exactly.
    if (m.type === '생산 입고' && wo && wo.qty) amount = Math.round(((woIssued.get(wo.id) ?? 0) * m.qty) / wo.qty) + Math.round((wo.conversion ?? 0) * m.qty);
    // Selling the last unit clears the pool exactly, so rounding never leaves a stray won.
    if (m.qty < 0 && round(pool.qty + m.qty) === 0 && !['구매 반품', '입고 취소'].includes(m.type)) amount = -pool.value;
    if (m.type === '생산 출고' && wo) woIssued.set(wo.id, (woIssued.get(wo.id) ?? 0) - amount);
    pool.qty = round(pool.qty + m.qty);
    pool.value += amount;
    pools.set(m.code, pool);
    byMovement.set(m.id, { id: m.id, code: m.code, date: m.date, type: m.type, qty: m.qty, unitCost: Math.round(unitCost), exact: unitCost, amount, balanceQty: pool.qty, balanceValue: pool.value });
  }
  return { byMovement, pools, woIssued };
}

/** Current quantity, value and average cost of each item. */
export function valuation(state: ErpState) {
  const { pools } = costLedger(state);
  return state.items.map(i => {
    const p = pools.get(i[0]) ?? { qty: 0, value: 0 };
    return { code: i[0], name: i[1], qty: p.qty, value: p.value, avg: p.qty > 0 ? Math.round(p.value / p.qty) : i[6], std: i[6] };
  });
}

/* ───────── 재고수불부 ───────── */

export function stockLedger(state: ErpState, month: string) {
  const { byMovement } = costLedger(state);
  const start = `${month}-01`, end = lastDay(month);
  return state.items.map(i => {
    const lines = [...byMovement.values()].filter(l => l.code === i[0]);
    const before = lines.filter(l => l.date < start);
    const within = lines.filter(l => l.date >= start && l.date <= end);
    const open = { qty: round(before.reduce((t, l) => t + l.qty, 0)), value: before.reduce((t, l) => t + l.amount, 0) };
    const inn = within.filter(l => l.qty > 0), out = within.filter(l => l.qty < 0);
    const inQty = round(inn.reduce((t, l) => t + l.qty, 0)), inValue = inn.reduce((t, l) => t + l.amount, 0);
    const outQty = round(-out.reduce((t, l) => t + l.qty, 0)), outValue = -out.reduce((t, l) => t + l.amount, 0);
    return { code: i[0], name: i[1], unit: unit(i), open, inQty, inValue, outQty, outValue, close: { qty: round(open.qty + inQty - outQty), value: open.value + inValue - outValue } };
  });
}

/* ───────── Warehouses and transfers ───────── */

export function warehouses(state: ErpState): WarehouseDef[] {
  const own = [...new Set(state.items.map(i => i[3]))].map(name => ({ name, type: '자가' as WarehouseType, owner: '물류팀' }));
  return [...own, ...state.inv.warehouses.filter(w => !own.some(o => o.name === w.name))];
}

export function addWarehouse(state: ErpState, f: { name: Value; type: Value; owner: Value }) {
  const name = String(f.name ?? '').trim();
  if (!name) throw Error('창고 이름을 입력해 주세요.');
  if (warehouses(state).some(w => w.name === name) || name === IN_TRANSIT) throw Error('이미 있는 창고예요.');
  const w: WarehouseDef = { name, type: (['자가', '외부 위탁', '외주 가공'].includes(String(f.type)) ? f.type : '자가') as WarehouseType, owner: String(f.owner ?? '').trim() || '물류팀' };
  state.inv.warehouses.push(w);
  return w;
}

/** Good-stock quantity of one item in each warehouse (movements carry the warehouse they hit). */
export function stockByWarehouse(state: ErpState, code: string) {
  const map = new Map<string, number>();
  state.movements.filter(m => m.code === code && m.stockType !== '불량').forEach(m => map.set(m.warehouse, round((map.get(m.warehouse) ?? 0) + m.qty)));
  return map;
}

function move(state: ErpState, code: string, qty: number, wh: string, ref: string, note: string) {
  const row = recordStockChange(state, code, qty, '창고 이동', ref, note, id('TF'));
  row.warehouse = wh;
  return row;
}

/** Sends stock out of `from`; it sits in 이동 중 until the receiving warehouse confirms. */
export function startTransfer(state: ErpState, f: { code: Value; from: Value; to: Value; qty: Value }, today = date()) {
  const item = state.items.find(i => i[0] === f.code);
  if (!item) throw Error('품목을 골라 주세요.');
  const from = String(f.from), to = String(f.to);
  if (!from || !to || from === to) throw Error('출발 창고와 도착 창고를 다르게 골라 주세요.');
  const qty = Number(f.qty);
  if (!(qty > 0) || (unit(item) === 'EA' && !Number.isInteger(qty))) throw Error('이동 수량을 확인해 주세요.');
  const have = stockByWarehouse(state, item[0]).get(from) ?? 0;
  if (qty > have) throw Error(`${from}에 ${have}${unit(item)}만 있어요.`);
  const t: Transfer = { id: id('TR'), code: item[0], name: item[1], from, to, qty, status: '이동 중', date: today };
  move(state, item[0], -qty, from, t.id, `${to}(으)로 이동 출고`);
  move(state, item[0], qty, IN_TRANSIT, t.id, `${from} → ${to}`);
  state.inv.transfers.unshift(t);
  return t;
}

export function arriveTransfer(state: ErpState, transferId: string, today = date()) {
  const t = state.inv.transfers.find(x => x.id === transferId);
  if (!t || t.status !== '이동 중') throw Error('이동 중인 건만 도착 처리할 수 있어요.');
  move(state, t.code, -t.qty, IN_TRANSIT, t.id, `${t.to} 도착`);
  move(state, t.code, t.qty, t.to, t.id, `${t.from}에서 이동 입고`);
  t.status = '이동 완료';
  t.doneAt = today;
  return t;
}

/* ───────── Item master extras: barcode, shelf life, pack unit ───────── */

export function setItemMeta(state: ErpState, code: string, f: { barcode?: Value; shelfLifeDays?: Value; packUnit?: Value; packPer?: Value; inspect?: Value | boolean }) {
  if (!state.items.some(i => i[0] === code)) throw Error('품목을 찾을 수 없어요.');
  const barcode = String(f.barcode ?? '').trim();
  if (barcode && Object.entries(state.inv.meta).some(([c, m]) => c !== code && m.barcode === barcode)) throw Error('다른 품목이 이미 쓰는 바코드예요.');
  const per = Number(f.packPer ?? 0), life = Number(f.shelfLifeDays ?? 0);
  if (per < 0 || life < 0) throw Error('숫자를 확인해 주세요.');
  state.inv.meta[code] = {
    ...(barcode && { barcode }), ...(life > 0 && { shelfLifeDays: life }),
    ...(per > 1 && String(f.packUnit ?? '').trim() && { pack: { unit: String(f.packUnit).trim(), per } }),
    ...(f.inspect === 'on' || f.inspect === true ? { inspect: true } : {}),
  };
}

export const itemByBarcode = (state: ErpState, barcode: string) => {
  const code = Object.entries(state.inv.meta).find(([, m]) => m.barcode === barcode.trim())?.[0];
  return code ? state.items.find(i => i[0] === code) : undefined;
};

/** 1,234 EA with a 24-EA box → "51 BOX + 10 EA". */
export function packLabel(state: ErpState, code: string, qty: number) {
  const p = state.inv.meta[code]?.pack;
  if (!p || qty < p.per) return '';
  const boxes = Math.floor(qty / p.per), rest = round(qty - boxes * p.per);
  return `${boxes} ${p.unit}${rest ? ` + ${rest}` : ''}`;
}

/* ───────── Receipt with inspection and LOT ───────── */

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

/**
 * 입고 검사: only the passed quantity is received (불합격분은 공급사로 돌려보내고 발주 잔량으로 남아요).
 * The received lot gets a 제조번호 and an expiry (from the item's shelf life when not given).
 */
export function receiveInspected(state: ErpState, orderId: string, f: { qty: Value; rejected?: Value; reason?: Value; lot?: Value; expiry?: Value }, token: string, today = date()) {
  const o = state.orders.find(x => x.id === orderId);
  if (!o) throw Error('발주를 찾을 수 없어요.');
  const passed = Number(f.qty), rejected = Number(f.rejected || 0);
  if (!(rejected >= 0)) throw Error('불합격 수량을 확인해 주세요.');
  if (rejected > 0 && !String(f.reason ?? '').trim()) throw Error('불합격 사유를 입력해 주세요.');
  if (round(passed + rejected) > round(o.qty - o.received)) throw Error('합격 + 불합격 수량이 남은 발주 수량을 넘어요.');
  const lot = String(f.lot ?? '').trim() || `${o.id}-${today.replace(/-/g, '')}`;
  const life = state.inv.meta[o.itemCode]?.shelfLifeDays;
  const expiry = String(f.expiry ?? '') || (life ? addDays(today, life) : '');
  let row: Movement | undefined;
  if (passed > 0) {
    row = receipt(state, orderId, passed, token);
    row.lot = lot;
    if (expiry) row.expiry = expiry;
  } else if (!(rejected > 0)) throw Error('합격 수량을 입력해 주세요.');
  if (rejected > 0 || state.inv.meta[o.itemCode]?.inspect) {
    state.inv.inspections.unshift({ id: id('QC'), orderId, code: o.itemCode, name: o.name, date: today, passed, rejected, reason: String(f.reason ?? '').trim() || '이상 없음', lot });
  }
  return row;
}

/* ───────── LOT balances (FEFO: 유통기한이 빠른 것부터 출고) ───────── */

export interface LotBalance { code: string; lot: string; expiry: string; inQty: number; qty: number; received: string; out: { movementId: string; ref: string; date: string; qty: number }[] }

export function lotBalances(state: ErpState, code?: string) {
  const lots: LotBalance[] = [];
  for (const m of chronological(state.movements).filter(x => (!code || x.code === code) && x.stockType !== '불량' && x.type !== '창고 이동')) {
    if (m.qty > 0) {
      const wo = state.workOrders.find(w => w.id === m.ref);
      const lot = m.lot ?? (m.type === '기초 재고' ? `${m.code}-기초` : wo ? wo.lot : m.type === '판매 반품' ? `반품-${m.ref}` : m.id);
      const life = state.inv.meta[m.code]?.shelfLifeDays;
      const expiry = m.expiry ?? (life ? addDays(m.date, life) : '');
      const same = lots.find(l => l.code === m.code && l.lot === lot);
      if (same) { same.qty = round(same.qty + m.qty); same.inQty = round(same.inQty + m.qty); }
      else lots.push({ code: m.code, lot, expiry, inQty: m.qty, qty: m.qty, received: m.date, out: [] });
    } else {
      let need = -m.qty;
      const open = lots.filter(l => l.code === m.code && l.qty > 0).sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999') || a.received.localeCompare(b.received));
      for (const l of open) {
        if (need <= 0) break;
        const take = Math.min(l.qty, need);
        l.qty = round(l.qty - take);
        l.out.push({ movementId: m.id, ref: m.ref, date: m.date, qty: take });
        need = round(need - take);
      }
    }
  }
  return lots;
}

/** Where every unit of a lot went: for recalls. */
export const traceLot = (state: ErpState, code: string, lot: string) => lotBalances(state, code).find(l => l.lot === lot);

/* ───────── Stock analysis ───────── */

export function stockAnalysis(state: ErpState, today = date()) {
  const { byMovement } = costLedger(state);
  const lines = [...byMovement.values()];
  const yearAgo = `${addMonths(today.slice(0, 7), -12)}-01`;
  return valuation(state).map(v => {
    const outs = lines.filter(l => l.code === v.code && l.qty < 0 && ['판매 출고', '생산 출고'].includes(l.type));
    const last = outs.map(l => l.date).sort().at(-1);
    const usedValue = -outs.filter(l => l.date >= yearAgo).reduce((t, l) => t + l.amount, 0);
    const idle = last ? Math.round((Date.parse(today) - Date.parse(last)) / 86400000) : null;
    const expiring = lotBalances(state, v.code).filter(l => l.qty > 0 && l.expiry && l.expiry <= addDays(today, 90));
    return { ...v, last, idle, turnover: v.value > 0 ? usedValue / v.value : 0, expiring };
  });
}

/* ───────── Sample data ───────── */

export function seedInv(state: ErpState) {
  state.inv = emptyInv();
  const meta: Record<string, ItemMeta> = {
    'FG-001': { barcode: '8801234500011', shelfLifeDays: 730, pack: { unit: 'BOX', per: 24 } },
    'FG-002': { barcode: '8801234500028', shelfLifeDays: 730, pack: { unit: 'BOX', per: 24 } },
    'RM-001': { shelfLifeDays: 365, inspect: true },
    'RM-002': { shelfLifeDays: 540, inspect: true },
    'PK-001': { barcode: '8801234599990', pack: { unit: 'BOX', per: 200 } },
    'SF-001': { shelfLifeDays: 180 },
    'G-001': { barcode: '8809876500017', pack: { unit: 'BOX', per: 12 } },
    'G-002': { barcode: '8809876500024' },
    'G-003': { barcode: '8809876500031', pack: { unit: 'BOX', per: 20 } },
  };
  state.items.forEach(i => { if (meta[i[0]]) state.inv.meta[i[0]] = meta[i[0]]; });
  state.inv.warehouses.push({ name: '물류센터 (3PL 위탁)', type: '외부 위탁', owner: '한빛 로지스' });
  const fg = state.items.find(i => i[2] === '완제품' || i[2] === '상품');
  if (fg) {
    try { startTransfer(state, { code: fg[0], from: fg[3], to: '물류센터 (3PL 위탁)', qty: 10 }, date()); } catch {}
  }
}
