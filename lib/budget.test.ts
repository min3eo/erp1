import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import * as G from './budget';
import { seed } from './seed';

const TODAY = '2026-10-08';

test('예산: 경과 예산 · 소진율 · 초과 경고, 부서 예산은 그 부서 태그만', () => {
  const s = seed('epure');
  s.books.budgets = [];
  G.setBudget(s, { year: '2026', account: '광고선전비', amount: '1,200,000' });
  G.setBudget(s, { year: '2026', account: '복리후생비', dept: '운영팀', amount: 100000 });
  assert.throws(() => G.setBudget(s, { year: '2026', account: '보통예금', amount: 1 }), /수익이나 비용/);
  const r = G.budgetReport(s, '2026', TODAY);
  const ad = r.find(x => x.account === '광고선전비')!;
  const spent = A.trialBalance(A.journal(s, TODAY).filter(e => e.date.startsWith('2026')), B.accountTypes(s)).find(x => x.account === '광고선전비')!.balance;
  assert.equal(ad.spent, spent);
  assert.equal(ad.elapsed, 1_000_000, '10월까지 10/12');
  assert.equal(ad.status, spent > 1_200_000 ? '초과' : spent > 1_000_000 ? '주의' : '정상');
  const team = r.find(x => x.dept === '운영팀')!;
  assert.equal(team.spent, 0, '운영팀 태그가 붙은 복리후생비만');
  B.addVoucher(s, { date: TODAY, kind: '출금', account: '복리후생비', counter: 'CASH', amount: 70000, desc: '팀 간식', dept: '운영팀' });
  assert.equal(G.budgetReport(s, '2026', TODAY).find(x => x.dept === '운영팀')!.spent, 70000);
  assert.match(G.budgetWarning(s, '복리후생비', 50000, TODAY, '운영팀'), /20,000원 초과/);
  assert.equal(G.budgetWarning(s, '복리후생비', 50000, TODAY, '상품팀'), '', '다른 부서는 해당 없음');
  G.setBudget(s, { year: '2026', account: '광고선전비', amount: 0 });
  assert.ok(!G.budgetReport(s, '2026', TODAY).some(x => x.account === '광고선전비' && !x.dept), '0으로 저장하면 삭제');
});

test('프로젝트 손익: 전표 · 매출매입 · 경비의 프로젝트 태그로 모음', () => {
  const s = seed('epure');
  B.addTrade(s, { kind: '매출', date: TODAY, partner: '새봄 피부과', desc: '팝업 운영 용역', account: '매출', supply: 2_000_000, settle: '외상', proof: '세금계산서', project: '성수 팝업' });
  B.addTrade(s, { kind: '매입', date: TODAY, partner: '오피스플러스', desc: '팝업 집기', account: '소모품비', supply: 300_000, settle: '외상', proof: '세금계산서', project: '성수 팝업' });
  const e = B.addExpense(s, { date: TODAY, person: '김하늘', dept: '운영팀', account: '여비교통비', amount: 40000, desc: '팝업 출장', method: '개인 결제', project: '성수 팝업' });
  B.decideExpense(s, e.id, true);
  const p = G.projectPL(s, A.journal(s, TODAY)).find(x => x.project === '성수 팝업')!;
  assert.equal(p.revenue, 2_000_000);
  assert.equal(p.cost, 340_000);
  assert.equal(p.profit, 1_660_000);
  assert.equal(p.count, 3);
});
