/* 데이터 가져오기: rows pasted from Excel (tab-separated) or a CSV file, validated row by row through the same rules the screens use. */
import { addBankTx, addFund, addPartner, addPartnerOpening, setOpening, setPartnerTerms } from './books';
import { date, id, unit, type ErpState, type Item } from './flow-core';
import { hire } from './hr';
import { setItemMeta } from './inventory';

type Row = Record<string, string>;
export interface Column { key: string; label: string; required?: boolean; example: string; hint?: string }
interface Kind { label: string; desc: string; columns: Column[]; apply: (state: ErpState, r: Row) => void }

const ITEM_TYPES = ['원료', '부자재', '반제품', '완제품', '상품'];
const n = (v: string | undefined, label: string, min = 0) => {
  const x = Number(String(v ?? '').replace(/,/g, '') || 0);
  if (!Number.isFinite(x) || x < min) throw Error(`${label}을(를) 숫자로 확인해 주세요.`);
  return x;
};

export const IMPORT_KINDS: Record<string, Kind> = {
  items: {
    label: '품목', desc: '품목 코드 · 이름 · 분류 · 창고와 시작 재고 수량 · 단가',
    columns: [
      { key: 'code', label: '품목코드', example: 'RM-010', hint: '비우면 자동' },
      { key: 'name', label: '품목명', required: true, example: '세라마이드 NP' },
      { key: 'type', label: '분류', required: true, example: '원료', hint: ITEM_TYPES.join(' · ') },
      { key: 'warehouse', label: '창고', example: '원료 창고' },
      { key: 'stock', label: '기초수량', example: '120' },
      { key: 'safety', label: '안전재고', example: '50' },
      { key: 'price', label: '단가', required: true, example: '52000', hint: '기초 재고 평가 단가 (원)' },
      { key: 'barcode', label: '바코드', example: '' },
    ],
    apply: (state, r) => {
      const name = r.name?.trim();
      if (!name) throw Error('품목명이 비었어요.');
      if (!ITEM_TYPES.includes(r.type)) throw Error(`분류는 ${ITEM_TYPES.join(' · ')} 중 하나예요.`);
      const code = r.code?.trim() || 'IT-' + id('N').slice(2);
      if (state.items.some(i => i[0] === code)) throw Error(`이미 있는 품목코드예요. (${code})`);
      if (state.items.some(i => i[1] === name)) throw Error(`같은 이름의 품목이 이미 있어요.`);
      const item: Item = [code, name, r.type, r.warehouse?.trim() || '본사 창고', n(r.stock, '기초수량'), n(r.safety, '안전재고'), n(r.price, '단가', 1)];
      if (unit(item) === 'EA' && !Number.isInteger(item[4])) throw Error('EA 품목의 수량은 정수여야 해요.');
      state.items.push(item);
      state.movements.unshift({ id: id('ST'), date: date(), type: '기초 재고', code, name, warehouse: item[3], qty: item[4], before: 0, after: item[4], ref: 'OPENING', note: '데이터 가져오기', unit: unit(item) });
      if (r.barcode?.trim()) setItemMeta(state, code, { barcode: r.barcode });
    },
  },
  partners: {
    label: '거래처', desc: '이름 · 사업자등록번호 · 구분과 결제 조건 · 여신 한도',
    columns: [
      { key: 'name', label: '거래처명', required: true, example: '새봄 피부과' },
      { key: 'bizNo', label: '사업자등록번호', example: '123-45-67890' },
      { key: 'kind', label: '구분', example: '매출처', hint: '매출처 · 매입처 · 공통' },
      { key: 'contact', label: '연락처', example: '02-555-0101' },
      { key: 'terms', label: '결제조건(일)', example: '30' },
      { key: 'creditLimit', label: '여신한도', example: '5000000' },
      { key: 'discount', label: '할인율(%)', example: '' },
    ],
    apply: (state, r) => {
      addPartner(state, { name: r.name, bizNo: r.bizNo, kind: r.kind, contact: r.contact });
      if (r.terms || r.creditLimit || r.discount) setPartnerTerms(state, r.name.trim(), { terms: r.terms, creditLimit: r.creditLimit?.replace(/,/g, ''), discount: r.discount });
    },
  },
  employees: {
    label: '직원', desc: '인사 기본 정보와 급여 기준 (입사 신고 대기로 등록돼요)',
    columns: [
      { key: 'name', label: '이름', required: true, example: '최다은' },
      { key: 'dept', label: '부서', required: true, example: '상품팀' },
      { key: 'role', label: '직책', required: true, example: '매니저' },
      { key: 'type', label: '고용형태', example: '정규직', hint: '정규직 · 계약직 · 단시간' },
      { key: 'joined', label: '입사일', required: true, example: '2026-03-02' },
      { key: 'base', label: '기본급', required: true, example: '3200000' },
      { key: 'allowance', label: '수당', example: '200000' },
      { key: 'dependents', label: '부양가족수', example: '1' },
      { key: 'pension', label: '퇴직연금', example: 'DB', hint: 'DB · DC · 없음' },
      { key: 'email', label: '이메일', example: '' },
      { key: 'phone', label: '휴대폰', example: '' },
      { key: 'bank', label: '급여은행', example: '국민은행' },
      { key: 'account', label: '급여계좌', example: '' },
    ],
    apply: (state, r) => { hire(state, { ...r, base: r.base?.replace(/,/g, ''), allowance: (r.allowance || '0').replace(/,/g, ''), dependents: r.dependents || '1' }); },
  },
  funds: {
    label: '계좌 · 카드', desc: '통장 · 법인카드 · 현금 시재와 시작 잔액',
    columns: [
      { key: 'kind', label: '종류', required: true, example: '계좌', hint: '계좌 · 카드 · 현금' },
      { key: 'name', label: '이름', required: true, example: '하나은행 보통예금' },
      { key: 'number', label: '번호', example: '123-456789-01' },
      { key: 'opening', label: '기초잔액', example: '10000000', hint: '카드는 0' },
    ],
    apply: (state, r) => { addFund(state, { kind: r.kind, name: r.name, number: r.number, opening: (r.opening || '0').replace(/,/g, '') }); },
  },
  partnerOpening: {
    label: '거래처 기초 잔액', desc: '시스템을 쓰기 전부터 남아 있던 받을 돈 · 줄 돈',
    columns: [
      { key: 'partner', label: '거래처명', required: true, example: '온누리 드럭' },
      { key: 'side', label: '구분', required: true, example: '채권', hint: '채권 (받을 돈) · 채무 (줄 돈)' },
      { key: 'amount', label: '금액', required: true, example: '3300000', hint: '부가세 포함' },
    ],
    apply: (state, r) => {
      if (r.side !== '채권' && r.side !== '채무') throw Error('구분은 채권 또는 채무예요.');
      addPartnerOpening(state, { partner: r.partner, side: r.side, amount: r.amount?.replace(/,/g, '') });
    },
  },
  bankTx: {
    label: '은행 · 카드 내역', desc: '인터넷뱅킹 · 카드사에서 내려받은 거래내역 (계좌/카드 화면에서 처리)',
    columns: [
      { key: 'fund', label: '계좌 · 카드', required: true, example: '기업은행 보통예금', hint: '등록한 이름이나 번호 일부' },
      { key: 'date', label: '거래일자', required: true, example: '2026-10-07' },
      { key: 'desc', label: '적요', required: true, example: 'KT 통신요금' },
      { key: 'in', label: '입금액', example: '' },
      { key: 'out', label: '출금액', example: '88000', hint: '카드는 이용금액' },
    ],
    apply: (state, r) => {
      const key = r.fund.trim();
      const digits = key.replace(/\D/g, '');
      // By full name, part of the name, or at least 4 digits of the account / card number.
      const fund = state.books.funds.find(f => f.name === key) ?? state.books.funds.find(f => (key.length >= 2 && f.name.includes(key)) || (digits.length >= 4 && f.number.replace(/\D/g, '').includes(digits)));
      if (!fund) throw Error(`등록된 계좌 · 카드에서 '${key}'를 찾지 못했어요.`);
      const d = r.date.replace(/[./]/g, '-').slice(0, 10);
      const amountIn = n(r.in, '입금액'), amountOut = n(r.out, '출금액');
      if (!!amountIn === !!amountOut) throw Error('입금액과 출금액 중 하나만 넣어 주세요.');
      const signed = amountIn || -amountOut;
      if (state.books.bankTx.some(t => t.fund === fund.id && t.date === d && t.desc === r.desc.trim() && t.amount === signed)) throw Error('이미 들어온 내역이에요.');
      addBankTx(state, { fund: fund.id, date: d, desc: r.desc, direction: amountIn ? '입금' : '출금', amount: amountIn || amountOut });
    },
  },
  accountOpening: {
    label: '계정 기초 잔액', desc: '전기 재무상태표의 계정별 잔액 (차입금, 미지급금 외 기타 계정)',
    columns: [
      { key: 'account', label: '계정과목', required: true, example: '장기차입금' },
      { key: 'amount', label: '금액', required: true, example: '50000000' },
    ],
    apply: (state, r) => { setOpening(state, r.account?.trim(), n(r.amount, '금액', 1)); },
  },
};

/** Splits pasted Excel cells (tabs) or CSV text (commas, quoted fields) into rows of cells. */
export function parseTable(text: string): string[][] {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const tab = clean.split('\n')[0]?.includes('\t');
  const rows: string[][] = [];
  if (tab) clean.split('\n').forEach(l => rows.push(l.split('\t').map(c => c.trim())));
  else {
    let row: string[] = [], cell = '', quoted = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (quoted) {
        if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { row.push(cell.trim()); cell = ''; }
      else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c !== ''));
}

export interface PreviewRow { line: number; values: Row; error?: string }

/**
 * Maps the header row to columns (by label, in any order) and tries every row on a copy of the state,
 * so each row's error is reported against the rows before it (duplicates within the file are caught too).
 */
export function previewImport(state: ErpState, kind: string, text: string) {
  const k = IMPORT_KINDS[kind];
  if (!k) throw Error('가져올 종류를 골라 주세요.');
  const [header, ...body] = parseTable(text);
  if (!header) return { rows: [] as PreviewRow[], missing: [] as string[] };
  const index = new Map(header.map((h, i) => [h.replace(/\s|\*/g, ''), i]));
  const at = (c: Column) => index.get(c.label.replace(/\s/g, ''));
  const missing = k.columns.filter(c => c.required && at(c) == null).map(c => c.label);
  if (missing.length) return { rows: [] as PreviewRow[], missing };
  const draft = structuredClone(state);
  const rows = body.map((cells, i): PreviewRow => {
    const values = Object.fromEntries(k.columns.map(c => [c.key, at(c) != null ? cells[at(c)!] ?? '' : ''])) as Row;
    const empty = k.columns.find(c => c.required && !values[c.key]);
    if (empty) return { line: i + 2, values, error: `${empty.label}이(가) 비었어요.` };
    try {
      k.apply(draft, values);
      return { line: i + 2, values };
    } catch (e) {
      return { line: i + 2, values, error: (e as Error).message };
    }
  });
  return { rows, missing };
}

/** Imports the rows that passed the preview; returns how many went in. */
export function runImport(state: ErpState, kind: string, text: string) {
  const { rows, missing } = previewImport(state, kind, text);
  if (missing.length) throw Error(`필수 열이 없어요: ${missing.join(', ')}`);
  const good = rows.filter(r => !r.error);
  if (!good.length) throw Error('가져올 수 있는 행이 없어요. 오류를 고친 뒤 다시 붙여 넣어 주세요.');
  good.forEach(r => IMPORT_KINDS[kind].apply(state, r.values));
  return { imported: good.length, skipped: rows.length - good.length };
}

/** Template with the header and one example row, as CSV (opens in Excel). */
export function templateCsv(kind: string) {
  const k = IMPORT_KINDS[kind];
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [k.columns.map(c => esc(c.label + (c.required ? '*' : ''))).join(','), k.columns.map(c => esc(c.example)).join(',')].join('\r\n');
}
