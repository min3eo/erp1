'use client';

import { useState, type DragEvent } from 'react';
import * as C from '@/lib/collab';
import type { Task, TaskStatus } from '@/lib/collab';
import { useErp } from './erp-provider';
import { Avatar, DetailField, DetailGrid, IdLink, MiniProgress, Pill, cx } from './ui';

/** The demo's fixed "today", matching the header date. */
export const TODAY = '2026-10-07';

export const statusColor: Record<TaskStatus, string> = {
  요청: 'var(--color-accent)', 진행: 'var(--color-info)', 피드백: 'var(--color-warn)', 완료: 'var(--color-ok)', 보류: 'var(--color-subtle)',
};

export const dday = (due: string) => {
  const diff = Math.round((Date.parse(due) - Date.parse(TODAY)) / 86400000);
  return diff === 0 ? '오늘 마감' : diff > 0 ? `D-${diff}` : `${-diff}일 지남`;
};
export const isLate = (t: Task) => t.status !== '완료' && t.due < TODAY;
export const shortDate = (d: string) => d.slice(5).replace('-', '.');

/** Runs a collaboration change on the draft state; failures become an error toast. */
export function useCollab() {
  const { state, mutate, toast } = useErp();
  const run = (fn: (c: C.Collab) => void, done?: string) => {
    try {
      mutate(d => fn(d.collab));
      if (done) toast(done);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return { collab: state.collab, run };
}

export function ProjectDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cx('inline-block size-2.5 shrink-0 rounded-[3px]', className)} style={{ background: color }} />;
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  return (
    <span className="flex -space-x-1.5" aria-label={`참여자 ${names.join(', ')}`}>
      {names.slice(0, max).map(n => <Avatar key={n} name={n} className="size-6 text-[10px] ring-2 ring-surface" />)}
      {names.length > max && <span className="grid size-6 place-items-center rounded-full bg-surface-2 text-[10px] text-muted ring-2 ring-surface">+{names.length - max}</span>}
    </span>
  );
}

/** Flow-style five-step status control. */
export function StatusSteps({ task }: { task: Task }) {
  const { run } = useCollab();
  return (
    <div role="radiogroup" aria-label="업무 상태" className="grid grid-cols-5 gap-1 rounded-lg border border-line bg-surface-2 p-1">
      {C.TASK_STATUSES.map(s => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={task.status === s}
          onClick={() => run(c => C.setTaskStatus(c, task.id, s), `‘${task.title}’ 상태를 ${s}(으)로 바꿨어요.`)}
          className={cx('h-8 rounded-md text-caption font-medium transition-colors', task.status === s ? 'text-white' : 'text-muted hover:bg-surface')}
          style={task.status === s ? { background: statusColor[s] } : undefined}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function TaskDetail({ id }: { id: string }) {
  const { collab, run } = useCollab();
  const task = collab.tasks.find(t => t.id === id);
  if (!task) return <p className="text-body text-muted">삭제된 업무예요.</p>;
  const project = collab.projects.find(p => p.id === task.projectId);
  const posts = collab.posts.filter(p => p.taskId === task.id);
  return (
    <div className="flex flex-col gap-5">
      {project && (
        <p className="flex items-center gap-2 text-caption text-muted">
          <ProjectDot color={project.color} />
          {project.name}
        </p>
      )}
      <StatusSteps task={task} />
      <div>
        <div className="mb-1.5 flex justify-between text-caption text-muted">
          <label htmlFor={`progress-${task.id}`}>진행률</label>
          <strong className="text-ink">{task.progress}%</strong>
        </div>
        <input
          id={`progress-${task.id}`}
          type="range"
          min={0}
          max={100}
          step={10}
          value={task.progress}
          onChange={e => run(c => C.setTaskProgress(c, task.id, Number(e.target.value)))}
          className="w-full accent-accent"
        />
      </div>
      <DetailGrid className="mt-0 mb-0">
        <DetailField label="담당자" value={<span className="flex items-center gap-2"><Avatar name={task.assignee} className="size-6 text-[10px]" />{task.assignee}</span>} />
        <DetailField label="우선순위" value={<Pill>{task.priority}</Pill>} />
        <DetailField label="기간" value={`${shortDate(task.start)} ~ ${shortDate(task.due)}`} />
        <DetailField label="마감" value={<span className={isLate(task) ? 'text-danger' : ''}>{task.status === '완료' ? '완료됨' : dday(task.due)}</span>} />
        {task.ref && <DetailField label="관련 문서" value={<IdLink id={task.ref} href={`/documents/${encodeURIComponent(task.ref)}`} />} />}
      </DetailGrid>
      {posts.length > 0 && (
        <div>
          <h3 className="mb-2 text-caption text-muted">피드 글 {posts.length}</h3>
          <ul className="flex flex-col gap-2">
            {posts.map(p => (
              <li key={p.id} className="rounded-md border border-line p-3 text-body">
                <strong className="font-medium">{p.author}</strong> <span className="text-tiny text-subtle">{shortDate(p.date)}</span>
                <p className="mt-1 text-ink-2">{p.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function useOpenTask() {
  const { state, openDrawer } = useErp();
  return (id: string) => {
    const t = state.collab.tasks.find(x => x.id === id);
    if (t) openDrawer(t.title, <TaskDetail id={id} />);
  };
}

/** One clickable task line used in lists and the feed. */
export function TaskCard({ task, compact }: { task: Task; compact?: boolean }) {
  const openTask = useOpenTask();
  return (
    <button
      type="button"
      onClick={() => openTask(task.id)}
      className="flex w-full flex-col gap-2 rounded-md border border-line bg-surface p-3 text-left transition-colors hover:border-line-strong"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-body font-medium text-ink">{task.title}</span>
        {!compact && <Pill>{task.status}</Pill>}
      </span>
      <span className="flex items-center gap-2 text-tiny text-muted">
        <Avatar name={task.assignee} className="size-5 text-[9px]" />
        {task.assignee}
        <span className={cx('ml-auto', isLate(task) && 'text-danger')}>{task.status === '완료' ? shortDate(task.due) : dday(task.due)}</span>
      </span>
      <span className="flex items-center gap-2">
        <MiniProgress ratio={task.progress / 100} className="w-auto flex-1" />
        <span className="text-tiny text-subtle">{task.progress}%</span>
        {task.priority !== '보통' && task.priority !== '낮음' && <Pill>{task.priority}</Pill>}
      </span>
    </button>
  );
}

/** Kanban board: drag a card to another column to change its status. */
export function TaskBoard({ tasks }: { tasks: Task[] }) {
  const { run } = useCollab();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const drop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/task');
    const task = tasks.find(t => t.id === id);
    if (task && task.status !== status) run(c => C.setTaskStatus(c, id, status), `‘${task.title}’ → ${status}`);
  };
  return (
    <div className="grid gap-3 overflow-x-auto p-3 md:grid-cols-5">
      {C.TASK_STATUSES.map(s => {
        const list = tasks.filter(t => t.status === s);
        return (
          <section
            key={s}
            onDragOver={e => { e.preventDefault(); setOver(s); }}
            onDragLeave={() => setOver(null)}
            onDrop={drop(s)}
            aria-label={`${s} ${list.length}건`}
            className={cx('flex min-h-40 min-w-52 flex-col gap-2 rounded-lg bg-surface-2/70 p-2 transition-colors', over === s && 'bg-accent-soft ring-1 ring-accent-line')}
          >
            <h3 className="flex items-center gap-2 px-1 py-1 text-caption font-medium">
              <i className="size-2 rounded-full" style={{ background: statusColor[s] }} />
              {s}
              <span className="text-subtle">{list.length}</span>
            </h3>
            {list.map(t => (
              <div key={t.id} draggable onDragStart={e => e.dataTransfer.setData('text/task', t.id)} className="cursor-grab active:cursor-grabbing">
                <TaskCard task={t} compact />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Gantt chart: one row per task, bar from start to due, filled to its progress. */
export function Gantt({ tasks }: { tasks: Task[] }) {
  const openTask = useOpenTask();
  if (!tasks.length) return <p className="px-4 py-10 text-center text-body text-subtle">표시할 업무가 없어요.</p>;
  const from = Math.min(...tasks.map(t => Date.parse(t.start)), Date.parse(TODAY)) - 2 * DAY;
  const to = Math.max(...tasks.map(t => Date.parse(t.due)), Date.parse(TODAY)) + 3 * DAY;
  const days = Array.from({ length: Math.round((to - from) / DAY) + 1 }, (_, i) => iso(from + i * DAY));
  const col = 30;
  const idx = (d: string) => Math.round((Date.parse(d) - from) / DAY);
  const todayX = idx(TODAY) * col + col / 2;
  return (
    <div className="overflow-x-auto">
      <div className="relative" style={{ width: 240 + days.length * col }}>
        <div className="sticky top-0 z-1 flex border-b border-line bg-surface-2 text-tiny text-subtle">
          <div className="sticky left-0 z-2 w-60 shrink-0 border-r border-line bg-surface-2 px-4 py-2">업무</div>
          {days.map(d => {
            const wd = new Date(d).getDay();
            return (
              <div key={d} className={cx('shrink-0 py-1 text-center leading-tight', (wd === 0 || wd === 6) && 'text-line-strong', d === TODAY && 'font-semibold text-accent')} style={{ width: col }}>
                {d.endsWith('-01') || d === days[0] ? <span className="block text-[9px]">{Number(d.slice(5, 7))}월</span> : <span className="block text-[9px]">&nbsp;</span>}
                {Number(d.slice(8))}
              </div>
            );
          })}
        </div>
        <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent" style={{ left: 240 + todayX }} aria-hidden />
        {tasks.map(t => {
          const x = idx(t.start) * col + 3;
          const w = (idx(t.due) - idx(t.start) + 1) * col - 6;
          return (
            <div key={t.id} className="flex border-b border-line last:border-0 hover:bg-surface-2/50">
              <button type="button" onClick={() => openTask(t.id)} className="sticky left-0 z-1 flex w-60 shrink-0 items-center gap-2 border-r border-line bg-surface px-4 py-2 text-left">
                <Avatar name={t.assignee} className="size-5 text-[9px]" />
                <span className="min-w-0 truncate text-caption text-ink">{t.title}</span>
              </button>
              <div className="relative h-10 flex-1">
                {days.map((d, i) => {
                  const wd = new Date(d).getDay();
                  return (wd === 0 || wd === 6) ? <div key={d} className="absolute inset-y-0 bg-surface-2/60" style={{ left: i * col, width: col }} /> : null;
                })}
                <button
                  type="button"
                  onClick={() => openTask(t.id)}
                  title={`${t.title} · ${t.status} · ${t.progress}%`}
                  className="absolute top-2 h-6 overflow-hidden rounded-md text-left"
                  style={{ left: x, width: w, background: `color-mix(in srgb, ${statusColor[t.status]} 22%, transparent)`, outline: `1px solid color-mix(in srgb, ${statusColor[t.status]} 55%, transparent)` }}
                >
                  <span className="absolute inset-y-0 left-0" style={{ width: `${t.progress}%`, background: statusColor[t.status], opacity: 0.85 }} />
                  <span className="relative px-2 text-[11px] leading-6 font-medium whitespace-nowrap text-ink">{t.status} · {t.progress}%</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
