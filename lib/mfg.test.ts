import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import { valuation } from './inventory';
import { manufacturingStatement } from './ledgers';
import * as P from './production';
import { seed } from './seed';

const TODAY = '2026-10-08';

test('제조원가: 생산 입고 원가 = 재료비 + 가공비, 명세서는 재공품 흐름과 일치', () => {
  const s = seed('epure');
  const wo = s.workOrders.find(w => w.status === '완료')!;
  assert.equal(wo.conversion, 2000, 'BOM 가공비가 지시에 고정됨');
  const m = manufacturingStatement(A.journal(s, TODAY), '2026-01-01', '2026-12-31');
  assert.equal(m.conversion, 2000 * wo.produced, '반제품 50kg × 2,000원');
  assert.equal(m.open + m.total - m.finished, m.close);
  const wip = A.trialBalance(A.journal(s, TODAY), B.accountTypes(s)).find(r => r.account === '재공품')?.balance ?? 0;
  assert.equal(m.close, wip, '기말재공품 = 장부 재공품');
  const tb = A.trialBalance(A.journal(s, TODAY), B.accountTypes(s));
  assert.equal((tb.find(r => r.account === '재고자산')?.balance ?? 0) + wip, valuation(s).reduce((t, v) => t + v.value, 0), '장부 재고 = 원가 평가 (가공비 포함)');
  assert.equal(tb.find(r => r.account === '가공비배부')!.balance, -m.conversion, '배부한 만큼 비용이 줄어듦');

  P.setConversion(s, 'FG-001', 0);
  const next = P.createWorkOrder(s, { productCode: 'FG-001', qty: 10, due: '2026-12-31' });
  assert.equal(next.conversion, undefined, '0으로 바꾸면 이후 지시는 가공비 없음');
  assert.throws(() => P.setConversion(s, 'FG-001', -1), /0 이상/);
});
