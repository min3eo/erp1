import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import { cashPlan } from './cashflow';
import * as M from './finance';
import { seed } from './seed';
import * as T from './tax';

const TODAY = '2026-10-08';
const balanced = (entries: A.JournalEntry[]) => entries.every(e => e.lines.reduce((t, l) => t + l.debit - l.credit, 0) === 0);
const balanceOf = (s: ReturnType<typeof seed>, account: string) => A.trialBalance(A.journal(s, TODAY), B.accountTypes(s)).find(r => r.account === account)?.balance ?? 0;

test('장부: 회계 기록을 더해도 모든 전표 차대 일치, 외상매출금 = 채권관리 화면', () => {
  for (const company of ['epure', 'other'] as const) {
    const s = seed(company);
    const entries = A.journal(s, TODAY);
    assert.ok(balanced(entries), `${company} 모든 전표 차변 = 대변`);
    assert.equal(balanceOf(s, '외상매출금'), M.receivables(s).reduce((t, b) => t + b.balance, 0));
    assert.equal(balanceOf(s, '외상매입금'), M.payables(s).reduce((t, b) => t + b.balance, 0));
    const funds = A.fundBalances(s, entries);
    const bank = funds.filter(f => f.fund.kind === '계좌').reduce((t, f) => t + f.balance, 0);
    assert.equal(bank, balanceOf(s, '보통예금'), '계좌별 잔액 합계 = 보통예금');
    assert.equal(funds.find(f => f.fund.kind === '현금')!.balance, balanceOf(s, '현금'));
  }
});

test('전표 입력 · 계좌 내역 처리 · 매출매입 · 세금계산서', () => {
  const s = seed('epure');
  const cash0 = balanceOf(s, '현금');
  B.addVoucher(s, { date: TODAY, kind: '출금', account: '소모품비', counter: 'CASH', amount: 10000, desc: '건전지' });
  assert.equal(balanceOf(s, '현금'), cash0 - 10000);
  assert.throws(() => B.addVoucher(s, { date: TODAY, kind: '대체', account: '소모품비', counter: '소모품비', amount: 1, desc: 'x' }), /같아요/);
  assert.throws(() => B.addVoucher(s, { date: TODAY, kind: '입금', account: '잡이익', counter: 'CARD-1', amount: 1, desc: 'x' }), /카드/);

  const tx = s.books.bankTx.find(t => !t.voucherId && t.fund === 'CARD-1')!;
  const card0 = A.fundBalances(s).find(f => f.fund.id === 'CARD-1')!.balance;
  B.processBankTx(s, tx.id, '복리후생비');
  assert.equal(A.fundBalances(s).find(f => f.fund.id === 'CARD-1')!.balance, card0 - tx.amount, '카드 사용 → 미결제 증가');
  assert.throws(() => B.processBankTx(s, tx.id, '복리후생비'), /이미/);
  const pay = B.addBankTx(s, { fund: 'BANK-1', date: TODAY, desc: '카드 대금', direction: '출금', amount: 50000 });
  B.processBankTx(s, pay.id, 'fund:CARD-1');
  assert.equal(A.fundBalances(s).find(f => f.fund.id === 'CARD-1')!.balance, card0 - tx.amount - 50000, '카드 대금 결제 → 미결제 감소');

  const t = B.addTrade(s, { kind: '매출', date: TODAY, partner: '바른약국 체인', desc: '컨설팅', account: '매출', supply: 1000000, settle: '외상', invoice: 'on' });
  assert.equal(t.vat, 100000);
  const inv = s.books.invoices.find(i => i.id === t.invoiceId)!;
  assert.equal(inv.status, '발행 대기');
  B.advanceInvoice(s, inv.id);
  B.advanceInvoice(s, inv.id);
  assert.equal(inv.status, '전송 완료');
  assert.throws(() => B.deleteTrade(s, t.id), /발행/);
  assert.throws(() => B.advanceInvoice(s, B.addTrade(s, { kind: '매출', date: TODAY, partner: '모르는 곳', desc: 'x', account: '매출', supply: 1, settle: '외상', invoice: 'on' }).invoiceId!), /사업자등록번호/);

  const target = B.invoiceTargets(s).find(x => x.kind === '매출')!;
  B.invoiceForDoc(s, '매출', target.docId);
  assert.equal(B.invoiceable(s, '매출', target.docId), 0, '같은 금액은 두 번 발행되지 않음');
  assert.ok(balanced(A.journal(s, TODAY)));
});

test('고정자산 감가상각 · 처분, 경비 · 계약 청구', () => {
  const a: B.Asset = { id: 'x', name: '노트북', category: '비품', date: '2026-01-15', cost: 1201000, life: 1, settle: '외상' };
  const d = B.depreciation(a, '2027-06-01');
  assert.equal(d.rows.length, 12, '내용연수 12개월에서 멈춤');
  assert.equal(d.accumulated, 1200000);
  assert.equal(d.book, 1000, '비망가액 1,000원');
  assert.equal(B.depreciation(a, '2026-03-31').rows.length, 3, '취득한 달부터 상각');

  const s = seed('epure');
  const fa = B.addAsset(s, { name: '복합기', category: '비품', date: '2026-08-01', cost: 2400000, life: 2, settle: 'BANK-1' });
  B.disposeAsset(s, fa.id, TODAY);
  assert.equal(balanceOf(s, '유형자산'), s.books.assets.filter(x => !x.disposed).reduce((t, x) => t + x.cost, 0), '처분한 자산은 유형자산에서 빠짐');
  assert.ok(balanceOf(s, '유형자산처분손실') > 0);

  const e = B.addExpense(s, { date: TODAY, person: '민서', dept: '경영지원팀', account: '여비교통비', amount: 30000, desc: '택시', method: '개인 결제' });
  const travel0 = balanceOf(s, '여비교통비');
  assert.throws(() => B.payExpense(s, e.id), /승인된/);
  B.decideExpense(s, e.id, true);
  assert.equal(balanceOf(s, '여비교통비'), travel0 + 30000, '승인하면 비용 반영');
  B.payExpense(s, e.id, TODAY);
  assert.equal(e.status, '지급 완료');

  const lease = s.books.contracts.find(c => c.category === '임대차')!;
  assert.throws(() => B.billContract(s, lease.id, '2026-09'), /이미/);
  B.billContract(s, lease.id, '2026-10');
  assert.ok(s.books.trades.some(t => t.contractId === lease.id && t.desc.includes('2026-10')));
  const consult = s.books.contracts.find(c => c.side === '매출')!;
  assert.throws(() => B.billContract(s, consult.id, '2026-10'), /서명/);
  B.advanceSign(s, consult.id, TODAY);
  B.billContract(s, consult.id, '2026-10');
  assert.ok(balanced(A.journal(s, TODAY)));
});

test('세무: 일용 · 사업 · 기타소득 세액, 원천세 집계 · 납부, 부가세 신고로 예수 · 대급 정리', () => {
  assert.equal(B.dailyTax({ days: 1, wage: 150000 }).tax, 0, '일당 15만 원 이하 비과세');
  assert.equal(B.dailyTax({ days: 5, wage: 180000 }).tax, 4050, '(18만 − 15만) × 2.7% × 5일');
  assert.equal(B.dailyTax({ days: 1, wage: 180000 }).tax, 0, '1,000원 미만 소액부징수');
  assert.deepEqual(B.otherIncomeTax('사업소득', 1500000), { tax: 45000, local: 4500, net: 1450500 });
  assert.equal(B.otherIncomeTax('기타소득', 500000).tax, 40000, '필요경비 60% 뒤 20%');
  assert.equal(B.otherIncomeTax('기타소득', 125000).tax, 0, '기타소득금액 5만 원 이하 과세최저한');

  const s = seed('epure');
  const w = T.withholdingSummary(s, '2026-09');
  assert.ok(w.rows.find(r => r.code === 'A01')!.tax > 0, '9월 급여 근로소득세');
  assert.equal(w.rows.find(r => r.code === 'A25')!.tax, 45000);
  assert.equal(w.due, '2026-10-10');
  const withheld0 = balanceOf(s, '예수금');
  T.payWithholding(s, '2026-09', TODAY);
  assert.equal(balanceOf(s, '예수금'), withheld0 - w.total);
  assert.throws(() => T.payWithholding(s, '2026-09', TODAY), /이미/);
  assert.throws(() => T.payWithholding(s, '2026-10', TODAY), /끝난 뒤/);

  const v = T.vatSummary(s, '2026-Q3', A.journal(s, TODAY));
  assert.equal(v.due, '2026-10-25');
  assert.ok(v.input > 0, '9월 임차료 · 그룹웨어 매입세액');
  assert.throws(() => T.fileVat(s, '2026-Q4', TODAY), /분기가 끝난/);
  const out0 = balanceOf(s, '부가세예수금'), in0 = balanceOf(s, '부가세대급금');
  T.fileVat(s, '2026-Q3', TODAY);
  assert.equal(balanceOf(s, '부가세예수금'), out0 - v.output);
  assert.equal(balanceOf(s, '부가세대급금'), in0 - v.input);
  assert.equal(T.vatSummary(s, '2026-Q3', A.journal(s, TODAY)).payable, v.payable, '신고 전표는 기간 집계에서 빠짐');
  assert.ok(balanced(A.journal(s, TODAY)));
  assert.equal(T.quarterLabel('2026-Q3'), '2026년 2기 예정 (7~9월)');
});

test('자금계획: 시작 잔액 = 계좌 + 현금, 주별 잔액은 흐름을 누적', () => {
  const s = seed('epure');
  const plan = cashPlan(s, TODAY);
  const funds = A.fundBalances(s, A.journal(s, TODAY)).filter(f => f.fund.kind !== '카드').reduce((t, f) => t + f.balance, 0);
  assert.equal(plan.opening, funds);
  const last = plan.rows.at(-1)!;
  assert.equal(last.closing, plan.opening + plan.items.reduce((t, i) => t + i.amount, 0));
  assert.ok(plan.items.some(i => i.kind === '급여'), '미확정 달 급여 예상 포함');
  assert.ok(plan.items.some(i => i.kind === '직접 입력'));
});

test('법인세: 구간 세율, 세무조정 · 이월결손금 반영, 연환산', () => {
  assert.equal(T.corpTaxOn(100_000_000, '2026').tax, 10_000_000, '2억 이하 10%');
  assert.equal(T.corpTaxOn(300_000_000, '2026').tax, 20_000_000 + 20_000_000, '2억 × 10% + 1억 × 20%');
  assert.equal(T.corpTaxOn(100_000_000, '2025').tax, 9_000_000, '2025년 귀속은 9%');
  const s = seed('epure');
  const base = T.corpTaxEstimate(s, '2026', TODAY);
  assert.equal(base.add, 96000, '샘플 가산 조정 2건');
  assert.equal(base.income, base.pl.net + base.add - base.sub);
  B.addTaxAdjust(s, { year: '2026', kind: '가산', desc: '테스트', amount: 500_000_000 });
  B.setCarryLoss(s, '2026', 100_000_000);
  const t = T.corpTaxEstimate(s, '2026', TODAY);
  assert.equal(t.carry, 100_000_000);
  assert.equal(t.base, t.income - 100_000_000);
  assert.equal(t.local, Math.floor(t.tax * 0.1 / 10) * 10);
  assert.equal(t.months, 10);
  assert.equal(t.due, '2027-03-31');
});

test('전자계약: 요청 · 재전송 · 취소 · 체결 이력, 수입비용 직접 입력은 부서와 함께 장부 반영', () => {
  const s = seed('epure');
  const c = B.addContract(s, { title: '유지보수', partner: '바른약국 체인', side: '매출', category: '용역', start: TODAY, amount: 500000, cycle: '월 정기' });
  assert.throws(() => B.remindSign(s, c.id), /서명 대기/);
  assert.throws(() => B.requestSign(s, c.id, 'a@b.kr'), /결재/);
  assert.throws(() => B.decideContract(s, c.id, true, { name: '김하늘', role: '영업' }), /관리자/);
  B.decideContract(s, c.id, true, { name: '정우진', role: '경리' }, TODAY);
  assert.throws(() => B.requestSign(s, c.id, ''), /서명자/);
  B.requestSign(s, c.id, 'a@b.kr', TODAY);
  B.remindSign(s, c.id, TODAY);
  B.cancelSign(s, c.id, TODAY);
  assert.equal(c.sign, '작성');
  B.requestSign(s, c.id, 'a@b.kr', TODAY);
  B.advanceSign(s, c.id, TODAY);
  assert.equal(c.sign, '서명 완료');
  assert.deepEqual(c.signLog!.filter(l => !l.text.includes('결재')).map(l => l.text.split(' ').at(-1)), ['요청', '재전송', '취소', '요청', '체결']);
  assert.ok(s.books.contracts.filter(x => x.side !== '근로').every(x => x.signLog?.length), '샘플 계약은 모두 이력 있음');

  const v = B.addVoucher(s, { date: TODAY, kind: '출금', account: '복리후생비', counter: 'BANK-1', amount: 70000, desc: '회식', dept: '운영팀' }, '수입비용');
  assert.equal(v.dept, '운영팀');
  assert.equal(v.origin, '수입비용');
  assert.ok(A.journal(s, TODAY).some(e => e.ref === v.id));
});
