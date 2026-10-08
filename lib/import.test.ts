import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import * as I from './import';
import { valuation } from './inventory';
import { seed } from './seed';

test('엑셀 붙여넣기(탭) · CSV(따옴표) 모두 읽음', () => {
  assert.deepEqual(I.parseTable('품목명\t단가\n크림\t1,200\n'), [['품목명', '단가'], ['크림', '1,200']]);
  assert.deepEqual(I.parseTable('﻿이름,메모\r\n"A, B","말 ""인용"""\r\n'), [['이름', '메모'], ['A, B', '말 "인용"']]);
});

test('행별 검증: 필수 열 · 중복 · 형식 오류는 그 행만 빠지고 나머지는 들어감', () => {
  const s = seed('epure');
  const text = [
    '품목코드\t품목명*\t분류*\t창고\t기초수량\t단가*',
    'RM-010\t세라마이드\t원료\t원료 창고\t12.5\t52000',
    'RM-010\t중복 코드\t원료\t\t1\t100',
    '\t잘못된 분류\t기타\t\t1\t100',
    'PK-010\t펌프 용기\t부자재\t\t1.5\t300',
    'GD-001\t선물 세트\t상품\t\t40\t9,000',
  ].join('\n');
  const p = I.previewImport(s, 'items', text);
  assert.deepEqual(p.rows.map(r => !!r.error), [false, true, true, true, false]);
  assert.match(p.rows[1].error!, /이미 있는 품목코드/, '파일 안의 중복도 잡음');
  assert.match(p.rows[3].error!, /정수/);
  assert.equal(s.items.length, seed('epure').items.length, '미리보기는 데이터를 바꾸지 않음');
  const r = I.runImport(s, 'items', text);
  assert.deepEqual(r, { imported: 2, skipped: 3 });
  const tb = A.trialBalance(A.journal(s), B.accountTypes(s));
  const bal = (a: string) => tb.find(x => x.account === a)?.balance ?? 0;
  assert.equal(bal('재고자산') + bal('재공품'), valuation(s).reduce((t, v) => t + v.value, 0), '기초 재고가 장부와 평가에 함께 반영');
  assert.equal(I.previewImport(s, 'items', '품목명\n크림').missing.join(), '분류,단가');
});

test('거래처 · 직원 · 계좌 · 기초 잔액 가져오기', () => {
  const s = seed('epure');
  I.runImport(s, 'partners', '거래처명,사업자등록번호,구분,결제조건(일),여신한도\n새봄 피부과,123-45-67890,매출처,45,"5,000,000"');
  const p = s.books.partners.find(x => x.name === '새봄 피부과')!;
  assert.equal(p.terms, 45);
  assert.equal(p.creditLimit, 5000000);
  I.runImport(s, 'employees', '이름,부서,직책,입사일,기본급\n최다은,상품팀,매니저,2026-03-02,"3,200,000"');
  assert.ok(s.employees.some(e => e.name === '최다은'));
  assert.ok(s.hr.insuranceReports.some(r => r.name === '최다은' && r.kind === '취득'), '4대보험 취득 신고 대기');
  I.runImport(s, 'funds', '종류,이름,기초잔액\n계좌,하나은행 보통예금,"10,000,000"');
  I.runImport(s, 'partnerOpening', '거래처명,구분,금액\n온누리 드럭,채권,3300000');
  I.runImport(s, 'accountOpening', '계정과목,금액\n장기차입금,50000000');
  const entries = A.journal(s);
  assert.ok(entries.every(e => e.lines.reduce((t, l) => t + l.debit - l.credit, 0) === 0));
  assert.throws(() => I.runImport(s, 'accountOpening', '계정과목,금액\n보통예금,1'), /가져올 수 있는 행이 없어요/);
  assert.match(I.templateCsv('items'), /^﻿품목코드,품목명\*,분류\*/);
});
