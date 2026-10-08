/* Live versions of the former preview screens: 가용재고, 월간 리포트, 회사 정보 and 홈택스 매입 대사. */
import { journal } from './accounting';
import { addMonths, bizNoOf, lastDay, type TaxInvoice } from './books';
import { date, round, unit, type ErpState } from './flow-core';
import { costLedger, stockLedger } from './inventory';
import { parseTable } from './import';
import { requirements } from './production';

/* ───────── 가용재고 ───────── */

/**
 * Per item: good stock on hand, what open sales orders and planned work orders have claimed,
 * what is on order from suppliers, and what can still be promised.
 */
export function availability(state: ErpState) {
  return state.items.map(i => {
    const sales = state.sales.filter(s => s.itemCode === i[0] && (s.status === '출고 대기' || s.status === '부분 출고')).reduce((t, s) => t + s.qty - s.shipped, 0);
    const production = state.workOrders.filter(w => w.status === '계획').reduce((t, w) => t + (requirements(state, w).find(r => r.code === i[0])?.need ?? 0), 0);
    const incoming = state.orders.filter(o => o.itemCode === i[0] && ['승인 완료', '발주 완료', '부분 입고'].includes(o.status)).reduce((t, o) => t + o.qty - o.received, 0);
    const making = state.workOrders.filter(w => w.productCode === i[0] && (w.status === '계획' || w.status === '생산 중')).reduce((t, w) => t + w.qty - w.produced, 0);
    const reserved = round(sales + production);
    const available = round(i[4] - reserved);
    return { code: i[0], name: i[1], type: i[2], warehouse: i[3], unit: unit(i), stock: i[4], safety: i[5], sales: round(sales), production: round(production), reserved, available, incoming: round(incoming + making), expected: round(available + incoming + making), bad: state.quarantine[i[0]] || 0 };
  });
}

/* ───────── 월간 리포트 ───────── */

const weekOf = (d: string) => Math.min(4, Math.floor((Number(d.slice(8)) - 1) / 7));

/** One month of 구매 · 판매, 재고 and 근태 figures, with last month for comparison. */
export function monthlyReport(state: ErpState, month: string) {
  const entries = journal(state, lastDay(month));
  const { byMovement } = costLedger(state);
  const lines = [...byMovement.values()];
  const range = (m: string) => [`${m}-01`, lastDay(m)] as const;
  const trade = (m: string) => {
    const [a, b] = range(m);
    const inM = entries.filter(e => e.date >= a && e.date <= b);
    const purchase = lines.filter(l => l.date >= a && l.date <= b && l.type === '구매 입고').reduce((t, l) => t + l.amount, 0) + state.books.trades.filter(t => t.kind === '매입' && t.date >= a && t.date <= b).reduce((t, x) => t + x.supply, 0);
    const sales = inM.reduce((t, e) => t + e.lines.filter(l => l.account === '매출').reduce((s, l) => s + l.credit - l.debit, 0), 0);
    const shipments = state.movements.filter(x => x.type === '판매 출고' && !x.cancelled && x.date >= a && x.date <= b).length;
    const out = lines.filter(l => l.date >= a && l.date <= b && (l.type === '판매 출고' || l.type === '생산 출고')).reduce((t, l) => t - l.amount, 0);
    const inValue = lines.filter(l => l.date >= a && l.date <= b && l.qty > 0 && l.type !== '창고 이동' && l.type !== '기초 재고').reduce((t, l) => t + l.amount, 0);
    const weeks = [0, 1, 2, 3, 4].map(w => ({
      purchase: lines.filter(l => l.date >= a && l.date <= b && weekOf(l.date) === w && l.type === '구매 입고').reduce((t, l) => t + l.amount, 0),
      sales: inM.filter(e => e.source === '판매' && weekOf(e.date) === w).reduce((t, e) => t + e.lines.filter(l => l.account === '매출').reduce((s, l) => s + l.credit - l.debit, 0), 0),
      in: lines.filter(l => l.date >= a && l.date <= b && weekOf(l.date) === w && l.qty > 0 && l.type !== '창고 이동').reduce((t, l) => t + l.amount, 0),
      out: lines.filter(l => l.date >= a && l.date <= b && weekOf(l.date) === w && l.qty < 0 && l.type !== '창고 이동').reduce((t, l) => t - l.amount, 0),
    }));
    return { purchase, sales, shipments, out, inValue, weeks };
  };
  const now = trade(month), prev = trade(addMonths(month, -1));
  const ledger = stockLedger(state, month);
  const types = [...new Set(state.items.map(i => i[2]))].map(type => {
    const rows = ledger.filter(r => state.items.find(i => i[0] === r.code)?.[2] === type);
    return { type, count: rows.length, value: rows.reduce((t, r) => t + r.close.value, 0), low: state.items.filter(i => i[2] === type && i[4] < i[5]).length };
  });
  const stockValue = ledger.reduce((t, r) => t + r.close.value, 0);

  const hr = (m: string) => {
    const leave = state.leaves.filter(l => l.status === '승인 완료' && l.date.startsWith(m)).reduce((t, l) => t + l.days, 0);
    const overtime = state.hr.overtime.filter(o => o.month === m).reduce((t, o) => t + o.overtime + o.night + o.holiday, 0);
    const active = state.employees.filter(e => e.joined <= lastDay(m) && (!e.left || e.left >= `${m}-01`));
    return { leave, overtime, headcount: active.length, joined: state.employees.filter(e => e.joined.startsWith(m)).length, left: state.employees.filter(e => e.left?.startsWith(m)).length };
  };
  const depts = [...new Set(state.employees.filter(e => !e.left).map(e => e.dept))].map(dept => {
    const people = state.employees.filter(e => e.dept === dept && !e.left).map(e => e.name);
    return {
      dept, people: people.length,
      leave: state.leaves.filter(l => l.status === '승인 완료' && l.date.startsWith(month) && people.includes(l.name)).reduce((t, l) => t + l.days, 0),
      overtime: state.hr.overtime.filter(o => o.month === month && people.includes(o.name)).reduce((t, o) => t + o.overtime + o.night + o.holiday, 0),
      pending: state.leaves.filter(l => l.status === '승인 대기' && people.includes(l.name)).length,
    };
  });
  return { month, now, prev, types, stockValue, hr: hr(month), hrPrev: hr(addMonths(month, -1)), depts };
}

export const change = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${(((a - b) / Math.abs(b)) * 100).toFixed(1)}%` : a ? '신규' : '—');

/* ───────── 회사 정보 ───────── */

export interface CompanyProfile { name: string; bizNo: string; ceo: string; address: string; bizType: string; bizItem: string; phone: string; email: string }

/** The company's own details for tax invoices and documents; sample values until the user fills them in. */
export function companyProfile(state: ErpState, fallback: { name: string; business: string }): CompanyProfile {
  return {
    name: fallback.name, bizNo: '123-45-67890', ceo: '민서', address: '서울특별시 성동구 성수이로 00 (샘플)', bizType: fallback.business, bizItem: '화장품 · 생활용품', phone: '02-000-0000', email: '',
    ...state.books.company,
  };
}

export function setCompanyProfile(state: ErpState, f: Partial<Record<keyof CompanyProfile, string>>) {
  const name = String(f.name ?? '').trim();
  if (!name) throw Error('상호를 입력해 주세요.');
  const bizNo = String(f.bizNo ?? '').trim();
  if (!/^\d{3}-\d{2}-\d{5}$/.test(bizNo)) throw Error('사업자등록번호는 000-00-00000 형식으로 입력해 주세요.');
  const ceo = String(f.ceo ?? '').trim();
  if (!ceo) throw Error('대표자를 입력해 주세요.');
  state.books.company = {
    name, bizNo, ceo, address: String(f.address ?? '').trim(), bizType: String(f.bizType ?? '').trim(), bizItem: String(f.bizItem ?? '').trim(),
    phone: String(f.phone ?? '').trim(), email: String(f.email ?? '').trim(),
  };
}

/* ───────── 홈택스 매입 세금계산서 대사 ───────── */

const HOMETAX_COLUMNS = { date: ['작성일자', '작성일'], bizNo: ['공급자사업자등록번호', '공급자 사업자등록번호', '사업자등록번호'], name: ['상호', '공급자상호', '공급자 상호'], supply: ['공급가액'], vat: ['세액'], item: ['품목명', '품목'] };

/**
 * Compares the 매입 세금계산서 list downloaded from 홈택스 with the invoices in the books (same supplier, month and amounts).
 * missing: on 홈택스 but not booked (a purchase not entered yet). extra: booked but not on 홈택스 (not issued, or a different supplier number).
 */
export function reconcileHometax(state: ErpState, text: string) {
  const [header, ...rows] = parseTable(text);
  if (!header) return { matched: [], missing: [], extra: [], error: '' };
  const col = (k: keyof typeof HOMETAX_COLUMNS) => header.findIndex(h => HOMETAX_COLUMNS[k].includes(h.replace(/\s/g, '').replace('*', '')) || HOMETAX_COLUMNS[k].includes(h.trim()));
  const idx = { date: col('date'), bizNo: col('bizNo'), name: col('name'), supply: col('supply'), vat: col('vat'), item: col('item') };
  const need = (['date', 'name', 'supply', 'vat'] as const).filter(k => idx[k] < 0);
  if (need.length) return { matched: [], missing: [], extra: [], error: `필요한 열이 없어요: ${need.map(k => HOMETAX_COLUMNS[k][0]).join(', ')}` };
  const num = (v?: string) => Number(String(v ?? '').replace(/[,원\s]/g, '')) || 0;
  const list = rows.map((r, i) => ({
    line: i + 2, date: String(r[idx.date] ?? '').replace(/[./]/g, '-').slice(0, 10), bizNo: idx.bizNo >= 0 ? String(r[idx.bizNo] ?? '').trim() : '',
    name: String(r[idx.name] ?? '').trim(), supply: num(r[idx.supply]), vat: num(r[idx.vat]), item: idx.item >= 0 ? String(r[idx.item] ?? '') : '',
  })).filter(r => r.name && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
  const months = new Set(list.map(r => r.date.slice(0, 7)));
  const booked = state.books.invoices.filter(i => i.kind === '매입' && months.has(i.date.slice(0, 7)));
  const used = new Set<string>();
  const same = (inv: TaxInvoice, r: (typeof list)[number]) =>
    !used.has(inv.id) && inv.date.slice(0, 7) === r.date.slice(0, 7) && inv.supply === r.supply && inv.vat === r.vat &&
    ((r.bizNo && bizNoOf(state, inv.partner) === r.bizNo) || inv.partner.replace(/\s|\(주\)|주식회사/g, '') === r.name.replace(/\s|\(주\)|주식회사/g, ''));
  const matched: { row: (typeof list)[number]; invoice: TaxInvoice }[] = [];
  const missing: (typeof list)[number][] = [];
  list.forEach(r => {
    const inv = booked.find(i => same(i, r));
    if (inv) { used.add(inv.id); matched.push({ row: r, invoice: inv }); }
    else missing.push(r);
  });
  return { matched, missing, extra: booked.filter(i => !used.has(i.id)), error: '' };
}

export const todayMonth = () => date().slice(0, 7);
