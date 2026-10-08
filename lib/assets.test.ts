import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import { seed } from './seed';

const TODAY = '2026-10-08';
const bal = (s: ReturnType<typeof seed>, account: string) => A.trialBalance(A.journal(s, TODAY), B.accountTypes(s)).find(r => r.account === account)?.balance ?? 0;

test('정률법: 5년 상각률 45.1%, 첫해가 더 크고 마지막에 비망가액만 남음', () => {
  assert.equal(Math.round(B.decliningRate(5) * 1000), 451);
  const a: B.Asset = { id: 'x', name: '설비', category: '기계장치', date: '2026-01-10', cost: 10_000_000, life: 5, settle: '외상', method: '정률법' };
  const d = B.depreciation(a, '2031-12-31');
  assert.equal(d.rows.length, 60);
  const year = (y: number) => d.rows.slice(y * 12, y * 12 + 12).reduce((t, r) => t + r.amount, 0);
  assert.ok(year(0) > year(1) && year(1) > year(2), '해마다 줄어듦');
  assert.equal(year(0), Math.floor((10_000_000 * B.decliningRate(5)) / 12) * 12);
  assert.equal(d.book, 1000);
  const line: B.Asset = { ...a, method: undefined };
  assert.ok(year(0) > B.depreciation(line, '2026-12-31').accumulated, '정액법보다 첫해 상각이 큼');
});

test('자본적 지출은 남은 기간에 나눠 상각, 매각은 부가세와 처분이익', () => {
  const s = seed('epure');
  const fa = B.addAsset(s, { name: '포장기', category: '기계장치', date: '2026-01-05', cost: 12_001_000, life: 1, settle: 'BANK-1' });
  B.addCapex(s, fa.id, { date: '2026-07-01', amount: 600_000, desc: '자동 라벨러 추가', settle: 'BANK-1' });
  const d = B.depreciation(s.books.assets.find(a => a.id === fa.id)!, '2026-12-31');
  assert.equal(d.rows[0].amount, 1_000_000);
  assert.equal(d.rows[6].amount, 1_100_000, '7월부터 60만 원 ÷ 남은 6개월이 더해짐');
  assert.equal(d.book, 1000);
  assert.equal(d.cost, 12_601_000);

  const vat0 = bal(s, '부가세예수금'), gain0 = bal(s, '유형자산처분이익'), ppe0 = bal(s, '유형자산');
  const book = B.depreciation(s.books.assets.find(a => a.id === fa.id)!, '2026-08-31').book;
  B.disposeAsset(s, fa.id, '2026-08-31', { price: book + 500_000, fund: 'BANK-1' });
  assert.equal(bal(s, '유형자산처분이익'), gain0 + 500_000);
  assert.equal(bal(s, '부가세예수금'), vat0 + Math.round((book + 500_000) * 0.1), '자산 매각도 과세');
  assert.equal(bal(s, '유형자산'), ppe0 - 12_601_000, '자본적 지출까지 함께 제거');
  assert.ok(A.journal(s, TODAY).every(e => e.lines.reduce((t, l) => t + l.debit - l.credit, 0) === 0));
  assert.throws(() => B.addCapex(s, fa.id, { date: TODAY, amount: 1, desc: 'x', settle: '외상' }), /보유 중/);
});
