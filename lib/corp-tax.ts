/* 법인세: brackets, automatic 세무조정, 세액감면 · 공제, 최저한세, 중간예납. One calculation shared by the 법인세 and 결산 screens. */
import { assertOpen } from './admin';
import { incomeSummary, trialBalance, type JournalEntry } from './accounting';
import { accountTypes, evidenceIssue } from './books';
import { id, type ErpState } from './flow-core';

type Value = string | number | undefined;

/**
 * Corporate tax brackets by 사업연도. Rates went up 1%p for years starting in 2026 (2025 세법 개정);
 * confirm against the current law before relying on them.
 */
export function corpBrackets(year: string): [number, number][] {
  return Number(year) >= 2026
    ? [[200_000_000, 0.1], [20_000_000_000, 0.2], [300_000_000_000, 0.22], [Infinity, 0.25]]
    : [[200_000_000, 0.09], [20_000_000_000, 0.19], [300_000_000_000, 0.21], [Infinity, 0.24]];
}

export function corpTaxOn(base: number, year: string) {
  let tax = 0, prev = 0;
  const rows: { limit: number; rate: number; amount: number }[] = [];
  for (const [limit, rate] of corpBrackets(year)) {
    if (base <= prev) break;
    const part = Math.min(base, limit) - prev;
    rows.push({ limit, rate, amount: Math.floor(part * rate) });
    tax += part * rate;
    prev = limit;
  }
  return { tax: Math.floor(tax / 10) * 10, rows };
}

const floor10 = (n: number) => Math.floor(n / 10) * 10;

/** 중소기업 접대비(기업업무추진비) 기본한도 3,600만 원 + 수입금액 100억 이하분의 0.3%. */
export const ENTERTAINMENT_BASE = 36_000_000;
/** 중소기업 최저한세율. */
export const MIN_TAX_RATE = 0.07;
/** 중소기업 중간예납 면제 기준 (직전 사업연도 기준 50만 원 미만). */
export const INTERIM_EXEMPT = 500_000;

export interface AutoAdjust { kind: '가산' | '차감'; desc: string; amount: number; basis: string }
export type CreditKind = '감면' | '공제';
/** 세액감면 by rate of 산출세액 (중소기업 특별세액감면) or a fixed 세액공제 amount (통합투자, 고용증대 …). */
export interface TaxCredit { id: string; year: string; kind: CreditKind; desc: string; rate?: number; amount?: number }

/** The 세무조정 the books can work out on their own for one 사업연도. */
export function autoAdjustments(state: ErpState, year: string, entries: JournalEntry[]): AutoAdjust[] {
  const inYear = entries.filter(e => e.date.startsWith(year));
  const end = entries.filter(e => e.date <= `${year}-12-31`);
  const sumLines = (list: JournalEntry[], account: string, sign: 1 | -1 = 1) => list.reduce((t, e) => t + e.lines.filter(l => l.account === account).reduce((s, l) => s + sign * (l.debit - l.credit), 0), 0);
  const out: AutoAdjust[] = [];

  // 접대비: 3만 원 넘게 쓰고 적격증빙이 없는 것은 바로 손금불산입, 나머지는 한도와 비교.
  const noProof = state.books.vouchers.filter(v => v.date.startsWith(year) && evidenceIssue(state, v)?.startsWith('접대비')).reduce((t, v) => t + v.lines.filter(l => l.account === '접대비').reduce((s, l) => s + l.debit, 0), 0)
    + state.books.trades.filter(t => t.date.startsWith(year) && t.kind === '매입' && t.account === '접대비' && t.proof === '영수증 없음' && t.supply + t.vat > 30000).reduce((s, t) => s + t.supply + t.vat, 0);
  if (noProof) out.push({ kind: '가산', desc: '접대비 적격증빙 미수취 (3만 원 초과)', amount: noProof, basis: '신용카드 · 세금계산서 없이 쓴 접대비' });
  const entertainment = sumLines(inYear, '접대비') - noProof;
  const revenue = incomeSummary(trialBalance(inYear, accountTypes(state))).revenue;
  const limit = ENTERTAINMENT_BASE + Math.floor(Math.min(Math.max(0, revenue), 10_000_000_000) * 0.003);
  if (entertainment > limit) out.push({ kind: '가산', desc: '접대비 한도 초과', amount: entertainment - limit, basis: `한도 ${limit.toLocaleString()}원 = 3,600만 원 + 수입금액 × 0.3%` });

  // 대손충당금: 세법 한도는 기말 채권 × 1% (대손실적률이 더 높으면 그 비율).
  const allowance = -sumLines(end, '대손충당금');
  const receivable = sumLines(end, '외상매출금') + sumLines(end, '미수금');
  const taxLimit = Math.floor(Math.max(0, receivable) * 0.01);
  const setThisYear = sumLines(inYear.filter(e => e.source === '결산'), '대손상각비');
  const overAllowance = Math.min(Math.max(0, allowance - taxLimit), Math.max(0, setThisYear));
  if (overAllowance) out.push({ kind: '가산', desc: '대손충당금 한도 초과', amount: overAllowance, basis: `세법 한도 ${taxLimit.toLocaleString()}원 (채권 × 1%)` });

  // 퇴직급여충당금: 세법상 설정 한도는 0이라 설정액 전부 손금불산입 (실제 지급 때 손금).
  const severanceReserve = -sumLines(inYear.filter(e => e.source === '결산'), '퇴직급여충당부채');
  if (severanceReserve > 0) out.push({ kind: '가산', desc: '퇴직급여충당금 설정액 (한도 0)', amount: severanceReserve, basis: '퇴직연금에 넣지 않은 충당금은 실제 지급 때 비용' });
  return out;
}

/** Full 법인세 for one year from a set of journal entries (the 결산 screen passes pending entries too). */
export function corpTaxFrom(state: ErpState, year: string, entries: JournalEntry[]) {
  const inYear = entries.filter(e => e.date.startsWith(year));
  const pl = incomeSummary(trialBalance(inYear, accountTypes(state)));
  const auto = autoAdjustments(state, year, entries);
  const manual = state.books.taxAdjust.filter(a => a.year === year);
  const add = [...auto, ...manual].filter(a => a.kind === '가산').reduce((t, a) => t + a.amount, 0);
  const sub = [...auto, ...manual].filter(a => a.kind === '차감').reduce((t, a) => t + a.amount, 0);
  const income = pl.net + add - sub;
  const carry = Math.min(state.books.carryLoss[year] ?? 0, Math.max(0, income));
  const base = Math.max(0, income - carry);
  const { tax, rows } = corpTaxOn(base, year);
  const credits = (state.books.corpCredits ?? []).filter(c => c.year === year).map(c => ({ ...c, value: c.rate ? floor10(tax * c.rate / 100) : c.amount ?? 0 }));
  const creditTotal = credits.reduce((t, c) => t + c.value, 0);
  // 최저한세: credits can only bring the tax down to 7% of the 과세표준.
  const minTax = floor10(base * MIN_TAX_RATE);
  const allowedCredit = Math.min(creditTotal, Math.max(0, tax - minTax));
  const determined = tax - allowedCredit;
  const local = floor10(determined * 0.1);
  const prepaid = state.books.filings.filter(f => f.kind === '중간예납' && f.period === year).reduce((t, f) => t + f.amount, 0);
  return { year, pl, auto, manual, add, sub, income, carry, base, tax, rows, credits, creditTotal, minTax, allowedCredit, determined, local, total: determined + local, prepaid, payable: determined - prepaid };
}

/** 중간예납: half of last year's 결정세액, or tax on the first half's books (가결산) — the smaller one. */
export function interimTax(state: ErpState, year: string, entries: JournalEntry[]) {
  const prior = state.books.priorCorpTax?.[String(Number(year) - 1)];
  const byPrior = prior != null ? floor10(prior / 2) : null;
  const half = entries.filter(e => e.date >= `${year}-01-01` && e.date <= `${year}-06-30`);
  const h = corpTaxFrom(state, year, half);
  // 가결산: 6개월 소득을 12개월로 환산해 세액을 구하고 6/12.
  const annualTax = corpTaxOn(Math.max(0, h.income - h.carry) * 2, year).tax;
  const byHalf = Math.max(0, floor10(annualTax / 2 - h.allowedCredit / 2));
  const exempt = byPrior != null && prior! < INTERIM_EXEMPT;
  const amount = exempt ? 0 : byPrior == null ? byHalf : Math.min(byPrior, byHalf);
  const paid = state.books.filings.find(f => f.kind === '중간예납' && f.period === year);
  return { year, prior, byPrior, byHalf, exempt, amount, due: `${year}-08-31`, paid };
}

export function payInterim(state: ErpState, year: string, f: { amount: Value; date: Value }) {
  if (state.books.filings.some(x => x.kind === '중간예납' && x.period === year)) throw Error('이미 납부를 기록했어요.');
  const amount = Number(f.amount);
  if (!Number.isInteger(amount) || amount < 1) throw Error('납부한 금액을 확인해 주세요.');
  const when = String(f.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(when)) throw Error('납부일을 확인해 주세요.');
  assertOpen(state, when);
  state.books.filings.push({ id: id('FL'), kind: '중간예납', period: year, date: when, amount });
}

export function setPriorCorpTax(state: ErpState, year: string, amount: Value) {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 0) throw Error('금액을 확인해 주세요.');
  state.books.priorCorpTax = { ...state.books.priorCorpTax, [year]: n };
}

export function addCredit(state: ErpState, f: { year: Value; kind: Value; desc: Value; rate?: Value; amount?: Value }) {
  const kind = f.kind === '공제' ? '공제' : '감면';
  const desc = String(f.desc ?? '').trim();
  if (!desc) throw Error('감면 · 공제 이름을 입력해 주세요.');
  const c: TaxCredit = { id: id('TC'), year: String(f.year), kind, desc };
  if (kind === '감면') {
    const rate = Number(f.rate);
    if (!(rate > 0 && rate <= 100)) throw Error('감면율(%)을 확인해 주세요.');
    c.rate = rate;
  } else {
    const amount = Number(f.amount);
    if (!Number.isInteger(amount) || amount < 1) throw Error('공제 금액을 확인해 주세요.');
    c.amount = amount;
  }
  (state.books.corpCredits ||= []).push(c);
  return c;
}

export const removeCredit = (state: ErpState, creditId: string) => { state.books.corpCredits = (state.books.corpCredits ?? []).filter(c => c.id !== creditId); };
