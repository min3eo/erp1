'use client';

import { useState, type ReactNode } from 'react';
import { useErp } from '@/components/erp-provider';
import { REPORTS } from '@/components/report-doc';
import { ButtonLink, Hint, PageHead } from '@/components/ui';
import { journal, trialBalance } from '@/lib/accounting';
import { ledgerPartners } from '@/lib/ledgers';
import { accountTypes, monthOf } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { quarterLabel, recentQuarters, withholdingMonths } from '@/lib/tax';

const control = 'h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 text-caption';

const desc: Record<string, string> = {
  bs: '자산 · 부채 · 자본과 당기순이익. 은행 · 투자 제출용',
  pl: '매출부터 순이익까지, 판매비와관리비 계정별 내역 포함',
  tb: '계정별 차변 · 대변 합계와 잔액. 결산 전 차대 일치 확인',
  journal: '한 달 동안의 모든 전표를 날짜순으로',
  ledger: '한 계정의 입출과 잔액 흐름',
  vat: '분기 세금계산서 목록. 부가세 신고 때 세무사 전달용',
  wht: '월별 근로 · 일용 · 사업 · 기타소득 원천세 집계',
  partner: '거래처 한 곳과의 외상 · 선수 · 선급 거래와 잔액. 잔액 확인서 대용',
  cash: '현금 시재(또는 보통예금)의 날짜별 입출금과 잔액',
  cf: '영업 · 투자 · 재무활동별 현금 증감 (직접법)',
  equity: '자본금과 이익잉여금의 연간 변동',
  mfg: '재료비 + 가공비 → 재공품 → 당기제품제조원가 (제조업)',
};

export default function PrintoutsPage() {
  const { state } = useErp();
  const today = date();
  const accounts = trialBalance(journal(state, today), accountTypes(state)).map(r => r.account);
  const months = [...new Set([monthOf(today), ...journal(state, today).map(e => monthOf(e.date))])].sort().reverse();
  const [account, setAccount] = useState('보통예금');
  const [month, setMonth] = useState(monthOf(today));
  const [quarter, setQuarter] = useState(recentQuarters(today)[0]);
  const [wht, setWht] = useState(withholdingMonths(state)[0]);
  const partners = ledgerPartners(journal(state, today));
  const [partner, setPartner] = useState(partners[0] ?? '');
  const [cashMonth, setCashMonth] = useState(monthOf(today));
  const [cashAccount, setCashAccount] = useState('현금');
  const years = [...new Set([today.slice(0, 4), ...months.map(m => m.slice(0, 4))])];
  const [cfPeriod, setCfPeriod] = useState(today.slice(0, 4));
  const [eqYear, setEqYear] = useState(today.slice(0, 4));

  const options: Record<string, { query: string; control?: ReactNode }> = {
    bs: { query: '' }, pl: { query: '' }, tb: { query: '' },
    journal: { query: `?p=${month}`, control: <select value={month} onChange={e => setMonth(e.target.value)} className={control} aria-label="월">{months.map(m => <option key={m}>{m}</option>)}</select> },
    ledger: { query: `?a=${encodeURIComponent(account)}`, control: <select value={account} onChange={e => setAccount(e.target.value)} className={control} aria-label="계정">{accounts.map(a => <option key={a}>{a}</option>)}</select> },
    vat: { query: `?p=${quarter}`, control: <select value={quarter} onChange={e => setQuarter(e.target.value)} className={control} aria-label="분기">{recentQuarters(today).map(q => <option key={q} value={q}>{quarterLabel(q)}</option>)}</select> },
    partner: { query: `?a=${encodeURIComponent(partner)}&p=${today.slice(0, 4)}`, control: <select value={partner} onChange={e => setPartner(e.target.value)} className={control} aria-label="거래처">{partners.map(p => <option key={p}>{p}</option>)}</select> },
    cash: {
      query: `?a=${cashAccount}&p=${cashMonth}`,
      control: (
        <>
          <select value={cashAccount} onChange={e => setCashAccount(e.target.value)} className={control} aria-label="계정"><option>현금</option><option>보통예금</option></select>
          <select value={cashMonth} onChange={e => setCashMonth(e.target.value)} className={control} aria-label="월">{months.map(m => <option key={m}>{m}</option>)}</select>
        </>
      ),
    },
    cf: { query: `?p=${cfPeriod}`, control: <select value={cfPeriod} onChange={e => setCfPeriod(e.target.value)} className={control} aria-label="기간">{years.map(y => <option key={y} value={y}>{y}년</option>)}{months.map(m => <option key={m} value={m}>{m}</option>)}</select> },
    mfg: { query: `?p=${cfPeriod}`, control: <select value={cfPeriod} onChange={e => setCfPeriod(e.target.value)} className={control} aria-label="기간">{years.map(y => <option key={y} value={y}>{y}년</option>)}{months.map(m => <option key={m} value={m}>{m}</option>)}</select> },
    equity: { query: `?p=${eqYear}`, control: <select value={eqYear} onChange={e => setEqYear(e.target.value)} className={control} aria-label="사업연도">{years.map(y => <option key={y} value={y}>{y}년</option>)}</select> },
    wht: { query: `?p=${wht}`, control: <select value={wht} onChange={e => setWht(e.target.value)} className={control} aria-label="지급 월">{withholdingMonths(state).map(m => <option key={m}>{m}</option>)}</select> },
  };

  return (
    <>
      <PageHead title="출력물" sub="재무제표와 장부를 A4로 인쇄하거나 PDF로 저장해요. 숫자는 지금 장부 기준으로 바로 계산됩니다." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(REPORTS).map(([kind, title]) => (
          <section key={kind} className="flex flex-col rounded-card border border-line bg-surface p-4">
            <h2 className="text-title font-medium">{title}</h2>
            <p className="mt-1 mb-4 flex-1 text-caption text-muted">{desc[kind]}</p>
            <div className="flex items-center gap-2">
              {options[kind].control}
              <ButtonLink href={`/print/report/${kind}${options[kind].query}`} variant="primary" className="ml-auto">인쇄 보기</ButtonLink>
            </div>
          </section>
        ))}
      </div>
      <Hint className="mt-6">세금계산서, 거래명세서, 발주서, 급여명세서는 각 화면의 ‘보기 · 명세서’ 버튼에서 출력할 수 있어요.</Hint>
    </>
  );
}
