/* 수출입 · 외화: foreign-currency sales and purchases, customs costs, settlement 환차손익 and period-end 외화환산. */
import { assertOpen } from './admin';
import type { JournalEntry, JournalLine } from './accounting';
import { accountTypes, fundAccount, fundById, type Books } from './books';
import { id, recordStockChange, round, type ErpState } from './flow-core';

type Value = string | number | undefined;

export const CURRENCIES = ['USD', 'EUR', 'JPY', 'CNY'] as const;
export type Currency = (typeof CURRENCIES)[number];
export type FxKind = '수출' | '수입';

export interface FxSettlement { date: string; amount: number; rate: number; fund: string }
export interface FxDeal {
  id: string; kind: FxKind; date: string; partner: string; desc: string; currency: Currency;
  /** Foreign amount (up to 2 decimals) and the 기준환율 (원 per 1 unit) on the shipping / receipt date. */
  amount: number; rate: number;
  /** 수출: income account (매출). 수입: what was bought (재고자산 or an expense). */
  account: string;
  /** 수입 into stock: the item and quantity received (a '수입 입고' movement valued at 외화 × 환율 + 관세). */
  itemCode?: string; qty?: number;
  /** 수입 통관: 관세 joins the cost, 수입부가세 is input VAT; both paid from `fund`. */
  customs?: { date: string; duty: number; vat: number; fund: string };
  settlements: FxSettlement[];
  /** 외화환산: KRW adjustments of the open balance at period ends. */
  revaluations: { date: string; amount: number }[];
}

const day = (v: Value) => {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('날짜를 확인해 주세요.');
  return s;
};
const fx = (v: Value, label: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || Math.round(n * 100) !== n * 100) throw Error(`${label}을(를) 소수 둘째 자리까지 0보다 크게 입력해 주세요.`);
  return n;
};
const rateOf = (v: Value) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 100000) throw Error('환율(1단위당 원)을 확인해 주세요.');
  return n;
};
const krw = (amount: number, rate: number) => Math.round(amount * rate);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The receivable (수출 → 미수금) or payable (수입 → 미지급금) account a deal carries. */
export const fxAccount = (d: Pick<FxDeal, 'kind'>) => (d.kind === '수출' ? '미수금' : '미지급금');

/**
 * Walks a deal's settlements and revaluations in date order and returns the journal lines they produce,
 * plus the open foreign amount and its book value (KRW) after everything up to `asOf`.
 */
export function fxPosition(d: FxDeal, asOf = '9999-12-31') {
  let openFx = d.amount, book = krw(d.amount, d.rate);
  const events = [
    ...d.settlements.map(s => ({ date: s.date, s })),
    ...d.revaluations.map(r => ({ date: r.date, r })),
  ].filter(e => e.date <= asOf).sort((a, b) => a.date.localeCompare(b.date) || ('r' in a ? 1 : -1));
  const steps: { date: string; kind: '결제' | '환산'; fxAmount: number; cash: number; bookPart: number; diff: number; fund?: string; rate?: number }[] = [];
  for (const e of events) {
    if ('s' in e && e.s) {
      const part = r2(e.s.amount) === r2(openFx) ? book : Math.round((book * e.s.amount) / openFx);
      const cash = krw(e.s.amount, e.s.rate);
      // 수출: getting more won than booked is a gain. 수입: paying more is a loss.
      const diff = d.kind === '수출' ? cash - part : part - cash;
      steps.push({ date: e.date, kind: '결제', fxAmount: e.s.amount, cash, bookPart: part, diff, fund: e.s.fund, rate: e.s.rate });
      openFx = r2(openFx - e.s.amount);
      book -= part;
    } else if ('r' in e && e.r) {
      steps.push({ date: e.date, kind: '환산', fxAmount: openFx, cash: 0, bookPart: e.r.amount, diff: d.kind === '수출' ? e.r.amount : -e.r.amount });
      book += e.r.amount;
    }
  }
  return { openFx, book, steps };
}

export function addFxDeal(state: ErpState, f: { kind: Value; date: Value; partner: Value; desc: Value; currency: Value; amount: Value; rate: Value; account?: Value; itemCode?: Value; qty?: Value }) {
  const kind = f.kind === '수입' ? '수입' : '수출';
  const currency = String(f.currency) as Currency;
  if (!CURRENCIES.includes(currency)) throw Error('통화를 골라 주세요.');
  const partner = String(f.partner ?? '').trim();
  if (!partner) throw Error('해외 거래처를 입력해 주세요.');
  const desc = String(f.desc ?? '').trim();
  if (!desc) throw Error('품목 · 내용을 입력해 주세요.');
  const types = accountTypes(state);
  const account = kind === '수출' ? String(f.account || '매출') : String(f.account || '재고자산');
  if (kind === '수출' ? types[account] !== '수익' : !(account === '재고자산' || account === '유형자산' || types[account] === '비용')) throw Error('계정을 확인해 주세요.');
  const d = day(f.date);
  assertOpen(state, d);
  const deal: FxDeal = { id: id(kind === '수출' ? 'EX' : 'IM'), kind, date: d, partner, desc, currency, amount: fx(f.amount, '외화 금액'), rate: rateOf(f.rate), account, settlements: [], revaluations: [] };
  if (kind === '수입' && account === '재고자산') {
    const item = state.items.find(i => i[0] === f.itemCode);
    if (!item) throw Error('입고할 품목을 골라 주세요.');
    const qty = Number(f.qty);
    if (!(qty > 0)) throw Error('입고 수량을 확인해 주세요.');
    const row = recordStockChange(state, item[0], qty, '수입 입고', deal.id, `${partner} 수입`, id('IMP'));
    row.date = d;
    Object.assign(deal, { itemCode: item[0], qty: round(qty) });
  }
  state.books.fxDeals.unshift(deal);
  return deal;
}

/** Unit cost of an imported item: 원화 환산액 + 관세, per unit. */
export const importUnitCost = (d: FxDeal) => (d.qty ? (krw(d.amount, d.rate) + (d.customs?.duty ?? 0)) / d.qty : 0);

const find = (state: ErpState, dealId: string) => {
  const d = state.books.fxDeals.find(x => x.id === dealId);
  if (!d) throw Error('외화 거래를 찾을 수 없어요.');
  return d;
};

/** 수입 통관: 관세 and 수입부가세 (on the 수입세금계산서) paid to customs. */
export function addCustoms(state: ErpState, dealId: string, f: { date: Value; duty: Value; vat: Value; fund: Value }) {
  const d = find(state, dealId);
  if (d.kind !== '수입') throw Error('수입 거래만 통관 비용을 넣을 수 있어요.');
  const duty = Number(f.duty || 0), vat = Number(f.vat || 0);
  if (!Number.isInteger(duty) || !Number.isInteger(vat) || duty < 0 || vat < 0 || duty + vat === 0) throw Error('관세나 수입부가세를 원 단위로 입력해 주세요.');
  const fund = fundById(state, String(f.fund));
  if (!fund || fund.kind === '카드') throw Error('낸 계좌를 골라 주세요.');
  const when = day(f.date);
  if (d.customs) assertOpen(state, d.customs.date);
  assertOpen(state, when);
  d.customs = { date: when, duty, vat, fund: fund.id };
  return d;
}

/** 입금 (수출) or 송금 (수입) of part or all of the open foreign amount at that day's rate. */
export function settleFx(state: ErpState, dealId: string, f: { date: Value; amount: Value; rate: Value; fund: Value }) {
  const d = find(state, dealId);
  const pos = fxPosition(d);
  const amount = fx(f.amount, '외화 금액');
  if (amount > pos.openFx) throw Error(`남은 금액 ${pos.openFx.toLocaleString()} ${d.currency}을(를) 넘을 수 없어요.`);
  const fund = fundById(state, String(f.fund));
  if (!fund || fund.kind !== '계좌') throw Error('계좌를 골라 주세요.');
  const when = day(f.date);
  if (when < d.date) throw Error('결제일은 거래일 이후여야 해요.');
  assertOpen(state, when);
  d.settlements.push({ date: when, amount, rate: rateOf(f.rate), fund: fund.id });
  return d;
}

export function undoFxSettlement(state: ErpState, dealId: string) {
  const d = find(state, dealId);
  const last = d.settlements.at(-1);
  if (!last) throw Error('취소할 결제가 없어요.');
  if (d.revaluations.some(r => r.date > last.date)) throw Error('결제 뒤에 외화환산을 했어요. 환산을 먼저 지워 주세요.');
  assertOpen(state, last.date);
  d.settlements.pop();
}

export function deleteFxDeal(state: ErpState, dealId: string) {
  const d = find(state, dealId);
  if (d.settlements.length || d.revaluations.length) throw Error('결제나 환산 기록이 있는 거래는 지울 수 없어요.');
  assertOpen(state, d.date);
  if (d.customs) assertOpen(state, d.customs.date);
  if (d.itemCode && d.qty) {
    const original = state.movements.find(m => m.ref === d.id && m.type === '수입 입고');
    const row = recordStockChange(state, d.itemCode, -d.qty, '수입 취소', d.id, '수입 거래 삭제', id('IMP'));
    if (original) row.originalId = original.id;
  }
  state.books.fxDeals = state.books.fxDeals.filter(x => x.id !== dealId);
}

/** Open deals at `asOf` and what revaluing them at the given rates would book. */
export function revaluationPreview(state: ErpState, asOf: string, rates: Partial<Record<Currency, number>>) {
  return state.books.fxDeals
    .filter(d => d.date <= asOf)
    .map(d => {
      // Re-running the same date replaces that date's revaluation.
      const base = fxPosition({ ...d, revaluations: d.revaluations.filter(r => r.date !== asOf) }, asOf);
      const rate = rates[d.currency];
      const target = rate ? krw(base.openFx, rate) : base.book;
      return { deal: d, openFx: base.openFx, book: base.book, rate, target, amount: base.openFx ? target - base.book : 0 };
    })
    .filter(r => r.openFx > 0);
}

/** 외화환산 at a period end: brings each open balance to `rates`. */
export function revalueFx(state: ErpState, asOf: Value, rates: Partial<Record<Currency, Value>>) {
  const when = day(asOf);
  assertOpen(state, when);
  const parsed = Object.fromEntries(Object.entries(rates).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, rateOf(v)])) as Partial<Record<Currency, number>>;
  if (!Object.keys(parsed).length) throw Error('환산할 통화의 기말 환율을 넣어 주세요.');
  const rows = revaluationPreview(state, when, parsed).filter(r => r.rate);
  if (!rows.length) throw Error('환산할 외화 잔액이 없어요.');
  rows.forEach(r => {
    r.deal.revaluations = r.deal.revaluations.filter(x => x.date !== when);
    if (r.amount) r.deal.revaluations.push({ date: when, amount: r.amount });
  });
  state.books.fxRates = { ...state.books.fxRates, ...parsed };
  return rows;
}

/** Journal entries for every deal: booking, customs, settlements (환차손익) and revaluations (환산손익). */
export function fxEntries(books: Books): JournalEntry[] {
  return (books.fxDeals ?? []).flatMap(d => {
    const acct = fxAccount(d);
    const base = krw(d.amount, d.rate);
    const tag = (l: JournalLine): JournalLine => (l.account === acct ? { ...l, partner: d.partner } : l);
    const out: JournalEntry[] = [{
      id: 'J-' + d.id, date: d.date, source: '매출매입', ref: d.id, partner: d.partner,
      desc: `${d.partner} · ${d.desc} ${d.kind} (${d.amount.toLocaleString()} ${d.currency} × ${d.rate.toLocaleString()})`,
      lines: (d.kind === '수출'
        ? [{ account: acct, debit: base, credit: 0 }, { account: d.account, debit: 0, credit: base }]
        : [{ account: d.account, debit: base, credit: 0 }, { account: acct, debit: 0, credit: base }]).map(tag),
    }];
    if (d.customs) {
      const fund = books.funds.find(f => f.id === d.customs!.fund);
      const money = fund ? fundAccount(fund) : '보통예금';
      out.push({
        id: `J-${d.id}-CUS`, date: d.customs.date, source: '매출매입', ref: d.id, desc: `${d.desc} 수입 통관 (관세 · 수입부가세)`,
        lines: [
          ...(d.customs.duty ? [{ account: d.account, debit: d.customs.duty, credit: 0 }] : []),
          ...(d.customs.vat ? [{ account: '부가세대급금', debit: d.customs.vat, credit: 0 }] : []),
          { account: money, debit: 0, credit: d.customs.duty + d.customs.vat, fund: fund?.id },
        ],
      });
    }
    fxPosition(d).steps.forEach((s, i) => {
      if (s.kind === '결제') {
        const fund = books.funds.find(f => f.id === s.fund);
        const bank: JournalLine = { account: '보통예금', debit: 0, credit: 0, fund: fund?.id };
        const lines: JournalLine[] = d.kind === '수출'
          ? [{ ...bank, debit: s.cash }, { account: acct, debit: 0, credit: s.bookPart }, ...(s.diff > 0 ? [{ account: '외환차익', debit: 0, credit: s.diff }] : s.diff < 0 ? [{ account: '외환차손', debit: -s.diff, credit: 0 }] : [])]
          : [{ account: acct, debit: s.bookPart, credit: 0 }, { ...bank, credit: s.cash }, ...(s.diff > 0 ? [{ account: '외환차익', debit: 0, credit: s.diff }] : s.diff < 0 ? [{ account: '외환차손', debit: -s.diff, credit: 0 }] : [])];
        out.push({ id: `J-${d.id}-S${i}`, date: s.date, source: d.kind === '수출' ? '수금' : '지급', ref: d.id, partner: d.partner, desc: `${d.partner} ${d.kind === '수출' ? '수출대금 입금' : '수입대금 송금'} ${s.fxAmount.toLocaleString()} ${d.currency} × ${s.rate?.toLocaleString()}`, lines: lines.map(tag) });
      } else {
        // 수출 receivable up / 수입 payable down is a gain.
        const up = s.bookPart > 0, gain = s.diff > 0, a = Math.abs(s.bookPart);
        const lines: JournalLine[] = [
          up ? { account: acct, debit: d.kind === '수출' ? a : 0, credit: d.kind === '수입' ? a : 0 } : { account: acct, debit: d.kind === '수입' ? a : 0, credit: d.kind === '수출' ? a : 0 },
          gain ? { account: '외화환산이익', debit: 0, credit: a } : { account: '외화환산손실', debit: a, credit: 0 },
        ].map(tag);
        out.push({ id: `J-${d.id}-R${i}`, date: s.date, source: '결산', ref: d.id, partner: d.partner, desc: `${d.partner} ${d.desc} 외화환산 (${s.fxAmount.toLocaleString()} ${d.currency})`, lines });
      }
    });
    return out;
  });
}

/** 영세율 과세표준: 수출 booked in the given months (원화 환산액). */
export const zeroRatedSales = (books: Books, months: string[]) =>
  (books.fxDeals ?? []).filter(d => d.kind === '수출' && months.includes(d.date.slice(0, 7))).map(d => ({ ...d, krw: krw(d.amount, d.rate) }));
