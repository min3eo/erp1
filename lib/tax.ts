/* VAT and withholding summaries built from the journal and payroll records. Sample rules, not a filing tool. */
import { incomeSummary, journal, trialBalance, type JournalEntry, type Source } from './accounting';
import { accountTypes, addMonths, dailyTax, lastDay, monthOf, otherIncomeTax, type OtherIncomeKind } from './books';
import { zeroRatedSales } from './forex';
import { yearEndCalc } from './hr';
import { assertOpen } from './admin';
import { corpTaxFrom, corpTaxOn } from './corp-tax';
import { date, id, type ErpState } from './flow-core';
import { payslips } from './payroll';

/* ───────── 부가세 ───────── */

/** '2026-Q3' → months 2026-07..09. 1기 = 1~6월, 2기 = 7~12월; 예정 = 1 · 3분기, 확정 = 2 · 4분기. */
export const quarterOf = (d: string) => `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}`;
export function quarterMonths(period: string) {
  const [y, q] = [period.slice(0, 4), Number(period.slice(6))];
  const first = `${y}-${String((q - 1) * 3 + 1).padStart(2, '0')}`;
  return [first, addMonths(first, 1), addMonths(first, 2)];
}
export function quarterLabel(period: string) {
  const q = Number(period.slice(6));
  return `${period.slice(0, 4)}년 ${q <= 2 ? 1 : 2}기 ${q % 2 ? '예정' : '확정'} (${(q - 1) * 3 + 1}~${q * 3}월)`;
}
/** Filing and payment due: the 25th of the month after the quarter. */
export const vatDue = (period: string) => `${addMonths(quarterMonths(period)[2], 1)}-25`;
export const quarterEnded = (period: string, today = date()) => lastDay(quarterMonths(period)[2]) < today;

/** Recent quarters, newest first, for the period picker. */
export function recentQuarters(today = date(), count = 6) {
  const out: string[] = [];
  let m = monthOf(today);
  while (out.length < count) {
    const q = quarterOf(m + '-01');
    if (!out.includes(q)) out.push(q);
    m = addMonths(m, -1);
  }
  return out;
}

export interface VatSummary {
  period: string; output: number; input: number; payable: number; due: string;
  bySource: { source: Source; output: number; input: number }[];
  invoices: { salesCount: number; salesSupply: number; purchaseCount: number; purchaseSupply: number; unsent: number };
  /** 영세율 과세표준 (수출, 원화 환산액). */
  zeroRated: number;
}

/** Output tax = 부가세예수금 credits, input tax = 부가세대급금 debits within the quarter (filing entries excluded). */
export function vatSummary(state: ErpState, period: string, entries: JournalEntry[] = journal(state)): VatSummary {
  const months = quarterMonths(period);
  const inPeriod = entries.filter(e => e.source !== '세무' && months.includes(e.date.slice(0, 7)));
  const by = new Map<Source, { output: number; input: number }>();
  inPeriod.forEach(e => e.lines.forEach(l => {
    if (l.account !== '부가세예수금' && l.account !== '부가세대급금') return;
    const r = by.get(e.source) ?? { output: 0, input: 0 };
    if (l.account === '부가세예수금') r.output += l.credit - l.debit;
    else r.input += l.debit - l.credit;
    by.set(e.source, r);
  }));
  const bySource = [...by].map(([source, v]) => ({ source, ...v }));
  const output = bySource.reduce((t, r) => t + r.output, 0);
  const input = bySource.reduce((t, r) => t + r.input, 0);
  const inv = state.books.invoices.filter(i => months.includes(i.date.slice(0, 7)));
  const sales = inv.filter(i => i.kind === '매출'), purchases = inv.filter(i => i.kind === '매입');
  return {
    period, output, input, payable: output - input, due: vatDue(period), bySource,
    zeroRated: zeroRatedSales(state.books, months).reduce((t, d) => t + d.krw, 0),
    invoices: {
      salesCount: sales.length, salesSupply: sales.reduce((t, i) => t + i.supply, 0),
      purchaseCount: purchases.length, purchaseSupply: purchases.reduce((t, i) => t + i.supply, 0),
      unsent: sales.filter(i => i.status !== '전송 완료').length,
    },
  };
}

export const vatFiling = (state: ErpState, period: string) => state.books.filings.find(f => f.kind === '부가세' && f.period === period);

/** Files and pays (or claims a refund for) one quarter: clears 부가세예수금 / 부가세대급금 for it. */
export function fileVat(state: ErpState, period: string, today = date()) {
  if (vatFiling(state, period)) throw Error('이미 신고한 기간이에요.');
  if (!quarterEnded(period, today)) throw Error('분기가 끝난 뒤에 신고할 수 있어요.');
  const s = vatSummary(state, period, journal(state, today));
  if (!s.output && !s.input) throw Error('이 기간에는 부가세 거래가 없어요.');
  assertOpen(state, today);
  const f = { id: id('VAT'), kind: '부가세' as const, period, date: today, amount: s.payable, output: s.output, input: s.input };
  state.books.filings.push(f);
  return f;
}

/* ───────── 원천세 ───────── */

export interface WithholdingRow { code: string; label: string; people: number; gross: number; tax: number; local: number }

/** 원천징수이행상황신고서 rows for one payment month: 근로 · 연말정산 · 일용 · 퇴직 · 사업 · 기타 · 이자 · 배당. */
export function withholdingSummary(state: ErpState, month: string) {
  const run = state.payrolls.find(r => r.month === month);
  // Runs confirmed before taxes were stored fall back to today's payslips.
  const fallback = run && run.incomeTax == null ? payslips(state) : null;
  const wageTax = run ? run.incomeTax ?? fallback!.reduce((t, p) => t + p.incomeTax, 0) : 0;
  const wageLocal = run ? run.localTax ?? fallback!.reduce((t, p) => t + p.localTax, 0) : 0;
  const daily = state.books.dailyWork.filter(w => w.paidAt && monthOf(w.paidAt) === month);
  const other = (kind: OtherIncomeKind) => state.books.otherIncome.filter(o => o.kind === kind && monthOf(o.date) === month);
  const sumOther = (kind: OtherIncomeKind) => {
    const list = other(kind);
    return { people: new Set(list.map(o => o.name)).size, gross: list.reduce((t, o) => t + o.gross, 0), tax: list.reduce((t, o) => t + otherIncomeTax(o.kind, o.gross).tax, 0), local: list.reduce((t, o) => t + otherIncomeTax(o.kind, o.gross).local, 0) };
  };
  const rows: WithholdingRow[] = [
    { code: 'A01', label: '근로소득 · 간이세액', people: run?.headcount ?? 0, gross: run?.gross ?? 0, tax: wageTax, local: wageLocal },
    {
      code: 'A03', label: '일용근로소득', people: new Set(daily.map(w => w.name)).size, gross: daily.reduce((t, w) => t + dailyTax(w).gross, 0),
      tax: daily.reduce((t, w) => t + dailyTax(w).tax, 0), local: daily.reduce((t, w) => t + dailyTax(w).local, 0),
    },
    { code: 'A04', label: '근로소득 · 연말정산', ...yearEndRow(state, month) },
    { code: 'A21', label: '퇴직소득', ...severanceRow(state, month) },
    { code: 'A25', label: '사업소득 · 매월징수', ...sumOther('사업소득') },
    { code: 'A42', label: '기타소득', ...sumOther('기타소득') },
    { code: 'A50', label: '이자소득', ...sumOther('이자소득') },
    { code: 'A60', label: '배당소득', ...sumOther('배당소득') },
  ];
  const tax = rows.reduce((t, r) => t + r.tax, 0), local = rows.reduce((t, r) => t + r.local, 0);
  return { month, rows, tax, local, total: tax + local, due: `${addMonths(month, 1)}-10` };
}

/** 연말정산 settled in this month: + 추가 징수, − 환급 (reduces what the company pays). */
function yearEndRow(state: ErpState, month: string) {
  const done = Object.entries(state.hr?.yearEnd ?? {}).flatMap(([year, people]) => Object.entries(people).filter(([, v]) => v.done && monthOf(v.done) === month).map(([name]) => yearEndCalc(state, year, name)));
  return { people: done.length, gross: done.reduce((t, c) => t + c.total, 0), tax: done.reduce((t, c) => t + c.diff, 0), local: done.reduce((t, c) => t + c.diffLocal, 0) };
}

function severanceRow(state: ErpState, month: string) {
  const paid = (state.hr?.severance ?? []).filter(s => s.paidAt && monthOf(s.paidAt) === month);
  return { people: paid.length, gross: paid.reduce((t, s) => t + s.amount, 0), tax: paid.reduce((t, s) => t + s.tax, 0), local: paid.reduce((t, s) => t + s.local, 0) };
}

export const withholdingFiling = (state: ErpState, month: string) => state.books.filings.find(f => f.kind === '원천세' && f.period === month);

/** Months with anything withheld, newest first. */
export function withholdingMonths(state: ErpState) {
  const months = new Set<string>([
    ...state.payrolls.map(r => r.month),
    ...state.books.dailyWork.filter(w => w.paidAt).map(w => monthOf(w.paidAt!)),
    ...state.books.otherIncome.map(o => monthOf(o.date)),
    ...(state.hr?.severance ?? []).filter(x => x.paidAt).map(x => monthOf(x.paidAt!)),
    ...Object.values(state.hr?.yearEnd ?? {}).flatMap(p => Object.values(p).filter(v => v.done).map(v => monthOf(v.done!))),
    monthOf(date()),
  ]);
  return [...months].sort().reverse();
}

/** Pays one month's withheld income + local tax from the main account. */
export function payWithholding(state: ErpState, month: string, today = date()) {
  if (withholdingFiling(state, month)) throw Error('이미 신고 · 납부한 달이에요.');
  if (monthOf(today) <= month) throw Error('지급한 달이 끝난 뒤에 신고할 수 있어요.');
  const s = withholdingSummary(state, month);
  if (!s.total) throw Error('이 달에는 원천징수한 세금이 없어요.');
  assertOpen(state, today);
  const f = { id: id('WHT'), kind: '원천세' as const, period: month, date: today, amount: s.total };
  state.books.filings.push(f);
  return f;
}

/* ───────── 법인세 ───────── */

export { corpBrackets, corpTaxOn } from './corp-tax';

/** 법인세 estimate for one 사업연도 (12월 결산) from the books so far, plus a full-year projection. */
export function corpTaxEstimate(state: ErpState, year: string, today = date()) {
  const c = corpTaxFrom(state, year, journal(state, today));
  const { income, carry } = c;
  const months = year < today.slice(0, 4) ? 12 : year > today.slice(0, 4) ? 0 : Number(today.slice(5, 7));
  const annualBase = months ? Math.max(0, Math.round((income * 12) / months) - carry) : 0;
  const annual = corpTaxOn(annualBase, year).tax;
  return {
    ...c, adjust: c.manual, months,
    annualBase, annual, annualLocal: Math.floor(annual * 0.1 / 10) * 10,
    due: `${Number(year) + 1}-03-31`, interimDue: `${year}-08-31`,
  };
}
