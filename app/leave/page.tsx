'use client';

import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Avatar, Button, Card, CardHead, DataTable, Hint, MiniProgress, PageHead, Pill } from '@/components/ui';
import { date } from '@/lib/flow-core';
import { leaveBalance, staff } from '@/lib/hr';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export default function LeavePage() {
  const { state } = useErp();
  const openForm = useOpenForm();
  const today = date();
  const people = staff(state, today);
  const mine = leaveBalance(state, '민서', today);
  const rows = people.map(p => ({ p, b: leaveBalance(state, p[0], today) }));
  // 연차 사용 촉진: 소멸 6개월 전에 남은 일수를 알리고 사용 계획을 받아야 해요.
  const promote = rows.filter(r => r.b.left > 0 && daysBetween(today, r.b.expires) <= 183);

  return (
    <>
      <PageHead title="휴가 관리" sub="근로기준법 기준으로 입사일에 맞춰 연차가 자동으로 생겨요. 신청 · 승인한 휴가는 잔여일에서 바로 빠집니다." action={<Button variant="primary" onClick={() => openForm('leave')}>＋ 휴가 신청</Button>} />
      <div className="grid gap-5.5 md:grid-cols-[1fr_2fr]">
        <Card className="p-6.75 text-xs text-muted">
          <h2 className="text-title font-semibold text-ink">내 연차</h2>
          <p className="my-3">{mine.since} 발생분 · {mine.expires} 소멸</p>
          <div className="mt-5 mb-2.5 text-[40px] font-bold tracking-[-.7px] text-ink">
            {mine.left}
            <small className="ml-1.25 text-body font-medium text-muted">일 남았어요</small>
          </div>
          <MiniProgress ratio={mine.granted ? mine.used / mine.granted : 0} className="my-5 w-full" />
          <p className="my-3">발생 {mine.granted}일 · 사용 {mine.used}일 · 근속 {mine.years}년</p>
          <p className="my-3">신청 중인 휴가는 승인 후 반영됩니다.</p>
        </Card>
        <Card>
          <CardHead title="구성원 연차 현황" sub="1년 미만: 매월 1일 (최대 11일) · 1년 이상: 15일, 2년마다 1일 가산 (최대 25일)" />
          <DataTable
            compact
            foot={false}
            headers={['구성원', '발생 기준일', '발생', '사용', '잔여', '소멸 예정']}
            rows={rows.map(({ p, b }) => [
              <span key="n" className="flex items-center gap-2"><Avatar name={p[0]} className="size-6 text-[10px]" />{p[0]}</span>,
              b.since, `${b.granted}일`, `${b.used}일`,
              <strong key="l" className={b.left <= 0 ? 'text-danger' : 'text-ink'}>{b.left}일</strong>,
              <span key="e" className={daysBetween(today, b.expires) <= 183 && b.left > 0 ? 'text-warn' : ''}>{b.expires}</span>,
            ])}
          />
        </Card>
      </div>
      {promote.length > 0 && (
        <Hint className="mt-5">
          연차 사용 촉진 대상: {promote.map(r => `${r.p[0]} (${r.b.left}일, ${r.b.expires} 소멸)`).join(', ')}. 소멸 6개월 전 서면으로 사용을 촉구하면 미사용 수당 지급 의무가 줄어요.
        </Hint>
      )}
      <Card className="mt-5.5">
        <CardHead title="휴가 신청 내역" />
        <DataTable headers={['구성원', '부서', '휴가 종류', '시작일', '사용 일수', '상태']} rows={state.leaves.map(l => [l.name, l.dept, l.type, l.date, l.days + '일', <Pill key="s">{l.status}</Pill>])} />
      </Card>
    </>
  );
}
