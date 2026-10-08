import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as M from './finance';
import * as Pay from './payroll';
import * as P from './production';
import { seed } from './seed';

test('생산: 자재 부족 시 출고 거절(재고 그대로), 출고 → 부분/전체 실적, 취소 규칙', () => {
  const s = seed('epure');
  const pk = () => s.items.find(i => i[0] === 'PK-001')![4];
  const fg = () => s.items.find(i => i[0] === 'FG-002')![4];

  const short = s.workOrders.find(w => w.id === 'MO-202610-003')!;
  const before = pk();
  assert.throws(() => P.issueMaterials(s, short.id, 'x'), /자재가 부족/);
  assert.equal(pk(), before, '부족하면 어떤 자재도 차감하지 않음');

  const wo = P.createWorkOrder(s, { productCode: 'FG-002', qty: 100 });
  assert.equal(P.requirements(s, wo).find(r => r.code === 'PK-001')!.need, 100);
  assert.throws(() => P.reportOutput(s, wo.id, 10, 'early'), /자재 출고/);
  P.issueMaterials(s, wo.id, 'issue');
  assert.equal(pk(), before - 100);
  assert.throws(() => P.issueMaterials(s, wo.id, 'again'), /계획 상태/);
  const fg0 = fg();
  P.reportOutput(s, wo.id, 40, 'r1');
  assert.equal(wo.status, '생산 중');
  assert.throws(() => P.reportOutput(s, wo.id, 61, 'r2'), /남은 생산 수량/);
  P.reportOutput(s, wo.id, 60, 'r3');
  assert.equal(wo.status, '완료');
  assert.equal(fg(), fg0 + 100);
  assert.throws(() => P.cancelWorkOrder(s, wo.id), /자재 출고 전/);
  P.cancelWorkOrder(s, short.id, '수요 감소');
  assert.equal(short.status, '취소');
  assert.throws(() => P.createWorkOrder(s, { productCode: 'RM-001', qty: 1 }), /BOM/);
  assert.ok(P.unitMaterialCost(s, 'FG-001') > 0);
});

test('급여: 공제 합계와 실지급액, 비과세 식대, 중복 확정 방지, 입력 검증', () => {
  const s = seed('epure');
  const p = Pay.payslip(s.salaries[0]);
  assert.equal(p.gross, 4700000);
  assert.equal(p.taxable, 4500000, '식대 20만 원 비과세');
  assert.equal(p.deductions, p.pension + p.health + p.longTermCare + p.employment + p.incomeTax + p.localTax);
  assert.equal(p.net, p.gross - p.deductions);
  assert.ok(p.incomeTax > 0 && p.localTax === Math.floor((p.incomeTax * 0.1) / 10) * 10);
  assert.ok(Pay.incomeTax(4500000, 4) < Pay.incomeTax(4500000, 1), '부양가족이 많으면 세금이 적음');
  Pay.confirmPayroll(s, '2026-10', '2026-10-25');
  assert.throws(() => Pay.confirmPayroll(s, '2026-10', '2026-10-25'), /이미 확정/);
  assert.throws(() => Pay.updateSalary(s, '민서', { base: -1, allowance: 0, dependents: 1 }), /기본급/);
  Pay.updateSalary(s, '민서', { base: 5000000, allowance: 0, dependents: 2 });
  assert.equal(s.salaries[0].base, 5000000);
});

test('회계: 모든 전표 차대 일치, 시산표 합계 일치, 채권·채무 계정 = 채권채무 화면', () => {
  const s = seed('epure');
  const entries = A.journal(s);
  assert.ok(entries.length > 10);
  for (const e of entries) {
    const d = e.lines.reduce((t, l) => t + l.debit, 0);
    const c = e.lines.reduce((t, l) => t + l.credit, 0);
    assert.equal(d, c, `${e.desc} 차변 = 대변`);
  }
  const tb = A.trialBalance(entries);
  assert.equal(tb.reduce((t, r) => t + r.debit, 0), tb.reduce((t, r) => t + r.credit, 0), '시산표 차변 합계 = 대변 합계');
  const bal = (a: string) => tb.find(r => r.account === a)?.balance ?? 0;
  assert.equal(bal('외상매출금'), M.receivables(s).reduce((t, b) => t + b.balance, 0));
  assert.equal(bal('외상매입금'), M.payables(s).reduce((t, b) => t + b.balance, 0));
  const pl = A.incomeSummary(tb);
  const exports = s.books.fxDeals.filter(d => d.kind === '수출').reduce((t, d) => t + Math.round(d.amount * d.rate), 0);
  const trades = s.books.trades.filter(t => t.kind === '매출' && t.account === '매출').reduce((t, x) => t + x.supply, 0);
  const shipped = s.sales.reduce((t, x) => t + x.shipped * x.price, 0);
  assert.equal(shipped, 640000 + 260000 + 1_600_000, '샘플 출고: 8월 20개 · 10월 10개 · 10월 50개');
  assert.equal(pl.revenue, shipped + exports + trades, '출고된 공급가 합계 + 수출 + 매출매입 매출');
  assert.equal(pl.gross, pl.revenue - pl.cogs);
  assert.ok(bal('급여') > 0, '확정된 9월 급여 반영');
});
