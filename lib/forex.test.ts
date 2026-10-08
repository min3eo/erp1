import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import * as X from './forex';
import { valuation } from './inventory';
import { seed } from './seed';
import { vatSummary } from './tax';

const TODAY = '2026-10-08';
const bal = (s: ReturnType<typeof seed>, account: string) => A.trialBalance(A.journal(s, TODAY), B.accountTypes(s)).find(r => r.account === account)?.balance ?? 0;

test('수출: 입금 환율 차이는 외환차익 · 차손, 기말 환산은 외화환산손익', () => {
  const s = seed('epure');
  const gain0 = bal(s, '외환차익'), loss0 = bal(s, '외환차손'), ar0 = bal(s, '미수금');
  const sample = s.books.fxDeals.find(x => x.kind === '수출')!, sample0 = X.fxPosition(sample).book;
  const d = X.addFxDeal(s, { kind: '수출', date: '2026-10-01', partner: 'ACME', desc: '크림', currency: 'USD', amount: 1000, rate: 1400 });
  assert.equal(bal(s, '미수금'), ar0 + 1_400_000);
  X.settleFx(s, d.id, { date: '2026-10-05', amount: 400, rate: 1410, fund: 'BANK-1' });
  assert.equal(bal(s, '외환차익'), gain0 + 4000, '400 × (1,410 − 1,400)');
  X.revalueFx(s, '2026-10-31', { USD: 1380 });
  assert.equal(bal(s, '외화환산손실') > 0, true);
  assert.equal(X.fxPosition(d).book, 600 * 1380, '남은 600달러는 기말 환율로');
  X.revalueFx(s, '2026-10-31', { USD: 1390 });
  assert.equal(X.fxPosition(d).book, 600 * 1390, '같은 날 다시 환산하면 덮어씀');
  X.settleFx(s, d.id, { date: '2026-11-03', amount: 600, rate: 1370, fund: 'BANK-1' });
  assert.equal(bal(s, '외환차손'), loss0 + 600 * 20, '환산 후 장부가 기준으로 차손');
  assert.equal(bal(s, '미수금'), ar0 + X.fxPosition(sample).book - sample0, '다 받으면 이 건의 미수금 0 (샘플 수출 건만 환산분이 남음)');
  assert.equal(X.fxPosition(sample).book, 5000 * 1390, '샘플 수출 잔액 5,000달러도 함께 환산');
  assert.ok(A.journal(s, TODAY).every(e => e.lines.reduce((t, l) => t + l.debit - l.credit, 0) === 0));
});

test('수입: 재고로 들이면 단가 = (외화 × 환율 + 관세) ÷ 수량, 수입부가세는 매입세액', () => {
  const s = seed('epure');
  const vat0 = vatSummary(s, '2026-Q4', A.journal(s, TODAY)).input;
  const d = X.addFxDeal(s, { kind: '수입', date: '2026-10-02', partner: 'Tokyo Chem', desc: '원료', currency: 'JPY', amount: 100000, rate: 9.5, account: '재고자산', itemCode: 'RM-001', qty: 100 });
  X.addCustoms(s, d.id, { date: '2026-10-04', duty: 50000, vat: 100000, fund: 'BANK-1' });
  assert.equal(X.importUnitCost(d), (950000 + 50000) / 100);
  assert.equal(bal(s, '재고자산') + bal(s, '재공품'), valuation(s).reduce((t, v) => t + v.value, 0), '장부 재고 = 원가 평가');
  assert.equal(vatSummary(s, '2026-Q4', A.journal(s, TODAY)).input, vat0 + 100000);
  assert.throws(() => X.settleFx(s, d.id, { date: '2026-10-05', amount: 200000, rate: 9, fund: 'BANK-1' }), /넘을 수 없어요/);
  X.settleFx(s, d.id, { date: '2026-10-06', amount: 100000, rate: 9.2, fund: 'BANK-1' });
  assert.equal(X.fxPosition(d).openFx, 0);
  assert.throws(() => X.deleteFxDeal(s, d.id), /지울 수 없어요/);
  X.undoFxSettlement(s, d.id);
  const stock = s.items.find(i => i[0] === 'RM-001')![4];
  X.deleteFxDeal(s, d.id);
  assert.equal(s.items.find(i => i[0] === 'RM-001')![4], stock - 100, '수입 삭제는 재고도 되돌림');
  assert.equal(bal(s, '재고자산') + bal(s, '재공품'), valuation(s).reduce((t, v) => t + v.value, 0));
});

test('부가세: 수출은 영세율 과세표준으로 집계', () => {
  const s = seed('epure');
  const q3 = vatSummary(s, '2026-Q3', A.journal(s, TODAY));
  assert.equal(q3.zeroRated, Math.round(12000 * 1385.5), '8월 샘플 수출');
});
