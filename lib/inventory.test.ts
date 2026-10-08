import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import { accountTypes } from './books';
import * as F from './flow-core';
import * as I from './inventory';
import { seed } from './seed';

const TODAY = F.date();
const bal = (s: ReturnType<typeof seed>, a: string) => A.trialBalance(A.journal(s, TODAY), accountTypes(s)).find(r => r.account === a)?.balance ?? 0;

test('이동평균 원가: 장부 재고자산 = 품목별 평가액 합계, 재공품은 미완성분만 (음수 아님)', () => {
  for (const company of ['epure', 'other'] as const) {
    const s = seed(company);
    const total = I.valuation(s).reduce((t, v) => t + v.value, 0);
    assert.equal(bal(s, '재고자산'), total, `${company} 재고자산 = 평가액`);
    assert.ok(bal(s, '재공품') >= 0, `${company} 재공품 ${bal(s, '재공품')}`);
  }
  const s = seed('epure');
  // Buy 10 more glycerin at a higher price: the average moves between the old average and the new price.
  const before = I.valuation(s).find(v => v.code === 'RM-001')!;
  const po = F.purchase(s, { itemCode: 'RM-001', vendor: '누리 소재', qty: 10, price: before.avg * 2 });
  F.approve(s, po.id); F.place(s, po.id);
  F.receipt(s, po.id, 10, 'R1');
  const after = I.valuation(s).find(v => v.code === 'RM-001')!;
  assert.ok(after.avg > before.avg && after.avg < before.avg * 2);
  assert.equal(after.value, before.value + Math.round(before.avg * 2) * 10);
});

test('창고 이동: 총재고는 그대로, 창고별 수량만 바뀌고 이동 중을 거쳐 도착', () => {
  const s = seed('epure');
  const item = s.items.find(i => i[0] === 'FG-001')!;
  const total = item[4];
  const t = I.startTransfer(s, { code: 'FG-001', from: item[3], to: '물류센터 (3PL 위탁)', qty: 5 });
  assert.equal(item[4], total);
  assert.equal(I.stockByWarehouse(s, 'FG-001').get(I.IN_TRANSIT), 5 + 10, '샘플 이동 10 + 이번 5');
  I.arriveTransfer(s, t.id);
  assert.equal(I.stockByWarehouse(s, 'FG-001').get('물류센터 (3PL 위탁)'), 5);
  assert.throws(() => I.arriveTransfer(s, t.id), /이동 중/);
  assert.throws(() => I.startTransfer(s, { code: 'FG-001', from: '물류센터 (3PL 위탁)', to: item[3], qty: 99 }), /만 있어요/);
  assert.equal(bal(s, '재고자산'), I.valuation(s).reduce((x, v) => x + v.value, 0), '이동은 원가 중립');
});

test('입고 검사 · LOT: 합격분만 입고, 불합격은 발주 잔량, FEFO로 유통기한 빠른 LOT부터 출고', () => {
  const s = seed('epure');
  const po = F.purchase(s, { itemCode: 'RM-002', vendor: '그린 파트너스', qty: 20, price: 48000 });
  F.approve(s, po.id); F.place(s, po.id);
  assert.throws(() => I.receiveInspected(s, po.id, { qty: 15, rejected: 5 }, 'Q0'), /사유/);
  I.receiveInspected(s, po.id, { qty: 15, rejected: 5, reason: '포장 파손', lot: 'HA-2611', expiry: '2027-01-31' }, 'Q1');
  assert.equal(po.received, 15);
  assert.equal(po.status, '부분 입고');
  assert.equal(s.inv.inspections[0].rejected, 5);
  const lots = I.lotBalances(s, 'RM-002');
  assert.ok(lots.some(l => l.lot === 'HA-2611' && l.qty === 15 && l.expiry === '2027-01-31'));
  // Opening lot has no expiry set → sorted last; the dated lot goes out first.
  F.recordStockChange(s, 'RM-002', -3, '생산 출고', 'TEST', '테스트', 'OUT1');
  assert.equal(I.lotBalances(s, 'RM-002').find(l => l.lot === 'HA-2611')!.qty, 12);
  assert.equal(I.traceLot(s, 'RM-002', 'HA-2611')!.out[0].qty, 3);
});

test('수불부: 기초 + 입고 − 출고 = 기말 (수량 · 금액), 바코드 · 포장 단위', () => {
  const s = seed('epure');
  const month = TODAY.slice(0, 7);
  for (const r of I.stockLedger(s, month)) {
    assert.equal(F.round(r.open.qty + r.inQty - r.outQty), r.close.qty, r.code);
    assert.equal(r.open.value + r.inValue - r.outValue, r.close.value, r.code);
  }
  assert.equal(I.itemByBarcode(s, '8801234500011')?.[0], 'FG-001');
  assert.equal(I.packLabel(s, 'FG-001', 50), '2 BOX + 2');
  assert.throws(() => I.setItemMeta(s, 'FG-002', { barcode: '8801234500011' }), /바코드/);
});
