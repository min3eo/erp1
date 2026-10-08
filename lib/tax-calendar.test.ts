import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as B from './books';
import { payInterim, setPriorCorpTax } from './corp-tax';
import { seed } from './seed';
import * as K from './tax-calendar';

const TODAY = '2026-10-08';

test('인지세 구간 · 계약 금액', () => {
  assert.deepEqual([9_999_999, 10_000_000, 30_000_000, 30_000_001, 100_000_000, 1_000_000_001].map(K.stampTax), [0, 20000, 20000, 40000, 70000, 350000]);
  const c = { side: '매출', category: '용역', cycle: '월 정기', amount: 1_200_000, start: '2026-10-01', end: '2027-03-31' } as B.Contract;
  assert.equal(K.contractTotal(c), 7_200_000, '6개월');
  assert.equal(K.contractStamp({ ...c, amount: 2_000_000 }), 20000, '1,200만 원 용역');
  assert.equal(K.contractStamp({ ...c, category: '임대차', amount: 9_000_000 }), 0, '임대차는 대상 아님');
});

test('세무 일정: 장부에 기록되면 완료, 나머지는 직접 완료 표시', () => {
  const s = seed('epure');
  const cal = K.taxCalendar(s, '2026-10-01', '2026-12-31', TODAY);
  const find = (k: string) => cal.find(d => d.key === k);
  assert.ok(find('원천세|2026-09'), '10월 10일 9월분 원천세');
  assert.ok(find('4대보험|2026-09'));
  assert.ok(find('부가세|2026-Q3'), '10월 25일 3분기 부가세');
  assert.equal(find('부가세|2026-Q3')!.date, '2026-10-25');
  assert.ok(cal.some(d => d.kind === '지방세' && d.key.startsWith('자동차세')) === false, '샘플 회사는 차량이 없음');
  assert.ok(cal.every((d, i) => !i || cal[i - 1].date <= d.date), '날짜순');

  assert.equal(K.taxCalendar(s, '2026-01-01', '2026-12-31', TODAY).find(d => d.key === '중간예납|2026')!.done, '낼 세액 없음', '결손 · 직전 세액 없음');
  setPriorCorpTax(s, '2025', 3_000_000);
  const year = K.taxCalendar(s, '2026-01-01', '2026-12-31', TODAY);
  assert.equal(year.find(d => d.key === '중간예납|2026')!.done, undefined, '직전 세액이 있으면 납부 대상');
  payInterim(s, '2026', { amount: 100000, date: '2026-08-31' });
  assert.equal(K.taxCalendar(s, '2026-01-01', '2026-12-31', TODAY).find(d => d.key === '중간예납|2026')!.done, '2026-08-31');
  const corp = year.find(d => d.key === '법인세|2025')!;
  assert.ok(corp.manual);
  K.markDeadline(s, corp.key, true, '2026-03-30');
  assert.equal(K.taxCalendar(s, '2026-01-01', '2026-12-31', TODAY).find(d => d.key === corp.key)!.done, '2026-03-30');

  // 인지세: a signed 1,500만 원 용역 contract shows up until it is paid.
  const c = B.addContract(s, { title: '물류 용역', partner: '한빛 공급', side: '매입', category: '용역', start: '2026-10-01', end: '', amount: 15_000_000, cycle: '일시', account: '지급수수료' });
  Object.assign(c, { sign: '서명 완료', signedAt: '2026-10-05', approvedBy: '민서' });
  const stamp = () => K.taxCalendar(s, '2026-10-01', '2026-12-31', TODAY).find(d => d.key === '인지세|' + c.id);
  assert.equal(stamp()!.done, undefined);
  B.payStamp(s, c.id, { amount: K.contractStamp(c), date: TODAY });
  assert.equal(stamp()!.done, TODAY);
  assert.throws(() => B.payStamp(s, c.id, { amount: 20000, date: TODAY }), /이미/);
});
