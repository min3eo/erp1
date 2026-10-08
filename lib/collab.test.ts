import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as C from './collab';

test('5단계 상태·진행률 연동, 업무 요청 검증, 피드·할일·댓글·메시지', () => {
  const c = C.seedCollab('epure');

  const t = C.setTaskStatus(c, 'T2', '완료');
  assert.equal(t.progress, 100, '완료로 바꾸면 진행률 100');
  C.setTaskProgress(c, 'T2', 40);
  assert.equal(t.status, '진행', '완료에서 진행률을 낮추면 진행으로');
  const req = C.setTaskStatus(c, 'T7', '요청');
  C.setTaskProgress(c, 'T7', 10);
  assert.equal(req.status, '진행', '요청 상태에서 진행률이 생기면 진행으로');
  assert.throws(() => C.setTaskProgress(c, 'T7', 120), /0에서 100/);

  const before = c.posts.length;
  const added = C.addTask(c, { projectId: 'P2', title: '바코드 라벨 재출력', assignee: '이서윤', priority: '높음', start: '2026-10-08', due: '2026-10-09' });
  assert.equal(added.status, '요청');
  assert.equal(c.posts.length, before + 1, '업무 요청은 피드에도 알림 글을 남김');
  assert.throws(() => C.addTask(c, { projectId: 'P2', title: '', assignee: '이서윤', start: '2026-10-08', due: '2026-10-09' }), /제목/);
  assert.throws(() => C.addTask(c, { projectId: 'P2', title: '외부인 배정', assignee: '정우진', start: '2026-10-08', due: '2026-10-09' }), /참여자/);
  assert.throws(() => C.addTask(c, { projectId: 'P2', title: '거꾸로 기간', assignee: '이서윤', start: '2026-10-09', due: '2026-10-08' }), /마감일/);

  const todo = C.addPost(c, { projectId: 'P1', kind: '할일', body: '포장 준비\n박스 6개\n완충재' });
  assert.equal(todo.todos?.length, 2);
  C.toggleTodo(c, todo.id, 0);
  assert.equal(todo.todos?.[0].done, true);
  assert.throws(() => C.addPost(c, { projectId: 'P1', kind: '할일', body: '제목만' }), /한 줄씩/);
  assert.throws(() => C.addPost(c, { projectId: 'P1', kind: '글', body: '   ' }), /내용/);

  C.addComment(c, todo.id, '완충재는 제가 챙길게요');
  assert.equal(todo.comments.length, 1);

  C.sendMessage(c, 'R2', '입고 확인했어요');
  assert.equal(c.rooms[1].messages.at(-1)?.text, '입고 확인했어요');
  assert.throws(() => C.sendMessage(c, 'R2', ' '), /메시지/);
  C.readRoom(c, 'R1');
  assert.equal(c.rooms[0].unread, 0);

  assert.ok(C.projectProgress(c, 'P1') >= 0 && C.projectProgress(c, 'P1') <= 100);
});
