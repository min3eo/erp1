'use client';

import { Fragment, useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { Avatar, Button, Card, CardHead, Hint, PageHead, Pill, cx } from '@/components/ui';
import { date } from '@/lib/flow-core';
import { staff } from '@/lib/hr';

const WEEK = ['월', '화', '수', '목', '금'];
const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const monday = (d: string) => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7));

export default function CalendarPage() {
  const { state } = useErp();
  const today = date();
  const [start, setStart] = useState(monday(today));
  const days = WEEK.map((_, i) => addDays(start, i));
  const people = staff(state, today);

  return (
    <>
      <PageHead
        title="근무 · 휴가 캘린더"
        sub="팀의 휴가와 외근 일정을 주 단위로 확인하세요. 휴가 관리에서 신청 · 승인한 내용이 그대로 보여요."
        action={
          <>
            <Button onClick={() => setStart(addDays(start, -7))}>← 이전 주</Button>
            <Button onClick={() => setStart(monday(today))}>이번 주</Button>
            <Button onClick={() => setStart(addDays(start, 7))}>다음 주 →</Button>
          </>
        }
      />
      <Card>
        <CardHead title={`${start} – ${addDays(start, 4)}`}><Pill>주간 일정</Pill></CardHead>
        <div className="overflow-auto">
          <div className="grid min-w-205 grid-cols-[160px_repeat(5,minmax(120px,1fr))]">
            <div className="border-y border-line bg-surface p-3.75 text-center text-caption text-muted">구성원</div>
            {days.map((d, i) => (
              <div key={d} className={cx('border-y border-line p-3.75 text-center text-caption text-muted', d === today ? 'bg-accent-soft font-semibold text-accent' : 'bg-surface')}>{WEEK[i]} {Number(d.slice(8))}</div>
            ))}
            {people.map(p => (
              <Fragment key={p[0]}>
                <div className="flex items-center gap-2.25 border-b border-line p-4.5 text-caption">
                  <Avatar name={p[0]} />
                  <span>{p[0]}<small className="block text-micro text-subtle">{p[1]}</small></span>
                </div>
                {days.map(d => {
                  const leave = state.leaves.find(l => l.name === p[0] && l.date === d && l.status !== '반려');
                  const out = d === today && p[3] === '외근';
                  return (
                    <div key={d} className={cx('border-b border-l border-line px-3 py-4.5', d === today && 'bg-accent-soft/40')}>
                      <span className={cx('block rounded-md px-2.25 py-1.75 text-tiny whitespace-nowrap', leave ? 'bg-warn-soft font-medium text-warn' : out ? 'bg-info-soft font-medium text-info' : 'bg-surface-2 text-muted')}>
                        {leave ? `${leave.type}${leave.status === '승인 대기' ? ' (대기)' : ''}` : out ? '외근' : '09:00 – 18:00'}
                      </span>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </Card>
      <Hint className="mt-4">기본 근무는 09:00 – 18:00이에요. 승인 대기 중인 휴가는 (대기)로 표시돼요.</Hint>
    </>
  );
}
