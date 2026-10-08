'use client';

import Link from 'next/link';
import { AvatarStack, isLate, useCollab } from '@/components/collab-ui';
import { MiniProgress, PageHead, Pill, Stat, Stats, cx } from '@/components/ui';
import * as C from '@/lib/collab';

export default function ProjectsPage() {
  const { collab, run } = useCollab();
  const open = collab.tasks.filter(t => t.status !== '완료');
  const mine = open.filter(t => t.assignee === C.ME);
  const sorted = [...collab.projects].sort((a, b) => Number(b.starred) - Number(a.starred));

  return (
    <>
      <PageHead title="프로젝트" sub="팀별 협업 공간에서 글과 업무를 나누고, 5단계로 진행 상황을 관리하세요." />
      <Stats>
        <Stat label="참여 프로젝트" value={collab.projects.length} unit="개" foot={`즐겨찾기 ${collab.projects.filter(p => p.starred).length}개`} />
        <Stat label="진행 중 업무" value={open.length} unit="건" foot="완료 제외 · 전체 프로젝트" tone="info" />
        <Stat label="내 업무" value={mine.length} unit="건" foot="나에게 배정된 미완료 업무" />
        <Stat label="마감 지남" value={collab.tasks.filter(isLate).length} unit="건" foot="오늘 기준" tone={collab.tasks.some(isLate) ? 'danger' : undefined} />
      </Stats>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map(p => {
          const tasks = collab.tasks.filter(t => t.projectId === p.id);
          const progress = C.projectProgress(collab, p.id);
          return (
            <article key={p.id} className="group relative flex flex-col rounded-card border border-line bg-surface transition-colors hover:border-line-strong">
              <span aria-hidden className="h-1 rounded-t-card" style={{ background: p.color }} />
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-[17px] font-normal">
                    <Link href={`/projects/${p.id}`} className="after:absolute after:inset-0">{p.name}</Link>
                  </h2>
                  <button
                    type="button"
                    onClick={() => run(c => C.toggleStar(c, p.id))}
                    aria-pressed={p.starred}
                    aria-label={p.starred ? '즐겨찾기 해제' : '즐겨찾기'}
                    className={cx('relative z-1 text-[18px] leading-none', p.starred ? 'text-sw-orange' : 'text-line-strong hover:text-subtle')}
                  >
                    ★
                  </button>
                </div>
                <p className="-mt-2 text-body text-muted">{p.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {C.TASK_STATUSES.filter(s => s !== '보류').map(s => {
                    const n = tasks.filter(t => t.status === s).length;
                    return n ? <Pill key={s}>{`${s} ${n}`}</Pill> : null;
                  })}
                </div>
                <div className="mt-auto flex items-center gap-3">
                  <AvatarStack names={p.members} />
                  <MiniProgress ratio={progress / 100} className="ml-auto w-24" />
                  <span className="w-9 text-right text-caption text-muted">{progress}%</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
