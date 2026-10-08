import { unit, type ErpState, type Unit } from './flow-core';
import type { CompanyId } from './seed';

export interface Vendor { code: string; name: string; type: string; owner: string; terms: string; status: string }
export interface Warehouse { code: string; name: string; owner: string; count: number; type: string }
export interface DocumentLine { code: string; name: string; warehouse: string; unit: Unit; qty: number; received: number; price: number }
export interface PurchaseDocument { id: string; vendor: string; date: string; due: string; status: string; lines: DocumentLine[]; preview: boolean }

export function masterVendors(state: ErpState): Vendor[] {
  return [...new Set(['한빛 공급', '누리 소재', '그린 파트너스', ...state.orders.map(o => o.vendor)])].map((name, n) => ({
    code: 'V-' + String(n + 1).padStart(3, '0'),
    name,
    type: n === 2 ? '제조업체' : '공급업체',
    owner: ['김담당', '이담당', '박담당'][n % 3],
    terms: n % 2 ? '월말 정산' : '입고 후 30일',
    status: '사용 중',
  }));
}

export function masterWarehouses(state: ErpState): Warehouse[] {
  return [...new Set(state.items.map(i => i[3]))].map((name, n) => ({
    code: 'WH-' + String(n + 1).padStart(2, '0'),
    name,
    owner: ['물류팀', '구매팀', '운영팀'][n % 3],
    count: state.items.filter(i => i[3] === name).length,
    type: name.includes('원료') ? '원료 보관' : name.includes('부자재') ? '포장재 보관' : '제품 보관',
  }));
}

export const PREVIEW_DOCUMENT_ID = 'PO-PREVIEW-001';

/** A static multi-line preview document followed by the sample purchase orders. */
export function previewDocuments(state: ErpState, company: CompanyId): PurchaseDocument[] {
  const source = company === 'epure' ? state.items.filter(i => ['FG-001', 'RM-001', 'PK-001'].includes(i[0])) : state.items.slice(0, 3);
  const lines = source.map((i, n) => ({ code: i[0], name: i[1], warehouse: i[3], unit: unit(i), qty: [100, 200, 500][n], received: [60, 0, 500][n], price: i[6] }));
  const demo: PurchaseDocument = { id: PREVIEW_DOCUMENT_ID, vendor: '한빛 공급', date: '2026.10.07', due: '2026.10.12', status: '부분 입고', lines, preview: true };
  return [
    demo,
    ...state.orders.map(o => {
      const item = state.items.find(i => i[0] === o.itemCode);
      return {
        id: o.id, vendor: o.vendor, date: o.date, due: '—', status: o.status, preview: false,
        lines: [{ code: o.itemCode || '미연결', name: o.name, warehouse: item?.[3] || '—', unit: item ? unit(item) : 'EA' as Unit, qty: o.qty, received: o.received, price: o.price }],
      };
    }),
  ];
}
