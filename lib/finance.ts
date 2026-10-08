/* Quotes, receivables / payables and payments. Browser-only demo rules; amounts include 10% VAT. */
import { assertOpen } from './admin';
import { date, id, purchase, round, sale, unit, type ErpState, type Order, type Sale } from './flow-core';

export type QuoteStatus = '작성' | '주문 전환' | '거절';
export interface Quote {
  id: string; customer: string; itemCode: string; name: string; qty: number; price: number;
  date: string; validUntil: string; status: QuoteStatus; saleId?: string; reason?: string;
}
export type PaymentKind = '수금' | '지급';
/** fund: the bank account the money moved through, when known (matched from 계좌/카드 내역). */
export interface Payment { id: string; kind: PaymentKind; partner: string; docId: string; amount: number; method: string; date: string; note: string; fund?: string }

export const VAT_RATE = 0.1;
export const PAYMENT_TERMS_DAYS = 30;
export const PAYMENT_METHODS = ['계좌이체', '카드', '현금'] as const;
/** Settlements that are not money moving: discounts, write-offs and advances applied to an invoice. */
export const SETTLE_METHODS = ['매출할인', '매입할인', '대손', '선수금 대체', '선급금 대체'] as const;

/** Supply amount → { supply, vat, total } in whole won. */
export function withVat(supply: number) {
  const s = Math.round(supply);
  const vat = Math.round(s * VAT_RATE);
  return { supply: s, vat, total: s + vat };
}

const iso = (d: string) => d.replace(/\./g, '-');
const addDays = (d: string, n: number) => new Date(Date.parse(iso(d)) + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(iso(to)) - Date.parse(iso(from))) / 86400000);

export interface Balance {
  kind: PaymentKind; docId: string; partner: string; name: string; docDate: string; due: string;
  billed: number; settled: number; balance: number; overdueDays: number;
}

const returnedQty = (state: ErpState, docId: string) => state.returns.filter(r => r.ref === docId).reduce((s, r) => s + r.qty, 0);
const settledFor = (state: ErpState, docId: string) => state.payments.filter(p => p.docId === docId).reduce((s, p) => s + p.amount, 0);

/** Receivable: shipped minus returned, billed with VAT. Payable: received minus returned, billed with VAT. */
/** Outstanding exposure to a customer: unpaid receivables plus unshipped orders, VAT included. */
export function creditExposure(state: ErpState, customer: string) {
  const open = receivables(state).filter(b => b.partner === customer).reduce((t, b) => t + b.balance, 0);
  const unshipped = state.sales.filter(s => s.customer === customer && s.status !== '출고 완료').reduce((t, s) => t + withVat((s.qty - s.shipped) * s.price).total, 0);
  return open + unshipped;
}

/** Refuses a new order that would push the customer past its 여신 한도. */
export function checkCredit(state: ErpState, customer: string, amount: number) {
  const limit = state.books?.partners.find(p => p.name === customer.trim())?.creditLimit;
  if (!limit) return;
  const after = creditExposure(state, customer.trim()) + withVat(amount).total;
  if (after > limit) throw Error(`여신 한도 초과: ${customer} 한도 ${limit.toLocaleString()}원, 이 주문까지 ${after.toLocaleString()}원이에요. 수금 후 주문하거나 한도를 조정해 주세요.`);
}

export function balanceOf(state: ErpState, doc: Sale | Order, kind: PaymentKind, today = date()): Balance {
  const done = kind === '수금' ? (doc as Sale).shipped : (doc as Order).received;
  const billed = withVat(round(done - returnedQty(state, doc.id)) * doc.price).total;
  const settled = settledFor(state, doc.id);
  const partnerName = kind === '수금' ? (doc as Sale).customer : (doc as Order).vendor;
  const terms = state.books?.partners.find(p => p.name === partnerName)?.terms ?? PAYMENT_TERMS_DAYS;
  const due = addDays(doc.date, terms);
  const balance = Math.max(0, billed - settled);
  return {
    kind, docId: doc.id, partner: kind === '수금' ? (doc as Sale).customer : (doc as Order).vendor, name: doc.name,
    docDate: iso(doc.date), due, billed, settled, balance, overdueDays: balance > 0 ? Math.max(0, daysBetween(due, today)) : 0,
  };
}

export function receivables(state: ErpState, today = date()) {
  return state.sales.filter(s => s.shipped > 0).map(s => balanceOf(state, s, '수금', today));
}

export function payables(state: ErpState, today = date()) {
  return state.orders.filter(o => o.received > 0).map(o => balanceOf(state, o, '지급', today));
}

export const AGING_BUCKETS = ['기한 내', '1~30일', '31~60일', '61일 이상'] as const;
export const agingBucket = (b: Balance) => (b.overdueDays === 0 ? '기한 내' : b.overdueDays <= 30 ? '1~30일' : b.overdueDays <= 60 ? '31~60일' : '61일 이상');

export function createQuote(state: ErpState, f: { itemCode: string; customer?: string; qty: string | number; price: string | number; validUntil?: string }) {
  const item = state.items.find(i => i[0] === f.itemCode);
  if (!item) throw Error('견적할 품목을 골라 주세요.');
  if (!['완제품', '상품'].includes(item[2])) throw Error('견적은 완제품 또는 상품으로 작성해 주세요.');
  const customer = f.customer?.trim();
  if (!customer) throw Error('고객사를 입력해 주세요.');
  const qty = Number(f.qty), price = Number(f.price);
  if (!Number.isFinite(qty) || qty <= 0 || (unit(item) === 'EA' && !Number.isInteger(qty))) throw Error('수량은 1 이상의 정수로 입력해 주세요.');
  if (!Number.isFinite(price) || price < 0) throw Error('단가는 0 이상의 숫자로 입력해 주세요.');
  const today = date();
  const validUntil = f.validUntil || addDays(today, 14);
  if (validUntil < today) throw Error('유효기간은 오늘 이후로 정해 주세요.');
  const q: Quote = { id: id('QT'), customer, itemCode: item[0], name: item[1], qty, price, date: today, validUntil, status: '작성' };
  state.quotes.unshift(q);
  return q;
}

/** Turns an open quote into a sales order with the same terms. */
export function convertQuote(state: ErpState, quoteId: string, today = date()) {
  const q = state.quotes.find(x => x.id === quoteId);
  if (!q || q.status !== '작성') throw Error('작성 상태의 견적만 주문으로 전환할 수 있어요.');
  if (q.validUntil < today) throw Error('유효기간이 지난 견적이에요. 새 견적을 작성해 주세요.');
  const s = sale(state, { itemCode: q.itemCode, customer: q.customer, qty: q.qty, price: q.price, quoteId: q.id });
  q.status = '주문 전환';
  q.saleId = s.id;
  return s;
}

export function rejectQuote(state: ErpState, quoteId: string, reason?: string) {
  const q = state.quotes.find(x => x.id === quoteId);
  if (!q || q.status !== '작성') throw Error('작성 상태의 견적만 거절 처리할 수 있어요.');
  q.status = '거절';
  q.reason = reason?.trim() || '고객 거절';
  return q;
}

export function recordPayment(state: ErpState, f: { kind: PaymentKind; docId: string; amount: string | number; method?: string; date?: string; note?: string }) {
  const doc = f.kind === '수금' ? state.sales.find(s => s.id === f.docId) : state.orders.find(o => o.id === f.docId);
  if (!doc) throw Error('정산할 거래를 찾을 수 없어요.');
  const b = balanceOf(state, doc, f.kind);
  const amount = Number(f.amount);
  if (!Number.isInteger(amount) || amount <= 0) throw Error('금액은 1원 이상의 정수로 입력해 주세요.');
  if (amount > b.balance) throw Error(`남은 금액 ${b.balance.toLocaleString()}원을 넘을 수 없어요.`);
  assertOpen(state, f.date || date());
  const method = ([...PAYMENT_METHODS, ...SETTLE_METHODS] as readonly string[]).includes(f.method ?? '') ? f.method! : '계좌이체';
  const p: Payment = { id: id(f.kind === '수금' ? 'RC' : 'PY'), kind: f.kind, partner: b.partner, docId: doc.id, amount, method, date: f.date || date(), note: f.note?.trim() || '' };
  state.payments.unshift(p);
  return p;
}

/** Low-stock items and how much to order to get back to twice the safety stock. */
export function reorderSuggestions(state: ErpState) {
  return state.items
    .filter(i => i[4] < i[5])
    .map(i => {
      const open = state.orders.filter(o => o.itemCode === i[0] && ['승인 대기', '승인 완료', '발주 완료', '부분 입고'].includes(o.status));
      const incoming = open.reduce((s, o) => s + round(o.qty - o.received), 0);
      const qty = round(Math.max(0, i[5] * 2 - i[4] - incoming));
      const lastVendor = state.orders.find(o => o.itemCode === i[0])?.vendor ?? '한빛 공급';
      return { item: i, incoming, qty: unit(i) === 'EA' ? Math.ceil(qty) : qty, vendor: lastVendor };
    });
}

export function requestReorder(state: ErpState, itemCode: string) {
  const s = reorderSuggestions(state).find(x => x.item[0] === itemCode);
  if (!s) throw Error('발주 제안 대상이 아니에요.');
  if (s.qty <= 0) throw Error('이미 진행 중인 발주로 충분해요.');
  return purchase(state, { itemCode, vendor: s.vendor, qty: s.qty, price: s.item[6] });
}

/** 4,325,000 → '사백삼십이만오천' (for the "일금 … 원정" line on printed documents). */
export function wonInKorean(n: number) {
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const small = ['', '십', '백', '천'];
  const big = ['', '만', '억', '조'];
  let out = '';
  let group = 0;
  let value = Math.floor(n);
  if (value === 0) return '영';
  while (value > 0) {
    const chunk = value % 10000;
    if (chunk) {
      let part = '';
      String(chunk).padStart(4, '0').split('').forEach((d, i) => {
        const v = Number(d);
        if (v) part += (v === 1 && i < 3 ? '' : digits[v]) + small[3 - i];
      });
      out = part + big[group] + out;
    }
    value = Math.floor(value / 10000);
    group++;
  }
  return out;
}

/** Most recent price this partner was given for the item (sales and quotes, or purchase orders). */
export function lastPrice(state: ErpState, side: 'sale' | 'purchase', partner: string, itemCode: string) {
  const name = partner.trim();
  if (!name) return null;
  // A partner price list (단가표) wins over history.
  const listed = state.books?.partners.find(p => p.name === name)?.prices?.[itemCode];
  if (listed) return { price: listed, date: '', source: `${name} 단가표` };
  const iso2 = (d: string) => d.replace(/\./g, '-');
  const history =
    side === 'sale'
      ? [
          ...state.sales.filter(s => s.customer === name && s.itemCode === itemCode).map(s => ({ price: s.price, date: iso2(s.date), source: `판매 ${s.id}` })),
          ...state.quotes.filter(q => q.customer === name && q.itemCode === itemCode && q.status !== '거절').map(q => ({ price: q.price, date: q.date, source: `견적 ${q.id}` })),
        ]
      : state.orders.filter(o => o.vendor === name && o.itemCode === itemCode).map(o => ({ price: o.price, date: iso2(o.date), source: `발주 ${o.id}` }));
  return history.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

/** Partner names seen in transactions, for input suggestions. */
export function knownPartners(state: ErpState, side: 'sale' | 'purchase') {
  const names = side === 'sale' ? [...state.sales.map(s => s.customer), ...state.quotes.map(q => q.customer)] : state.orders.map(o => o.vendor);
  return [...new Set(names)];
}
