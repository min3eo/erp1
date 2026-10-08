'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { useAction } from '@/components/form-kit';
import { Button, ButtonLink, Card, CellSub, DataTable, Hint, PageHead, Pill, Stat, Stats, Tabs, Toolbar } from '@/components/ui';
import { addMonths } from '@/lib/books';
import { date } from '@/lib/flow-core';
import { href } from '@/lib/nav';
import { daysLeft, markDeadline, taxCalendar, type Deadline } from '@/lib/tax-calendar';

const views = ['다가오는 일정', '완료한 일정'] as const;

export default function TaxCalendarPage() {
  const { state } = useErp();
  const act = useAction();
  const today = date();
  const [view, setView] = useState<(typeof views)[number]>('다가오는 일정');
  const from = `${addMonths(today.slice(0, 7), -3)}-01`, to = `${addMonths(today.slice(0, 7), 3)}-28`;
  const all = taxCalendar(state, from, to, today);
  const open = all.filter(d => !d.done);
  const overdue = open.filter(d => d.date < today);
  const soon = open.filter(d => d.date >= today && daysLeft(d.date, today) <= 14);
  // Upcoming: everything not done yet (overdue first). Past: done items and anything before today.
  const list = view === '다가오는 일정' ? open : all.filter(d => d.done).reverse();

  const status = (d: Deadline) => {
    if (d.done) return <Pill tone="ok">{`완료 · ${d.done}`}</Pill>;
    const n = daysLeft(d.date, today);
    return n < 0 ? <Pill tone="danger">{`${-n}일 지남`}</Pill> : n === 0 ? <Pill tone="danger">오늘</Pill> : <Pill tone={n <= 7 ? 'warn' : 'neutral'}>{`D-${n}`}</Pill>;
  };

  return (
    <>
      <PageHead
        title="세무 일정"
        sub="원천세 · 4대보험(10일), 부가세(25일), 법인세 · 지방세, 지급명세서, 인지세까지 한 달력에 모았어요. 장부에 신고 · 납부가 기록되면 자동으로 완료돼요."
      />
      <Stats>
        <Stat label="기한 지남" value={overdue.length} unit="건" foot={overdue[0] ? overdue[0].title : '없어요'} tone={overdue.length ? 'danger' : 'ok'} />
        <Stat label="2주 안에" value={soon.length} unit="건" foot={soon[0] ? `${soon[0].date} · ${soon[0].title}` : '없어요'} tone={soon.length ? 'warn' : undefined} />
        <Stat label="다음 국세" value={open.find(d => d.kind === '국세' && d.date >= today)?.date ?? '—'} unit="" foot={open.find(d => d.kind === '국세' && d.date >= today)?.title ?? ''} tone="info" />
        <Stat label="이번 기간 완료" value={all.filter(d => d.done).length} unit="건" foot={`${from} ~ ${to}`} />
      </Stats>
      <Card>
        <Toolbar>
          <Tabs options={views} value={view} onChange={setView} />
        </Toolbar>
        <DataTable
          headers={['기한', '구분', '일정', '상태', '']}
          rows={list.map(d => [
            d.date,
            <Pill key="k" tone={d.kind === '국세' ? 'info' : d.kind === '지방세' ? 'accent' : 'neutral'}>{d.kind}</Pill>,
            <><strong className="font-medium text-ink">{d.title}</strong><CellSub>{d.detail}</CellSub></>,
            status(d),
            <span key="a" className="flex gap-1">
              <ButtonLink variant="text" href={href(d.page)}>바로 가기</ButtonLink>
              {d.manual && <Button variant="text" onClick={() => act(s => markDeadline(s, d.key, !d.done, today), d.done ? '완료 표시를 지웠어요.' : '완료로 표시했어요.')}>{d.done ? '완료 취소' : '완료 표시'}</Button>}
            </span>,
          ])}
        />
      </Card>
      <Hint className="mt-4">
        공휴일 · 주말이면 다음 영업일이 기한이에요. 부가세는 거래가 없던 분기에도 무실적 신고를 해야 해요. 주민세 · 재산세 · 자동차세는 고지서나 위택스에서 금액을 확인하세요. 인지세는 계약서 작성(체결) 때 내며, 대상 여부는 계약 내용에 따라 달라 세무사 확인이 필요해요.
      </Hint>
    </>
  );
}
