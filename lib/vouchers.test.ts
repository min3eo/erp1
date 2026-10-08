import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import { closeMonth } from './admin';
import { seed } from './seed';

const TODAY = '2026-10-08';
const balanceOf = (s: ReturnType<typeof seed>, account: string) => A.trialBalance(A.journal(s, TODAY), B.accountTypes(s)).find(r => r.account === account)?.balance ?? 0;
const boss = { name: '민서', role: '관리자' };

test('복합 전표: 여러 줄, 차대 불일치 · 한 줄 양쪽 금액은 거절', () => {
  const s = seed('epure');
  const bank = balanceOf(s, '보통예금');
  const lent = balanceOf(s, '가지급금');
  // 급여 이체분 중 일부를 가지급금으로: 차변 2줄, 대변 1줄 (통장)
  const v = B.addCompoundVoucher(s, {
    date: '2026-10-07', desc: '대표 출장비 가지급 · 숙박', partner: '', dept: '경영지원팀', project: '부산 박람회', evidence: '신용카드',
    lines: [{ account: '가지급금', debit: 300000, credit: '' }, { account: '여비교통비', debit: 120000, credit: '' }, { account: 'fund:BANK-1', debit: '', credit: 420000 }],
  });
  assert.equal(v.kind, '출금');
  assert.equal(v.project, '부산 박람회');
  assert.equal(balanceOf(s, '보통예금'), bank - 420000);
  assert.equal(balanceOf(s, '가지급금'), lent + 300000);
  assert.throws(() => B.addCompoundVoucher(s, { date: TODAY, desc: 'x', lines: [{ account: '소모품비', debit: 100, credit: '' }, { account: '현금', debit: '', credit: 90 }] }), /달라요/);
  assert.throws(() => B.addCompoundVoucher(s, { date: TODAY, desc: 'x', lines: [{ account: '소모품비', debit: 100, credit: 100 }, { account: '현금', debit: '', credit: 0 }] }), /한쪽에만/);
  assert.throws(() => B.addCompoundVoucher(s, { date: TODAY, desc: 'x', lines: [{ account: '없는계정', debit: 100, credit: '' }, { account: '현금', debit: '', credit: 100 }] }), /목록에서/);
});

test('수정 · 승인 · 역분개 · 삭제 규칙', () => {
  const s = seed('epure');
  const v = B.addCompoundVoucher(s, { date: '2026-10-07', desc: '사무용품', lines: [{ account: '소모품비', debit: 50000, credit: '' }, { account: 'fund:CASH', debit: '', credit: 50000 }] });
  B.updateVoucher(s, v.id, { date: '2026-10-07', desc: '사무용품 (수정)', evidence: '현금영수증', lines: [{ account: '소모품비', debit: 55000, credit: '' }, { account: 'fund:CASH', debit: '', credit: 55000 }] });
  assert.equal(s.books.vouchers.find(x => x.id === v.id)!.lines[0].debit, 55000);
  assert.throws(() => B.approveVoucher(s, v.id, { name: '김하늘', role: '영업' }), /경리/);
  B.approveVoucher(s, v.id, boss, TODAY);
  assert.throws(() => B.updateVoucher(s, v.id, { date: '2026-10-07', desc: 'x', lines: [] }), /승인된/);
  assert.throws(() => B.deleteVoucher(s, v.id), /역분개/);
  const cost = balanceOf(s, '소모품비');
  const r = B.reverseVoucher(s, v.id, TODAY);
  assert.equal(balanceOf(s, '소모품비'), cost - 55000, '역분개로 비용 취소');
  assert.throws(() => B.reverseVoucher(s, v.id, TODAY), /이미/);
  assert.throws(() => B.deleteVoucher(s, v.id), /역분개/);
  B.deleteVoucher(s, r.id);
  assert.equal(s.books.vouchers.find(x => x.id === v.id)!.reversedBy, undefined, '역분개를 지우면 원 전표는 다시 살아 있음');
});

test('마감한 달 전표는 다음 달에 역분개', () => {
  const s = seed('epure');
  const v = B.addCompoundVoucher(s, { date: '2026-09-20', desc: '잘못 넣은 비용', lines: [{ account: '통신비', debit: 70000, credit: '' }, { account: 'fund:BANK-1', debit: '', credit: 70000 }] });
  closeMonth(s, '2026-09', TODAY);
  assert.throws(() => B.updateVoucher(s, v.id, { date: '2026-09-20', desc: 'x', lines: [{ account: '통신비', debit: 1, credit: '' }, { account: 'fund:BANK-1', debit: '', credit: 1 }] }), /마감/);
  assert.throws(() => B.reverseVoucher(s, v.id, '2026-09-30'), /마감/);
  B.reverseVoucher(s, v.id, '2026-10-01');
});

test('적격증빙: 3만 원 초과 지출에 증빙이 없으면 경고, 카드 결제는 통과', () => {
  const s = seed('epure');
  const noEv = B.addCompoundVoucher(s, { date: TODAY, desc: '식대', evidence: '간이영수증', lines: [{ account: '복리후생비', debit: 80000, credit: '' }, { account: 'fund:CASH', debit: '', credit: 80000 }] });
  assert.match(B.evidenceIssue(s, noEv)!, /가산세 1,600원/);
  const card = B.addCompoundVoucher(s, { date: TODAY, desc: '식대', lines: [{ account: '복리후생비', debit: 80000, credit: '' }, { account: 'fund:CARD-1', debit: '', credit: 80000 }] });
  assert.equal(B.evidenceIssue(s, card), null);
  const small = B.addCompoundVoucher(s, { date: TODAY, desc: '음료', lines: [{ account: '복리후생비', debit: 30000, credit: '' }, { account: 'fund:CASH', debit: '', credit: 30000 }] });
  assert.equal(B.evidenceIssue(s, small), null, '3만 원 이하는 간이영수증도 됨');
  const ent = B.addCompoundVoucher(s, { date: TODAY, desc: '거래처 식사', lines: [{ account: '접대비', debit: 50000, credit: '' }, { account: 'fund:CASH', debit: '', credit: 50000 }] });
  assert.match(B.evidenceIssue(s, ent)!, /손금불산입/);
});
