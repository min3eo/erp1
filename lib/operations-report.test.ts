import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import * as F from './flow-core';
import * as I from './import';
import * as O from './operations-report';
import { seed } from './seed';

const TODAY = '2026-10-08';

test('가용재고: 미출고 판매 · 계획 생산 자재를 예약으로, 발주 · 생산 중을 입고 예정으로', () => {
  const s = seed('epure');
  const fg = O.availability(s).find(r => r.code === 'FG-002')!;
  const open = s.sales.filter(x => x.itemCode === 'FG-002' && x.status !== '출고 완료').reduce((t, x) => t + x.qty - x.shipped, 0);
  assert.equal(fg.sales, open);
  assert.equal(fg.available, fg.stock - fg.reserved);
  const pk = O.availability(s).find(r => r.code === 'PK-001')!;
  assert.ok(pk.production > 0, '계획 상태 생산 지시가 용기를 예약');
  const before = O.availability(s).find(r => r.code === 'FG-001')!.reserved;
  F.sale(s, { itemCode: 'FG-001', customer: '새봄 피부과', qty: 7, price: 30000 });
  assert.equal(O.availability(s).find(r => r.code === 'FG-001')!.reserved, before + 7);
});

test('월간 리포트: 판매 금액 = 그 달 매출 계정, 지난달과 비교', () => {
  const s = seed('epure');
  const r = O.monthlyReport(s, '2026-10');
  const sales = A.journal(s, TODAY).filter(e => e.date.startsWith('2026-10')).reduce((t, e) => t + e.lines.filter(l => l.account === '매출').reduce((x, l) => x + l.credit - l.debit, 0), 0);
  assert.equal(r.now.sales, sales);
  assert.equal(r.now.weeks.reduce((t, w) => t + w.sales, 0), A.journal(s, TODAY).filter(e => e.date.startsWith('2026-10') && e.source === '판매').reduce((t, e) => t + e.lines.filter(l => l.account === '매출').reduce((x, l) => x + l.credit - l.debit, 0), 0));
  assert.equal(r.types.reduce((t, x) => t + x.value, 0), r.stockValue);
  assert.equal(O.change(110, 100), '+10.0%');
  assert.equal(O.change(5, 0), '신규');
});

test('회사 정보 · 은행 내역 가져오기 · 홈택스 매입 대사', () => {
  const s = seed('epure');
  assert.equal(O.companyProfile(s, { name: '이퓨어', business: '제조' }).bizNo, '123-45-67890', '입력 전에는 샘플');
  assert.throws(() => O.setCompanyProfile(s, { name: '이퓨어', bizNo: '1', ceo: '민서' }), /형식/);
  O.setCompanyProfile(s, { name: '(주)이퓨어', bizNo: '220-81-12345', ceo: '민서', address: '서울 성동구' });
  assert.equal(O.companyProfile(s, { name: '이퓨어', business: '제조' }).name, '(주)이퓨어');

  const text = '계좌 · 카드\t거래일자\t적요\t입금액\t출금액\n기업은행 보통예금\t2026.10.08\t전기요금\t\t230,000\n123-456789\t2026-10-08\t이자\t1,200\t';
  assert.deepEqual(I.runImport(s, 'bankTx', text), { imported: 2, skipped: 0 });
  assert.equal(I.previewImport(s, 'bankTx', text).rows.filter(r => r.error?.includes('이미')).length, 2, '같은 내역은 두 번 안 들어감');

  const inv = s.books.invoices.find(i => i.kind === '매입' && i.date.startsWith('2026-10'))!;
  const hometax = ['작성일자\t공급자사업자등록번호\t상호\t공급가액\t세액', `${inv.date}\t${B.bizNoOf(s, inv.partner)}\t${inv.partner}\t${inv.supply.toLocaleString()}\t${inv.vat}`, '2026-10-03\t111-22-33333\t새로운 공급사\t500000\t50000'].join('\n');
  assert.match(I.previewImport(s, 'bankTx', '계좌 · 카드,거래일자,적요,입금액,출금액\n없는계좌,2026-10-08,테스트,1000,').rows[0].error!, /찾지 못했어요/, '숫자 없는 이름은 번호와 맞추지 않음');
  const r = O.reconcileHometax(s, hometax);
  assert.equal(r.matched.length, 1);
  assert.equal(r.missing.length, 1, '장부에 없는 매입');
  assert.equal(r.missing[0].name, '새로운 공급사');
  assert.ok(r.extra.every(e => e.id !== inv.id));
  assert.match(O.reconcileHometax(s, '날짜\t금액\n1\t2').error, /필요한 열/);
});
