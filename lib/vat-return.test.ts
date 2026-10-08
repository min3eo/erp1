import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import * as M from './finance';
import { seed } from './seed';
import { vatSummary } from './tax';
import { vatReturn } from './vat-return';

const TODAY = '2026-10-08';
const Q = '2026-Q4';
const bal = (s: ReturnType<typeof seed>, account: string) => A.trialBalance(A.journal(s, TODAY), B.accountTypes(s)).find(r => r.account === account)?.balance ?? 0;
const ret = (s: ReturnType<typeof seed>) => vatReturn(s, Q, A.journal(s, TODAY));

test('신고서 합계 = 장부의 매출세액 · 매입세액 (모든 분기, 두 회사)', () => {
  for (const company of ['epure', 'other'] as const) {
    const s = seed(company);
    for (const q of ['2026-Q3', '2026-Q4']) {
      const r = vatReturn(s, q, A.journal(s, TODAY));
      const v = vatSummary(s, q, A.journal(s, TODAY));
      assert.equal(r.output, v.output, `${company} ${q} 매출세액`);
      assert.equal(r.input, v.input, `${company} ${q} 매입세액`);
    }
  }
});

test('면세는 계산서 · 세액 0, 카드 매출은 카드 발행분, 불공제는 원가로', () => {
  const s = seed('epure');
  const ex = B.addTrade(s, { kind: '매출', date: TODAY, partner: '새봄 피부과', desc: '교육 용역 (면세)', account: '매출', supply: 500000, settle: '외상', taxType: '면세', invoice: 'on' });
  assert.equal(ex.vat, 0);
  assert.equal(s.books.invoices.find(i => i.id === ex.invoiceId)!.type, '계산서');
  B.addTrade(s, { kind: '매출', date: TODAY, partner: '개인 고객', desc: '매장 판매', account: '매출', supply: 100000, settle: 'BANK-1', proof: '신용카드' });
  const vatIn = bal(s, '부가세대급금'), ent = bal(s, '접대비');
  const nd = B.addTrade(s, { kind: '매입', date: TODAY, partner: '한우마을', desc: '거래처 접대', account: '접대비', supply: 200000, settle: 'CARD-1', nonDeductible: '접대비 관련' });
  assert.equal(nd.proof, '신용카드', '카드 결제면 증빙은 카드');
  assert.equal(bal(s, '부가세대급금'), vatIn, '불공제 세액은 공제 안 됨');
  assert.equal(bal(s, '접대비'), ent + 220000, '세액까지 접대비 원가');
  const r = ret(s);
  assert.equal(r.sales.find(l => l.no === '3')!.vat, 10000, '카드 매출 세액');
  assert.equal(r.attachments.exempt.supply, 500000);
  assert.deepEqual(r.attachments.nonDeductible, [], '카드 불공제는 16번이 아니라 14번에서 빠짐');
  assert.ok(!r.attachments.cards.some(c => c.partner === '한우마을'), '카드 수취명세서에도 없음');
  B.addTrade(s, { kind: '매입', date: TODAY, partner: '한우마을', desc: '접대 (세금계산서)', account: '접대비', supply: 100000, settle: '외상', proof: '세금계산서', nonDeductible: '접대비 관련' });
  const r2 = ret(s);
  assert.deepEqual(r2.attachments.nonDeductible.map(x => [x.reason, x.vat]), [['접대비 관련', 10000]]);
  assert.equal(r2.purchases.find(l => l.no === '—'), undefined, '장부 차이 없음');
  assert.equal(r.input, vatSummary(s, Q, A.journal(s, TODAY)).input);
});

test('카드 내역 처리 때 부가세를 나누면 카드 수취명세서로 공제', () => {
  const s = seed('epure');
  const tx = s.books.bankTx.find(t => t.fund === 'CARD-1' && !B.isProcessed(t) && t.date >= '2026-10-01')!;
  const before = vatSummary(s, Q, A.journal(s, TODAY)).input;
  B.processBankTx(s, tx.id, '복리후생비', { vat: true, partner: '스타벅스 성수점' });
  const vat = Math.round(Math.abs(tx.amount) / 11);
  assert.equal(vatSummary(s, Q, A.journal(s, TODAY)).input, before + vat);
  const r = ret(s);
  assert.ok(r.attachments.cards.some(c => c.vat === vat && c.kind === '신용카드'));
});

test('수정세금계산서: 계약 해제 · 기재사항 착오 · 주문 건 공급가액 변동', () => {
  const s = seed('epure');
  const t = B.addTrade(s, { kind: '매출', date: '2026-10-02', partner: '바른약국 체인', desc: '진열 컨설팅', account: '매출', supply: 1_000_000, settle: '외상', invoice: 'on' });
  const inv = s.books.invoices.find(i => i.id === t.invoiceId)!;
  assert.throws(() => B.amendInvoice(s, inv.id, { reason: '계약 해제', date: TODAY }), /발행하지 않은/);
  inv.status = '전송 완료';
  const sales = bal(s, '매출'), ar = bal(s, '미수금');
  B.amendInvoice(s, inv.id, { reason: '기재사항 착오', supply: 900_000, date: TODAY });
  assert.equal(bal(s, '매출'), sales - 100_000, '착오 정정: 순 10만 원 감액');
  assert.equal(bal(s, '미수금'), ar - 110_000);
  B.amendInvoice(s, inv.id, { reason: '계약 해제', date: TODAY });
  assert.equal(bal(s, '매출'), sales - 1_000_000, '계약 해제로 전액 취소');
  assert.throws(() => B.amendInvoice(s, inv.id, { reason: '공급가액 변동', supply: -1, date: TODAY }), /줄일 수 없어요/);

  // A shipped sale invoiced, then a price cut: 매출할인 with VAT, receivable down.
  const doc = s.sales.find(x => x.id === 'SO-202610-003')!;
  const di = B.invoiceForDoc(s, '매출', doc.id, TODAY);
  di.status = '발행 완료';
  const vatOut = bal(s, '부가세예수금');
  const owed = M.receivables(s, TODAY).find(r => r.docId === doc.id)!.balance;
  B.amendInvoice(s, di.id, { reason: '공급가액 변동', supply: -10_000, date: TODAY });
  assert.equal(bal(s, '부가세예수금'), vatOut - 1000, '매출세액 1천 원 감소');
  assert.equal(M.receivables(s, TODAY).find(r => r.docId === doc.id)!.balance, owed - 11_000);
  assert.equal(B.invoiceable(s, '매출', doc.id), 0, '할인 수정분 때문에 다시 발행 대상이 되지 않음');
  assert.ok(A.journal(s, TODAY).every(e => e.lines.reduce((x, l) => x + l.debit - l.credit, 0) === 0));
});
