'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { accountLedger, incomeSummary, journal, trialBalance, type TrialRow } from '@/lib/accounting';
import { accountTypes, bizNoOf, lastDay, monthOf } from '@/lib/books';
import { equityStatement } from '@/lib/closing';
import { cashBook, cashFlow, manufacturingStatement, partnerLedger } from '@/lib/ledgers';
import { date } from '@/lib/flow-core';
import { quarterLabel, quarterMonths, quarterOf, withholdingSummary } from '@/lib/tax';
import { useErp } from './erp-provider';
import { Button } from './ui';

export const REPORTS: Record<string, string> = {
  bs: '재무상태표', pl: '손익계산서', tb: '합계잔액시산표', journal: '분개장', ledger: '계정별원장', vat: '매입매출장', wht: '원천징수이행상황신고서',
  partner: '거래처원장', cash: '현금출납장', cf: '현금흐름표', equity: '자본변동표', mfg: '제조원가명세서',
};

/** p = YYYY (a year) or YYYY-MM (a month) → [from, to]. */
export const periodRange = (p: string): [string, string] => (/^\d{4}$/.test(p) ? [`${p}-01-01`, `${p}-12-31`] : [`${p}-01`, lastDay(p)]);

const won = (n: number) => (n < 0 ? `(${Math.abs(n).toLocaleString('ko-KR')})` : n.toLocaleString('ko-KR'));
const th = 'border border-[#999] bg-[#f3f3f3] px-2 py-1.5 font-normal';
const td = 'border border-[#999] px-2 py-1';

function Table({ headers, rows, foot }: { headers: string[]; rows: ReactNode[][]; foot?: ReactNode[] }) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead><tr>{headers.map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length ? rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={td + (typeof c === 'number' || (typeof c === 'string' && /^\(?[\d,]+\)?$/.test(c)) ? ' text-right' : '')}>{c}</td>)}</tr>
        )) : <tr><td colSpan={headers.length} className={td + ' py-6 text-center text-[#888]'}>내역이 없습니다.</td></tr>}
      </tbody>
      {foot && <tfoot><tr className="bg-[#f3f3f3] font-semibold">{foot.map((c, j) => <td key={j} className={td + (j ? ' text-right' : '')}>{c}</td>)}</tr></tfoot>}
    </table>
  );
}

/** Printable accounting report: /print/report/<kind>?a=<account>&p=<period>. */
export function ReportDoc({ kind, onBack }: { kind: string; onBack: () => void }) {
  const { state, companyInfo } = useErp();
  const [params, setParams] = useState<{ a: string; p: string }>({ a: '보통예금', p: '' });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setParams({ a: q.get('a') || '보통예금', p: q.get('p') || '' });
  }, []);
  const today = date();
  const types = accountTypes(state);
  const entries = journal(state, today);
  const tb = trialBalance(entries, types);
  const pl = incomeSummary(tb);
  const title = REPORTS[kind];
  if (!title) return null;

  let period = `${today.slice(0, 4)}년 1월 1일 ~ ${today} 현재`;
  let body: ReactNode = null;

  const section = (type: TrialRow['type']) => tb.filter(r => r.type === type && r.balance !== 0);
  if (kind === 'bs') {
    const sum = (t: TrialRow['type']) => section(t).reduce((s, r) => s + r.balance, 0);
    const net = sum('수익') - sum('비용');
    const left = section('자산').map(r => [r.account, won(r.balance)]);
    const right = [...section('부채').map(r => [r.account, won(r.balance)]), ['부채 합계', won(sum('부채'))], ...section('자본').map(r => [r.account, won(r.balance)]), ['당기순이익', won(net)], ['자본 합계', won(sum('자본') + net)]];
    const n = Math.max(left.length, right.length);
    body = (
      <Table
        headers={['자산', '금액', '부채 · 자본', '금액']}
        rows={Array.from({ length: n }, (_, i) => [left[i]?.[0] ?? '', left[i]?.[1] ?? '', right[i]?.[0] ?? '', right[i]?.[1] ?? ''])}
        foot={['자산 총계', won(sum('자산')), '부채 · 자본 총계', won(sum('부채') + sum('자본') + net)]}
      />
    );
  } else if (kind === 'pl') {
    const exp = tb.filter(r => r.type === '비용' && r.account !== '매출원가');
    body = (
      <Table
        headers={['과목', '금액']}
        rows={[
          ['Ⅰ. 매출액', won(pl.revenue)], ['Ⅱ. 매출원가', won(pl.cogs)], ['Ⅲ. 매출총이익', won(pl.gross)], ['Ⅳ. 판매비와관리비', won(pl.sga)],
          ...exp.filter(r => !['이자비용', '잡손실', '재고자산감모손실', '유형자산처분손실'].includes(r.account)).map(r => [`　　${r.account}`, won(r.balance)]),
          ['Ⅴ. 영업이익', won(pl.operating)], ['Ⅵ. 영업외 손익', won(pl.other)],
        ]}
        foot={['Ⅶ. 법인세차감전 순이익', won(pl.net)]}
      />
    );
  } else if (kind === 'tb') {
    body = (
      <Table
        headers={['차변 잔액', '차변 합계', '계정과목', '대변 합계', '대변 잔액']}
        rows={tb.map(r => {
          const debitSide = r.debit >= r.credit;
          return [debitSide ? won(r.debit - r.credit) : '', won(r.debit), r.account, won(r.credit), debitSide ? '' : won(r.credit - r.debit)];
        })}
        foot={['', won(tb.reduce((t, r) => t + r.debit, 0)), '합계', won(tb.reduce((t, r) => t + r.credit, 0)), '']}
      />
    );
  } else if (kind === 'journal') {
    const month = params.p || monthOf(today);
    period = `${month} 월분`;
    const list = entries.filter(e => e.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
    body = (
      <Table
        headers={['일자', '적요', '차변 계정', '차변 금액', '대변 계정', '대변 금액']}
        rows={list.flatMap(e => {
          const d = e.lines.filter(l => l.debit), c = e.lines.filter(l => l.credit);
          return Array.from({ length: Math.max(d.length, c.length) }, (_, i) => [i ? '' : e.date, i ? '' : e.desc, d[i]?.account ?? '', d[i] ? won(d[i].debit) : '', c[i]?.account ?? '', c[i] ? won(c[i].credit) : '']);
        })}
      />
    );
  } else if (kind === 'ledger') {
    const rows = accountLedger(entries, params.a, types[params.a] ?? '비용');
    period += ` · ${params.a}`;
    body = (
      <Table
        headers={['일자', '적요', '차변', '대변', '잔액']}
        rows={rows.map(r => [r.date, r.desc, r.debit ? won(r.debit) : '', r.credit ? won(r.credit) : '', won(r.balance)])}
        foot={['', '합계', won(rows.reduce((t, r) => t + r.debit, 0)), won(rows.reduce((t, r) => t + r.credit, 0)), won(rows.at(-1)?.balance ?? 0)]}
      />
    );
  } else if (kind === 'vat') {
    const q = params.p || quarterOf(today);
    period = quarterLabel(q);
    const months = quarterMonths(q);
    const list = state.books.invoices.filter(i => months.includes(i.date.slice(0, 7))).sort((a, b) => a.kind.localeCompare(b.kind) || a.date.localeCompare(b.date));
    const total = (k: string, f: 'supply' | 'vat') => list.filter(i => i.kind === k).reduce((t, i) => t + i[f], 0);
    body = (
      <Table
        headers={['구분', '작성일', '거래처', '사업자등록번호', '공급가액', '세액']}
        rows={list.map(i => [i.kind, i.date, i.partner, bizNoOf(state, i.partner), won(i.supply), won(i.vat)])}
        foot={['합계', '', `매출 ${won(total('매출', 'supply'))}`, `매입 ${won(total('매입', 'supply'))}`, won(total('매출', 'supply') - total('매입', 'supply')), won(total('매출', 'vat') - total('매입', 'vat'))]}
      />
    );
  } else if (kind === 'wht') {
    const month = params.p || monthOf(today);
    const s = withholdingSummary(state, month);
    period = `${month} 지급분 · 신고 기한 ${s.due}`;
    body = (
      <Table
        headers={['코드', '소득 구분', '인원', '총지급액', '소득세', '지방소득세']}
        rows={s.rows.map(r => [r.code, r.label, String(r.people), won(r.gross), won(r.tax), won(r.local)])}
        foot={['', '합계', '', won(s.rows.reduce((t, r) => t + r.gross, 0)), won(s.tax), won(s.local)]}
      />
    );
  } else if (kind === 'partner') {
    const [from, to] = periodRange(params.p || today.slice(0, 4));
    const l = partnerLedger(entries, params.a, from, to);
    period = `${from} ~ ${to} · ${params.a}${bizNoOf(state, params.a) ? ` (${bizNoOf(state, params.a)})` : ''}`;
    const sum = (k: 'increase' | 'decrease', side: string) => l.rows.filter(r => r.side === side).reduce((t, r) => t + r[k], 0);
    body = (
      <>
        <Table
          headers={['일자', '적요', '계정', '받을 돈 증가', '받을 돈 감소', '줄 돈 증가', '줄 돈 감소', '잔액']}
          rows={[
            ['', '전기 이월', '', '', '', '', '', won(l.open)],
            ...l.rows.map(r => [r.date, r.desc, r.account, r.side === '채권' && r.increase ? won(r.increase) : '', r.side === '채권' && r.decrease ? won(r.decrease) : '', r.side === '채무' && r.increase ? won(r.increase) : '', r.side === '채무' && r.decrease ? won(r.decrease) : '', won(r.balance)]),
          ]}
          foot={['', '합계', '', won(sum('increase', '채권')), won(sum('decrease', '채권')), won(sum('increase', '채무')), won(sum('decrease', '채무')), won(l.close)]}
        />
        <p className="mt-2 text-[10px] text-[#555]">잔액이 +이면 거래처가 갚을 돈, −(괄호)이면 우리가 갚을 돈이에요. 부가세 포함 금액이에요.</p>
      </>
    );
  } else if (kind === 'cash') {
    const [from, to] = periodRange(params.p || monthOf(today));
    const b = cashBook(entries, from, to, params.a === '보통예금' ? '보통예금' : '현금');
    period = `${from} ~ ${to} · ${params.a === '보통예금' ? '보통예금' : '현금'}`;
    body = (
      <Table
        headers={['일자', '적요', '상대 계정', '입금', '출금', '잔액']}
        rows={[['', '전기 이월', '', '', '', won(b.open)], ...b.rows.map(r => [r.date, r.desc, r.counter, r.inflow ? won(r.inflow) : '', r.outflow ? won(r.outflow) : '', won(r.balance)])]}
        foot={['', '합계', '', won(b.rows.reduce((t, r) => t + r.inflow, 0)), won(b.rows.reduce((t, r) => t + r.outflow, 0)), won(b.close)]}
      />
    );
  } else if (kind === 'cf') {
    const [from, to] = periodRange(params.p || today.slice(0, 4));
    const cf = cashFlow(entries, from, to);
    period = `${from} ~ ${to} · 직접법`;
    const roman = ['Ⅰ', 'Ⅱ', 'Ⅲ'];
    body = (
      <Table
        headers={['과목', '금액']}
        rows={[
          ...cf.sections.flatMap((sec, i) => [[`${roman[i]}. ${sec.name}으로 인한 현금흐름`, won(sec.total)], ...sec.rows.map(r => [`　　${r.label}`, won(r.amount)])]),
          ['Ⅳ. 현금의 증가 (Ⅰ + Ⅱ + Ⅲ)', won(cf.net)],
          ['Ⅴ. 기초의 현금', won(cf.open)],
        ]}
        foot={['Ⅵ. 기말의 현금', won(cf.close)]}
      />
    );
  } else if (kind === 'mfg') {
    const [from, to] = periodRange(params.p || today.slice(0, 4));
    const m = manufacturingStatement(entries, from, to);
    period = `${from} ~ ${to}`;
    body = (
      <>
        <Table
          headers={['과목', '금액']}
          rows={[
            ['Ⅰ. 재료비 (원재료 · 부재료 · 반제품 투입)', won(m.materials)],
            ['Ⅱ. 가공비 (노무비 · 제조경비 배부)', won(m.conversion)],
            ['Ⅲ. 당기총제조비용 (Ⅰ + Ⅱ)', won(m.total)],
            ['Ⅳ. 기초재공품재고액', won(m.open)],
            ['Ⅴ. 합계 (Ⅲ + Ⅳ)', won(m.total + m.open)],
            ['Ⅵ. 기말재공품재고액', won(m.close)],
          ]}
          foot={['Ⅶ. 당기제품제조원가 (Ⅴ − Ⅵ)', won(m.finished)]}
        />
        <p className="mt-2 text-[10px] text-[#555]">가공비는 BOM의 단위당 가공비로 배부한 금액이에요. 실제 노무비 · 제조경비와의 차이(배부차이)는 각 비용 계정에 남아요.</p>
      </>
    );
  } else if (kind === 'equity') {
    const eq = equityStatement(state, params.p || today.slice(0, 4), today);
    period = `${eq.year}년 1월 1일 ~ 12월 31일`;
    body = (
      <Table
        headers={['구분', '자본금', '이익잉여금', '합계']}
        rows={eq.rows.map(r => [r.label, won(r.capital), won(r.retained), won(r.capital + r.retained)])}
        foot={['기말 잔액', won(eq.close.capital), won(eq.close.retained), won(eq.close.capital + eq.close.retained)]}
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button onClick={onBack}>← 돌아가기</Button>
        <p className="text-caption text-muted">브라우저 인쇄 창에서 ‘PDF로 저장’을 고르면 파일로 받을 수 있어요.</p>
        <Button variant="primary" onClick={() => window.print()}>인쇄 · PDF 저장</Button>
      </div>
      <article className="mx-auto w-full max-w-[210mm] bg-white p-[12mm] text-[12px] leading-relaxed text-[#111] shadow-[0_1px_3px_rgb(0_0_0/0.12)] print:max-w-none print:p-0 print:shadow-none">
        <h1 className="text-center text-[22px] font-semibold tracking-[0.2em]">{title}</h1>
        <div className="mt-2 mb-5 flex justify-between text-[11px] text-[#555]">
          <span>회사명: {companyInfo.name}</span>
          <span>{period}</span>
          <span>(단위: 원)</span>
        </div>
        {body}
        <p className="mt-6 text-center text-[10px] text-[#888]">tessel 프론트 시안에서 출력한 샘플 장부입니다. 세무 신고에는 세무 대리인의 확인을 받으세요.</p>
      </article>
    </>
  );
}
