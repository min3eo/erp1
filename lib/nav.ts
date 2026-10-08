import type { Modules } from './flow-core';

export type PageId =
  | 'home' | 'approval' | 'masters' | 'documents' | 'inventory' | 'availability' | 'purchase' | 'receipt' | 'sales'
  | 'transfers' | 'returns' | 'adjustments' | 'movements' | 'bom' | 'production' | 'people' | 'organization'
  | 'attendance' | 'calendar' | 'leave' | 'reports' | 'integrations' | 'settings' | 'permissions' | 'approvalSettings'
  | 'projects' | 'tasks' | 'messenger' | 'quotes' | 'receivables' | 'accounting' | 'payroll';

export const pageNames: Record<PageId, string> = {
  permissions: '권한 설정', approvalSettings: '승인 절차 설정', organization: '조직도', calendar: '근무 · 휴가 캘린더',
  availability: '가용재고', transfers: '창고 이동', bom: 'BOM 관리', production: '생산 현황', integrations: '연동 관리',
  reports: '리포트', masters: '기준정보 관리', documents: '문서 관리', home: '홈', inventory: '재고 관리',
  purchase: '구매 관리', receipt: '입고 관리', sales: '판매 · 출고', movements: '입출고 이력', returns: '반품 관리',
  adjustments: '재고 실사 · 조정', people: '구성원', attendance: '근무 현황', leave: '휴가 관리', approval: '결재함',
  settings: '워크스페이스 설정', projects: '프로젝트', tasks: '내 업무', messenger: '메신저', quotes: '견적 관리', receivables: '채권 · 채무', accounting: '회계', payroll: '급여',
};

export const href = (page: PageId) => (page === 'home' ? '/' : page === 'approvalSettings' ? '/approval-settings' : '/' + page);

export function pageFromPath(pathname: string): PageId {
  const segment = pathname.split('/')[1] || 'home';
  const id = segment === 'approval-settings' ? 'approvalSettings' : segment;
  return id in pageNames ? (id as PageId) : 'home';
}

export function navGroups(modules: Modules): [string, PageId[]][] {
  return [
    ['워크스페이스', ['home', 'approval']],
    ['협업', modules.collab ? ['projects', 'tasks', 'messenger'] : []],
    ['기준정보', modules.erp ? ['masters', 'documents'] : []],
    ['업무 관리', modules.erp ? ['purchase', 'receipt', 'quotes', 'sales', 'returns', 'receivables', 'inventory', 'availability', 'transfers', 'adjustments', 'movements'] : []],
    ['제조 관리', modules.manufacturing ? ['bom', 'production'] : []],
    ['사람과 조직', modules.hr ? ['people', 'organization', 'attendance', 'calendar', 'leave', 'payroll'] : []],
    ['관리', ['accounting', 'reports', 'integrations', 'settings', 'permissions', 'approvalSettings']],
  ];
}

const base = {
  masters: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  documents: 'M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6',
  receipt: 'M12 3v12M7 10l5 5 5-5M4 15v6h16v-6',
  sales: 'M12 15V3M7 8l5-5 5 5M4 15v6h16v-6',
  returns: 'M8 6L3 11l5 5M3 11h12a5 5 0 0 1 0 10',
  adjustments: 'M4 6h16M8 3v6M4 12h16M16 9v6M4 18h16M10 15v6',
  movements: 'M4 7h15M15 3l4 4-4 4M20 17H5M9 13l-4 4 4 4',
  home: 'M3 10l9-7 9 7M5 9v12h5v-7h4v7h5V9',
  inventory: 'M3 7l9-4 9 4-9 4-9-4zm0 0v10l9 4 9-4V7M12 11v10',
  purchase: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M20 8v6M17 11h6',
  attendance: 'M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
  leave: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2',
  approval: 'M6 3h12v18H6zM9 12l2 2 4-4',
  settings: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
};

export const iconPaths: Record<PageId, string> = {
  ...base,
  organization: base.people, calendar: base.leave, availability: base.inventory, transfers: base.movements,
  bom: base.masters, production: base.inventory, integrations: base.settings, reports: base.purchase,
  permissions: base.people, approvalSettings: base.approval,
  projects: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 5.5l1 1 2-2M4 11.5l1 1 2-2M4 17.5l1 1 2-2',
  quotes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h4M9 9h2',
  receivables: 'M3 6h18v12H3zM3 10h18M7 15h3M16 15h1',
  accounting: 'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h6',
  payroll: 'M3 6h18v12H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M6 12h.01M18 12h.01',
  messenger: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 11h.01M12 11h.01M15.5 11h.01',
};

/** Top tabs are the nav groups; each tab's sidebar is split into these sections. */
const sectionsByGroup: Record<string, [string, PageId[]][]> = {
  '워크스페이스': [['개요', ['home', 'approval']]],
  '협업': [['협업', ['projects', 'tasks', 'messenger']]],
  '기준정보': [['기준정보', ['masters', 'documents']]],
  '업무 관리': [['구매', ['purchase', 'receipt']], ['판매', ['quotes', 'sales', 'returns']], ['정산', ['receivables']], ['재고', ['inventory', 'availability', 'transfers', 'adjustments', 'movements']]],
  '제조 관리': [['제조', ['bom', 'production']]],
  '사람과 조직': [['구성원', ['people', 'organization']], ['근태', ['attendance', 'calendar', 'leave']], ['급여', ['payroll']]],
  '관리': [['회계 · 분석', ['accounting', 'reports']], ['설정', ['settings', 'permissions', 'approvalSettings', 'integrations']]],
};

export function navSections(group: string): [string, PageId[]][] {
  return sectionsByGroup[group] ?? [];
}

/** Short tab labels for the module bar. */
export const groupTabLabel: Record<string, string> = {
  '워크스페이스': '홈', '협업': '협업', '기준정보': '기준정보', '업무 관리': '거래 · 재고', '제조 관리': '제조', '사람과 조직': '사람과 조직', '관리': '관리',
};
