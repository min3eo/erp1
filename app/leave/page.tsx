'use client';

import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Button, Card, CardHead, DataTable, PageHead, Pill, cx } from '@/components/ui';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

export default function LeavePage() {
  const { state } = useErp();
  const openForm = useOpenForm();
  const used = state.leaves.filter(l => l.name === '민서' && l.status === '승인 완료').reduce((s, l) => s + l.days, 0);

  return (
    <>
      <PageHead title="휴가 관리" sub="휴가 잔여일과 팀의 일정을 확인하고 신청하세요." action={<Button variant="primary" onClick={() => openForm('leave')}>＋ 휴가 신청</Button>} />
      <div className="grid gap-5.5 md:grid-cols-[1fr_2fr]">
        <Card className="p-6.75 text-xs text-muted">
          <h2 className="text-title font-semibold text-ink">내 연차</h2>
          <p className="my-3">2026년 부여 기준 · 샘플 정책</p>
          <div className="mt-5 mb-2.5 text-[40px] font-bold tracking-[-.7px] text-ink">
            {10 - used}
            <small className="ml-1.25 text-body font-medium text-muted">일 남았어요</small>
          </div>
          <div className="my-5 h-1.5 rounded-md bg-surface-2">
            <span className="block h-full w-[35%] rounded-md bg-accent" />
          </div>
          <p className="my-3">부여 15일 · 사용 {5 + used}일</p>
          <p className="my-3">신청 중인 휴가는 승인 후 반영됩니다.</p>
        </Card>
        <Card>
          <CardHead title="2026년 10월">
            <Pill>팀 휴가 일정</Pill>
          </CardHead>
          <div className="grid grid-cols-7 px-5.5 pb-5.5">
            {weekdays.map(w => <div key={w} className="min-h-8.25 p-2 text-caption text-muted">{w}</div>)}
            {Array.from({ length: 35 }, (_, i) => {
              const d = i - 3;
              const inMonth = d >= 1 && d <= 31;
              return (
                <div key={i} className={cx('min-h-13.75 border-t border-line p-1.25 text-xs text-muted sm:min-h-18 sm:p-2', d === 7 && 'bg-accent-soft font-semibold text-accent')}>
                  {inMonth ? d : ''}
                  {d === 12 && <span className="mt-1 block rounded px-1 py-0.5 bg-warn-soft text-[9px] font-medium text-warn sm:text-micro">박지호 · 반차</span>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <Card className="mt-5.5">
        <CardHead title="휴가 신청 내역" />
        <DataTable headers={['구성원', '부서', '휴가 종류', '시작일', '사용 일수', '상태']} rows={state.leaves.map(l => [l.name, l.dept, l.type, l.date, l.days + '일', <Pill key="s">{l.status}</Pill>])} />
      </Card>
    </>
  );
}
