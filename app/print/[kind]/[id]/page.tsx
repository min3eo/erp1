'use client';

import { companyProfile } from '@/lib/operations-report';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { ContractDoc, LaborDoc } from '@/components/contract-doc';
import { ReportDoc } from '@/components/report-doc';
import { bizNoOf } from '@/lib/books';
import { Button } from '@/components/ui';
import { unit } from '@/lib/flow-core';
import { PAYMENT_TERMS_DAYS, withVat, wonInKorean } from '@/lib/finance';
import { RATES, payslip, type Payslip } from '@/lib/payroll';

interface Line { name: string; code: string; qty: number; unit: string; price: number }
interface PrintDoc { title: string; no: string; date: string; partner: string; partnerRole: string; greeting: string; lines: Line[]; notes: string[] }

const won = (n: number) => n.toLocaleString('ko-KR');
const MIN_ROWS = 8;

export default function PrintPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const { state, companyInfo } = useErp();
  const me = companyProfile(state, companyInfo);
  const router = useRouter();
  // Payslip month comes from ?m=YYYY-MM; read after mount so the page needs no Suspense boundary.
  const [month, setMonth] = useState('2026-10');
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('m');
    if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m);
  }, []);
  const docId = decodeURIComponent(id);
  const itemUnit = (code: string) => {
    const item = state.items.find(i => i[0] === code);
    return item ? unit(item) : 'EA';
  };

  let doc: PrintDoc | null = null;
  if (kind === 'quote') {
    const q = state.quotes.find(x => x.id === docId);
    if (q) doc = {
      title: '견 적 서', no: q.id, date: q.date, partner: q.customer, partnerRole: '수신', greeting: '아래와 같이 견적합니다.',
      lines: [{ name: q.name, code: q.itemCode, qty: q.qty, unit: itemUnit(q.itemCode), price: q.price }],
      notes: [`유효기간: ${q.validUntil}까지`, '납기: 발주 후 협의', `결제 조건: 납품일로부터 ${PAYMENT_TERMS_DAYS}일`],
    };
  } else if (kind === 'statement') {
    const s = state.sales.find(x => x.id === docId);
    if (s) {
      const returned = state.returns.filter(r => r.ref === s.id).reduce((t, r) => t + r.qty, 0);
      doc = {
        title: '거 래 명 세 서', no: s.id, date: s.date.replace(/\./g, '-'), partner: s.customer, partnerRole: '공급받는자', greeting: '아래와 같이 거래합니다.',
        lines: [{ name: s.name, code: s.itemCode, qty: s.shipped - returned, unit: itemUnit(s.itemCode), price: s.price }],
        notes: [`출고 ${s.shipped}${returned ? ` · 반품 ${returned}` : ''} / 주문 ${s.qty}`, `결제 기한: 거래일로부터 ${PAYMENT_TERMS_DAYS}일`],
      };
    }
  } else if (kind === 'order') {
    const o = state.orders.find(x => x.id === docId);
    if (o) doc = {
      title: '발 주 서', no: o.id, date: o.date.replace(/\./g, '-'), partner: o.vendor, partnerRole: '수신', greeting: '아래와 같이 발주합니다.',
      lines: [{ name: o.name, code: o.itemCode, qty: o.qty, unit: itemUnit(o.itemCode), price: o.price }],
      notes: ['납품 장소: 본사 창고', `결제 조건: 입고일로부터 ${PAYMENT_TERMS_DAYS}일`, `진행 상태: ${o.status}`],
    };

  } else if (kind === 'taxinvoice') {
    const inv = state.books.invoices.find(x => x.id === docId);
    if (inv) doc = {
      title: inv.kind === '매출' ? '전 자 세 금 계 산 서' : '세 금 계 산 서 (매입)', no: inv.id, date: inv.date, partner: inv.partner,
      partnerRole: inv.kind === '매출' ? '공급받는자' : '공급자', greeting: inv.kind === '매출' ? '위 금액을 청구합니다.' : '위 금액을 공급받았습니다.',
      lines: [{ name: inv.desc, code: inv.ref, qty: 1, unit: '식', price: inv.supply }],
      notes: [`상태: ${inv.status}`, `공급받는자 사업자등록번호: ${inv.kind === '매출' ? bizNoOf(state, inv.partner) || '미등록' : '123-45-67890'}`],
    };
  }

  if (kind === 'report') return <ReportDoc kind={docId} onBack={() => router.back()} />;
  const labor = kind === 'labor' && state.books.contracts.find(c => c.id === docId && c.side === '근로');
  if (labor) return <LaborDoc c={labor} company={companyInfo.name} onBack={() => router.back()} />;
  const contract = kind === 'contract' && state.books.contracts.find(c => c.id === docId && c.side !== '근로');
  if (contract) return <ContractDoc c={contract} company={companyInfo.name} onBack={() => router.back()} />;

  if (kind === 'payslip') {
    const salary = state.salaries.find(s => s.name === docId);
    if (salary) return <PayslipDoc slip={payslip(salary)} month={month} company={companyInfo.name} onBack={() => router.back()} />;
  }

  if (!doc) {
    return (
      <div className="py-16 text-center">
        <p className="text-body text-muted">출력할 문서를 찾을 수 없어요.</p>
        <Button className="mt-3" onClick={() => router.back()}>← 돌아가기</Button>
      </div>
    );
  }

  const supply = doc.lines.reduce((s, l) => s + l.qty * l.price, 0);
  const total = withVat(supply);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button onClick={() => router.back()}>← 돌아가기</Button>
        <p className="text-caption text-muted">브라우저 인쇄 창에서 ‘PDF로 저장’을 고르면 파일로 받을 수 있어요.</p>
        <Button variant="primary" onClick={() => window.print()}>인쇄 · PDF 저장</Button>
      </div>

      {/* Paper is deliberately white in both themes. */}
      <article className="mx-auto w-full max-w-[210mm] bg-white p-[12mm] text-[12px] leading-relaxed text-[#111] shadow-[0_1px_3px_rgb(0_0_0/0.12)] print:max-w-none print:p-0 print:shadow-none">
        <h1 className="mb-6 text-center text-[26px] font-semibold tracking-[0.3em]">{doc.title}</h1>

        <div className="mb-4 grid grid-cols-[1fr_1.15fr] gap-4">
          <div className="flex flex-col justify-between">
            <dl className="grid grid-cols-[64px_1fr] gap-y-1">
              <dt className="text-[#666]">문서 번호</dt><dd className="font-mono">{doc.no}</dd>
              <dt className="text-[#666]">작성일</dt><dd>{doc.date}</dd>
            </dl>
            <p className="mt-4 border-b border-[#111] pb-1 text-[15px]">
              <strong className="font-semibold">{doc.partner}</strong> 귀하 <span className="text-[11px] text-[#666]">({doc.partnerRole})</span>
            </p>
            <p className="mt-2">{doc.greeting}</p>
          </div>
          <table className="w-full border-collapse text-[11px]">
            <tbody>
              {[
                ['등록번호', me.bizNo],
                ['상호', me.name],
                ['대표자', me.ceo],
                ['주소', me.address],
                ['업태 · 종목', [me.bizType, me.bizItem].filter(Boolean).join(' · ')],
              ].map(([k, v], i) => (
                <tr key={k}>
                  {i === 0 && <th rowSpan={5} className="w-6 border border-[#999] bg-[#f3f3f3] px-1 font-normal [writing-mode:vertical-rl]">공급자</th>}
                  <th className="w-20 border border-[#999] bg-[#f3f3f3] px-2 py-1 text-left font-normal">{k}</th>
                  <td className="relative border border-[#999] px-2 py-1">
                    {v}
                    {k === '대표자' && (
                      <span aria-label="직인" className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 rotate-[-8deg] place-items-center rounded-full border-2 border-[#d33] text-[9px] leading-tight font-semibold text-[#d33] opacity-80">
                        {me.name}<br />인
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-3 flex items-baseline justify-between border-y-2 border-[#111] px-2 py-2 text-[14px]">
          <span>합계 금액 <span className="text-[11px] text-[#666]">(부가세 포함)</span></span>
          <strong className="font-semibold">일금 {wonInKorean(total.total)}원정 <span className="ml-2 font-normal">(₩{won(total.total)})</span></strong>
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#f3f3f3]">
              {['No', '품목', '규격', '수량', '단위', '단가', '공급가액', '세액'].map(h => <th key={h} className="border border-[#999] px-2 py-1.5 font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(MIN_ROWS, doc.lines.length) }, (_, i) => {
              const l = doc.lines[i];
              const amt = l ? withVat(l.qty * l.price) : null;
              return (
                <tr key={i} className="h-7">
                  <td className="border border-[#999] px-2 text-center text-[#666]">{l ? i + 1 : ''}</td>
                  <td className="border border-[#999] px-2">{l?.name}</td>
                  <td className="border border-[#999] px-2 font-mono text-[10px]">{l?.code}</td>
                  <td className="border border-[#999] px-2 text-right">{l ? won(l.qty) : ''}</td>
                  <td className="border border-[#999] px-2 text-center">{l?.unit}</td>
                  <td className="border border-[#999] px-2 text-right">{l ? won(l.price) : ''}</td>
                  <td className="border border-[#999] px-2 text-right">{amt ? won(amt.supply) : ''}</td>
                  <td className="border border-[#999] px-2 text-right">{amt ? won(amt.vat) : ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#f3f3f3] font-semibold">
              <td colSpan={6} className="border border-[#999] px-2 py-1.5 text-center">합계</td>
              <td className="border border-[#999] px-2 text-right">{won(total.supply)}</td>
              <td className="border border-[#999] px-2 text-right">{won(total.vat)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-4 border border-[#999] p-3">
          <p className="mb-1 font-semibold">비고</p>
          <ul className="list-disc pl-4">
            {doc.notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        </div>
        <p className="mt-6 text-center text-[10px] text-[#888]">tessel 프론트 시안에서 출력한 샘플 문서입니다.</p>
      </article>
    </>
  );
}

/** Payslip: earnings on the left, deductions on the right, net pay at the bottom. */
function PayslipDoc({ slip, month, company, onBack }: { slip: Payslip; month: string; company: string; onBack: () => void }) {
  const earnings: [string, number][] = [['기본급', slip.base], ['직책 · 기타 수당', slip.allowance], ['식대 (비과세)', slip.meal]];
  const deductions: [string, number][] = [
    [`국민연금 (${RATES.pension * 100}%)`, slip.pension], ['건강보험', slip.health], ['장기요양보험', slip.longTermCare],
    ['고용보험', slip.employment], ['소득세', slip.incomeTax], ['지방소득세', slip.localTax],
  ];
  const rows = Math.max(earnings.length, deductions.length);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button onClick={onBack}>← 돌아가기</Button>
        <Button variant="primary" onClick={() => window.print()}>인쇄 · PDF 저장</Button>
      </div>
      <article className="mx-auto w-full max-w-[180mm] bg-white p-[12mm] text-[12px] text-[#111] shadow-[0_1px_3px_rgb(0_0_0/0.12)] print:max-w-none print:p-0 print:shadow-none">
        <h1 className="text-center text-[22px] font-semibold tracking-[0.2em]">급 여 명 세 서</h1>
        <p className="mt-1 text-center text-[#666]">{month.slice(0, 4)}년 {Number(month.slice(5))}월분 · {company}</p>
        <dl className="mt-6 grid grid-cols-4 border border-[#999]">
          {[['성명', slip.name], ['지급일', `${month}-25`]].map(([k, v]) => (
            <div key={k} className="contents"><dt className="border-r border-[#999] bg-[#f3f3f3] px-3 py-2">{k}</dt><dd className="border-r border-[#999] px-3 py-2 last:border-r-0">{v}</dd></div>
          ))}
        </dl>
        <table className="mt-4 w-full border-collapse">
          <thead><tr className="bg-[#f3f3f3]">{['지급 항목', '금액', '공제 항목', '금액'].map((h, i) => <th key={i}className="border border-[#999] px-3 py-1.5 font-normal">{h}</th>)}</tr></thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i} className="h-8">
                <td className="border border-[#999] px-3">{earnings[i]?.[0]}</td>
                <td className="border border-[#999] px-3 text-right">{earnings[i] ? earnings[i][1].toLocaleString() : ''}</td>
                <td className="border border-[#999] px-3">{deductions[i]?.[0]}</td>
                <td className="border border-[#999] px-3 text-right">{deductions[i] ? deductions[i][1].toLocaleString() : ''}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#f3f3f3] font-semibold">
              <td className="border border-[#999] px-3 py-1.5">지급 합계</td><td className="border border-[#999] px-3 text-right">{slip.gross.toLocaleString()}</td>
              <td className="border border-[#999] px-3">공제 합계</td><td className="border border-[#999] px-3 text-right">{slip.deductions.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-4 flex items-baseline justify-between border-y-2 border-[#111] px-3 py-2 text-[15px]">
          <span>실지급액</span><strong className="font-semibold">₩{slip.net.toLocaleString()}</strong>
        </div>
        <p className="mt-4 text-[10px] leading-relaxed text-[#777]">과세 대상 {slip.taxable.toLocaleString()}원 (식대 월 20만 원 비과세). 보험 요율과 소득세는 시안용 샘플 계산이며 실제 신고 금액과 다를 수 있어요.</p>
        <p className="mt-6 text-center">위 금액을 지급합니다. <span className="ml-4">{company} (인)</span></p>
      </article>
    </>
  );
}
