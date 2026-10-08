'use client';

import type { Contract } from '@/lib/books';
import { Button } from './ui';

/** Standard labor contract (표준근로계약서 요약) for a signed 근로 contract. */
export function LaborDoc({ c, company, onBack }: { c: Contract; company: string; onBack: () => void }) {
  const clauses: [string, string][] = [
    ['근로계약 기간', `${c.start} 부터 ${c.end ? `${c.end} 까지` : '기간의 정함이 없음'} (${c.category})`],
    ['근무 장소', '본사 (서울특별시 성동구 성수이로 00, 샘플)'],
    ['업무 내용', '회사가 정한 소속 부서의 업무'],
    ['소정 근로시간', '09:00 ~ 18:00 (휴게 12:00 ~ 13:00), 주 40시간'],
    ['근무일 · 휴일', '주 5일 (월~금), 주휴일 일요일'],
    ['임금', `월 기본급 ${c.amount.toLocaleString()}원, 식대 월 200,000원 (비과세) · 매월 25일 본인 계좌로 지급`],
    ['연차 유급휴가', '근로기준법에서 정하는 바에 따라 부여'],
    ['사회보험', '국민연금 · 건강보험 · 고용보험 · 산재보험 가입'],
    ['기타', '이 계약에 정하지 않은 사항은 근로기준법과 회사 취업규칙에 따름'],
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button onClick={onBack}>← 돌아가기</Button>
        <Button variant="primary" onClick={() => window.print()}>인쇄 · PDF 저장</Button>
      </div>
      <article className="mx-auto w-full max-w-[210mm] bg-white p-[14mm] text-[12px] leading-relaxed text-[#111] shadow-[0_1px_3px_rgb(0_0_0/0.12)] print:max-w-none print:p-0 print:shadow-none">
        <h1 className="mb-6 text-center text-[24px] font-semibold tracking-[0.3em]">근 로 계 약 서</h1>
        <p className="mb-4">
          <strong>{company}</strong>(이하 ‘사업주’)과 <strong>{c.partner}</strong>(이하 ‘근로자’)은 다음과 같이 근로계약을 체결한다.
        </p>
        <table className="w-full border-collapse">
          <tbody>
            {clauses.map(([k, v], i) => (
              <tr key={k}>
                <th className="w-36 border border-[#999] bg-[#f3f3f3] px-3 py-2 text-left font-normal">{i + 1}. {k}</th>
                <td className="border border-[#999] px-3 py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-6 text-center">{c.signedAt ?? c.start}</p>
        <div className="mt-6 grid grid-cols-2 gap-6">
          {[['사업주', company], ['근로자', c.partner]].map(([role, name]) => (
            <div key={role} className="rounded border border-[#999] p-3">
              <p className="text-[#666]">({role})</p>
              <p className="mt-1">성명: {name}</p>
              <p className="mt-1 text-[#2a7]">{c.sign === '서명 완료' ? `✓ 전자서명 완료 · ${c.signedAt}` : `서명 상태: ${c.sign}`}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-[10px] text-[#888]">tessel 프론트 시안에서 출력한 샘플 계약서입니다. 실제 계약 전에는 고용노동부 표준근로계약서와 노무사 확인을 받으세요.</p>
      </article>
    </>
  );
}

/** 매출 · 매입 contract with the e-sign certificate of both parties. */
export function ContractDoc({ c, company, onBack }: { c: Contract; company: string; onBack: () => void }) {
  const [us, them] = c.side === '매출' ? ['공급자 (갑)', '고객 (을)'] : ['발주자 (갑)', '공급자 (을)'];
  const clauses: [string, string][] = [
    ['계약 내용', `${c.title} (${c.category})`],
    ['계약 기간', `${c.start} 부터 ${c.end ? `${c.end} 까지` : '기간의 정함이 없음'}`],
    ['계약 금액', `${c.cycle === '월 정기' ? '월 ' : ''}${c.amount.toLocaleString()}원 (부가세 별도)`],
    ['대금 지급', c.cycle === '월 정기' ? '매월 말일 세금계산서 발행, 발행일로부터 30일 이내 지급' : '완료 후 세금계산서 발행, 발행일로부터 30일 이내 지급'],
    ['계약 해지', '어느 한쪽이 계약을 위반하면 상대방은 서면 통지 후 30일이 지나 계약을 해지할 수 있음'],
    ['비밀 유지', '계약으로 알게 된 상대방의 영업 비밀을 계약 종료 후에도 제3자에게 알리지 않음'],
    ['분쟁 해결', '이 계약에 관한 분쟁은 갑의 본점 소재지 관할 법원에서 해결함'],
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button onClick={onBack}>← 돌아가기</Button>
        <Button variant="primary" onClick={() => window.print()}>인쇄 · PDF 저장</Button>
      </div>
      <article className="mx-auto w-full max-w-[210mm] bg-white p-[14mm] text-[12px] leading-relaxed text-[#111] shadow-[0_1px_3px_rgb(0_0_0/0.12)] print:max-w-none print:p-0 print:shadow-none">
        <h1 className="mb-6 text-center text-[24px] font-semibold tracking-[0.2em]">{c.title} 계약서</h1>
        <p className="mb-4">
          <strong>{c.side === '매출' ? company : c.partner}</strong>(이하 ‘갑’)과 <strong>{c.side === '매출' ? c.partner : company}</strong>(이하 ‘을’)은 다음과 같이 계약을 체결한다.
        </p>
        <table className="w-full border-collapse">
          <tbody>
            {clauses.map(([k, v], i) => (
              <tr key={k}>
                <th className="w-32 border border-[#999] bg-[#f3f3f3] px-3 py-2 text-left font-normal">제{i + 1}조 {k}</th>
                <td className="border border-[#999] px-3 py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-8 grid grid-cols-2 gap-6">
          {[[us, company, '대표자 민서'], [them, c.partner, c.signer ?? '']].map(([role, name, who]) => (
            <div key={role} className="rounded border border-[#999] p-3">
              <p className="text-[#666]">{role}</p>
              <p className="mt-1">상호: {name}</p>
              <p className="mt-1">서명자: {who}</p>
              <p className="mt-1 text-[#2a7]">✓ 전자서명 완료 · {c.signedAt}</p>
            </div>
          ))}
        </div>
        {c.signLog?.length ? (
          <div className="mt-6 border-t border-[#ccc] pt-3 text-[10px] text-[#666]">
            <p className="mb-1 font-semibold">전자서명 이력</p>
            {c.signLog.map((l, i) => <p key={i}>{l.date} · {l.text}</p>)}
          </div>
        ) : null}
        <p className="mt-8 text-center text-[10px] text-[#888]">tessel 프론트 시안에서 출력한 샘플 계약서입니다. 실제 계약 조항은 법률 검토를 받으세요.</p>
      </article>
    </>
  );
}
