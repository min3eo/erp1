import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as F from './flow-core';
import * as M from './finance';
import { seed } from './seed';

test('샘플 데이터: 재고와 입출고 이력 합계 일치, 미수·미지급 계산 가능', () => {
  for (const company of ['epure', 'other'] as const) {
    const s = seed(company);
    for (const i of s.items) {
      const sum = F.round(s.movements.filter(m => m.code === i[0] && m.stockType !== '불량').reduce((t, m) => t + m.qty, 0));
      assert.equal(sum, i[4], `${company} ${i[0]} 재고 = 이력 합계`);
    }
    assert.ok(s.movements.every(m => m.ref === 'OPENING' || s.sales.some(x => x.id === m.ref) || s.orders.some(x => x.id === m.ref) || s.workOrders.some(x => x.id === m.ref) || s.inv.transfers.some(x => x.id === m.ref) || s.books.fxDeals.some(x => x.id === m.ref)), '이력의 관련 문서가 모두 존재');
    assert.equal(M.receivables(s, '2026-10-07').length, 3, '8월 · 10월 2건 판매 미수');
    assert.ok(M.receivables(s, '2026-10-07')[0].balance > 0);
    assert.ok(M.payables(s, '2026-10-07').some(p => p.settled === 1000000), '선지급 100만');
  }
});
