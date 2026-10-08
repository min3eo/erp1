import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as F from './flow-core';
import * as M from './finance';

const make = () => F.normalize({ items: [['A', '상품 A', '상품', '창고', 100, 50, 1000], ['R', '원료 R', '원료', '창고', 1, 5, 500]], orders: [], sales: [] });

test('견적 → 주문 전환, 출고·반품 기준 미수금, 수금 한도, 미지급금, 연체, 발주 제안, 한글 금액', () => {
  const s = make();

  const q = M.createQuote(s, { itemCode: 'A', customer: '고객', qty: 10, price: 2000, validUntil: '2999-12-31' });
  assert.throws(() => M.createQuote(s, { itemCode: 'R', customer: '고객', qty: 1, price: 1 }), /완제품/);
  const so = M.convertQuote(s, q.id);
  assert.equal(q.status, '주문 전환');
  assert.equal(so.quoteId, q.id);
  assert.throws(() => M.convertQuote(s, q.id), /작성 상태/);
  assert.equal(M.receivables(s).length, 0, '출고 전에는 미수금 없음');

  F.ship(s, so.id, 10, 'out');
  let ar = M.receivables(s)[0];
  assert.equal(ar.billed, 22000, '공급가 20,000 + 부가세 2,000');
  F.returnGoods(s, { kind: '판매 반품', ref: so.id, qty: 2, reason: '파손', grade: '불량' }, 'ret');
  ar = M.receivables(s)[0];
  assert.equal(ar.billed, 17600, '반품 2개만큼 청구 차감');

  M.recordPayment(s, { kind: '수금', docId: so.id, amount: 10000 });
  assert.equal(M.receivables(s)[0].balance, 7600);
  assert.throws(() => M.recordPayment(s, { kind: '수금', docId: so.id, amount: 7601 }), /넘을 수 없/);
  assert.throws(() => M.recordPayment(s, { kind: '수금', docId: so.id, amount: 0.5 }), /정수/);
  M.recordPayment(s, { kind: '수금', docId: so.id, amount: 7600 });
  assert.equal(M.receivables(s)[0].balance, 0);

  const po = F.purchase(s, { itemCode: 'A', vendor: '공급사', qty: 5, price: 1000 });
  F.approve(s, po.id); F.place(s, po.id); F.receipt(s, po.id, 5, 'in');
  const ap = M.payables(s)[0];
  assert.equal(ap.billed, 5500);
  assert.equal(ap.overdueDays, 0, '방금 입고된 건은 기한 내');
  const late = M.balanceOf(s, { ...po, date: '2026-01-01' }, '지급', '2026-03-15');
  assert.equal(late.overdueDays, 43, '30일 결제 조건 이후 경과일');
  assert.equal(M.agingBucket(late), '31~60일');

  const sug = M.reorderSuggestions(s);
  assert.equal(sug.length, 1);
  assert.equal(sug[0].qty, 9, '안전재고 5의 두 배 - 보유 1');
  const req = M.requestReorder(s, 'R');
  assert.equal(req.status, '승인 대기');
  assert.equal(M.reorderSuggestions(s)[0].qty, 0, '진행 중인 발주를 반영');

  M.rejectQuote(s, M.createQuote(s, { itemCode: 'A', customer: '고객2', qty: 1, price: 1 }).id, '');
  assert.equal(s.quotes[0].status, '거절');

  assert.equal(M.wonInKorean(4325000), '사백삼십이만오천');
  assert.equal(M.wonInKorean(10000), '일만');
  assert.equal(M.wonInKorean(110000000), '일억천만');
});
