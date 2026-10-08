import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as F from './flow-core';

const sample = () => F.normalize({ items: [['A', '상품 A', '상품', '본사 창고', 10, 5, 100], ['R', '원료 R', '원료', '원료 창고', 2, 1, 100]], orders: [], sales: [] });

test('승인·발주·부분 입고·중복 방지·초과 방지·부분 출고·소수 단위·재고/이력 합계', () => {
  const s = sample();
  const o = F.purchase(s, { itemCode: 'A', vendor: '공급사', qty: 10, price: 100 });
  assert.equal(s.items[0][4], 10, '요청 등록으로 재고가 바뀌지 않아야 함');
  assert.throws(() => F.receipt(s, o.id, 1, 'pending'), /발주된/);
  F.approve(s, o.id); assert.equal(o.status, '승인 완료');
  assert.throws(() => F.approve(s, o.id), /승인 대기/);
  F.place(s, o.id);
  F.receipt(s, o.id, 4, 'tx1'); assert.equal(o.status, '부분 입고'); assert.equal(s.items[0][4], 14);
  assert.throws(() => F.receipt(s, o.id, 4, 'tx1'), /이미 처리/); assert.equal(s.items[0][4], 14);
  assert.throws(() => F.receipt(s, o.id, 7, 'tx2'), /초과/); assert.equal(o.received, 4);
  F.receipt(s, o.id, 6, 'tx3'); assert.equal(o.status, '입고 완료'); assert.equal(s.items[0][4], 20);
  assert.throws(() => F.receipt(s, o.id, 1, 'tx4'), /발주된/);
  const sale = F.sale(s, { itemCode: 'A', customer: '고객', qty: 25, price: 200 });
  assert.equal(s.items[0][4], 20, '주문 등록으로 재고가 바뀌지 않아야 함');
  assert.throws(() => F.ship(s, sale.id, 25, 'tx5'), /보유 재고/); assert.equal(sale.shipped, 0);
  F.ship(s, sale.id, 5, 'tx6'); assert.equal(s.items[0][4], 15); assert.equal(sale.status, '부분 출고');
  assert.throws(() => F.ship(s, sale.id, 5, 'tx6'), /이미 처리/);
  assert.throws(() => F.purchase(s, { itemCode: 'A', vendor: '공급사', qty: .5, price: 100 }), /정수/);
  assert.throws(() => F.purchase(s, { itemCode: 'A', vendor: '공급사', qty: -1, price: 100 }), /정수/);
  const raw = F.purchase(s, { itemCode: 'R', vendor: '공급사', qty: .125, price: 100 }); F.approve(s, raw.id); F.place(s, raw.id); F.receipt(s, raw.id, .125, 'raw'); assert.equal(s.items[1][4], 2.125);
  assert.throws(() => F.sale(s, { itemCode: 'R', customer: '고객', qty: 1, price: 100 }), /완제품/);
  const other = sample(); assert.equal(other.items[0][4], 10);
  for (const i of s.items) assert.equal(F.round(s.movements.filter(m => m.code === i[0]).reduce((sum, m) => sum + m.qty, 0)), i[4], '재고와 변동 이력 합계 일치');
  const count = s.movements.length; F.normalize(s); assert.equal(s.movements.length, count, '재조회 시 기초 재고 중복 생성 방지');
});
