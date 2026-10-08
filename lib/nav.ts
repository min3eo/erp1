import type { Modules } from './flow-core';

export type PageId =
  | 'home' | 'approval' | 'masters' | 'documents' | 'inventory' | 'availability' | 'purchase' | 'receipt' | 'sales'
  | 'transfers' | 'returns' | 'adjustments' | 'movements' | 'bom' | 'production' | 'people' | 'organization'
  | 'attendance' | 'calendar' | 'leave' | 'reports' | 'integrations' | 'settings' | 'permissions' | 'approvalSettings'
  | 'projects' | 'tasks' | 'messenger' | 'quotes' | 'receivables' | 'accounting' | 'payroll'
  | 'acctSetup' | 'trades' | 'taxInvoices' | 'funds' | 'vouchers' | 'assets' | 'printouts'
  | 'payables' | 'cashPlan' | 'expenses' | 'incomeExpense' | 'contracts' | 'esign'
  | 'dailyPay' | 'laborContracts' | 'withholding' | 'otherTax' | 'vat' | 'corpTax'
  | 'insurance' | 'severance' | 'yearEndTax' | 'payStatements' | 'auditLog' | 'closing' | 'loans' | 'forex' | 'dataImport' | 'taxCalendar' | 'budget';

export const pageNames: Record<PageId, string> = {
  permissions: '권한 설정', approvalSettings: '승인 절차 설정', organization: '조직도', calendar: '근무 · 휴가 캘린더',
  availability: '가용재고', transfers: '창고 이동', bom: 'BOM 관리', production: '생산 현황', integrations: '연동 관리',
  reports: '리포트', masters: '기준정보 관리', documents: '문서 관리', home: '홈', inventory: '재고 관리',
  purchase: '구매 관리', receipt: '입고 관리', sales: '판매 · 출고', movements: '입출고 이력', returns: '반품 관리',
  adjustments: '재고 실사 · 조정', people: '인사관리', attendance: '근태관리', leave: '휴가 관리', approval: '결재함',
  settings: '워크스페이스 설정', projects: '프로젝트', tasks: '내 업무', messenger: '메신저', quotes: '견적 관리',
  receivables: '채권관리', payables: '채무관리', accounting: '회계거래관리', payroll: '급여관리',
  acctSetup: '기초등록', trades: '매출매입거래', taxInvoices: '전자(세금)계산서', funds: '계좌/카드', vouchers: '전표 입력',
  assets: '고정자산', printouts: '출력물', cashPlan: '자금계획', expenses: '비용관리', incomeExpense: '수입비용', esign: '전자계약',
  contracts: '계약관리', dailyPay: '일용근로급여관리', laborContracts: '전자근로계약',
  withholding: '원천징수', otherTax: '기타원천세', vat: '부가세', corpTax: '법인세',
  auditLog: '변경 이력', closing: '결산', loans: '차입금 · 가지급금', forex: '수출입 · 외화', dataImport: '데이터 가져오기', taxCalendar: '세무 일정', budget: '예산관리', insurance: '4대보험', severance: '퇴직금', yearEndTax: '연말정산', payStatements: '지급명세서',
};

/** camelCase page id ↔ kebab-case path segment (approvalSettings ↔ /approval-settings). */
export const href = (page: PageId) => (page === 'home' ? '/' : '/' + page.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));

export function pageFromPath(pathname: string): PageId {
  const segment = pathname.split('/')[1] || 'home';
  const id = segment.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  return id in pageNames ? (id as PageId) : 'home';
}

const ACCOUNTING: PageId[] = ['acctSetup', 'trades', 'forex', 'taxInvoices', 'funds', 'vouchers', 'accounting', 'closing', 'assets', 'printouts'];
const TREASURY: PageId[] = ['receivables', 'payables', 'cashPlan', 'loans', 'incomeExpense', 'budget', 'expenses', 'contracts', 'esign'];
const HR: PageId[] = ['payroll', 'people', 'dailyPay', 'attendance', 'laborContracts', 'insurance', 'severance', 'yearEndTax'];
const TAX: PageId[] = ['taxCalendar', 'withholding', 'payStatements', 'otherTax', 'vat', 'corpTax'];

export function navGroups(modules: Modules): [string, PageId[]][] {
  return [
    ['워크스페이스', ['home', 'approval']],
    ['협업', modules.collab ? ['projects', 'tasks', 'messenger'] : []],
    ['기준정보', modules.erp ? ['masters', 'documents'] : []],
    ['업무 관리', modules.erp ? ['purchase', 'receipt', 'quotes', 'sales', 'returns', 'inventory', 'availability', 'transfers', 'adjustments', 'movements'] : []],
    ['제조 관리', modules.manufacturing ? ['bom', 'production'] : []],
    ['회계', modules.erp ? [...ACCOUNTING, ...TREASURY] : []],
    ['인사 · 세무', [...(modules.hr ? HR : []), ...TAX]],
    ['사람과 조직', modules.hr ? ['organization', 'calendar', 'leave'] : []],
    ['관리', ['reports', 'integrations', 'settings', 'dataImport', 'permissions', 'approvalSettings', 'auditLog']],
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
  receivables: 'M3 6h18v12H3zM3 10h18M7 15h3M16 15h1',
  accounting: 'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h6',
  quotes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h4M9 9h2',
};

export const iconPaths: Record<PageId, string> = {
  ...base,
  organization: base.people, calendar: base.leave, availability: base.inventory, transfers: base.movements,
  bom: base.masters, production: base.inventory, integrations: base.settings, reports: base.purchase,
  permissions: base.people, approvalSettings: base.approval,
  projects: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 5.5l1 1 2-2M4 11.5l1 1 2-2M4 17.5l1 1 2-2',
  payroll: 'M3 6h18v12H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5M6 12h.01M18 12h.01',
  messenger: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 11h.01M12 11h.01M15.5 11h.01',
  acctSetup: base.settings,
  trades: base.movements,
  taxInvoices: base.quotes,
  funds: 'M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  vouchers: 'M4 4h16v16H4zM4 9h16M9 9v11M12 13h5M12 16h3',
  assets: 'M4 21V9l8-5 8 5v12M9 21v-6h6v6M4 21h16',
  printouts: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  payables: base.receivables,
  cashPlan: 'M3 20h18M5 16l4-5 4 3 6-8M15 6h4v4',
  expenses: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  incomeExpense: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  esign: 'M3 17c3-4 5-4 6 0s3 4 6 0 4-4 6 0M14 4l5 5-8 8H6v-5z',
  contracts: 'M6 3h9l4 4v14H6zM14 3v5h5M9 17c1.5-2 2.5-2 3.5 0s2 2 3.5 0M9 12h7',
  dailyPay: 'M12 8v4l2.5 1.5M3 6h18v12H3zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10',
  laborContracts: 'M6 3h9l4 4v14H6zM14 3v5h5M9 17c1.5-2 2.5-2 3.5 0s2 2 3.5 0M10 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
  withholding: 'M5 3h14v18H5zM9 8l6 8M9.5 15.5h.01M14.5 8.5h.01',
  otherTax: 'M5 3h14v18H5zM8 8h8M8 12h8M8 16h4',
  vat: 'M4 4h16v16H4zM9 9l6 6M9.5 14.5h.01M14.5 9.5h.01',
  corpTax: 'M4 21V8l8-5 8 5v13M9 13h6M9 17h6M12 3v5',
  budget: 'M4 20V10M10 20V4M16 20v-7M2 20h20M14 6h6M17 3v6',
  taxCalendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16M9 15l2 2 4-4',
  dataImport: 'M12 15V3M7 10l5 5 5-5M4 15v6h16v-6',
  forex: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9M12 3c-2.5 2.5-3.5 5.5-3.5 9s1 6.5 3.5 9',
  loans: 'M3 10l9-6 9 6M5 10v8M19 10v8M3 20h18M12 11v6M10 13h4',
  closing: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16l2 2 4-4',
  auditLog: 'M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
  insurance: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  severance: 'M3 7h18v12H3zM8 7V5h8v2M12 11v4M10 13h4',
  yearEndTax: 'M4 4h16v16H4zM8 9h8M8 13h5M15 15l2 2 3-3',
  payStatements: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h3M15 17l1.5 1.5L19 16',
};

/** Top tabs are the nav groups; each tab's sidebar is split into these sections. */
const sectionsByGroup: Record<string, [string, PageId[]][]> = {
  '워크스페이스': [['개요', ['home', 'approval']]],
  '협업': [['협업', ['projects', 'tasks', 'messenger']]],
  '기준정보': [['기준정보', ['masters', 'documents']]],
  '업무 관리': [['구매', ['purchase', 'receipt']], ['판매', ['quotes', 'sales', 'returns']], ['재고', ['inventory', 'availability', 'transfers', 'adjustments', 'movements']]],
  '제조 관리': [['제조', ['bom', 'production']]],
  '회계': [['회계', ACCOUNTING], ['자금', TREASURY]],
  '인사 · 세무': [['관리', HR], ['세무', TAX]],
  '사람과 조직': [['조직', ['organization']], ['휴가', ['calendar', 'leave']]],
  '관리': [['분석', ['reports']], ['설정', ['settings', 'dataImport', 'permissions', 'approvalSettings', 'auditLog', 'integrations']]],
};

export function navSections(group: string): [string, PageId[]][] {
  return sectionsByGroup[group] ?? [];
}

/** Short tab labels for the module bar. */
export const groupTabLabel: Record<string, string> = {
  '워크스페이스': '홈', '협업': '협업', '기준정보': '기준정보', '업무 관리': '거래 · 재고', '제조 관리': '제조',
  '회계': '회계 · 자금', '인사 · 세무': '인사 · 세무', '사람과 조직': '조직 · 휴가', '관리': '관리',
};
