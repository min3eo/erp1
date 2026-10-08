/* 세무 일정: every filing and payment deadline a small company meets, with its status from the books where the books know it. */
import { addMonths, lastDay, monthOf, type Contract } from './books';
import { date, type ErpState } from './flow-core';
import { journal } from './accounting';
import { interimTax } from './corp-tax';
import { statementSchedule } from './hr';
import type { PageId } from './nav';
import { quarterOf, vatFiling, vatSummary, withholdingFiling, withholdingMonths } from './tax';

export type DeadlineKind = '국세' | '지방세' | '4대보험' | '신고 자료' | '인지세';
export interface Deadline {
  key: string; date: string; kind: DeadlineKind; title: string; detail: string; page: PageId;
  /** done: the books show it was filed / paid. manual: the user marks it done on the calendar. */
  done?: string; manual?: boolean;
}

/**
 * 인지세 (인지세법 제3조) on contracts that may be taxable documents: 도급 · 공사 · 용역 · 부동산 거래 계약서.
 * 1천만 원 미만 비과세, 3천만 원 이하 2만 원, 5천만 원 이하 4만 원, 1억 원 이하 7만 원, 10억 원 이하 15만 원, 초과 35만 원.
 * Whether a given contract is taxable depends on its content; confirm with a tax adviser.
 */
export const STAMP_CATEGORIES = ['도급', '공사', '용역', '부동산'];
export function stampTax(amount: number) {
  if (amount < 10_000_000) return 0;
  if (amount <= 30_000_000) return 20_000;
  if (amount <= 50_000_000) return 40_000;
  if (amount <= 100_000_000) return 70_000;
  if (amount <= 1_000_000_000) return 150_000;
  return 350_000;
}
/** Amount written on the contract: one-off amount, or the monthly fee over the term (12 months when open-ended). */
export function contractTotal(c: Contract) {
  if (c.cycle === '일시') return c.amount;
  if (!c.end) return c.amount * 12;
  const [y1, m1] = c.start.split('-').map(Number), [y2, m2] = c.end.split('-').map(Number);
  return c.amount * Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}
export const contractStamp = (c: Contract) => (c.side !== '근로' && STAMP_CATEGORIES.includes(c.category) ? stampTax(contractTotal(c)) : 0);

/** 중간예납 의무가 없을 때: 직전 세액 50만 원 미만 면제, 또는 직전 세액이 없고 상반기도 결손. 직전 세액이 있으면 가결산으로 0원이어도 신고는 해야 해요. */
const noInterimDuty = (state: ErpState, y: string, today: string) => {
  const i = interimTax(state, y, journal(state, today));
  return i.exempt || i.prior === 0 || (i.prior == null && i.byHalf === 0);
};

/** Deadlines between `from` and `to` (inclusive), oldest first, including earlier ones still not done. */
export function taxCalendar(state: ErpState, from: string, to: string, today = date()): Deadline[] {
  const out: Deadline[] = [];
  const marked = state.books.calendarDone ?? {};
  const add = (d: Omit<Deadline, 'done'> & { done?: string }) => out.push({ ...d, done: d.done ?? (d.manual ? marked[d.key] : undefined) });
  const assets = state.books.assets.filter(a => !a.disposed);
  const wht = new Set(withholdingMonths(state));

  for (let m = addMonths(monthOf(from), -1); m <= monthOf(to); m = addMonths(m, 1)) {
    const prev = addMonths(m, -1), y = m.slice(0, 4), mm = Number(m.slice(5));
    if (wht.has(prev)) add({ key: `원천세|${prev}`, date: `${m}-10`, kind: '국세', title: `${prev} 원천세 신고 · 납부`, detail: '급여 · 일용 · 사업 · 기타소득에서 뗀 세금 (지방소득세 함께)', page: 'withholding', done: withholdingFiling(state, prev)?.date });
    if (state.payrolls.some(r => r.month === prev)) add({ key: `4대보험|${prev}`, date: `${m}-10`, kind: '4대보험', title: `${prev} 4대보험료 납부`, detail: '국민연금 · 건강 · 고용 · 산재 (사업주 부담분 포함)', page: 'insurance', done: state.hr.insurancePaid[prev]?.date });
    if ([1, 4, 7, 10].includes(mm)) {
      const q = quarterOf(`${prev}-01`);
      const v = vatSummary(state, q);
      // 무실적이어도 신고 의무는 있지만, 시안에서는 매출 · 매입세액이 있었던 분기만 보여줘요.
      if (v.output || v.input || vatFiling(state, q)) add({ key: `부가세|${q}`, date: `${m}-25`, kind: '국세', title: `부가세 ${mm === 1 || mm === 7 ? '확정' : '예정'} 신고 · 납부`, detail: `${q.replace('-Q', '년 ')}분기 매출 · 매입`, page: 'vat', done: vatFiling(state, q)?.date });
    }
    if (mm === 3) {
      add({ key: `법인세|${Number(y) - 1}`, date: `${y}-03-31`, kind: '국세', title: `${Number(y) - 1}년 법인세 신고 · 납부`, detail: '12월 결산 법인 · 세무조정계산서 제출', page: 'corpTax', manual: true });
      add({ key: `보수총액|${Number(y) - 1}`, date: `${y}-03-15`, kind: '4대보험', title: '4대보험 보수총액신고', detail: '건강보험 · 고용 · 산재 전년도 보수 신고', page: 'insurance', manual: true });
    }
    if (mm === 4) add({ key: `지방소득세|${Number(y) - 1}`, date: `${y}-04-30`, kind: '지방세', title: `${Number(y) - 1}년 법인지방소득세 신고 · 납부`, detail: '사업장 소재지 시 · 군 · 구 (위택스)', page: 'corpTax', manual: true });
    if (mm === 8) {
      add({ key: `중간예납|${y}`, date: `${y}-08-31`, kind: '국세', title: `${y}년 법인세 중간예납`, detail: '직전 세액 1/2 또는 상반기 가결산 (중소기업 50만 원 미만 면제)', page: 'corpTax', done: state.books.filings.find(f => f.kind === '중간예납' && f.period === y)?.date ?? (`${y}-08-31` <= today && noInterimDuty(state, y, today) ? '낼 세액 없음' : undefined) });
      add({ key: `주민세|${y}`, date: `${y}-08-31`, kind: '지방세', title: '주민세 사업소분 신고 · 납부', detail: '7월 1일 기준 사업소 · 자본금 기준 기본세액 (연면적 330㎡ 초과 시 추가)', page: 'settings', manual: true });
    }
    if (assets.some(a => ['건물', '토지'].includes(a.category))) {
      if (mm === 7) add({ key: `재산세|${y}-07`, date: `${y}-07-31`, kind: '지방세', title: '재산세 (건물분 1/2)', detail: '6월 1일 기준 소유 건물', page: 'assets', manual: true });
      if (mm === 9) add({ key: `재산세|${y}-09`, date: `${y}-09-30`, kind: '지방세', title: '재산세 (토지 · 건물분 1/2)', detail: '6월 1일 기준 소유 토지 · 건물', page: 'assets', manual: true });
    }
    if (assets.some(a => a.category === '차량운반구') && (mm === 6 || mm === 12)) add({ key: `자동차세|${m}`, date: lastDay(m), kind: '지방세', title: `자동차세 (${mm === 6 ? '1기' : '2기'})`, detail: '보유 차량 · 1월 연납하면 할인', page: 'assets', manual: true });
  }

  // 지급명세서 · 간이지급명세서 (this year and last).
  [String(Number(from.slice(0, 4)) - 1), from.slice(0, 4), to.slice(0, 4)].filter((v, i, a) => a.indexOf(v) === i).forEach(y => {
    statementSchedule(state, y).forEach(r => add({ key: `지급명세서|${r.key}`, date: r.due, kind: '신고 자료', title: `${r.kind} 지급명세서 (${r.period})`, detail: `${r.people}명 · ${r.amount.toLocaleString()}원`, page: 'payStatements', done: r.submitted }));
  });

  // 인지세: on signing, for contracts that may be taxable documents.
  state.books.contracts.filter(c => c.sign === '서명 완료' && c.signedAt && contractStamp(c)).forEach(c => add({
    key: `인지세|${c.id}`, date: c.signedAt!, kind: '인지세', title: `인지세 · ${c.title}`, detail: `${c.partner} · 계약금액 ${contractTotal(c).toLocaleString()}원 → ${contractStamp(c).toLocaleString()}원 (전자수입인지)`, page: 'contracts', done: c.stampPaid,
  }));

  return out
    .filter(d => (d.date >= from && d.date <= to) || (!d.done && d.date < from && d.date >= addMonths(monthOf(today), -6) + '-01'))
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function markDeadline(state: ErpState, key: string, done: boolean, today = date()) {
  const next = { ...state.books.calendarDone };
  if (done) next[key] = today;
  else delete next[key];
  state.books.calendarDone = next;
}

/** Days from today to the deadline (negative = overdue). */
export const daysLeft = (d: string, today = date()) => Math.round((Date.parse(d) - Date.parse(today)) / 86400000);
