import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import { bookClosing } from './closing';
import * as C from './corp-tax';
import { seed } from './seed';

const TODAY = '2026-10-08';
const run = (s: ReturnType<typeof seed>, year = '2026') => C.corpTaxFrom(s, year, A.journal(s, TODAY));

test('자동 세무조정: 접대비 증빙 미수취 · 한도 초과, 퇴직급여충당금 설정액', () => {
  const s = seed('epure');
  assert.deepEqual(run(s).auto, [], '샘플은 자동 조정 없음');
  B.addCompoundVoucher(s, { date: '2026-10-01', desc: '거래처 접대 (현금)', lines: [{ account: '접대비', debit: 80000, credit: '' }, { account: 'fund:CASH', debit: '', credit: 80000 }] });
  B.addTrade(s, { kind: '매입', date: '2026-10-02', partner: '호텔', desc: '접대 만찬', account: '접대비', supply: 40_000_000, settle: 'CARD-1', nonDeductible: '접대비 관련' });
  const t = run(s);
  assert.equal(t.auto.find(a => a.desc.startsWith('접대비 적격증빙'))!.amount, 80000);
  const over = t.auto.find(a => a.desc === '접대비 한도 초과')!;
  const ent = A.trialBalance(A.journal(s, TODAY).filter(e => e.date.startsWith('2026')), B.accountTypes(s)).find(r => r.account === '접대비')!.balance;
  const limit = C.ENTERTAINMENT_BASE + Math.floor(t.pl.revenue * 0.003);
  assert.equal(over.amount, ent - 80000 - limit, '증빙 없는 분을 뺀 접대비 − 한도');
  assert.equal(t.add, t.auto.reduce((x, a) => x + a.amount, 0) + 96000);

  bookClosing(s, '2026-09-30', ['퇴직급여충당부채']);
  const reserve = run(s).auto.find(a => a.desc.startsWith('퇴직급여충당금'))!;
  assert.ok(reserve.amount > 0, '충당금 설정액은 손금불산입');
});

test('감면 · 공제와 최저한세 7%, 중간예납 납부는 선납세금', () => {
  const s = seed('epure');
  B.addTaxAdjust(s, { year: '2026', kind: '가산', desc: '테스트 소득', amount: 300_000_000 });
  const before = run(s);
  assert.ok(before.base > 200_000_000);
  C.addCredit(s, { year: '2026', kind: '감면', desc: '중소기업 특별세액감면', rate: 10 });
  C.addCredit(s, { year: '2026', kind: '공제', desc: '통합투자세액공제', amount: 50_000_000 });
  const t = run(s);
  assert.equal(t.minTax, Math.floor((t.base * 0.07) / 10) * 10);
  assert.equal(t.determined, t.minTax, '공제가 커도 최저한세 아래로는 안 내려감');
  assert.equal(t.allowedCredit, t.tax - t.minTax);
  assert.equal(t.local, Math.floor((t.determined * 0.1) / 10) * 10);

  C.setPriorCorpTax(s, '2025', 3_000_000);
  const i = C.interimTax(s, '2026', A.journal(s, TODAY));
  assert.equal(i.byPrior, 1_500_000);
  assert.equal(i.amount, Math.min(1_500_000, i.byHalf));
  C.setPriorCorpTax(s, '2025', 400_000);
  assert.equal(C.interimTax(s, '2026', A.journal(s, TODAY)).exempt, true, '직전 50만 원 미만은 면제');
  C.payInterim(s, '2026', { amount: 700_000, date: '2026-08-31' });
  assert.throws(() => C.payInterim(s, '2026', { amount: 1, date: '2026-08-31' }), /이미/);
  const bal = A.trialBalance(A.journal(s, TODAY), B.accountTypes(s)).find(r => r.account === '선납세금')!.balance;
  assert.equal(bal, 700_000);
  assert.equal(run(s).payable, run(s).determined - 700_000, '정기 신고 때는 중간예납을 빼고 냄');
});
