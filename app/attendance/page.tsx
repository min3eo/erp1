'use client';

import { useErp } from '@/components/erp-provider';
import { Avatar, Button, Card, DataTable, FilterToolbar, Hint, PageHead, Pill, useListFilter } from '@/components/ui';
import { people } from '@/lib/seed';

export default function AttendancePage() {
  const { state, mutate, toast } = useErp();
  const list = useListFilter();

  const clock = () => {
    if (state.clockOut) return toast('오늘의 출퇴근 기록이 완료되었어요.', 'info');
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    const clockingOut = !!state.clock;
    mutate(d => {
      if (clockingOut) d.clockOut = time;
      else d.clock = time;
    });
    toast(`${clockingOut ? '퇴근' : '출근'} ${time} 기록을 완료했어요.`);
  };

  const rows = people
    .filter(p => (list.filter === '전체' || p[3] === list.filter) && list.matches(...p))
    .map(p => {
      const me = p[0] === '민서';
      return [
        <div key="n" className="flex items-center gap-2.5"><Avatar name={p[0]} className="size-7.5" /><span className="font-semibold">{p[0]}</span></div>,
        p[1],
        me && state.clock ? state.clock : p[4],
        me && state.clockOut ? state.clockOut : '—',
        <Pill key="s">{p[3]}</Pill>,
      ];
    });

  return (
    <>
      <PageHead
        title="근무 현황"
        sub="오늘의 출퇴근과 근무 상태를 확인하세요."
        action={<Button variant="primary" onClick={clock}>{state.clockOut ? '오늘 기록 완료' : state.clock ? '퇴근 기록' : '출근 기록'}</Button>}
      />
      <Hint>내 기록: {state.clock || '아직 출근 기록이 없습니다.'} · 시안에서는 버튼을 누른 시간이 이 브라우저에 저장됩니다.</Hint>
      <Card>
        <FilterToolbar tabs={['전체', '근무 중', '외근', '휴가']} list={list} />
        <DataTable headers={['구성원', '부서', '출근', '퇴근', '근무 상태']} rows={rows} />
      </Card>
    </>
  );
}
