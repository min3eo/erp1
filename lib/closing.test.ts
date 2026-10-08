import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import * as C from './closing';
import { seed } from './seed';

const TODAY = '2026-10-08';
const balanced = (entries: A.JournalEntry[]) => entries.every(e => e.lines.reduce((t, l) => t + l.debit - l.credit, 0) === 0);
const balanceOf = (s: ReturnType<typeof seed>, account: string) => A.trialBalance(A.journal(s, TODAY), B.accountTypes(s)).find(r => r.account === account)?.balance ?? 0;

test('결산 정리: 목표 잔액까지만 반영해서 두 번 해도 중복되지 않음', () => {
  const s = seed('epure');
  s.books.badDebtRate = 2;
  const items = C.closingItems(s, '2026-09-30');
  assert.ok(items.find(i => i.key === '대손충당금')!.amount > 0, '채권이 있으니 대손충당금 설정');
  C.bookClosing(s, '2026-09-30');
  assert.ok(balanced(A.journal(s, TODAY)));
  assert.ok(C.closingItems(s, '2026-09-30').every(i => i.amount === 0), '반영 후에는 남은 정리가 없음');
  assert.throws(() => C.bookClosing(s, '2026-09-30'), /반영할 결산 정리가 없어요/);
  assert.throws(() => C.bookClosing(s, '2026-09-15'), /월말/);
  assert.throws(() => C.bookClosing(s, '2026-10-31'), /지나지 않은/);
});

test('발생주의 정리: 다음 달 1일 역분개, 지우면 짝도 함께', () => {
  const s = seed('epure');
  const before = balanceOf(s, '통신비');
  const a = C.addAccrual(s, { kind: '미지급비용', month: '2026-09', account: '통신비', amount: 120000, desc: '9월 인터넷 요금' });
  const sept = A.trialBalance(A.journal(s, TODAY).filter(e => e.date <= '2026-09-30'), B.accountTypes(s)).find(r => r.account === '미지급비용')!.balance;
  assert.equal(sept, 120000, '9월 말 미지급비용');
  assert.equal(balanceOf(s, '미지급비용'), 0, '10월 1일 역분개로 사라짐');
  assert.equal(balanceOf(s, '통신비'), before, '연간 비용은 그대로 (청구서가 오면 그때 정상 처리)');
  assert.throws(() => C.addAccrual(s, { kind: '미지급비용', month: '2026-09', account: '매출', amount: 1, desc: 'x' }), /비용 계정/);
  B.deleteVoucher(s, a.id);
  assert.equal(s.books.vouchers.filter(v => v.closing === '미지급비용').length, 0);
});

test('월 마감: 마감한 달은 바꿀 수 없음', () => {
  const s = seed('epure');
  C.closeWithChecks(s, '2026-09', TODAY);
  assert.throws(() => C.addAccrual(s, { kind: '선급비용', month: '2026-09', account: '임차료', amount: 1000, desc: 'x' }), /마감/);
  assert.throws(() => B.addVoucher(s, { date: '2026-09-30', kind: '출금', account: '소모품비', counter: 'CASH', amount: 1000, desc: 'x' }), /마감/);
  assert.equal(C.monthChecks(s, '2026-10').length > 0, true);
});

test('자본변동표: 기말 자본 = 자산 − 부채', () => {
  for (const company of ['epure', 'other'] as const) {
    const s = seed(company);
    C.bookClosing(s, '2026-09-30');
    const eq = C.equityStatement(s, '2026', TODAY);
    const tb = A.trialBalance(A.journal(s, TODAY), B.accountTypes(s));
    const sum = (t: B.AccountType) => tb.filter(r => r.type === t).reduce((x, r) => x + r.balance, 0);
    assert.equal(eq.close.capital + eq.close.retained, sum('자산') - sum('부채'), company);
  }
});
