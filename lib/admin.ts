/* Users, role-based menu access, approval rules (전결 규정) and the change history. */
import { date, id, type ErpState } from './flow-core';

export const ROLES = ['관리자', '경리', '영업', '구매 · 물류', '생산', '인사'] as const;
export type Role = (typeof ROLES)[number];
export interface User { id: string; name: string; role: Role }
export type ApprovalKind = '구매' | '경비' | '재고 조정' | '휴가' | '전표' | '계약';
/** Requests up to `limit` (원) go to `approver`; anything above goes to the next rule, the last rule has no limit. */
export interface ApprovalRule { kind: ApprovalKind; limit: number | null; approver: Role }
export interface AuditEntry { at: string; user: string; page: string; text: string }
export interface Admin {
  users: User[]; currentUser: string;
  /** Nav group names each role may open. */
  access: Record<Role, string[]>;
  rules: ApprovalRule[];
  audit: AuditEntry[];
  /** Books are locked through this month (YYYY-MM); '' when nothing is closed. */
  closedThrough: string;
  /** First month ever closed; reopening past it leaves nothing closed. */
  closedFrom: string;
}

/** Rules added after the first release; older saved data gets them through withDefaultRules. */
const EXTRA_RULES: ApprovalRule[] = [
  { kind: '전표', limit: 1_000_000, approver: '경리' },
  { kind: '전표', limit: null, approver: '관리자' },
  { kind: '계약', limit: 30_000_000, approver: '경리' },
  { kind: '계약', limit: null, approver: '관리자' },
];

export function withDefaultRules(admin: Admin): Admin {
  const missing = EXTRA_RULES.filter(r => !admin.rules.some(x => x.kind === r.kind));
  return missing.length ? { ...admin, rules: [...admin.rules, ...missing] } : admin;
}

export const ALL_GROUPS = ['워크스페이스', '협업', '기준정보', '업무 관리', '제조 관리', '회계', '인사 · 세무', '사람과 조직', '관리'];

export function defaultAdmin(): Admin {
  return {
    users: [
      { id: 'U-1', name: '민서', role: '관리자' },
      { id: 'U-2', name: '김하늘', role: '영업' },
      { id: 'U-3', name: '박지호', role: '구매 · 물류' },
      { id: 'U-4', name: '이서윤', role: '생산' },
      { id: 'U-5', name: '정우진', role: '경리' },
      { id: 'U-6', name: '한도윤', role: '인사' },
    ],
    currentUser: 'U-1',
    access: {
      관리자: ALL_GROUPS,
      경리: ['워크스페이스', '협업', '기준정보', '업무 관리', '회계', '인사 · 세무', '사람과 조직'],
      영업: ['워크스페이스', '협업', '기준정보', '업무 관리', '사람과 조직'],
      '구매 · 물류': ['워크스페이스', '협업', '기준정보', '업무 관리', '제조 관리', '사람과 조직'],
      생산: ['워크스페이스', '협업', '기준정보', '업무 관리', '제조 관리', '사람과 조직'],
      인사: ['워크스페이스', '협업', '인사 · 세무', '사람과 조직'],
    },
    rules: [
      { kind: '구매', limit: 1_000_000, approver: '구매 · 물류' },
      { kind: '구매', limit: null, approver: '관리자' },
      { kind: '경비', limit: 300_000, approver: '경리' },
      { kind: '경비', limit: null, approver: '관리자' },
      { kind: '재고 조정', limit: null, approver: '관리자' },
      { kind: '휴가', limit: null, approver: '인사' },
      ...EXTRA_RULES,
    ],
    audit: [],
    closedThrough: '',
    closedFrom: '',
  };
}

export const currentUser = (state: ErpState) => state.admin.users.find(u => u.id === state.admin.currentUser) ?? state.admin.users[0];
export const canOpen = (state: ErpState, group: string) => {
  const u = currentUser(state);
  return !u || u.role === '관리자' || group === '워크스페이스' || (state.admin.access[u.role] ?? []).includes(group);
};

/** Who must approve a request of this kind and amount. */
export function approverFor(state: ErpState, kind: ApprovalKind, amount = 0): Role {
  const rules = state.admin.rules.filter(r => r.kind === kind).sort((a, b) => (a.limit ?? Infinity) - (b.limit ?? Infinity));
  return rules.find(r => r.limit == null || amount <= r.limit)?.approver ?? '관리자';
}
export const canApprove = (state: ErpState, kind: ApprovalKind, amount = 0) => {
  const role = currentUser(state)?.role;
  return role === '관리자' || role === approverFor(state, kind, amount);
};
export function assertApprover(state: ErpState, kind: ApprovalKind, amount = 0) {
  if (!canApprove(state, kind, amount)) throw Error(`${approverFor(state, kind, amount)} 담당자나 관리자만 승인할 수 있어요.`);
}

export function switchUser(state: ErpState, userId: string) {
  if (!state.admin.users.some(u => u.id === userId)) throw Error('사용자를 찾을 수 없어요.');
  state.admin.currentUser = userId;
}

export function addUser(state: ErpState, f: { name: string; role: string }) {
  const name = f.name?.trim();
  if (!name) throw Error('이름을 입력해 주세요.');
  if (!(ROLES as readonly string[]).includes(f.role)) throw Error('역할을 골라 주세요.');
  const u: User = { id: id('U'), name, role: f.role as Role };
  state.admin.users.push(u);
  return u;
}

export function setUserRole(state: ErpState, userId: string, role: Role) {
  const u = state.admin.users.find(x => x.id === userId);
  if (!u) throw Error('사용자를 찾을 수 없어요.');
  if (u.role === '관리자' && role !== '관리자' && state.admin.users.filter(x => x.role === '관리자').length === 1) throw Error('관리자가 한 명은 있어야 해요.');
  u.role = role;
}

export function toggleAccess(state: ErpState, role: Role, group: string) {
  if (role === '관리자') throw Error('관리자는 모든 메뉴를 열 수 있어요.');
  const list = state.admin.access[role] ?? [];
  state.admin.access[role] = list.includes(group) ? list.filter(g => g !== group) : [...list, group];
}

export function setRule(state: ErpState, index: number, f: { limit: string; approver: string }) {
  const r = state.admin.rules[index];
  if (!r) throw Error('규칙을 찾을 수 없어요.');
  const limit = f.limit === '' ? null : Number(f.limit);
  if (limit != null && !(Number.isInteger(limit) && limit > 0)) throw Error('금액 한도를 확인해 주세요.');
  if (!(ROLES as readonly string[]).includes(f.approver)) throw Error('승인 역할을 골라 주세요.');
  Object.assign(r, { limit, approver: f.approver });
}

/** Appends one line to the change history (newest first, last 500 kept). */
export function audit(state: ErpState, page: string, text: string) {
  const u = currentUser(state);
  state.admin.audit.unshift({ at: new Date().toISOString(), user: u ? `${u.name} (${u.role})` : '—', page, text });
  if (state.admin.audit.length > 500) state.admin.audit.length = 500;
}

/* ───────── 월 마감 ───────── */

export function closeMonth(state: ErpState, month: string, today = date()) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw Error('마감할 월을 확인해 주세요.');
  if (month >= today.slice(0, 7)) throw Error('지난 달까지만 마감할 수 있어요.');
  if (state.admin.closedThrough && month <= state.admin.closedThrough) throw Error('이미 마감한 달이에요.');
  if (!state.admin.closedThrough) state.admin.closedFrom = month;
  state.admin.closedThrough = month;
}

/** Reopens the latest closed month (only an 관리자 may). */
export function reopenMonth(state: ErpState) {
  if (currentUser(state)?.role !== '관리자') throw Error('마감 취소는 관리자만 할 수 있어요.');
  const m = state.admin.closedThrough;
  if (!m) throw Error('마감한 달이 없어요.');
  const [y, mm] = m.split('-').map(Number);
  const prev = new Date(y, mm - 2, 1);
  // Earlier months stay closed; reopening again steps back one more month.
  state.admin.closedThrough = state.admin.closedFrom && m <= state.admin.closedFrom ? '' : `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

/** Guards every dated record: nothing may be added, changed or removed inside a closed month. */
export function assertOpen(state: ErpState, day: string) {
  const closed = state.admin?.closedThrough;
  if (closed && day.slice(0, 7) <= closed) throw Error(`${closed}까지 마감됐어요. 마감한 기간의 기록은 바꿀 수 없어요. (회계 › 결산에서 마감 취소)`);
}
