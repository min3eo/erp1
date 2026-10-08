'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AvatarStack, Gantt, ProjectDot, TaskBoard, TaskCard, dday, isLate, shortDate, statusColor, useCollab, useOpenTask } from '@/components/collab-ui';
import { useOpenForm } from '@/components/forms';
import { Avatar, Button, Card, DataTable, MiniProgress, Pill, Tabs, Toolbar, cx } from '@/components/ui';
import * as C from '@/lib/collab';
import type { Post } from '@/lib/collab';

const views = ['피드', '업무', '보드', '간트차트'] as const;
type View = (typeof views)[number];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { collab, run } = useCollab();
  const openForm = useOpenForm();
  const openTask = useOpenTask();
  const [view, setView] = useState<View>('피드');
  const project = collab.projects.find(p => p.id === id);

  if (!project) {
    return (
      <div className="py-16 text-center">
        <p className="text-body text-muted">프로젝트를 찾을 수 없어요. 회사를 전환했다면 목록에서 다시 골라 주세요.</p>
        <Link href="/projects" className="mt-3 inline-block text-body text-accent hover:underline">← 프로젝트 목록</Link>
      </div>
    );
  }

  const tasks = collab.tasks.filter(t => t.projectId === project.id);
  const posts = collab.posts.filter(p => p.projectId === project.id);
  const progress = C.projectProgress(collab, project.id);

  return (
    <>
      <div className="mb-6 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <Link href="/projects" className="mb-1.5 inline-block text-caption text-subtle hover:text-ink">← 프로젝트</Link>
          <h1 className="flex items-center gap-3 text-[30px] leading-tight font-normal tracking-tight">
            <ProjectDot color={project.color} className="size-4 rounded" />
            {project.name}
            <button type="button" onClick={() => run(c => C.toggleStar(c, project.id))} aria-pressed={project.starred} aria-label="즐겨찾기" className={cx('text-[20px]', project.starred ? 'text-sw-orange' : 'text-line-strong hover:text-subtle')}>★</button>
          </h1>
          <p className="mt-1 text-body text-muted">{project.desc}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AvatarStack names={project.members} />
          <span className="flex items-center gap-2 text-caption text-muted"><MiniProgress ratio={progress / 100} className="w-20" />{progress}%</span>
          <Button variant="primary" onClick={() => openForm('task', project.id)}>＋ 업무 요청</Button>
        </div>
      </div>

      <Card>
        <Toolbar>
          <Tabs options={views} value={view} onChange={setView} />
          <span className="flex flex-wrap gap-1.5">
            {C.TASK_STATUSES.map(s => (
              <span key={s} className="flex items-center gap-1 text-tiny text-muted">
                <i className="size-2 rounded-full" style={{ background: statusColor[s] }} />
                {s} {tasks.filter(t => t.status === s).length}
              </span>
            ))}
          </span>
        </Toolbar>

        {view === '피드' && (
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="flex flex-col gap-3">
              <Composer projectId={project.id} />
              {posts.length ? posts.map(p => <FeedPost key={p.id} post={p} />) : <p className="py-10 text-center text-body text-subtle">첫 글을 남겨 보세요.</p>}
            </div>
            <aside className="flex flex-col gap-3">
              <section className="rounded-card border border-line p-4">
                <h2 className="mb-3 text-caption text-muted">업무 리포트</h2>
                <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                  {C.TASK_STATUSES.map(s => {
                    const n = tasks.filter(t => t.status === s).length;
                    return n ? <span key={s} style={{ width: `${(n / tasks.length) * 100}%`, background: statusColor[s] }} title={`${s} ${n}`} /> : null;
                  })}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-y-1.5 text-caption">
                  {C.TASK_STATUSES.map(s => (
                    <li key={s} className="flex items-center gap-1.5 text-muted">
                      <i className="size-2 rounded-full" style={{ background: statusColor[s] }} />
                      {s} <strong className="ml-auto pr-3 font-medium text-ink">{tasks.filter(t => t.status === s).length}</strong>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-card border border-line p-4">
                <h2 className="mb-3 text-caption text-muted">참여자 {project.members.length}</h2>
                <ul className="flex flex-col gap-2">
                  {project.members.map(m => (
                    <li key={m} className="flex items-center gap-2 text-body">
                      <Avatar name={m} className="size-6 text-[10px]" />
                      {m}
                      <span className="ml-auto text-tiny text-subtle">업무 {tasks.filter(t => t.assignee === m && t.status !== '완료').length}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>
        )}

        {view === '업무' && (
          <DataTable
            headers={['업무', '상태', '우선순위', '담당자', '기간', '마감', '진행률']}
            rows={tasks.map(t => [
              <button key="t" type="button" onClick={() => openTask(t.id)} className="text-left font-medium text-ink hover:text-accent">{t.title}</button>,
              <Pill key="s">{t.status}</Pill>,
              <Pill key="p">{t.priority}</Pill>,
              <span key="a" className="flex items-center gap-2"><Avatar name={t.assignee} className="size-5 text-[9px]" />{t.assignee}</span>,
              `${shortDate(t.start)} ~ ${shortDate(t.due)}`,
              <span key="d" className={isLate(t) ? 'text-danger' : ''}>{t.status === '완료' ? '—' : dday(t.due)}</span>,
              <span key="g" className="flex items-center gap-2"><MiniProgress ratio={t.progress / 100} />{t.progress}%</span>,
            ])}
          />
        )}

        {view === '보드' && <TaskBoard tasks={tasks} />}
        {view === '간트차트' && <Gantt tasks={[...tasks].sort((a, b) => a.start.localeCompare(b.start))} />}
      </Card>
      {view === '보드' && <p className="mt-2 text-caption text-subtle">카드를 다른 열로 끌어다 놓으면 상태가 바뀌어요.</p>}
    </>
  );
}

function Composer({ projectId }: { projectId: string }) {
  const { run } = useCollab();
  const [kind, setKind] = useState<'글' | '할일'>('글');
  const [body, setBody] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    let ok = false;
    run(c => { C.addPost(c, { projectId, kind, body }); ok = true; }, kind === '글' ? '글을 올렸어요.' : '할일을 올렸어요.');
    if (ok) setBody('');
  };
  return (
    <form onSubmit={submit} className="rounded-card border border-line bg-surface p-3">
      <div className="mb-2 flex gap-1">
        {(['글', '할일'] as const).map(k => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cx('h-7 rounded-md px-2.5 text-caption', kind === k ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:text-ink')}>
            {k}
          </button>
        ))}
      </div>
      <label htmlFor={`composer-${projectId}`} className="sr-only">{kind} 내용</label>
      <textarea
        id={`composer-${projectId}`}
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={kind === '할일' ? 4 : 2}
        placeholder={kind === '글' ? '프로젝트에 공유할 내용을 적어 주세요.' : '첫 줄은 제목, 다음 줄부터 할일을 한 줄씩 적어 주세요.\n예) 샘플 준비\n박스 6개 포장'}
        className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-body outline-none placeholder:text-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft"
      />
      <div className="mt-2 flex justify-end">
        <Button type="submit" variant="primary" disabled={!body.trim()}>올리기</Button>
      </div>
    </form>
  );
}

function FeedPost({ post }: { post: Post }) {
  const { collab, run } = useCollab();
  const [comment, setComment] = useState('');
  const task = post.taskId ? collab.tasks.find(t => t.id === post.taskId) : undefined;
  const done = post.todos?.filter(t => t.done).length ?? 0;
  const send = (e: FormEvent) => {
    e.preventDefault();
    let ok = false;
    run(c => { C.addComment(c, post.id, comment); ok = true; });
    if (ok) setComment('');
  };
  return (
    <article className="rounded-card border border-line bg-surface">
      <header className="flex items-center gap-2.5 px-4 pt-4">
        <Avatar name={post.author} className="size-8" />
        <div className="leading-tight">
          <strong className="block text-body font-medium">{post.author}</strong>
          <span className="text-tiny text-subtle">{shortDate(post.date)}</span>
        </div>
        <Pill tone="neutral" className="ml-auto">{post.kind}</Pill>
      </header>
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-body whitespace-pre-line text-ink-2">{post.body}</p>
        {task && <TaskCard task={task} />}
        {post.todos && (
          <div className="rounded-md border border-line p-3">
            <div className="mb-2 flex items-center justify-between text-caption text-muted">
              할일 <span>{done}/{post.todos.length}</span>
            </div>
            <ul className="flex flex-col gap-1.5">
              {post.todos.map((t, i) => (
                <li key={i}>
                  <label className="flex items-center gap-2 text-body">
                    <input type="checkbox" checked={t.done} onChange={() => run(c => C.toggleTodo(c, post.id, i))} className="size-4 accent-accent" />
                    <span className={t.done ? 'text-subtle line-through' : ''}>{t.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-caption text-muted">
        <button type="button" onClick={() => run(c => C.like(c, post.id))} className="hover:text-ink">♡ 좋아요 {post.likes}</button>
        <span>댓글 {post.comments.length}</span>
      </div>
      {post.comments.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-line bg-surface-2/50 px-4 py-3">
          {post.comments.map((c, i) => (
            <li key={i} className="flex gap-2 text-body">
              <Avatar name={c.author} className="size-6 text-[10px]" />
              <div><strong className="mr-1.5 font-medium">{c.author}</strong><span className="text-ink-2">{c.text}</span></div>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={send} className="flex gap-2 border-t border-line px-4 py-2.5">
        <label htmlFor={`c-${post.id}`} className="sr-only">댓글</label>
        <input
          id={`c-${post.id}`}
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="댓글 달기"
          className="h-8 flex-1 rounded-md border border-line bg-surface px-3 text-body outline-none placeholder:text-subtle focus:border-accent"
        />
        <Button type="submit" disabled={!comment.trim()}>등록</Button>
      </form>
    </article>
  );
}
