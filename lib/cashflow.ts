/* Cash forecast: today's bank + cash balance rolled forward with what is due to come in and go out. */
import { fundBalances, journal } from './accounting';
import { addMonths, contractPhase, monthOf } from './books';
import { payables, receivables } from './finance';
import { date, type ErpState } from './flow-core';
import { loanSchedule, loanStatus } from './loans';
import { payslips, totals } from './payroll';
import { quarterOf, recentQuarters, vatDue, vatFiling, vatSummary, withholdingFiling, withholdingMonths, withholdingSummary } from './tax';

export type FlowKind = '수금 예정' | '지급 예정' | '급여' | '세금' | '카드 대금' | '경비' | '정기 계약' | '차입금' | '직접 입력';
export interface FlowItem { date: string; desc: string; amount: number; kind: FlowKind; planId?: string; overdue?: boolean }

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
/** Monday of the week containing d. */
const weekStart = (d: string) => {
  const day = new Date(d + 'T00:00:00Z').getUTCDay();
  return addDays(d, -((day + 6) % 7));
};

export function cashPlan(state: ErpState, today = date(), weeks = 8) {
  const entries = journal(state, today);
  const balances = fundBalances(state, entries);
  const opening = balances.filter(b => b.fund.kind !== '카드').reduce((t, b) => t + b.balance, 0);
  const horizon = addDays(weekStart(today), weeks * 7 - 1);
  const items: FlowItem[] = [];
  const add = (d: string, desc: string, amount: number, kind: FlowKind, extra: Partial<FlowItem> = {}) => {
    if (!amount) return;
    // Anything already past due is expected today.
    items.push({ date: d < today ? today : d, desc, amount, kind, ...(d < today && { overdue: true }), ...extra });
  };

  receivables(state, today).filter(b => b.balance > 0).forEach(b => add(b.due, `${b.partner} · ${b.docId}`, b.balance, '수금 예정'));
  payables(state, today).filter(b => b.balance > 0).forEach(b => add(b.due, `${b.partner} · ${b.docId}`, -b.balance, '지급 예정'));
  state.books.expenses.filter(e => e.status === '승인 완료' && e.method === '개인 결제').forEach(e => add(today, `${e.person} 경비 · ${e.desc}`, -e.amount, '경비'));

  // Card charges are paid from the bank on the 15th of the next month.
  balances.filter(b => b.fund.kind === '카드' && b.balance > 0).forEach(b => add(`${addMonths(monthOf(today), 1)}-15`, `${b.fund.name} 결제`, -b.balance, '카드 대금'));

  const net = totals(payslips(state)).net;
  for (let m = monthOf(today); `${m}-01` <= horizon; m = addMonths(m, 1)) {
    if (!state.payrolls.some(r => r.month === m)) add(`${m}-25`, `${m} 급여 (예상)`, -net, '급여');
    state.books.contracts
      .filter(c => c.side !== '근로' && c.sign === '서명 완료' && c.cycle === '월 정기' && !c.billed.includes(m) && m >= monthOf(c.start) && (!c.end || m <= monthOf(c.end)) && contractPhase(c, today) !== '만료')
      .forEach(c => add(`${m}-${c.side === '매출' ? '28' : '25'}`, `${c.partner} · ${c.title}`, (c.side === '매출' ? 1 : -1) * Math.round(c.amount * 1.1), '정기 계약'));
  }

  withholdingMonths(state).filter(m => m < monthOf(today) && !withholdingFiling(state, m)).forEach(m => {
    const s = withholdingSummary(state, m);
    add(s.due, `${m} 원천세`, -s.total, '세금');
  });
  const lastQuarter = recentQuarters(today).find(q => q < quarterOf(today));
  if (lastQuarter && !vatFiling(state, lastQuarter)) {
    const s = vatSummary(state, lastQuarter, entries);
    add(vatDue(lastQuarter), `${lastQuarter} 부가세`, -s.payable, '세금');
  }
  (state.books.loans ?? []).forEach(l => {
    const paid = new Set(l.payments.map(p => p.seq));
    if (loanStatus(l).done) return;
    loanSchedule(l).filter(r => !paid.has(r.seq)).forEach(r => add(r.date, `${l.lender} ${r.seq}회차 상환`, -r.payment, '차입금'));
  });
  state.books.plans.forEach(p => add(p.date, p.desc, p.amount, '직접 입력', { planId: p.id }));

  const inRange = items.filter(i => i.date <= horizon).sort((a, b) => a.date.localeCompare(b.date));
  let running = opening;
  const rows = Array.from({ length: weeks }, (_, w) => {
    const start = addDays(weekStart(today), w * 7);
    const end = addDays(start, 6);
    const list = inRange.filter(i => i.date >= start && i.date <= end);
    const inflow = list.filter(i => i.amount > 0).reduce((t, i) => t + i.amount, 0);
    const outflow = list.filter(i => i.amount < 0).reduce((t, i) => t - i.amount, 0);
    running += inflow - outflow;
    return { start, end, inflow, outflow, closing: running, items: list };
  });
  const lowest = rows.reduce((min, r) => (r.closing < min.closing ? r : min), rows[0]);
  return { opening, balances, rows, items: inRange, lowest, horizon };
}
