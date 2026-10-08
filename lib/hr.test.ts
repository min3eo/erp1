import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import { accountTypes } from './books';
import * as H from './hr';
import * as Pay from './payroll';
import { seed } from './seed';
import * as T from './tax';

const TODAY = '2026-10-08';
const balanced = (s: ReturnType<typeof seed>) => A.journal(s, TODAY).every(e => e.lines.reduce((t, l) => t + l.debit - l.credit, 0) === 0);
const bal = (s: ReturnType<typeof seed>, a: string) => A.trialBalance(A.journal(s, TODAY), accountTypes(s)).find(r => r.account === a)?.balance ?? 0;

test('연차: 1년 미만 월 1일, 1년 이상 15일 + 2년마다 1일 (최대 25일)', () => {
  const s = seed('epure');
  assert.equal(H.leaveBalance(s, '한도윤', TODAY).granted, 6, '2026-04-01 입사 → 6개월');
  assert.equal(H.leaveBalance(s, '민서', TODAY).granted, 16, '3년 근속 → 15 + 1');
  assert.equal(H.leaveBalance(s, '이서윤', TODAY).granted, 16, '4년 근속 → 15 + 1');
  assert.equal(H.leaveBalance(s, '정우진', TODAY).granted, 18, '7년 근속 → 15 + 3');
  assert.equal(H.leaveBalance(s, '민서', TODAY).expires, '2027-03-02');
});

test('입사 · 일할 · 퇴사 · 퇴직금 · 4대보험 상실까지 이어짐', () => {
  const s = seed('epure');
  H.hire(s, { name: '신입', dept: '운영팀', role: '사원', type: '정규직', joined: '2026-10-16', base: 3_100_000, allowance: 0, dependents: 1 });
  const slip = Pay.payslips(s, '2026-10').find(p => p.name === '신입')!;
  assert.deepEqual(slip.days, { worked: 16, total: 31 }, '10/16 입사 → 16일 일할');
  assert.ok(s.hr.insuranceReports.some(r => r.name === '신입' && r.kind === '취득'));
  assert.ok(!H.staff(s, TODAY).some(p => p[0] === '신입'), '입사일 전에는 재직 목록에 없음');
  H.retire(s, '이서윤', { date: TODAY, reason: '개인 사정' });
  assert.ok(s.hr.insuranceReports.some(r => r.name === '이서윤' && r.kind === '상실'));
  const sev = s.hr.severance.find(x => x.name === '이서윤')!;
  assert.ok(sev.amount > 0 && sev.tax >= 0);
  assert.ok(!Pay.payslips(s, '2026-11').some(p => p.name === '이서윤'), '퇴사 다음 달 급여 제외');
  H.paySeverance(s, '이서윤', TODAY);
  assert.ok(balanced(s));
  assert.equal(T.withholdingSummary(s, '2026-10').rows.find(r => r.code === 'A21')!.tax, sev.tax);
});

test('퇴직소득세: 근속연수공제 · 환산급여공제 적용, 근속이 길면 세 부담 감소', () => {
  assert.deepEqual(H.retirementTax(0, 5), { tax: 0, local: 0 });
  const short = H.retirementTax(30_000_000, 3).tax, long = H.retirementTax(30_000_000, 10).tax;
  assert.ok(short > long, '같은 금액이면 근속이 길수록 세금이 적음');
  assert.equal(H.basicTax(14_000_000), 840_000);
  assert.equal(H.basicTax(50_000_000), 50_000_000 * 0.15 - 1_260_000);
});

test('연장근로 수당 · 상여가 급여에 반영되고, 4대보험 납부로 예수금이 정리됨', () => {
  const s = seed('epure');
  const base = Pay.payslips(s, '2026-11').find(p => p.name === '민서')!;
  H.addOvertime(s, { name: '민서', month: '2026-11', overtime: 10, night: 0, holiday: 0 });
  H.addBonus(s, { name: '민서', month: '2026-11', amount: 300_000, desc: '성과급' });
  const after = Pay.payslips(s, '2026-11').find(p => p.name === '민서')!;
  assert.equal(after.overtime, Math.round(H.hourlyWage(4_200_000, 300_000) * 15));
  assert.equal(after.gross, base.gross + after.overtime + 300_000);
  assert.throws(() => H.addOvertime(s, { name: '민서', month: '2026-11', overtime: 60, night: 0, holiday: 0 }), /52시간/);

  const ins = H.insuranceMonth(s, '2026-09');
  assert.ok(ins.employer > ins.employee, '사업주는 고용안정 · 산재까지 더 냄');
  const withheld0 = bal(s, '예수금');
  H.payInsurance(s, '2026-09', TODAY);
  assert.equal(bal(s, '예수금'), withheld0 - ins.employee);
  assert.throws(() => H.payInsurance(s, '2026-09', TODAY), /이미/);
  assert.throws(() => H.payInsurance(s, '2026-12', TODAY), /확정한 달/);
  assert.ok(balanced(s));
});

test('연말정산: 결정세액 − 기납부세액, 확정하면 원천세 A04와 장부에 반영', () => {
  const s = seed('epure');
  const c = H.yearEndCalc(s, '2026', '민서');
  assert.equal(c.months, 1, '샘플은 9월분만 확정');
  assert.equal(c.diff, c.decided - c.paid);
  H.confirmYearEnd(s, '2026', '민서', TODAY);
  assert.throws(() => H.setYearEndInput(s, '2026', '민서', { cardSpend: 1 }), /확정/);
  assert.equal(T.withholdingSummary(s, '2026-10').rows.find(r => r.code === 'A04')!.tax, c.diff);
  assert.ok(balanced(s));
  const rows = H.statementSchedule(s, '2026');
  assert.ok(rows.some(r => r.kind === '근로소득' && r.due === '2027-03-10'));
  assert.ok(rows.some(r => r.kind === '일용근로' && r.period === '2026-09' && r.due === '2026-10-31'));
});
