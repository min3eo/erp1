'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Gantt, ProjectDot, TODAY, dday, isLate, shortDate, useCollab, useOpenTask } from '@/components/collab-ui';
import { Avatar, Card, DataTable, FilterToolbar, MiniProgress, PageHead, Pill, Stat, Stats, Tabs, useListFilter } from '@/components/ui';
import * as C from '@/lib/collab';

const scopes = ['내 업무', '전체 업무'] as const;

export default function TasksPage() {
  const { collab } = useCollab();
  const openTask = useOpenTask();
  const list = useListFilter();
  const [scope, setScope] = useState<(typeof scopes)[number]>('내 업무');
  const [view, setView] = useState<'목록' | '간트차트'>('목록');

  const base = collab.tasks.filter(t => scope === '전체 업무' || t.assignee === C.ME);
  const project = (id: string) => collab.projects.find(p => p.id === id);
  const rows = base
    .filter(t => (list.filter === '전체' || t.status === list.filter) && list.matches(t.title, t.assignee, project(t.projectId)?.name))
    .sort((a, b) => Number(a.status === '완료') - Number(b.status === '완료') || a.due.localeCompare(b.due));

  return (
    <>
      <PageHead
        title="내 업무"
        sub="모든 프로젝트에서 나에게 배정된 업무를 마감일 순으로 모아 봅니다."
        action={<Tabs options={scopes} value={scope} onChange={setScope} />}
      />
      <Stats>
        <Stat label="진행할 업무" value={base.filter(t => t.status !== '완료').length} unit="건" foot="완료 제외" />
        <Stat label="오늘 마감" value={base.filter(t => t.status !== '완료' && t.due === TODAY).length} unit="건" foot="2026. 10. 7. 기준" tone="warn" />
        <Stat label="마감 지남" value={base.filter(isLate).length} unit="건" foot="상태를 확인해 주세요" tone={base.some(isLate) ? 'danger' : undefined} />
        <Stat label="완료" value={base.filter(t => t.status === '완료').length} unit="건" foot="이번 달" tone="ok" />
      </Stats>
      <Card>
        <FilterToolbar tabs={['전체', ...C.TASK_STATUSES]} list={list} placeholder="업무, 담당자, 프로젝트 검색" />
        <div className="flex justify-end border-b border-line px-3 py-2">
          <Tabs options={['목록', '간트차트'] as const} value={view} onChange={setView} />
        </div>
        {view === '목록' ? (
          <DataTable
            headers={['업무', '프로젝트', '상태', '우선순위', '담당자', '기간', '마감', '진행률']}
            rows={rows.map(t => {
              const p = project(t.projectId);
              return [
                <button key="t" type="button" onClick={() => openTask(t.id)} className="text-left font-medium text-ink hover:text-accent">{t.title}</button>,
                p ? <Link key="p" href={`/projects/${p.id}`} className="flex items-center gap-1.5 hover:text-accent"><ProjectDot color={p.color} />{p.name}</Link> : '—',
                <Pill key="s">{t.status}</Pill>,
                <Pill key="r">{t.priority}</Pill>,
                <span key="a" className="flex items-center gap-2"><Avatar name={t.assignee} className="size-5 text-[9px]" />{t.assignee}</span>,
                `${shortDate(t.start)} ~ ${shortDate(t.due)}`,
                <span key="d" className={isLate(t) ? 'text-danger' : ''}>{t.status === '완료' ? '—' : dday(t.due)}</span>,
                <span key="g" className="flex items-center gap-2"><MiniProgress ratio={t.progress / 100} />{t.progress}%</span>,
              ];
            })}
          />
        ) : (
          <Gantt tasks={rows} />
        )}
      </Card>
    </>
  );
}
