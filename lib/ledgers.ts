/* Books derived from the journal: 거래처원장, 현금출납장 and the 현금흐름표 (직접법). */
import type { JournalEntry } from './accounting';

const byDate = (a: JournalEntry, b: JournalEntry) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

/** Accounts that carry a partner balance: + receivable side, − payable side. */
export const PARTNER_ACCOUNTS: Record<string, '채권' | '채무'> = {
  외상매출금: '채권', 미수금: '채권', 선급금: '채권',
  외상매입금: '채무', 미지급금: '채무', 선수금: '채무',
};

/** Partners that appear on any receivable / payable line. */
export function ledgerPartners(entries: JournalEntry[]) {
  const names = new Set<string>();
  entries.forEach(e => e.lines.forEach(l => { const p = l.partner ?? e.partner; if (p && l.account in PARTNER_ACCOUNTS) names.add(p); }));
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}

/**
 * 거래처원장: every receivable / payable line with one partner, oldest first.
 * The balance is what the partner owes us (+) or we owe them (−).
 */
export function partnerLedger(entries: JournalEntry[], partner: string, from = '0000-01-01', to = '9999-12-31') {
  let balance = 0, open = 0;
  const rows: { date: string; desc: string; account: string; side: '채권' | '채무'; increase: number; decrease: number; balance: number }[] = [];
  [...entries].sort(byDate).forEach(e => e.lines.forEach(l => {
    const side = PARTNER_ACCOUNTS[l.account];
    if (!side || (l.partner ?? e.partner) !== partner) return;
    const delta = l.debit - l.credit; // both sides: debit raises what they owe us / lowers what we owe them
    balance += delta;
    if (e.date < from) { open = balance; return; }
    if (e.date > to) return;
    const increase = side === '채권' ? l.debit : l.credit, decrease = side === '채권' ? l.credit : l.debit;
    rows.push({ date: e.date, desc: e.desc, account: l.account, side, increase, decrease, balance });
  }));
  return { open, rows, close: rows.at(-1)?.balance ?? open };
}

/** Balance per partner, split into 받을 돈 and 줄 돈. */
export function partnerBalances(entries: JournalEntry[]) {
  const map = new Map<string, { receivable: number; payable: number }>();
  entries.forEach(e => e.lines.forEach(l => {
    const side = PARTNER_ACCOUNTS[l.account], p = l.partner ?? e.partner;
    if (!side || !p) return;
    const r = map.get(p) ?? { receivable: 0, payable: 0 };
    if (side === '채권') r.receivable += l.debit - l.credit;
    else r.payable += l.credit - l.debit;
    map.set(p, r);
  }));
  return [...map.entries()].map(([partner, r]) => ({ partner, ...r, net: r.receivable - r.payable })).sort((a, b) => a.partner.localeCompare(b.partner, 'ko'));
}

const CASH = ['현금', '보통예금'];

/** 현금출납장: cash (or one bank account) in and out by day, with a running balance. */
export function cashBook(entries: JournalEntry[], from: string, to: string, account = '현금') {
  let balance = 0, open = 0;
  const rows: { date: string; desc: string; counter: string; inflow: number; outflow: number; balance: number }[] = [];
  [...entries].sort(byDate).forEach(e => {
    const delta = e.lines.filter(l => l.account === account).reduce((t, l) => t + l.debit - l.credit, 0);
    if (!delta) return;
    balance += delta;
    if (e.date < from) { open = balance; return; }
    if (e.date > to) return;
    const counter = [...new Set(e.lines.filter(l => l.account !== account).map(l => l.account))].join(', ');
    rows.push({ date: e.date, desc: e.desc, counter, inflow: Math.max(0, delta), outflow: Math.max(0, -delta), balance });
  });
  return { open, rows, close: rows.at(-1)?.balance ?? open };
}

export type CashActivity = '영업활동' | '투자활동' | '재무활동';
const INVESTING = ['유형자산', '감가상각누계액', '유형자산처분손실'];
const FINANCING = ['단기차입금', '장기차입금', '기초자본', '이월이익잉여금'];

/** Which activity a cash movement belongs to, from the entry's other accounts. */
function activity(e: JournalEntry): CashActivity {
  const others = e.lines.filter(l => !CASH.includes(l.account)).map(l => l.account);
  if (others.some(a => INVESTING.includes(a))) return '투자활동';
  if (others.some(a => FINANCING.includes(a))) return '재무활동';
  return '영업활동';
}

/** Line label inside an activity, by the main counter account. */
function cashLabel(e: JournalEntry, delta: number) {
  const others = e.lines.filter(l => !CASH.includes(l.account)).map(l => l.account);
  const has = (...a: string[]) => others.some(o => a.includes(o));
  if (has('외상매출금', '매출', '미수금', '선수금')) return delta > 0 ? '매출 · 채권 회수' : '매출 환불';
  if (has('외상매입금', '재고자산', '선급금')) return '매입 대금 지급';
  if (has('미지급급여', '급여', '잡급', '퇴직급여')) return '급여 · 퇴직금 지급';
  if (has('예수금', '부가세예수금', '부가세대급금', '세금과공과', '미지급법인세', '법인세비용')) return '세금 · 4대보험 납부';
  if (has('이자수익', '이자비용')) return delta > 0 ? '이자 수입' : '이자 지급';
  if (has('유형자산')) return delta > 0 ? '유형자산 처분' : '유형자산 취득';
  if (has('단기차입금', '장기차입금')) return delta > 0 ? '차입' : '차입금 상환';
  if (has('기초자본')) return delta > 0 ? '출자 · 기초 이월' : '감자';
  if (has('이월이익잉여금')) return '배당금 지급';
  if (has('가지급금', '가수금')) return '가지급 · 가수 정리';
  if (has('미지급금')) return delta > 0 ? '기타 수입' : '카드 대금 · 미지급금 지급';
  return delta > 0 ? '기타 영업 수입' : '기타 영업비용 지급';
}

/**
 * 현금흐름표 (직접법): every movement of 현금 + 보통예금 in the period, grouped by activity.
 * 기초 entries dated on the first day are part of the opening cash, not a flow.
 */
export function cashFlow(entries: JournalEntry[], from: string, to: string) {
  let open = 0;
  const groups: Record<CashActivity, Map<string, number>> = { 영업활동: new Map(), 투자활동: new Map(), 재무활동: new Map() };
  [...entries].sort(byDate).forEach(e => {
    const delta = e.lines.filter(l => CASH.includes(l.account)).reduce((t, l) => t + l.debit - l.credit, 0);
    if (!delta || e.date > to) return;
    if (e.date < from || (e.source === '기초' && e.date === from)) { open += delta; return; }
    const g = groups[activity(e)], label = cashLabel(e, delta);
    g.set(label, (g.get(label) ?? 0) + delta);
  });
  const sections = (Object.keys(groups) as CashActivity[]).map(name => {
    const rows = [...groups[name].entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
    return { name, rows, total: rows.reduce((t, r) => t + r.amount, 0) };
  });
  const net = sections.reduce((t, s) => t + s.total, 0);
  return { open, sections, net, close: open + net };
}

/**
 * 제조원가명세서 from the 재공품 account over [from, to]:
 * 재료비 = materials issued into 재공품, 가공비 = what 가공비배부 moved in, 당기제품제조원가 = what left for finished goods.
 */
export function manufacturingStatement(entries: JournalEntry[], from: string, to: string) {
  const sumLines = (list: JournalEntry[], account: string, side: 'debit' | 'credit') => list.reduce((t, e) => t + e.lines.filter(l => l.account === account).reduce((s, l) => s + l[side], 0), 0);
  const before = entries.filter(e => e.date < from);
  const within = entries.filter(e => e.date >= from && e.date <= to);
  const open = sumLines(before, '재공품', 'debit') - sumLines(before, '재공품', 'credit');
  const conversion = sumLines(within, '가공비배부', 'credit') - sumLines(within, '가공비배부', 'debit');
  const materials = sumLines(within, '재공품', 'debit') - conversion;
  const finished = sumLines(within, '재공품', 'credit');
  const total = materials + conversion;
  return { open, materials, conversion, total, finished, close: open + total - finished };
}
