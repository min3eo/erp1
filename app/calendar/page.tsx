'use client';

import { Fragment } from 'react';
import { useOpenDetail } from '@/components/details';
import { Avatar, Button, Card, CardHead, DataTable, PageHead, Pill, PreviewNotice, cx } from '@/components/ui';
import { people } from '@/lib/seed';

const days = ['월 5', '화 6', '수 7', '목 8', '금 9'];
const TODAY = 2;

export default function CalendarPage() {
  const openDetail = useOpenDetail();
  return (
    <>
      <PageHead title="근무 · 휴가 캘린더" sub="팀의 근무 일정과 휴가, 정정 요청을 확인하세요." />
      <PreviewNotice />
      <Card>
        <CardHead title="2026년 10월 5일 – 11일">
          <Pill>주간 일정</Pill>
        </CardHead>
        <div className="overflow-auto">
          <div className="grid min-w-205 grid-cols-[160px_repeat(5,minmax(120px,1fr))]">
            <div className="border-y border-line bg-surface p-3.75 text-center text-caption text-muted">구성원</div>
            {days.map((d, i) => (
              <div key={d} className={cx('border-y border-line p-3.75 text-center text-caption text-muted', i === TODAY ? 'bg-accent-soft font-semibold text-accent' : 'bg-surface')}>{d}</div>
            ))}
            {people.map((p, i) => (
              <Fragment key={p[0]}>
                <div className="flex items-center gap-2.25 border-b border-line p-4.5 text-caption">
                  <Avatar name={p[0]} />
                  <span>{p[0]}<small className="block text-micro text-subtle">{p[1]}</small></span>
                </div>
                {days.map((_, d) => {
                  const vacation = (i === 1 && d === 3) || (i === 4 && d === 2);
                  const remote = i === 2 && d === 2;
                  return (
                    <div key={d} className={cx('border-b border-l border-line px-3 py-4.5', d === TODAY && 'bg-accent-soft/40')}>
                      <span className={cx('block rounded-md px-2.25 py-1.75 text-tiny whitespace-nowrap', vacation ? 'bg-warn-soft font-medium text-warn' : remote ? 'bg-info-soft font-medium text-info' : 'bg-surface-2 text-muted')}>
                        {vacation ? '연차' : remote ? '외근' : '09:00 – 18:00'}
                      </span>
                      {i === 0 && d === 1 && <span className="mt-1.25 block text-micro font-medium text-warn">정정 요청</span>}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </Card>
      <Card className="mt-5.5">
        <CardHead title="근태 정정 요청" />
        <DataTable
          headers={['신청자', '대상일', '기존 기록', '정정 요청', '사유', '상태', '상세']}
          rows={[['민서', '2026.10.06', '출근 미기록', '09:00 출근', '출근 기록 누락', <Pill key="s">승인 대기</Pill>, <Button key="d" onClick={() => openDetail('correction', 0)}>상세 보기</Button>]]}
        />
      </Card>
    </>
  );
}
