/* 차입금 (bank loans with repayment schedules) and 가지급금 인정이자 (deemed interest on loans to related persons). */
import { assertOpen } from './admin';
import type { JournalEntry } from './accounting';
import { addTaxAdjust, fundById, type Books } from './books';
import { date, id, type ErpState } from './flow-core';

type Value = string | number | undefined;

export type RepayMethod = '만기일시' | '원금균등' | '원리금균등';
export const REPAY_METHODS: RepayMethod[] = ['만기일시', '원금균등', '원리금균등'];
/** filler: an installment closed by 중도 상환 with nothing paid. */
export interface LoanPayment { seq: number; date: string; principal: number; interest: number; filler?: boolean }
export interface Loan {
  id: string; lender: string; desc: string; principal: number; rate: number; start: string; months: number;
  method: RepayMethod; fund: string; payments: LoanPayment[];
}

/** 당좌대출이자율 (법인세법 시행규칙): the default rate for 가지급금 인정이자. */
export const DEEMED_RATE = 4.6;

const won = (v: Value, label: string, min = 1) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw Error(`${label}을(를) 확인해 주세요.`);
  return n;
};
const day = (v: Value) => {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('날짜를 확인해 주세요.');
  return s;
};

/** Same day of the month, n months later (clamped to the month's last day). */
export function addMonthsDay(d: string, n: number) {
  const [y, m, dd] = d.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(dd, last)).padStart(2, '0')}`;
}

/** 단기 (1년 이내) or 장기 차입금, by term. */
export const loanAccount = (l: Pick<Loan, 'months'>) => (l.months <= 12 ? '단기차입금' : '장기차입금');

export interface ScheduleRow { seq: number; date: string; principal: number; interest: number; payment: number; balance: number }

/** The full repayment plan from the loan's terms (monthly installments, interest on the opening balance). */
export function loanSchedule(l: Loan): ScheduleRow[] {
  const r = l.rate / 100 / 12;
  const level = r ? (l.principal * r) / (1 - (1 + r) ** -l.months) : l.principal / l.months;
  let balance = l.principal;
  return Array.from({ length: l.months }, (_, i) => {
    const seq = i + 1, last = seq === l.months;
    const interest = Math.floor(balance * r);
    const principal = last ? balance : l.method === '만기일시' ? 0 : l.method === '원금균등' ? Math.floor(l.principal / l.months) : Math.round(level) - interest;
    balance -= principal;
    return { seq, date: addMonthsDay(l.start, seq), principal, interest, payment: principal + interest, balance };
  });
}

export function loanStatus(l: Loan) {
  const paidPrincipal = l.payments.reduce((t, p) => t + p.principal, 0);
  const balance = l.principal - paidPrincipal;
  const next = balance > 0 ? loanSchedule(l).find(s => !l.payments.some(p => p.seq === s.seq)) : undefined;
  return { balance, paidPrincipal, paidInterest: l.payments.reduce((t, p) => t + p.interest, 0), next, done: balance === 0 };
}

export function addLoan(state: ErpState, f: { lender: Value; desc?: Value; principal: Value; rate: Value; start: Value; months: Value; method: Value; fund: Value }) {
  const lender = String(f.lender ?? '').trim();
  if (!lender) throw Error('빌린 곳을 입력해 주세요.');
  const rate = Number(f.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 30) throw Error('연 이자율은 0~30% 사이로 입력해 주세요.');
  const months = won(f.months, '기간 (개월)');
  if (months > 360) throw Error('기간은 360개월 이내로 입력해 주세요.');
  const method = String(f.method) as RepayMethod;
  if (!REPAY_METHODS.includes(method)) throw Error('상환 방식을 골라 주세요.');
  const fund = fundById(state, String(f.fund));
  if (!fund || fund.kind !== '계좌') throw Error('대출금을 받을 계좌를 골라 주세요.');
  const start = day(f.start);
  assertOpen(state, start);
  const l: Loan = { id: id('LN'), lender, desc: String(f.desc ?? '').trim() || '운전자금', principal: won(f.principal, '대출 금액', 10000), rate, start, months, method, fund: fund.id, payments: [] };
  state.books.loans.unshift(l);
  return l;
}

/** Pays the next scheduled installment (or, with `payoff`, everything left plus that month's interest). */
export function repayLoan(state: ErpState, loanId: string, f: { date?: Value; payoff?: boolean } = {}) {
  const l = state.books.loans.find(x => x.id === loanId);
  if (!l) throw Error('차입금을 찾을 수 없어요.');
  const s = loanStatus(l);
  if (!s.next) throw Error('이미 다 갚은 차입금이에요.');
  const when = f.date ? day(f.date) : s.next.date;
  const lastPaid = l.payments.at(-1)?.date ?? l.start;
  if (when < lastPaid) throw Error('상환일은 이전 상환일 이후여야 해요.');
  assertOpen(state, when);
  const p: LoanPayment = f.payoff
    ? { seq: s.next.seq, date: when, principal: s.balance, interest: s.next.interest }
    : { seq: s.next.seq, date: when, principal: s.next.principal, interest: s.next.interest };
  l.payments.push(p);
  if (f.payoff) {
    // The rest of the schedule is settled; mark the remaining installments as paid with nothing due.
    loanSchedule(l).filter(r => r.seq > p.seq).forEach(r => l.payments.push({ seq: r.seq, date: when, principal: 0, interest: 0, filler: true }));
  }
  return p;
}

/** Undoes the most recent repayment (open months only). */
export function undoRepayment(state: ErpState, loanId: string) {
  const l = state.books.loans.find(x => x.id === loanId);
  const last = l?.payments.filter(p => !p.filler).at(-1);
  if (!l || !last) throw Error('취소할 상환 기록이 없어요.');
  assertOpen(state, last.date);
  // The payoff fillers go with the payment that created them.
  l.payments = l.payments.filter(p => p !== last && !p.filler);
}

export function deleteLoan(state: ErpState, loanId: string) {
  const l = state.books.loans.find(x => x.id === loanId);
  if (!l) throw Error('차입금을 찾을 수 없어요.');
  if (l.payments.length) throw Error('상환 기록이 있는 차입금은 지울 수 없어요. 상환을 먼저 취소해 주세요.');
  assertOpen(state, l.start);
  state.books.loans = state.books.loans.filter(x => x.id !== loanId);
}

/** Journal entries: the loan coming in, then each repayment (principal + 이자비용). */
export function loanEntries(books: Books): JournalEntry[] {
  return (books.loans ?? []).flatMap(l => {
    const account = loanAccount(l);
    const fund = books.funds.find(f => f.id === l.fund);
    const bank = { account: '보통예금', fund: fund?.id };
    return [
      { id: 'J-' + l.id, date: l.start, source: '지급' as const, ref: l.id, partner: l.lender, desc: `${l.lender} ${l.desc} 차입`, lines: [{ ...bank, debit: l.principal, credit: 0 }, { account, debit: 0, credit: l.principal }] },
      ...l.payments.filter(p => !p.filler).map(p => ({
        id: `J-${l.id}-${p.seq}`, date: p.date, source: '지급' as const, ref: l.id, partner: l.lender, desc: `${l.lender} ${l.desc} ${p.seq}회차 상환`,
        lines: [
          ...(p.principal ? [{ account, debit: p.principal, credit: 0 }] : []),
          ...(p.interest ? [{ account: '이자비용', debit: p.interest, credit: 0 }] : []),
          { ...bank, debit: 0, credit: p.principal + p.interest },
        ],
      })),
    ];
  });
}

/* ───────── 가지급금 인정이자 ───────── */

/**
 * For each person with a 가지급금 balance in `year` (up to `asOf`): 적수 (balance × days),
 * 인정이자 at the deemed rate, interest they actually paid (이자수익 from them), and the 익금산입 amount.
 */
export function deemedInterest(state: ErpState, entries: JournalEntry[], year: string, asOf = date()) {
  const end = [asOf, `${year}-12-31`].sort()[0];
  const start = `${year}-01-01`;
  const rate = state.books.deemedRate ?? DEEMED_RATE;
  const people = new Map<string, { date: string; delta: number }[]>();
  entries.forEach(e => e.lines.forEach(l => {
    if (l.account !== '가지급금' || e.date > end) return;
    const who = l.partner ?? e.partner ?? '(거래처 미지정)';
    const list = people.get(who) ?? [];
    list.push({ date: e.date, delta: l.debit - l.credit });
    people.set(who, list);
  }));
  const dayNo = (d: string) => Math.round(Date.parse(d) / 86400000);
  return [...people.entries()].map(([person, moves]) => {
    moves.sort((a, b) => a.date.localeCompare(b.date));
    let balance = moves.filter(m => m.date < start).reduce((t, m) => t + m.delta, 0);
    let cursor = start, sum = 0;
    for (const m of moves.filter(m => m.date >= start)) {
      sum += Math.max(0, balance) * (dayNo(m.date) - dayNo(cursor));
      balance += m.delta;
      cursor = m.date;
    }
    sum += Math.max(0, balance) * (dayNo(end) - dayNo(cursor) + 1);
    const deemed = Math.floor((sum * rate) / 100 / 365);
    const received = entries.filter(e => e.date >= start && e.date <= end && e.partner === person).reduce((t, e) => t + e.lines.filter(l => l.account === '이자수익').reduce((s, l) => s + l.credit - l.debit, 0), 0);
    const desc = `가지급금 인정이자 익금산입 (${person})`;
    const booked = state.books.taxAdjust.find(a => a.year === year && a.desc === desc)?.amount ?? 0;
    return { person, balance, sum, rate, deemed, received, add: Math.max(0, deemed - received), desc, booked };
  }).filter(r => r.sum > 0 || r.balance > 0);
}

/** Writes (or rewrites) the 익금산입 line for one person into the 법인세 세무조정. */
export function bookDeemedInterest(state: ErpState, entries: JournalEntry[], year: string, person: string, asOf = date()) {
  const r = deemedInterest(state, entries, year, asOf).find(x => x.person === person);
  if (!r || !r.add) throw Error('반영할 인정이자가 없어요.');
  state.books.taxAdjust = state.books.taxAdjust.filter(a => !(a.year === year && a.desc === r.desc));
  return addTaxAdjust(state, { year, kind: '가산', desc: r.desc, amount: r.add });
}

export function setDeemedRate(state: ErpState, rate: Value) {
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0 || n > 20) throw Error('이자율을 확인해 주세요.');
  state.books.deemedRate = n;
}
