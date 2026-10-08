'use client';

import { contractPhase } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { employee, leaveBalance, severanceFor } from '@/lib/hr';
import { payslips } from '@/lib/payroll';
import { useErp } from './erp-provider';
import { Avatar, DataTable, DetailField, DetailGrid, Pill, SectionTitle } from './ui';

const tenure = (from: string, to: string) => {
  const m = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
  return m >= 12 ? `${Math.floor(m / 12)}년 ${m % 12}개월` : `${Math.max(0, m)}개월`;
};

/** 인사카드: the whole HR picture of one person on one drawer. */
export function EmployeeCard({ name }: { name: string }) {
  const { state } = useErp();
  const e = employee(state, name);
  if (!e) return null;
  const today = date();
  const leave = leaveBalance(state, name, today);
  const salary = state.salaries.find(s => s.name === name);
  const slip = payslips(state).find(p => p.name === name);
  const contract = state.books.contracts.find(c => c.side === '근로' && c.partner === name && contractPhase(c, today) !== '만료');
  const sev = severanceFor(state, name, e.left ?? today);
  return (
    <>
      <div className="mb-6 flex items-center gap-3.5">
        <Avatar name={e.name} className="size-13 text-[18px]" />
        <div>
          <h2 className="text-title font-semibold">{e.name}</h2>
          <p className="my-1 text-xs text-muted">{e.dept} · {e.role} · {e.type}</p>
        </div>
        <Pill className="ml-auto">{e.left ? '퇴사' : '재직 중'}</Pill>
      </div>
      <SectionTitle>기본 정보</SectionTitle>
      <DetailGrid>
        <DetailField label="입사일" value={`${e.joined} (${tenure(e.joined, e.left ?? today)})`} />
        <DetailField label={e.left ? '퇴사일' : '오늘 상태'} value={e.left ? `${e.left} · ${e.leftReason}` : e.today} />
        <DetailField label="이메일" value={e.email || '—'} />
        <DetailField label="연락처" value={e.phone || '—'} />
        <DetailField label="급여 계좌" value={`${e.bank} ${e.account}`} />
        <DetailField label="퇴직연금" value={e.pension === '없음' ? '미가입 (퇴직금)' : e.pension + '형'} />
      </DetailGrid>
      <SectionTitle>연차</SectionTitle>
      <DetailGrid>
        <DetailField label="발생" value={`${leave.granted}일 (${leave.since}부터)`} />
        <DetailField label="사용 · 잔여" value={`${leave.used}일 사용 · ${leave.left}일 남음`} />
        <DetailField label="소멸 예정일" value={leave.expires} />
        <DetailField label="근속 연수" value={`${leave.years}년`} />
      </DetailGrid>
      <SectionTitle>급여 · 계약</SectionTitle>
      <DetailGrid>
        <DetailField label="기본급 · 수당" value={salary ? `${money(salary.base)} · ${money(salary.allowance)}` : '—'} />
        <DetailField label="이번 달 실지급" value={slip ? money(slip.net) : '—'} />
        <DetailField label="근로계약" value={contract ? `${contract.sign} · ${contract.start} ~ ${contract.end || '기간 없음'}` : '미작성'} />
        <DetailField label={e.left ? '퇴직금' : '오늘 퇴사 시 퇴직금'} value={sev.eligible ? money(sev.amount) : '1년 미만 · 대상 아님'} />
      </DetailGrid>
      <SectionTitle>인사 이력</SectionTitle>
      <DataTable compact foot={false} headers={['일자', '내용']} rows={[...e.history].reverse().map(h => [h.date, h.text])} />
    </>
  );
}
