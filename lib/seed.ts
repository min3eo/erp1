import { seedBooks } from './books';
import { seedHr } from './hr';
import { seedInv } from './inventory';
import { seedCollab } from './collab';
import { normalize, sale, ship, type ErpState, type ErpStateInput } from './flow-core';
import { confirmPayroll, seedSalaries } from './payroll';
import { createWorkOrder, issueMaterials, reportOutput, seedBoms } from './production';

export type CompanyId = 'epure' | 'other';

export const companies: Record<CompanyId, { name: string; tile: string; code: string; business: string }> = {
  epure: { name: '이퓨어', tile: 'E', code: 'EPURE-DEMO', business: '제조 · 유통' },
  other: { name: '온새 유통', tile: 'O', code: 'ONSAE-DEMO', business: '유통' },
};

/** [name, dept, role, status, clockIn] */
export type Person = [name: string, dept: string, role: string, status: string, clockIn: string];

export const people: Person[] = [
  ['민서', '경영지원팀', '관리자', '근무 중', '09:00'],
  ['김하늘', '운영팀', '매니저', '근무 중', '08:57'],
  ['박지호', '구매팀', '매니저', '외근', '09:12'],
  ['이서윤', '물류팀', '매니저', '근무 중', '08:50'],
  ['정우진', '상품팀', '팀장', '휴가', '—'],
  ['한도윤', '개발팀', '매니저', '근무 중', '09:05'],
];

export function seed(company: CompanyId): ErpState {
  const other = company === 'other';
  const input: ErpStateInput = {
    items: other
      ? [['G-001', '데일리 머그컵', '상품', '본사 창고', 280, 100, 6500], ['G-002', '코튼 타월 세트', '상품', '물류 창고', 45, 60, 12000], ['G-003', '유리 보관 용기', '상품', '본사 창고', 160, 50, 8000]]
      : [['FG-001', '히녹스 히노키 모이스처 크림', '완제품', '본사 창고', 100, 50, 24000], ['FG-002', '비베라 글로우 바이탈 크림', '완제품', '본사 창고', 82, 100, 19000], ['RM-001', '글리세린', '원료', '원료 창고', 240, 100, 7500], ['RM-002', '히알루론산', '원료', '원료 창고', 32, 50, 48000], ['PK-001', '크림 용기 · 60ml', '부자재', '부자재 창고', 1200, 500, 850], ['SF-001', '보습 크림 벌크', '반제품', '원료 창고', 180, 80, 14000]],
    orders: [
      { id: 'PO-202610-001', name: other ? '코튼 타월 세트' : '크림 용기 · 60ml', vendor: '한빛 공급', qty: 500, price: 850, status: '승인 대기', date: '2026.10.07' },
      { id: 'PO-202610-002', name: other ? '유리 보관 용기' : '글리세린', vendor: '누리 소재', qty: 200, price: 7500, status: '발주 완료', date: '2026.10.06' },
      { id: 'PO-202610-003', name: other ? '데일리 머그컵' : '히알루론산', vendor: '그린 파트너스', qty: 50, price: 48000, status: '입고 완료', date: '2026.10.05' },
    ],
    leaves: [
      { name: '김하늘', dept: '운영팀', date: '2026-10-08', type: '연차', days: 1, status: '승인 대기' },
      { name: '박지호', dept: '구매팀', date: '2026-10-12', type: '오전 반차', days: 0.5, status: '승인 완료' },
    ],
    clock: null,
    modules: { erp: true, hr: true, manufacturing: !other, collab: true },
    collab: seedCollab(company),
    boms: other ? [] : seedBoms(),
    salaries: seedSalaries(),
  };
  const state = normalize(input);
  seedHr(state);
  confirmPayroll(state, '2026-09', '2026-09-25');
  seedSales(state, other);
  if (!other) seedProduction(state);
  seedInv(state);
  seedBooks(state, company);
  return state;
}

/** Sample sales go through the real order → shipment rules so stock and history stay consistent. */
function seedSales(state: ErpState, other: boolean) {
  const [a, b] = other ? ['G-001', 'G-003'] : ['FG-001', 'FG-002'];
  const customer = other ? '하늘 리빙' : '바른약국 체인';
  const first = sale(state, { itemCode: a, customer, qty: 20, price: other ? 9000 : 32000 });
  ship(state, first.id, 20, 'SEED-SHIP-1');
  first.id = 'SO-202608-014';
  first.date = '2026-08-28';
  Object.assign(state.movements[0], { ref: first.id, date: first.date });
  const second = sale(state, { itemCode: b, customer: other ? '모퉁이 상점' : '온누리 드럭', qty: 30, price: other ? 11000 : 26000 });
  ship(state, second.id, 10, 'SEED-SHIP-2');
  second.id = 'SO-202610-003';
  second.date = '2026-10-02';
  Object.assign(state.movements[0], { ref: second.id, date: second.date });
  // An October order shipped in full, so the month has real sales.
  const third = sale(state, { itemCode: a, customer: other ? '모퉁이 상점' : '온누리 드럭', qty: 50, price: other ? 9000 : 32000 });
  ship(state, third.id, 50, 'SEED-SHIP-3');
  third.id = 'SO-202610-006';
  third.date = '2026-10-06';
  Object.assign(state.movements[0], { ref: third.id, date: third.date });
  state.quotes = [
    { id: 'QT-202610-007', customer: other ? '바람 잡화' : '새봄 피부과', itemCode: a, name: state.items.find(i => i[0] === a)![1], qty: 40, price: other ? 8800 : 31000, date: '2026-10-06', validUntil: '2026-10-20', status: '작성' },
    { id: 'QT-202610-004', customer, itemCode: b, name: state.items.find(i => i[0] === b)![1], qty: 50, price: other ? 10500 : 25000, date: '2026-10-02', validUntil: '2026-10-16', status: '작성' },
    { id: 'QT-202609-021', customer: '그린마트', itemCode: a, name: state.items.find(i => i[0] === a)![1], qty: 100, price: other ? 8000 : 29000, date: '2026-09-18', validUntil: '2026-10-02', status: '거절', reason: '단가 조건 불일치' },
  ];
  state.payments = [
    { id: 'RC-SEED-1', kind: '수금', partner: customer, docId: first.id, amount: other ? 100000 : 300000, method: '계좌이체', date: '2026-09-30', note: '1차 입금' },
    { id: 'PY-SEED-1', kind: '지급', partner: '그린 파트너스', docId: 'PO-202610-003', amount: 1000000, method: '계좌이체', date: '2026-10-06', note: '선지급' },
  ];
}

const storageKey = (company: CompanyId) => 'tessel-demo-' + company;
/** Data saved under earlier product names. */
const legacyKeys = (company: CompanyId) => ['gyeol-demo-' + company, 'moa-demo-' + company];

export function loadState(company: CompanyId): ErpState {
  try {
    const raw = [storageKey(company), ...legacyKeys(company)].map(k => localStorage.getItem(k)).find(Boolean);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Saved before production/payroll existed: start those modules with sample masters.
      parsed.boms ??= company === 'epure' ? seedBoms() : [];
      parsed.salaries ??= seedSalaries();
      // Saved before the 회계 · 세무 screens existed: start them with sample records.
      const hadBooks = !!parsed.books, hadHr = !!parsed.hr, hadInv = !!parsed.inv;
      const state = normalize(parsed);
      if (!hadHr) seedHr(state);
      if (!hadInv) seedInv(state);
      if (!hadBooks) seedBooks(state, company);
      state.collab ||= seedCollab(company);
      return state;
    }
  } catch {}
  return seed(company);
}

/** False when the browser refused to store it (storage full or blocked). */
export function saveState(company: CompanyId, state: ErpState) {
  try {
    localStorage.setItem(storageKey(company), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** A finished semi-product run, plus one plannable and one short-of-material order. */
function seedProduction(state: ErpState) {
  const done = createWorkOrder(state, { productCode: 'SF-001', qty: 50 });
  done.id = 'MO-202610-001';
  done.date = '2026-10-03';
  done.lot = 'LOT-20261003-001';
  issueMaterials(state, done.id, 'SEED-MO1-OUT');
  reportOutput(state, done.id, 50, 'SEED-MO1-IN');
  const ready = createWorkOrder(state, { productCode: 'FG-001', qty: 300, due: '2026-10-10' });
  ready.id = 'MO-202610-002';
  ready.lot = 'LOT-20261007-002';
  const short = createWorkOrder(state, { productCode: 'FG-002', qty: 2000, due: '2026-10-17' });
  short.id = 'MO-202610-003';
  short.lot = 'LOT-20261007-003';
}
