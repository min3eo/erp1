/* BOM and work orders: plan → issue materials → report output. Stock moves through flow-core guards. */
import { checkQuantity, date, id, recordStockChange, round, unit, type ErpState } from './flow-core';

export interface BomLine { code: string; qty: number }
/** Materials needed to make one unit (EA or kg) of the product. */
/** conversion: 가공비 (노무비 · 제조경비) applied per unit made, on top of the materials. */
export interface Bom { productCode: string; version: string; updated: string; lines: BomLine[]; note?: string; conversion?: number }

export type WorkOrderStatus = '계획' | '생산 중' | '완료' | '취소';
export interface WorkOrder {
  id: string; productCode: string; name: string; qty: number; produced: number; status: WorkOrderStatus;
  date: string; due: string; lot: string; lines: BomLine[]; issued: boolean; note?: string;
  /** 가공비 per unit, fixed from the BOM when the order was made. */
  conversion?: number;
}

export function seedBoms(): Bom[] {
  return [
    { productCode: 'FG-001', version: 'v1.1', updated: '2026-10-01', note: '보습 벌크 배합량 수정', conversion: 1500, lines: [{ code: 'SF-001', qty: 0.05 }, { code: 'PK-001', qty: 1 }] },
    { productCode: 'FG-002', version: 'v1.0', updated: '2026-08-01', conversion: 1800, lines: [{ code: 'SF-001', qty: 0.05 }, { code: 'RM-002', qty: 0.002 }, { code: 'PK-001', qty: 1 }] },
    { productCode: 'SF-001', version: 'v2.0', updated: '2026-09-15', note: '반제품: 1kg 기준', conversion: 2000, lines: [{ code: 'RM-001', qty: 0.8 }, { code: 'RM-002', qty: 0.02 }] },
  ];
}

export const bomFor = (state: ErpState, code: string) => state.boms.find(b => b.productCode === code);

/** Material cost of one unit, from each material's standard price. */
export function unitMaterialCost(state: ErpState, code: string) {
  const bom = bomFor(state, code);
  if (!bom) return 0;
  return bom.lines.reduce((s, l) => s + l.qty * (state.items.find(i => i[0] === l.code)?.[6] ?? 0), 0);
}

export interface Requirement { code: string; name: string; unit: string; need: number; stock: number; short: number }

export function requirements(state: ErpState, wo: Pick<WorkOrder, 'qty' | 'lines'>): Requirement[] {
  return wo.lines.map(l => {
    const item = state.items.find(i => i[0] === l.code);
    const need = round(l.qty * wo.qty);
    const stock = item?.[4] ?? 0;
    return { code: l.code, name: item?.[1] ?? l.code, unit: item ? unit(item) : 'EA', need, stock, short: round(Math.max(0, need - stock)) };
  });
}

export function createWorkOrder(state: ErpState, f: { productCode: string; qty: string | number; due?: string }) {
  const bom = bomFor(state, f.productCode);
  if (!bom) throw Error('BOM이 등록된 품목만 생산 지시할 수 있어요.');
  const qty = checkQuantity(f.qty, f.productCode, state);
  const today = date();
  const due = f.due || today;
  if (due < today) throw Error('완료 예정일은 오늘 이후로 정해 주세요.');
  const item = state.items.find(i => i[0] === f.productCode)!;
  const seq = String(state.workOrders.length + 1).padStart(3, '0');
  const wo: WorkOrder = {
    id: id('MO'), productCode: item[0], name: item[1], qty, produced: 0, status: '계획', date: today, due,
    lot: `LOT-${today.replace(/-/g, '')}-${seq}`, lines: bom.lines.map(l => ({ ...l })), issued: false,
    ...(bom.conversion && { conversion: bom.conversion }),
  };
  state.workOrders.unshift(wo);
  return wo;
}

const findWo = (state: ErpState, woId: string) => {
  const wo = state.workOrders.find(w => w.id === woId);
  if (!wo) throw Error('생산 지시를 찾을 수 없어요.');
  return wo;
};

/** Issues every material at once; refuses (and changes nothing) if any material is short. */
export function issueMaterials(state: ErpState, woId: string, token: string) {
  const wo = findWo(state, woId);
  if (wo.status !== '계획' || wo.issued) throw Error('계획 상태의 생산 지시만 자재를 출고할 수 있어요.');
  const short = requirements(state, wo).filter(r => r.short > 0);
  if (short.length) throw Error(`자재가 부족해요: ${short.map(r => `${r.name} ${r.short}${r.unit}`).join(', ')}`);
  requirements(state, wo).forEach((r, i) => recordStockChange(state, r.code, -r.need, '생산 출고', wo.id, `${wo.name} ${wo.qty} 생산용`, `${token}-${i}`));
  wo.issued = true;
  wo.status = '생산 중';
  return wo;
}

export function reportOutput(state: ErpState, woId: string, qty: string | number, token: string) {
  const wo = findWo(state, woId);
  if (wo.status !== '생산 중') throw Error('자재 출고가 끝난 생산 지시만 실적을 등록할 수 있어요.');
  const amount = checkQuantity(qty, wo.productCode, state);
  const left = round(wo.qty - wo.produced);
  if (amount > left) throw Error(`남은 생산 수량 ${left}을 넘을 수 없어요.`);
  const row = recordStockChange(state, wo.productCode, amount, '생산 입고', wo.id, `${wo.lot} 실적`, token);
  row.lot = wo.lot;
  const life = state.inv?.meta[wo.productCode]?.shelfLifeDays;
  if (life) row.expiry = new Date(Date.parse(date()) + life * 86400000).toISOString().slice(0, 10);
  wo.produced = round(wo.produced + amount);
  if (wo.produced === wo.qty) wo.status = '완료';
  return wo;
}

export function cancelWorkOrder(state: ErpState, woId: string, note?: string) {
  const wo = findWo(state, woId);
  if (wo.status !== '계획') throw Error('자재 출고 전 생산 지시만 취소할 수 있어요.');
  wo.status = '취소';
  wo.note = note?.trim() || '계획 취소';
  return wo;
}

/** 단위당 가공비 for a BOM: used by work orders created from now on. */
export function setConversion(state: ErpState, code: string, value: string | number) {
  const bom = bomFor(state, code);
  if (!bom) throw Error('BOM을 찾을 수 없어요.');
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw Error('가공비는 0 이상의 원 단위로 입력해 주세요.');
  bom.conversion = n || undefined;
  bom.updated = date();
  return bom;
}
