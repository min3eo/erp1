/* Project collaboration (projects, 5-step tasks, feed, messenger). Browser-only demo data. */
import type { CompanyId } from './seed';

export const TASK_STATUSES = ['요청', '진행', '피드백', '완료', '보류'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const PRIORITIES = ['긴급', '높음', '보통', '낮음'] as const;
export type Priority = (typeof PRIORITIES)[number];

export interface Project { id: string; name: string; desc: string; color: string; members: string[]; starred: boolean }
export interface Task {
  id: string; projectId: string; title: string; status: TaskStatus; priority: Priority; assignee: string;
  start: string; due: string; progress: number; ref?: string;
}
export interface Comment { author: string; text: string; date: string }
export interface Post {
  id: string; projectId: string; author: string; kind: '글' | '업무' | '할일'; body: string; date: string;
  taskId?: string; todos?: { text: string; done: boolean }[]; comments: Comment[]; likes: number;
}
export interface Message { author: string; text: string; time: string }
export interface ChatRoom { id: string; name: string; members: string[]; unread: number; messages: Message[] }
export interface Collab { projects: Project[]; tasks: Task[]; posts: Post[]; rooms: ChatRoom[] }

export const ME = '민서';
const uid = (prefix: string) => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toTimeString().slice(0, 5);
const today = () => new Date().toLocaleDateString('sv-SE');

export function seedCollab(company: CompanyId): Collab {
  const other = company === 'other';
  const launch = other ? '온라인몰 가을 기획전' : '가을 신제품 출시';
  const product = other ? '코튼 타월 세트' : '히녹스 크림';
  return {
    projects: [
      { id: 'P1', name: launch, desc: `${product} 출시 준비와 판매 채널 오픈`, color: 'var(--color-sw-magenta)', members: ['민서', '김하늘', '정우진', '한도윤'], starred: true },
      { id: 'P2', name: '물류센터 재고 실사', desc: '10월 정기 실사와 재고 차이 정리', color: 'var(--color-sw-orange)', members: ['이서윤', '박지호', '민서'], starred: false },
      { id: 'P3', name: '원료 공급처 다변화', desc: '주요 원료의 두 번째 공급처 확보', color: 'var(--color-sw-cyan)', members: ['박지호', '민서'], starred: false },
    ],
    tasks: [
      { id: 'T1', projectId: 'P1', title: '패키지 디자인 시안 확정', status: '진행', priority: '높음', assignee: '정우진', start: '2026-10-01', due: '2026-10-09', progress: 60 },
      { id: 'T2', projectId: 'P1', title: `${product} 초도 생산 BOM 확인`, status: '요청', priority: '보통', assignee: '민서', start: '2026-10-06', due: '2026-10-10', progress: 0 },
      { id: 'T3', projectId: 'P1', title: '상세페이지 촬영', status: '피드백', priority: '보통', assignee: '김하늘', start: '2026-10-03', due: '2026-10-08', progress: 80 },
      { id: 'T4', projectId: 'P1', title: '출시 공지 메일 발송', status: '보류', priority: '낮음', assignee: '한도윤', start: '2026-10-14', due: '2026-10-15', progress: 0 },
      { id: 'T5', projectId: 'P1', title: '초도 물량 용기 발주', status: '완료', priority: '긴급', assignee: '민서', start: '2026-09-29', due: '2026-10-02', progress: 100, ref: 'PO-202610-001' },
      { id: 'T6', projectId: 'P2', title: '본사 창고 실사', status: '진행', priority: '높음', assignee: '이서윤', start: '2026-10-06', due: '2026-10-08', progress: 40 },
      { id: 'T7', projectId: 'P2', title: '재고 차이 원인 확인', status: '요청', priority: '긴급', assignee: '민서', start: '2026-10-07', due: '2026-10-09', progress: 0 },
      { id: 'T8', projectId: 'P2', title: '불량 보관 구역 정리', status: '완료', priority: '보통', assignee: '박지호', start: '2026-10-01', due: '2026-10-03', progress: 100 },
      { id: 'T9', projectId: 'P3', title: '신규 공급처 견적 비교', status: '진행', priority: '보통', assignee: '박지호', start: '2026-10-02', due: '2026-10-12', progress: 50, ref: 'PO-202610-002' },
      { id: 'T10', projectId: 'P3', title: '공급처 현장 실사 일정 조율', status: '피드백', priority: '낮음', assignee: '민서', start: '2026-10-08', due: '2026-10-16', progress: 20 },
    ],
    posts: [
      { id: 'F1', projectId: 'P1', author: '정우진', kind: '글', date: '2026-10-06', body: '패키지 시안 2안 공유합니다. 금요일까지 의견 주세요.', comments: [{ author: '김하늘', text: '2안이 매장 진열에서 더 잘 보일 것 같아요.', date: '2026-10-06' }], likes: 3 },
      { id: 'F2', projectId: 'P1', author: '민서', kind: '업무', date: '2026-10-07', body: '초도 생산 전에 BOM 버전 확인 부탁드려요.', taskId: 'T2', comments: [], likes: 1 },
      { id: 'F3', projectId: 'P1', author: '김하늘', kind: '할일', date: '2026-10-05', body: '촬영 준비물', todos: [{ text: '제품 샘플 6개', done: true }, { text: '배경지', done: true }, { text: '모델 일정 확인', done: false }], comments: [], likes: 0 },
      { id: 'F4', projectId: 'P2', author: '이서윤', kind: '글', date: '2026-10-06', body: '실사는 10/8 오전 9시에 원료 창고부터 시작합니다.', comments: [{ author: '박지호', text: '바코드 스캐너 두 대 준비해 둘게요.', date: '2026-10-06' }], likes: 2 },
      { id: 'F5', projectId: 'P2', author: '민서', kind: '업무', date: '2026-10-07', body: '시스템 수량과 실물이 다른 품목 원인 확인이 필요해요.', taskId: 'T7', comments: [], likes: 0 },
      { id: 'F6', projectId: 'P3', author: '박지호', kind: '글', date: '2026-10-05', body: '견적 3곳 받았어요. 단가와 최소 주문 수량 비교해서 올리겠습니다.', comments: [], likes: 1 },
    ],
    rooms: [
      { id: 'R1', name: launch, members: ['민서', '김하늘', '정우진', '한도윤'], unread: 2, messages: [
        { author: '정우진', text: '시안 2안 피드에 올렸어요.', time: '09:12' },
        { author: '김하늘', text: '확인했습니다! 촬영은 금요일로 잡을게요.', time: '09:20' },
        { author: '정우진', text: '좋아요. 민서님 BOM 확인도 부탁드려요.', time: '09:41' },
      ] },
      { id: 'R2', name: '구매팀', members: ['민서', '박지호'], unread: 0, messages: [
        { author: '박지호', text: '글리세린 발주 들어갔어요. 다음 주 입고 예정입니다.', time: '어제' },
        { author: '민서', text: '고마워요. 입고되면 입고 처리 부탁해요.', time: '어제' },
      ] },
      { id: 'R3', name: '이서윤', members: ['민서', '이서윤'], unread: 1, messages: [
        { author: '이서윤', text: '내일 실사 끝나면 차이 목록 공유드릴게요.', time: '10:05' },
      ] },
    ],
  };
}

const find = <T extends { id: string }>(list: T[], id: string, what: string) => {
  const found = list.find(x => x.id === id);
  if (!found) throw Error(`${what}을(를) 찾을 수 없어요.`);
  return found;
};

export function setTaskStatus(c: Collab, taskId: string, status: TaskStatus) {
  const t = find(c.tasks, taskId, '업무');
  t.status = status;
  if (status === '완료') t.progress = 100;
  else if (status === '요청' && t.progress === 100) t.progress = 0;
  return t;
}

export function setTaskProgress(c: Collab, taskId: string, progress: number) {
  const t = find(c.tasks, taskId, '업무');
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw Error('진행률은 0에서 100 사이로 입력해 주세요.');
  t.progress = Math.round(progress);
  if (t.progress === 100) t.status = '완료';
  else if (t.status === '완료') t.status = '진행';
  else if (t.status === '요청' && t.progress > 0) t.status = '진행';
  return t;
}

export function addTask(c: Collab, f: { projectId: string; title?: string; assignee?: string; priority?: string; start?: string; due?: string }) {
  const p = find(c.projects, f.projectId, '프로젝트');
  const title = f.title?.trim();
  if (!title) throw Error('업무 제목을 입력해 주세요.');
  if (!f.assignee || !p.members.includes(f.assignee)) throw Error('프로젝트 참여자 중에서 담당자를 골라 주세요.');
  if (!f.start || !f.due || f.due < f.start) throw Error('마감일은 시작일과 같거나 그 이후로 정해 주세요.');
  const priority = (PRIORITIES as readonly string[]).includes(f.priority ?? '') ? (f.priority as Priority) : '보통';
  const task: Task = { id: uid('T'), projectId: p.id, title, status: '요청', priority, assignee: f.assignee, start: f.start, due: f.due, progress: 0 };
  c.tasks.push(task);
  c.posts.unshift({ id: uid('F'), projectId: p.id, author: ME, kind: '업무', date: today(), body: `${f.assignee}님에게 업무를 요청했어요.`, taskId: task.id, comments: [], likes: 0 });
  return task;
}

export function addPost(c: Collab, f: { projectId: string; kind: '글' | '할일'; body?: string }) {
  find(c.projects, f.projectId, '프로젝트');
  const lines = (f.body ?? '').split('\n').map(s => s.trim()).filter(Boolean);
  if (!lines.length) throw Error('내용을 입력해 주세요.');
  const post: Post =
    f.kind === '할일'
      ? { id: uid('F'), projectId: f.projectId, author: ME, kind: '할일', date: today(), body: lines[0], todos: lines.slice(1).map(text => ({ text, done: false })), comments: [], likes: 0 }
      : { id: uid('F'), projectId: f.projectId, author: ME, kind: '글', date: today(), body: lines.join('\n'), comments: [], likes: 0 };
  if (post.kind === '할일' && !post.todos?.length) throw Error('할일은 첫 줄에 제목, 다음 줄부터 항목을 한 줄씩 적어 주세요.');
  c.posts.unshift(post);
  return post;
}

export function addComment(c: Collab, postId: string, text: string) {
  const post = find(c.posts, postId, '게시물');
  if (!text.trim()) throw Error('댓글 내용을 입력해 주세요.');
  post.comments.push({ author: ME, text: text.trim(), date: today() });
}

export function toggleTodo(c: Collab, postId: string, index: number) {
  const todo = find(c.posts, postId, '게시물').todos?.[index];
  if (todo) todo.done = !todo.done;
}

export function like(c: Collab, postId: string) {
  find(c.posts, postId, '게시물').likes++;
}

export function toggleStar(c: Collab, projectId: string) {
  const p = find(c.projects, projectId, '프로젝트');
  p.starred = !p.starred;
}

export function sendMessage(c: Collab, roomId: string, text: string) {
  const room = find(c.rooms, roomId, '대화방');
  if (!text.trim()) throw Error('메시지를 입력해 주세요.');
  room.messages.push({ author: ME, text: text.trim(), time: now() });
}

export function readRoom(c: Collab, roomId: string) {
  find(c.rooms, roomId, '대화방').unread = 0;
}

export const projectProgress = (c: Collab, projectId: string) => {
  const tasks = c.tasks.filter(t => t.projectId === projectId && t.status !== '보류');
  return tasks.length ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0;
};
