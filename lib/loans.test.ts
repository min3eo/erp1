import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import { cashPlan } from './cashflow';
import * as L from './loans';
import { seed } from './seed';

const TODAY = '2026-10-08';
const balanceOf = (s: ReturnType<typeof seed>, account: string) => A.trialBalance(A.journal(s, TODAY), B.accountTypes(s)).find(r => r.account === account)?.balance ?? 0;
const base: L.Loan = { id: 'x', lender: '은행', desc: '', principal: 12_000_000, rate: 6, start: '2026-01-31', months: 12, method: '원금균등', fund: 'BANK-1', payments: [] };

test('상환표: 세 방식 모두 원금 합계 = 대출 금액, 원리금균등은 매달 같은 금액', () => {
  for (const method of L.REPAY_METHODS) {
    const rows = L.loanSchedule({ ...base, method });
    assert.equal(rows.reduce((t, r) => t + r.principal, 0), base.principal, method);
    assert.equal(rows.at(-1)!.balance, 0);
  }
  const level = L.loanSchedule({ ...base, method: '원리금균등' });
  assert.ok(Math.abs(level[0].payment - level[5].payment) <= 1, '원리금균등');
  assert.equal(L.loanSchedule({ ...base, method: '만기일시' })[0].principal, 0, '만기일시는 이자만');
  assert.equal(L.loanSchedule(base)[0].interest, 60000, '1,200만 × 6% / 12');
  assert.equal(L.loanSchedule(base)[0].date, '2026-02-28', '말일 대출은 다음 달 말일');
});

test('차입 · 상환 · 중도상환이 장부와 자금계획에 반영', () => {
  const s = seed('epure');
  const sample = s.books.loans[0];
  assert.equal(balanceOf(s, '장기차입금'), L.loanStatus(sample).balance, '샘플 대출 잔액 = 장기차입금');
  assert.ok(cashPlan(s, TODAY).items.some(i => i.kind === '차입금'), '다음 회차가 자금계획에 보임');
  const bank = balanceOf(s, '보통예금');
  const l = L.addLoan(s, { lender: '신한은행', principal: 10_000_000, rate: 5, start: '2026-10-01', months: 6, method: '원금균등', fund: 'BANK-1' });
  assert.equal(balanceOf(s, '단기차입금'), 10_000_000, '6개월은 단기차입금');
  L.repayLoan(s, l.id, { date: '2026-10-08' });
  assert.equal(balanceOf(s, '단기차입금'), 10_000_000 - 1_666_666);
  const interest = balanceOf(s, '이자비용');
  L.repayLoan(s, l.id, { date: '2026-10-08', payoff: true });
  assert.equal(balanceOf(s, '단기차입금'), 0, '중도상환으로 잔액 0');
  assert.ok(L.loanStatus(l).done);
  assert.ok(balanceOf(s, '이자비용') > interest);
  assert.throws(() => L.repayLoan(s, l.id), /다 갚은/);
  L.undoRepayment(s, l.id);
  assert.equal(balanceOf(s, '단기차입금'), 10_000_000 - 1_666_666, '중도상환 취소');
  assert.equal(L.loanStatus(l).done, false);
  assert.equal(balanceOf(s, '보통예금'), bank + 10_000_000 - 1_666_666 - 41_666);
});

test('가지급금 인정이자: 적수 × 4.6% ÷ 365, 받은 이자는 차감, 세무조정에 반영', () => {
  const s = seed('epure');
  const entries = A.journal(s, TODAY);
  const r = L.deemedInterest(s, entries, '2026', '2026-12-31').find(x => x.person === '대표이사 민서')!;
  // 4/15 ~ 8/19: 1,000만 (127일), 8/20 ~ 12/31: 600만 (134일)
  assert.equal(r.sum, 10_000_000 * 127 + 6_000_000 * 134);
  assert.equal(r.deemed, Math.floor((r.sum * 4.6) / 100 / 365));
  L.bookDeemedInterest(s, entries, '2026', '대표이사 민서', '2026-12-31');
  L.bookDeemedInterest(s, entries, '2026', '대표이사 민서', '2026-12-31');
  assert.equal(s.books.taxAdjust.filter(a => a.desc === r.desc).length, 1, '다시 반영하면 덮어씀');
  B.addVoucher(s, { date: '2026-12-31', kind: '입금', account: '이자수익', counter: 'BANK-1', amount: 100000, desc: '가지급금 이자', partner: '대표이사 민서' });
  const after = L.deemedInterest(s, A.journal(s, TODAY), '2026', '2026-12-31').find(x => x.person === '대표이사 민서')!;
  assert.equal(after.add, r.deemed - 100000, '받은 이자만큼 익금산입이 줄어듦');
});
