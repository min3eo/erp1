/* 결산: closing adjustments (대손 · 퇴직급여 · 법인세 · 발생주의), the month-end checklist and retained earnings. */
import { assertOpen, closeMonth } from './admin';
import { incomeSummary, journal, trialBalance, type JournalEntry, type JournalLine } from './accounting';
import { accountTypes, addMonths, isProcessed, lastDay, monthOf, type Voucher } from './books';
import { date, id, type ErpState } from './flow-core';
import { severanceLiability } from './hr';
import { stockLedger } from './inventory';
import { corpTaxFrom } from './corp-tax';

type Value = string | number | undefined;

export const CLOSING_KEYS = ['대손충당금', '퇴직급여충당부채', '법인세비용'] as const;
export type ClosingKey = (typeof CLOSING_KEYS)[number];

export interface ClosingItem {
  key: ClosingKey; basis: string;
  /** Balance the account should have at the period end, and what the books show now. */
  target: number; current: number;
  /** Positive: dr `debit` / cr `credit`; negative reverses it. 0 = nothing to book. */
  amount: number; debit: string; credit: string;
}

const balances = (state: ErpState, entries: JournalEntry[]) => {
  const rows = trialBalance(entries, accountTypes(state));
  return (account: string) => rows.find(r => r.account === account)?.balance ?? 0;
};

const asLines = (i: Pick<ClosingItem, 'amount' | 'debit' | 'credit'>): JournalLine[] => {
  const a = Math.abs(i.amount);
  return i.amount > 0
    ? [{ account: i.debit, debit: a, credit: 0 }, { account: i.credit, debit: 0, credit: a }]
    : [{ account: i.credit, debit: a, credit: 0 }, { account: i.debit, debit: 0, credit: a }];
};

/** Entries on or before `asOf`. */
const upTo = (state: ErpState, asOf: string) => journal(state, asOf).filter(e => e.date <= asOf);

/**
 * What each 결산 정리 should book as of `asOf` (a month end). Each item tops its account up (or down)
 * to the target, so booking twice never doubles; 법인세 is computed after the other two are applied.
 */
export function closingItems(state: ErpState, asOf: string): ClosingItem[] {
  const entries = upTo(state, asOf);
  const bal = balances(state, entries);
  const year = asOf.slice(0, 4);
  const items: ClosingItem[] = [];

  const receivable = bal('외상매출금') + bal('미수금');
  const rate = state.books.badDebtRate;
  const allowance = Math.round((Math.max(0, receivable) * rate) / 100);
  // 대손충당금 is a contra asset: its credit balance shows as a negative asset balance.
  items.push({ key: '대손충당금', basis: `외상매출금 + 미수금 ${receivable.toLocaleString()}원 × ${rate}%`, target: allowance, current: -bal('대손충당금'), amount: allowance + bal('대손충당금'), debit: '대손상각비', credit: '대손충당금' });

  const liability = severanceLiability(state, asOf);
  items.push({ key: '퇴직급여충당부채', basis: 'DB · 퇴직연금 미가입 재직자가 모두 퇴직한다고 할 때의 퇴직금 (퇴직금 추계액)', target: liability, current: bal('퇴직급여충당부채'), amount: liability - bal('퇴직급여충당부채'), debit: '퇴직급여', credit: '퇴직급여충당부채' });

  // 법인세: this year's books plus the two pending items above, adjusted like the 법인세 screen.
  const pending: JournalEntry[] = items.filter(i => i.amount).map(i => ({ id: 'PENDING-' + i.key, date: asOf, source: '결산', desc: '', ref: '', lines: asLines(i) }));
  const t = corpTaxFrom(state, year, [...entries, ...pending]);
  const total = t.total;
  const booked = t.pl.taxExpense;
  const base = t.base;
  items.push({ key: '법인세비용', basis: `${year}년 ${asOf.slice(5, 7)}월까지 과세표준 ${base.toLocaleString()}원 기준 법인세 + 지방소득세`, target: total, current: booked, amount: total - booked, debit: '법인세비용', credit: '미지급법인세' });
  return items;
}

/** Books the chosen closing items as one 대체 voucher each, dated `asOf`. */
export function bookClosing(state: ErpState, asOf: string, keys: readonly string[] = CLOSING_KEYS) {
  if (asOf !== lastDay(monthOf(asOf))) throw Error('결산 정리는 월말 날짜로 해요.');
  if (asOf > date()) throw Error('아직 지나지 않은 달은 결산할 수 없어요.');
  assertOpen(state, asOf);
  const todo = closingItems(state, asOf).filter(i => keys.includes(i.key) && i.amount);
  if (!todo.length) throw Error('반영할 결산 정리가 없어요. 이미 장부와 맞아요.');
  todo.forEach(i => {
    const v: Voucher = { id: id('JV'), date: asOf, kind: '대체', desc: `결산 정리 · ${i.key} (${monthOf(asOf)})`, partner: '', lines: asLines(i), origin: '결산', closing: i.key };
    state.books.vouchers.unshift(v);
  });
  return todo;
}

export function setBadDebtRate(state: ErpState, rate: Value) {
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw Error('설정률은 0~100% 사이로 입력해 주세요.');
  state.books.badDebtRate = Math.round(n * 100) / 100;
}

/* ───────── 발생주의 정리 (accruals with automatic reversal) ───────── */

export const ACCRUAL_KINDS = {
  미지급비용: { side: '비용', desc: '이번 달 쓴 비용인데 청구서 · 지급이 다음 달인 것 (예: 이번 달 전기료)' },
  선급비용: { side: '비용', desc: '미리 낸 비용 중 다음 달 이후 몫 (예: 1년치 보험료)' },
  미수수익: { side: '수익', desc: '이번 달 번 수익인데 돈은 다음 달 받는 것 (예: 예금 이자)' },
  선수수익: { side: '수익', desc: '미리 받은 수익 중 다음 달 이후 몫 (예: 선결제 이용료)' },
} as const;
export type AccrualKind = keyof typeof ACCRUAL_KINDS;

/**
 * Books an accrual at the month end and its reversal (역분개) on the 1st of the next month,
 * so the real bill or payment can be booked normally when it arrives.
 */
export function addAccrual(state: ErpState, f: { kind: Value; month: Value; account: Value; amount: Value; desc: Value }) {
  const kind = String(f.kind) as AccrualKind;
  if (!(kind in ACCRUAL_KINDS)) throw Error('정리 구분을 골라 주세요.');
  const month = String(f.month ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw Error('결산 월을 확인해 주세요.');
  const account = String(f.account ?? '');
  const types = accountTypes(state);
  if (types[account] !== ACCRUAL_KINDS[kind].side) throw Error(`${ACCRUAL_KINDS[kind].side} 계정을 골라 주세요.`);
  const amount = Number(f.amount);
  if (!Number.isInteger(amount) || amount < 1) throw Error('금액은 1원 이상의 정수로 입력해 주세요.');
  const desc = String(f.desc ?? '').trim();
  if (!desc) throw Error('내용을 입력해 주세요.');
  const at = lastDay(month), back = `${addMonths(month, 1)}-01`;
  assertOpen(state, at);
  assertOpen(state, back);
  // 미지급비용 · 선수수익 are liabilities, 선급비용 · 미수수익 assets; expenses rise with 미지급비용, fall with 선급비용, and so on.
  const [dr, cr] = kind === '미지급비용' ? [account, kind] : kind === '선급비용' ? [kind, account] : kind === '미수수익' ? [kind, account] : [account, kind];
  const accrual: Voucher = { id: id('JV'), date: at, kind: '대체', desc: `${kind} · ${desc}`, partner: '', lines: [{ account: dr, debit: amount, credit: 0 }, { account: cr, debit: 0, credit: amount }], origin: '결산', closing: kind };
  const reversal: Voucher = { ...accrual, id: id('JV'), date: back, desc: `[역분개] ${kind} · ${desc}`, lines: [{ account: cr, debit: amount, credit: 0 }, { account: dr, debit: 0, credit: amount }], pair: accrual.id };
  accrual.pair = reversal.id;
  state.books.vouchers.unshift(reversal, accrual);
  return accrual;
}

export const accruals = (state: ErpState) => state.books.vouchers.filter(v => v.origin === '결산' && v.closing && v.closing in ACCRUAL_KINDS && !v.desc.startsWith('[역분개]'));

/* ───────── Month-end checklist ───────── */

export interface Check { label: string; ok: boolean; detail: string; page: string; blocking?: boolean }

export function monthChecks(state: ErpState, month: string): Check[] {
  const end = lastDay(month);
  const entries = upTo(state, end);
  const bal = balances(state, entries);
  const inMonth = (d: string) => monthOf(d) === month;
  const debit = entries.reduce((t, e) => t + e.lines.reduce((s, l) => s + l.debit, 0), 0);
  const credit = entries.reduce((t, e) => t + e.lines.reduce((s, l) => s + l.credit, 0), 0);
  const bank = state.books.bankTx.filter(t => inMonth(t.date) && !isProcessed(t)).length;
  const expenses = state.books.expenses.filter(e => inMonth(e.date) && e.status === '승인 대기').length;
  const invoices = state.books.invoices.filter(i => i.kind === '매출' && i.status === '발행 대기' && i.date <= end).length;
  const adjust = state.adjustments.filter(a => a.status === '승인 대기').length;
  const unapproved = state.books.vouchers.filter(v => inMonth(v.date) && v.origin !== '결산' && !v.approvedBy).length;
  const payroll = state.payrolls.some(r => r.month === month);
  const stockBook = bal('재고자산') + bal('재공품');
  const stockValue = stockLedger(state, month).reduce((t, r) => t + r.close.value, 0);
  const items = end <= date() ? closingItems(state, end).filter(i => i.key !== '법인세비용' || month.endsWith('-12')) : [];
  const unbooked = items.filter(i => i.amount);
  return [
    { label: '차변 · 대변 일치', ok: debit === credit, detail: debit === credit ? '모든 전표의 차변과 대변 합계가 같아요.' : `차이 ${Math.abs(debit - credit).toLocaleString()}원`, page: 'accounting', blocking: true },
    { label: '계좌 · 카드 내역 처리', ok: !bank, detail: bank ? `처리하지 않은 내역 ${bank}건` : '이달 내역을 모두 전표로 처리했어요.', page: 'funds' },
    { label: '전표 승인', ok: !unapproved, detail: unapproved ? `승인하지 않은 전표 ${unapproved}건` : '이달 전표를 모두 승인했어요.', page: 'vouchers' },
    { label: '경비 승인', ok: !expenses, detail: expenses ? `승인 대기 ${expenses}건` : '대기 중인 경비가 없어요.', page: 'expenses' },
    { label: '매출 세금계산서 발행', ok: !invoices, detail: invoices ? `발행 대기 ${invoices}건 (다음 달 10일까지 발급)` : '발행 대기 중인 계산서가 없어요.', page: 'taxInvoices' },
    { label: '급여 확정', ok: payroll, detail: payroll ? '이달 급여를 확정했어요.' : '이달 급여를 아직 확정하지 않았어요.', page: 'payroll' },
    { label: '재고 실사 조정', ok: !adjust, detail: adjust ? `승인 대기 조정 ${adjust}건` : '대기 중인 조정이 없어요.', page: 'adjustments' },
    { label: '재고 장부 = 원가 평가', ok: Math.abs(stockBook - stockValue) < 10, detail: `장부 ${stockBook.toLocaleString()}원 · 수불부 월말 ${stockValue.toLocaleString()}원`, page: 'inventory' },
    { label: '결산 정리 반영', ok: !unbooked.length, detail: unbooked.length ? `${unbooked.map(i => i.key).join(', ')} 반영 전` : '대손 · 퇴직급여 정리를 반영했어요.', page: 'closing' },
  ];
}

/** Closes a month after the blocking checks pass (the others are warnings). */
export function closeWithChecks(state: ErpState, month: string, today = date()) {
  const blocked = monthChecks(state, month).filter(c => c.blocking && !c.ok);
  if (blocked.length) throw Error(`마감할 수 없어요: ${blocked.map(c => c.label).join(', ')}`);
  closeMonth(state, month, today);
}

/* ───────── 이익잉여금 · 자본변동표 ───────── */

/** Year-by-year equity movement. Profit is never closed into an account, so earlier years' profit is carried here. */
export function equityStatement(state: ErpState, year: string, today = date()) {
  const all = journal(state, today);
  const types = accountTypes(state);
  const net = (from: string, to: string) => {
    const pl = incomeSummary(trialBalance(all.filter(e => e.date >= from && e.date <= to), types));
    return pl.after;
  };
  const sumAccount = (account: string, pick: (e: JournalEntry) => boolean, sign: 1 | -1 = 1) =>
    all.filter(pick).reduce((t, e) => t + e.lines.filter(l => l.account === account).reduce((s, l) => s + sign * (l.credit - l.debit), 0), 0);
  const start = `${year}-01-01`, end = `${year}-12-31`;
  const before = (e: JournalEntry) => e.date < start;
  const within = (e: JournalEntry) => e.date >= start && e.date <= end;
  const capitalOpen = sumAccount('기초자본', before);
  const capitalIn = sumAccount('기초자본', within);
  const retainedOpen = sumAccount('이월이익잉여금', before) + net('0000-01-01', `${Number(year) - 1}-12-31`);
  const dividends = -sumAccount('이월이익잉여금', within);
  const profit = net(start, end);
  return {
    year,
    rows: [
      { label: '기초 잔액', capital: capitalOpen, retained: retainedOpen },
      { label: '자본 변동 (출자 · 기초 이월)', capital: capitalIn, retained: 0 },
      { label: '배당 등 처분', capital: 0, retained: -dividends },
      { label: '당기순이익', capital: 0, retained: profit },
    ],
    close: { capital: capitalOpen + capitalIn, retained: retainedOpen - dividends + profit },
    profit,
  };
}
