'use client';

import { useState } from 'react';
import { ToolbarField } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm } from '@/components/form-kit';
import { Avatar, Button, Card, DataTable, FilterToolbar, Hint, PageHead, Pill, Tabs, useListFilter } from '@/components/ui';
import { monthOf } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';
import { addOvertime, hourlyWage, minWageIssues, overtimePay, staff } from '@/lib/hr';

export default function AttendancePage() {
  const { state, mutate, toast } = useErp();
  const list = useListFilter();
  const [tab, setTab] = useState<'오늘' | '월별 근무 기록'>('오늘');
  const [month, setMonth] = useState(monthOf(date()));
  const [editing, setEditing] = useState<string | null>(null);

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

  const people = staff(state);
  const minWage = minWageIssues(state);
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
        title="근태관리"
        sub="오늘의 출퇴근과 월별 연장 · 야간 · 휴일 근무를 기록해요. 월별 근무 기록은 그 달 급여에 수당으로 자동 반영돼요."
        action={<Button variant="primary" onClick={clock}>{state.clockOut ? '오늘 기록 완료' : state.clock ? '퇴근 기록' : '출근 기록'}</Button>}
      />
      <div className="mb-4"><Tabs options={['오늘', '월별 근무 기록'] as const} value={tab} onChange={setTab} /></div>
      {minWage.length > 0 && <Hint>최저임금 미달 의심: {minWage.map(m => `${m.name} (시급 환산 ${money(m.hourly)})`).join(', ')} · 2026년 최저시급 {money(state.hr.settings.minWage)}</Hint>}
      {tab === '오늘' ? (
        <>
          <Hint>내 기록: {state.clock || '아직 출근 기록이 없습니다.'} · 시안에서는 버튼을 누른 시간이 이 브라우저에 저장됩니다.</Hint>
          <Card>
            <FilterToolbar tabs={['전체', '근무 중', '외근', '휴가']} list={list} />
            <DataTable headers={['구성원', '부서', '출근', '퇴근', '근무 상태']} rows={rows} />
          </Card>
        </>
      ) : (
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <ToolbarField label="근무 월"><input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-transparent outline-none" /></ToolbarField>
            <span className="text-caption text-muted">통상시급 = (기본급 + 고정수당) ÷ 209시간{state.hr.settings.smallBusiness ? ' · 5인 미만: 가산 없음' : ' · 연장 · 휴일 1.5배, 야간 0.5배 가산'}</span>
          </div>
          <DataTable
            headers={['구성원', '통상시급', '연장', '야간', '휴일', '수당 금액', '']}
            rows={people.map(p => {
              const s = state.salaries.find(x => x.name === p[0]);
              const o = state.hr.overtime.find(x => x.name === p[0] && x.month === month);
              return [
                <strong key="n" className="font-medium text-ink">{p[0]}</strong>,
                s ? money(hourlyWage(s.base, s.allowance)) : '—',
                o ? `${o.overtime}시간` : '—', o ? `${o.night}시간` : '—', o ? `${o.holiday}시간` : '—',
                <strong key="a" className="font-medium text-ink">{money(overtimePay(state, p[0], month))}</strong>,
                <Button key="e" variant="text" onClick={() => setEditing(p[0])}>{o ? '수정' : '입력'}</Button>,
              ];
            })}
          />
        </Card>
      )}
      <Hint className="mt-4">주 52시간(연장 주 12시간) 한도를 넘지 않게 관리하세요. 급여를 확정한 달의 근무 기록을 바꾸면 그 달 급여에는 반영되지 않아요.</Hint>

      {editing && (
        <ModalForm open onClose={() => setEditing(null)} title={`${editing} · ${month} 근무 기록`} submitLabel="저장" done="근무 기록을 저장했어요. 확정 전 급여에 수당으로 반영돼요." run={(d, f) => addOvertime(d, { name: editing, month, overtime: f.overtime, night: f.night, holiday: f.holiday })}>
          {(() => {
            const o = state.hr.overtime.find(x => x.name === editing && x.month === month);
            return (
              <div className="grid grid-cols-3 gap-3">
                <Field name="overtime" label="연장 (시간)" type="number" min={0} step="0.5" defaultValue={o?.overtime ?? 0} />
                <Field name="night" label="야간 22~06시 (시간)" type="number" min={0} step="0.5" defaultValue={o?.night ?? 0} />
                <Field name="holiday" label="휴일 (시간)" type="number" min={0} step="0.5" defaultValue={o?.holiday ?? 0} />
              </div>
            );
          })()}
        </ModalForm>
      )}
    </>
  );
}
