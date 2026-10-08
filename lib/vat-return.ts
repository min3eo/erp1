/* 부가세 신고서 (일반과세자) summary and its attachments, built from invoices, trades, vouchers and the journal. */
import { journal, type JournalEntry } from './accounting';
import { bizNoOf, fundById, type TaxInvoice } from './books';
import type { ErpState } from './flow-core';
import { zeroRatedSales } from './forex';
import { quarterMonths, vatSummary } from './tax';

export interface ReturnLine { no: string; label: string; supply: number; vat: number; note?: string }

const issued = (i: TaxInvoice) => i.kind === '매입' || i.status === '발행 완료' || i.status === '전송 완료';
const sum = <T,>(list: T[], pick: (x: T) => number) => list.reduce((t, x) => t + pick(x), 0);

/** One row per partner: the 매출처별 · 매입처별 (세금)계산서합계표. */
function byPartner(state: ErpState, list: TaxInvoice[]) {
  const map = new Map<string, { partner: string; bizNo: string; count: number; supply: number; vat: number; electronic: boolean }>();
  list.forEach(i => {
    const r = map.get(i.partner) ?? { partner: i.partner, bizNo: bizNoOf(state, i.partner), count: 0, supply: 0, vat: 0, electronic: true };
    r.count += 1;
    r.supply += i.supply;
    r.vat += i.vat;
    if (i.kind === '매출' && i.status !== '전송 완료') r.electronic = false;
    map.set(i.partner, r);
  });
  return [...map.values()].sort((a, b) => b.supply - a.supply);
}

/**
 * The quarter's return. Sales and purchase lines follow the 일반과세자 신고서 numbering; any VAT the books hold
 * that no line explains (shipments without an invoice yet, manual vouchers) shows as 기타 so totals tie to the ledger.
 */
export function vatReturn(state: ErpState, period: string, entries: JournalEntry[] = journal(state)) {
  const months = quarterMonths(period);
  const inQ = (d: string) => months.includes(d.slice(0, 7));
  const base = vatSummary(state, period, entries);
  const inv = state.books.invoices.filter(i => inQ(i.date) && issued(i));
  const trades = state.books.trades.filter(t => inQ(t.date));
  const isTax = (i: TaxInvoice) => i.type !== '계산서';

  // 매출
  const salesTaxInv = inv.filter(i => i.kind === '매출' && isTax(i) && i.vat !== 0);
  const salesZeroInv = inv.filter(i => i.kind === '매출' && isTax(i) && i.vat === 0);
  const salesCard = trades.filter(t => t.kind === '매출' && (t.taxType ?? '과세') === '과세' && (t.proof === '신용카드' || t.proof === '현금영수증'));
  const exports = zeroRatedSales(state.books, months);
  const zeroOther = trades.filter(t => t.kind === '매출' && t.taxType === '영세율' && !t.invoiceId);
  const exempt = trades.filter(t => t.kind === '매출' && t.taxType === '면세');
  const taxInvVat = sum(salesTaxInv, i => i.vat), cardSalesVat = sum(salesCard, t => t.vat);
  const otherVat = base.output - taxInvVat - cardSalesVat;
  const sales: ReturnLine[] = [
    { no: '1', label: '과세 · 세금계산서 발급분', supply: sum(salesTaxInv, i => i.supply), vat: taxInvVat },
    { no: '3', label: '과세 · 신용카드 · 현금영수증 발행분', supply: sum(salesCard, t => t.supply), vat: cardSalesVat },
    { no: '4', label: '과세 · 기타 (정규영수증 외 · 미발행)', supply: Math.round(otherVat * 10), vat: otherVat, note: otherVat ? '출고했지만 세금계산서를 아직 발행하지 않은 분 포함' : undefined },
    { no: '5', label: '영세율 · 세금계산서 발급분', supply: sum(salesZeroInv, i => i.supply), vat: 0 },
    { no: '6', label: '영세율 · 기타 (직수출)', supply: sum(exports, d => d.krw) + sum(zeroOther, t => t.supply), vat: 0 },
  ];

  // 매입
  const buyInv = inv.filter(i => i.kind === '매입' && isTax(i));
  const tradeOf = (i: TaxInvoice) => state.books.trades.find(t => t.id === i.ref);
  const fixed = buyInv.filter(i => tradeOf(i)?.account === '유형자산');
  const general = buyInv.filter(i => !fixed.includes(i));
  const customs = state.books.fxDeals.filter(d => d.customs && inQ(d.customs.date));
  const cardTrades = trades.filter(t => t.kind === '매입' && (t.taxType ?? '과세') === '과세' && (t.proof === '신용카드' || t.proof === '현금영수증') && !t.nonDeductible);
  const cardVouchers = state.books.vouchers.filter(v => inQ(v.date) && v.lines.some(l => l.account === '부가세대급금' && l.debit) && (v.evidence === '신용카드' || v.evidence === '현금영수증'));
  // 16번 공제받지 못할 매입세액: 받은 세금계산서 중 불공제분. Card / receipt 불공제 purchases are simply not claimed on 14.
  const nonDed = trades.filter(t => t.kind === '매입' && t.nonDeductible && t.invoiceId);
  const voucherVat = (v: (typeof cardVouchers)[number]) => sum(v.lines.filter(l => l.account === '부가세대급금'), l => l.debit - l.credit);
  const cardVat = sum(cardTrades, t => t.vat) + sum(cardVouchers, voucherVat);
  const invVat = sum(general, i => i.vat), fixedVat = sum(fixed, i => i.vat), customsVat = sum(customs, d => d.customs!.vat), nonVat = sum(nonDed, t => t.vat);
  const explained = invVat + fixedVat + customsVat + cardVat - nonVat;
  const otherIn = base.input - explained;
  const purchases: ReturnLine[] = [
    { no: '10', label: '세금계산서 수취분 · 일반매입', supply: sum(general, i => i.supply), vat: invVat },
    { no: '11', label: '세금계산서 수취분 · 고정자산', supply: sum(fixed, i => i.supply), vat: fixedVat },
    { no: '10-1', label: '수입세금계산서 (세관)', supply: Math.round(customsVat * 10), vat: customsVat },
    { no: '14', label: '그 밖의 공제 · 신용카드 · 현금영수증 수취분', supply: Math.round(cardVat * 10), vat: cardVat },
    { no: '16', label: '공제받지 못할 매입세액 (차감)', supply: -sum(nonDed, t => t.supply), vat: -nonVat },
    ...(otherIn ? [{ no: '—', label: '기타 (장부 차이 · 계산서 미수취 매입)', supply: Math.round(otherIn * 10), vat: otherIn, note: '구매 입고분 중 세금계산서를 아직 받지 않은 것 등' }] : []),
  ];

  const attachments = {
    salesTaxInvoices: byPartner(state, inv.filter(i => i.kind === '매출' && isTax(i))),
    purchaseTaxInvoices: byPartner(state, buyInv),
    salesInvoices: byPartner(state, inv.filter(i => i.kind === '매출' && !isTax(i))),
    purchaseInvoices: byPartner(state, inv.filter(i => i.kind === '매입' && !isTax(i))),
    cards: [
      ...cardTrades.map(t => ({ date: t.date, partner: t.partner, bizNo: bizNoOf(state, t.partner), kind: t.proof!, supply: t.supply, vat: t.vat })),
      ...cardVouchers.map(v => {
        const vat = voucherVat(v);
        const card = v.lines.find(l => l.credit && l.fund && fundById(state, l.fund)?.kind === '카드');
        return { date: v.date, partner: v.partner || v.desc, bizNo: bizNoOf(state, v.partner), kind: v.evidence!, supply: sum(v.lines.filter(l => l.debit && l.account !== '부가세대급금'), l => l.debit), vat, card: card ? fundById(state, card.fund)?.name : undefined };
      }),
    ].sort((a, b) => a.date.localeCompare(b.date)),
    nonDeductible: [...new Set(nonDed.map(t => t.nonDeductible!))].map(reason => {
      const list = nonDed.filter(t => t.nonDeductible === reason);
      return { reason, count: list.length, supply: sum(list, t => t.supply), vat: sum(list, t => t.vat) };
    }),
    exports: exports.map(d => ({ date: d.date, partner: d.partner, desc: d.desc, currency: d.currency, amount: d.amount, rate: d.rate, krw: d.krw })),
    exempt: { count: exempt.length, supply: sum(exempt, t => t.supply) },
  };

  const output = sum(sales, l => l.vat), input = sum(purchases, l => l.vat);
  return { period, due: base.due, sales, purchases, output, input, payable: output - input, attachments, filing: base };
}
