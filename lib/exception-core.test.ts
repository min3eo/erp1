import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as F from './flow-core';

const make = () => F.normalize({ items: [['A', '상품', '상품', '창고', 10, 1, 10]], orders: [], sales: [] });

test('입출고 취소·구매/판매 반품·불량 분리·실사 승인·재고 변동 충돌·이력 보존', () => {
  const s = make(); const p = F.purchase(s, { itemCode: 'A', vendor: '거래처', qty: 10, price: 1 }); F.approve(s, p.id); F.place(s, p.id); F.receipt(s, p.id, 5, 'in');
  assert.throws(() => F.cancelOrder(s, p.id, '취소'), /입고 전/);
  F.cancelMovement(s, 'in', '잘못된 입고', 'undo-in'); assert.equal(s.items[0][4], 10); assert.equal(p.received, 0); assert.equal(p.status, '발주 완료');
  assert.throws(() => F.cancelMovement(s, 'in', '중복', 'duplicate'), /취소할 수/); assert.equal(s.items[0][4], 10);
  F.receipt(s, p.id, 10, 'in-2'); F.returnGoods(s, { kind: '구매 반품', ref: p.id, qty: 2, reason: '공급 불량' }, 'purchase-return'); assert.equal(s.items[0][4], 18);
  assert.throws(() => F.cancelMovement(s, 'in-2', '취소', 'blocked'), /반품 이력/);
  assert.throws(() => F.returnGoods(s, { kind: '구매 반품', ref: p.id, qty: 9, reason: '초과' }, 'over'), /초과/);
  const sale = F.sale(s, { itemCode: 'A', customer: '고객', qty: 8, price: 2 }); F.ship(s, sale.id, 8, 'out'); assert.equal(s.items[0][4], 10);
  F.returnGoods(s, { kind: '판매 반품', ref: sale.id, qty: 2, reason: '고객 반품', grade: '정상' }, 'good'); assert.equal(s.items[0][4], 12);
  F.returnGoods(s, { kind: '판매 반품', ref: sale.id, qty: 1, reason: '파손', grade: '불량' }, 'bad'); assert.equal(s.items[0][4], 12); assert.equal(s.quarantine.A, 1);
  assert.throws(() => F.returnGoods(s, { kind: '판매 반품', ref: sale.id, qty: 6, reason: '초과' }, 'over-sale'), /초과/);
  assert.throws(() => F.returnGoods(s, { kind: '판매 반품', ref: sale.id, qty: 1, reason: '중복' }, 'bad'), /이미 처리/);
  const adj = F.requestAdjustment(s, { itemCode: 'A', actual: 9, reason: '실물 확인' }); assert.equal(s.items[0][4], 12); F.decideAdjustment(s, adj.id, true); assert.equal(s.items[0][4], 9);
  assert.throws(() => F.decideAdjustment(s, adj.id, true), /이미 처리/);
  const stale = F.requestAdjustment(s, { itemCode: 'A', actual: 7, reason: '실사' }); const so = F.sale(s, { itemCode: 'A', customer: '고객', qty: 1, price: 2 }); F.ship(s, so.id, 1, 'out-2'); assert.throws(() => F.decideAdjustment(s, stale.id, true), /재고가 바뀌/); assert.equal(s.items[0][4], 8); F.decideAdjustment(s, stale.id, false);
  F.cancelMovement(s, 'out-2', '출고 오류', 'undo-out'); assert.equal(s.items[0][4], 9); assert.equal(so.shipped, 0);
  const zero = F.requestAdjustment(s, { itemCode: 'A', actual: 0, reason: '실물 없음' }); F.decideAdjustment(s, zero.id, true); assert.equal(s.items[0][4], 0);
  const empty = F.purchase(s, { itemCode: 'A', vendor: '거래처', qty: 1, price: 1 }); F.cancelOrder(s, empty.id, '발주 불필요'); assert.equal(empty.status, '취소');
  assert.throws(() => F.requestAdjustment(s, { itemCode: 'A', actual: -1, reason: '오류' }), /0 이상/);
  assert.throws(() => F.requestAdjustment(s, { itemCode: 'A', actual: 1, reason: '' }), /사유/);
  assert.equal(s.movements.filter(m => m.stockType !== '불량').reduce((sum, m) => sum + m.qty, 0), s.items[0][4]);
  assert.equal(s.movements.filter(m => m.stockType === '불량').reduce((sum, m) => sum + m.qty, 0), s.quarantine.A);
});
