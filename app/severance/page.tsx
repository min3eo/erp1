'use client';

import { useErp } from '@/components/erp-provider';
import { useAction } from '@/components/form-kit';
import { Button, Card, CardHead, CellSub, DataTable, Hint, PageHead, Pill, Stat, Stats } from '@/components/ui';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { employed, paySeverance, severanceFor, severanceLiability } from '@/lib/hr';

export default function SeverancePage() {
  const { state } = useErp();
  const act = useAction();
  const today = date();
  const active = state.employees.filter(e => employed(e, today));
  const rows = active.map(e => ({ e, s: severanceFor(state, e.name, today) }));
  const due = state.hr.severance.filter(s => !s.paidAt);
  const dcMonthly = rows.filter(r => r.e.pension === 'DC').reduce((t, r) => t + Math.round((state.salaries.find(s => s.name === r.e.name)?.base ?? 0) / 12), 0);

  return (
    <>
      <PageHead
        title="퇴직금"
        sub="재직자의 예상 퇴직금과 퇴직연금 유형을 관리하고, 퇴사자의 퇴직금 · 퇴직소득세를 계산해 지급해요. 결산 때 퇴직급여충당부채의 근거가 됩니다."
      />
      <Stats>
        <Stat label="퇴직급여충당부채 (추계액)" value={money(severanceLiability(state, today))} unit="" foot="DB · 미가입자가 오늘 모두 퇴직할 때" tone="info" />
        <Stat label="지급 대기" value={money(due.reduce((t, s) => t + s.amount, 0))} unit="" foot={`${due.length}명 · 퇴직일로부터 14일 안에`} tone={due.length ? 'warn' : undefined} />
        <Stat label="DC형 월 부담금" value={money(dcMonthly)} unit="" foot="연간 임금총액의 1/12 이상" />
        <Stat label="퇴직연금 가입" value={rows.filter(r => r.e.pension !== '없음').length} unit={`/ ${rows.length}명`} foot={`DB ${rows.filter(r => r.e.pension === 'DB').length} · DC ${rows.filter(r => r.e.pension === 'DC').length}`} />
      </Stats>

      {due.length > 0 && (
        <Card className="mb-4">
          <CardHead title="퇴사자 퇴직금 정산" sub="퇴직소득세를 떼고 지급하면 원천징수(A21)와 장부에 반영돼요." />
          <DataTable
            foot={false}
            headers={['퇴사자', '퇴사일', '근속', '퇴직금', '퇴직소득세', '실지급액', '']}
            rows={due.map(s => [
              <strong key="n" className="font-medium text-ink">{s.name}</strong>, s.date, `${s.years}년`, money(s.amount),
              <>{money(s.tax + s.local)}<CellSub>소득세 {money(s.tax)} · 지방 {money(s.local)}</CellSub></>,
              <strong key="net" className="text-ink">{money(s.amount - s.tax - s.local)}</strong>,
              <Button key="p" variant="primary" onClick={() => act(d => paySeverance(d, s.name), `${s.name}님 퇴직금을 지급했어요.`)}>지급</Button>,
            ])}
          />
        </Card>
      )}

      <Card>
        <CardHead title="재직자 예상 퇴직금" sub="1일 평균임금(최근 3개월 + 상여 3/12) × 30일 × 재직일수 ÷ 365" />
        <DataTable
          headers={['구성원', '입사일', '재직일수', '퇴직연금', '1일 평균임금', '예상 퇴직금', '예상 퇴직소득세']}
          rows={rows.map(({ e, s }) => [
            <strong key="n" className="font-medium text-ink">{e.name}</strong>,
            e.joined,
            `${s.days.toLocaleString()}일`,
            <Pill key="p" tone={e.pension === '없음' ? 'warn' : 'neutral'}>{e.pension === '없음' ? '미가입' : e.pension + '형'}</Pill>,
            money(s.daily),
            s.eligible ? (e.pension === 'DC' ? <span key="a" className="text-subtle">DC 계좌 적립</span> : <strong key="a" className="font-medium text-ink">{money(s.amount)}</strong>) : <span key="a" className="text-subtle">1년 미만</span>,
            s.eligible && e.pension !== 'DC' ? money(s.tax + s.local) : '—',
          ])}
        />
      </Card>
      {state.hr.severance.some(s => s.paidAt) && (
        <p className="mt-4 text-caption text-muted">지급 완료: {state.hr.severance.filter(s => s.paidAt).map(s => `${s.name} ${money(s.amount)} (${s.paidAt})`).join(', ')}</p>
      )}
      <Hint className="mt-4">
        DC형은 매달 급여 확정 때 임금의 1/12을 퇴직연금 계좌로 보내는 것으로 장부에 들어가요. 퇴직소득세는 근속연수공제 · 환산급여공제를 적용한 근사 계산이니 실제 지급 전 확인하세요.
      </Hint>
    </>
  );
}
