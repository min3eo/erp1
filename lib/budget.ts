/* 예산관리 (budget vs actual by account and department) and 프로젝트별 손익. */
import { journal, type JournalEntry } from './accounting';
import { accountTypes } from './books';
import { date, id, type ErpState } from './flow-core';

type Value = string | number | undefined;

/** A yearly budget for one account, optionally for one department (spread evenly over 12 months). */
export interface Budget { id: string; year: string; account: string; dept?: string; amount: number }

export function setBudget(state: ErpState, f: { year: Value; account: Value; dept?: Value; amount: Value }) {
  const year = String(f.year ?? '');
  if (!/^\d{4}$/.test(year)) throw Error('연도를 확인해 주세요.');
  const account = String(f.account ?? '').trim();
  const type = accountTypes(state)[account];
  if (type !== '비용' && type !== '수익') throw Error('수익이나 비용 계정을 골라 주세요.');
  const amount = Number(String(f.amount ?? '').replace(/,/g, ''));
  if (!Number.isInteger(amount) || amount < 0) throw Error('예산 금액을 확인해 주세요.');
  const dept = String(f.dept ?? '').trim() || undefined;
  const list = (state.books.budgets ||= []);
  const same = list.find(b => b.year === year && b.account === account && (b.dept ?? '') === (dept ?? ''));
  if (same) {
    if (amount) same.amount = amount;
    else state.books.budgets = list.filter(b => b !== same);
    return same;
  }
  if (!amount) throw Error('예산 금액을 넣어 주세요.');
  const b: Budget = { id: id('BG'), year, account, ...(dept && { dept }), amount };
  list.push(b);
  return b;
}

export const removeBudget = (state: ErpState, budgetId: string) => { state.books.budgets = (state.books.budgets ?? []).filter(b => b.id !== budgetId); };

/** Actual amount of one account in [from, to], on its normal side, optionally only entries tagged with `dept`. */
function actual(state: ErpState, entries: JournalEntry[], account: string, from: string, to: string, dept?: string) {
  const income = accountTypes(state)[account] === '수익';
  return entries
    .filter(e => e.date >= from && e.date <= to && (!dept || e.dept === dept))
    .reduce((t, e) => t + e.lines.filter(l => l.account === account).reduce((s, l) => s + (income ? l.credit - l.debit : l.debit - l.credit), 0), 0);
}

/**
 * Budget vs actual for one year, through the end of `upTo`'s month.
 * 경과 예산 = yearly budget × months passed / 12; 소진율 = actual ÷ yearly budget.
 */
export function budgetReport(state: ErpState, year: string, upTo = date(), entries = journal(state, upTo)) {
  const months = year < upTo.slice(0, 4) ? 12 : year > upTo.slice(0, 4) ? 0 : Number(upTo.slice(5, 7));
  const end = months === 12 ? `${year}-12-31` : upTo;
  return (state.books.budgets ?? []).filter(b => b.year === year).map(b => {
    const spent = actual(state, entries, b.account, `${year}-01-01`, end, b.dept);
    const elapsed = Math.round((b.amount * months) / 12);
    const income = accountTypes(state)[b.account] === '수익';
    const rate = b.amount ? spent / b.amount : 0;
    // 비용: over the elapsed budget is a warning, over the year's budget is over. 수익: the reverse.
    const status = income ? (spent >= elapsed ? '달성' : '미달') : spent > b.amount ? '초과' : spent > elapsed ? '주의' : '정상';
    return { ...b, income, spent, elapsed, left: b.amount - spent, rate, status };
  }).sort((a, b) => Number(a.income) - Number(b.income) || b.rate - a.rate);
}

/** Warning when spending `amount` more on an account would pass its yearly budget (company-wide or the department's). */
export function budgetWarning(state: ErpState, account: string, amount: number, day = date(), dept?: string) {
  const report = budgetReport(state, day.slice(0, 4), day).filter(r => r.account === account && !r.income && (!r.dept || r.dept === dept));
  const hit = report.find(r => r.spent + amount > r.amount);
  return hit ? `${hit.dept ? hit.dept + ' ' : ''}${account} 예산 ${hit.amount.toLocaleString()}원 중 ${hit.spent.toLocaleString()}원을 썼어요. 이 건으로 ${(hit.spent + amount - hit.amount).toLocaleString()}원 초과돼요.` : '';
}

/** 프로젝트별 손익: every journal entry tagged with a project (vouchers, trades, expense claims). */
export function projectPL(state: ErpState, entries = journal(state), year?: string) {
  const types = accountTypes(state);
  const map = new Map<string, { project: string; revenue: number; cost: number; count: number; byAccount: Map<string, number> }>();
  entries.filter(e => e.project && (!year || e.date.startsWith(year))).forEach(e => {
    const r = map.get(e.project!) ?? { project: e.project!, revenue: 0, cost: 0, count: 0, byAccount: new Map() };
    r.count += 1;
    e.lines.forEach(l => {
      if (types[l.account] === '수익') r.revenue += l.credit - l.debit;
      if (types[l.account] === '비용') {
        r.cost += l.debit - l.credit;
        r.byAccount.set(l.account, (r.byAccount.get(l.account) ?? 0) + l.debit - l.credit);
      }
    });
    map.set(e.project!, r);
  });
  return [...map.values()].map(r => ({ ...r, profit: r.revenue - r.cost, margin: r.revenue ? (r.revenue - r.cost) / r.revenue : 0 })).sort((a, b) => b.revenue + b.cost - (a.revenue + a.cost));
}
