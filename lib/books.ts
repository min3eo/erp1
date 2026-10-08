/* Bookkeeping records behind the 회계 · 자금 · 세무 screens. Journal entries are derived from these in lib/accounting.ts. */
import { approverFor, assertOpen } from './admin';
import { date, id, type ErpState } from './flow-core';
import { VAT_RATE, recordPayment } from './finance';
import type { CompanyId } from './seed';
import { addLoan, loanStatus, repayLoan, type Loan } from './loans';
import type { Attachment } from './attachments';
import type { TaxCredit } from './corp-tax';
import type { Budget } from './budget';
import type { CompanyProfile } from './operations-report';
import { addCustoms, addFxDeal, settleFx, type Currency, type FxDeal } from './forex';

export type AccountType = '자산' | '부채' | '자본' | '수익' | '비용';

/** Built-in chart of accounts. Order here is the display order in the trial balance. */
export const ACCOUNTS: Record<string, AccountType> = {
  현금: '자산', 보통예금: '자산', 외상매출금: '자산', 대손충당금: '자산', 미수금: '자산', 선급금: '자산', 가지급금: '자산', 선급비용: '자산', 미수수익: '자산', 선납세금: '자산',
  재고자산: '자산', 재공품: '자산', 부가세대급금: '자산', 유형자산: '자산', 감가상각누계액: '자산',
  외상매입금: '부채', 미지급금: '부채', 미지급비용: '부채', 선수수익: '부채', 선수금: '부채', 가수금: '부채', 단기차입금: '부채', 장기차입금: '부채', 미지급법인세: '부채', 퇴직급여충당부채: '부채', 부가세예수금: '부채', 예수금: '부채', 미지급급여: '부채',
  기초자본: '자본', 이월이익잉여금: '자본',
  매출: '수익', 매출할인: '수익', 이자수익: '수익', 잡이익: '수익', 재고조정이익: '수익', 외환차익: '수익', 외화환산이익: '수익', 매입할인: '수익', 유형자산처분이익: '수익',
  매출원가: '비용', 급여: '비용', 퇴직급여: '비용', 잡급: '비용', 복리후생비: '비용', 여비교통비: '비용', 접대비: '비용', 통신비: '비용',
  소모품비: '비용', 지급수수료: '비용', 임차료: '비용', 차량유지비: '비용', 세금과공과: '비용', 감가상각비: '비용', 대손상각비: '비용', 광고선전비: '비용',
  재고자산감모손실: '비용', 유형자산처분손실: '비용', 이자비용: '비용', 외환차손: '비용', 외화환산손실: '비용', 잡손실: '비용', 가공비배부: '비용', 법인세비용: '비용',
};
/** Below operating income in the income summary. */
export const NON_OPERATING = ['이자수익', '잡이익', '매입할인', '유형자산처분이익', '재고조정이익', '외환차익', '외화환산이익', '재고자산감모손실', '유형자산처분손실', '이자비용', '외환차손', '외화환산손실', '잡손실'];
/** Below 법인세차감전순이익. */
export const TAX_EXPENSE = '법인세비용';
/** Accounts a person may pick for everyday expenses and income. */
export const EXPENSE_ACCOUNTS = ['복리후생비', '여비교통비', '접대비', '통신비', '소모품비', '지급수수료', '광고선전비', '임차료', '차량유지비', '세금과공과', '이자비용', '잡손실'];
export const INCOME_ACCOUNTS = ['매출', '이자수익', '잡이익'];

export type FundKind = '계좌' | '카드' | '현금';
export interface Fund { id: string; kind: FundKind; name: string; number: string; opening: number }
export interface CustomAccount { name: string; type: AccountType; memo: string }
export type PartnerKind = '매출처' | '매입처' | '공통';
/** terms: 결제 조건 (일), creditLimit: 여신 한도 (부가세 포함 원), discount: 기본 할인율 %, prices: 품목별 단가표. */
export interface Partner { name: string; bizNo: string; kind: PartnerKind; contact: string; terms?: number; creditLimit?: number; discount?: number; prices?: Record<string, number> }
export type AdvanceKind = '선수금' | '선급금';
/** 거래처별 기초 미수 · 미지급 carried over from before the system. */
export interface PartnerOpening { id: string; partner: string; side: '채권' | '채무'; amount: number; paid: number; date: string }
export interface Advance { id: string; kind: AdvanceKind; partner: string; date: string; amount: number; applied: number; fund: string; memo: string }

export interface VoucherLine { account: string; debit: number; credit: number; fund?: string }
export type VoucherKind = '입금' | '출금' | '대체';
export interface Voucher { id: string; date: string; kind: VoucherKind; desc: string; partner: string; lines: VoucherLine[]; origin: '전표 입력' | '계좌/카드' | '수입비용' | '결산'; dept?: string;
  /** 결산 정리 item key (e.g. '대손충당금'); `pair` links an accrual to its next-month reversal. */
  closing?: string; pair?: string;
  /** 관리항목 and 증빙. */
  project?: string; evidence?: Evidence;
  /** 승인: who confirmed the voucher (경리 · 관리자). */
  approvedBy?: string; approvedAt?: string;
  /** 역분개: the voucher this one cancels, or the one that cancelled it. */
  reversalOf?: string; reversedBy?: string;
}

/** 적격증빙: 세금계산서 · 계산서 · 신용카드 · 현금영수증. Over 3만 원 without one → 증빙불비 가산세 2% (접대비는 손금불산입). */
export const EVIDENCE = ['세금계산서', '계산서', '신용카드', '현금영수증', '간이영수증', '증빙 없음'] as const;
export type Evidence = (typeof EVIDENCE)[number];
export const QUALIFIED: Evidence[] = ['세금계산서', '계산서', '신용카드', '현금영수증'];
export const EVIDENCE_LIMIT = 30000;

export type TradeKind = '매출' | '매입';
/** settle: '외상' (미수금 · 미지급금) or a fund id paid or received right away. */
export interface Trade { id: string; kind: TradeKind; date: string; partner: string; desc: string; account: string; supply: number; vat: number; settle: string; invoiceId?: string; contractId?: string;
  /** Collected / paid so far on a 외상 trade. */
  paid?: number;
  /** 과세 유형 (default 과세) and the 증빙 given or received. */
  taxType?: TaxType; proof?: TradeProof;
  /** 매입세액 불공제 사유: the VAT then joins the cost instead of 부가세대급금. */
  nonDeductible?: NonDeductible;
  /** A 수정세금계산서 adjustment of this trade (supply may be negative). */
  amendOf?: string;
  /** 관리항목. */
  dept?: string; project?: string;
}

export const TAX_TYPES = ['과세', '영세율', '면세'] as const;
export type TaxType = (typeof TAX_TYPES)[number];
export const TRADE_PROOFS = ['세금계산서', '계산서', '신용카드', '현금영수증', '영수증 없음'] as const;
export type TradeProof = (typeof TRADE_PROOFS)[number];
export const NON_DEDUCTIBLE = ['접대비 관련', '비영업용 승용차', '사업과 무관', '면세사업 관련', '기타'] as const;
export type NonDeductible = (typeof NON_DEDUCTIBLE)[number];
export const AMEND_REASONS = ['기재사항 착오', '공급가액 변동', '환입', '계약 해제', '착오 이중발급'] as const;
export type AmendReason = (typeof AMEND_REASONS)[number];
export type InvoiceStatus = '발행 대기' | '발행 완료' | '전송 완료' | '수취 완료';
/** ref: the sale, purchase order or 매출매입 trade the invoice is for. */
/** type: 세금계산서 (과세 · 영세율) or 계산서 (면세). amendOf / reason: a 수정(세금)계산서 of another invoice. */
export interface TaxInvoice { id: string; kind: TradeKind; date: string; partner: string; desc: string; supply: number; vat: number; ref: string; status: InvoiceStatus; type?: '세금계산서' | '계산서'; amendOf?: string; reason?: AmendReason }

/** amount: + money in (or a card refund), − money out (or a card charge). */
/** voucherId: booked as a voucher · paymentId: matched to a receivable / payable · expenseId: matched to a card expense claim. */
export interface BankTx { id: string; fund: string; date: string; desc: string; amount: number; voucherId?: string; paymentId?: string; expenseId?: string }

export type DepMethod = '정액법' | '정률법';
export interface Asset {
  id: string; name: string; category: string; date: string; cost: number; life: number; settle: string; disposed?: string;
  /** 정액법 by default. */
  method?: DepMethod;
  /** 자본적 지출: spending that adds to the asset's value (depreciated over the remaining life). */
  capex?: { date: string; amount: number; desc: string; settle: string }[];
  /** 매각: sale price (공급가) and the account it came into; without it the disposal is a write-off (폐기). */
  sale?: { price: number; vat: number; fund: string };
}

export type ExpenseStatus = '승인 대기' | '승인 완료' | '지급 완료' | '반려';
export interface Expense {
  id: string; date: string; person: string; dept: string; account: string; amount: number; desc: string;
  method: '개인 결제' | '법인카드'; card?: string; status: ExpenseStatus; paidAt?: string; project?: string;
  /** Card line in 계좌/카드 this claim was matched to. */
  bankTx?: string;
}

export type ContractSide = '매출' | '매입' | '근로';
export type SignStatus = '작성' | '서명 요청' | '서명 완료';
export interface Contract {
  id: string; title: string; partner: string; side: ContractSide; category: string; start: string; end: string;
  amount: number; cycle: '월 정기' | '일시'; account: string; sign: SignStatus; signedAt?: string; billed: string[];
  /** E-sign: who the request went to, and every step taken (oldest first). */
  signer?: string; signLog?: { date: string; text: string }[];
  /** 계약 결재 (전결 규정): needed before a 매출 · 매입 contract goes out for signing. */
  approvedBy?: string; approvedAt?: string; rejectedAt?: string;
  /** 인지세 paid (date) and the voucher that booked it. */
  stampPaid?: string; stampVoucher?: string;
}

export interface DailyWork { id: string; name: string; month: string; days: number; wage: number; paidAt?: string }
export type OtherIncomeKind = '사업소득' | '기타소득' | '이자소득' | '배당소득';
export interface OtherIncome { id: string; date: string; name: string; kind: OtherIncomeKind; gross: number; desc: string; account: string }
export interface Filing { id: string; kind: '부가세' | '원천세' | '중간예납'; period: string; date: string; amount: number; output?: number; input?: number }
export interface PlanItem { id: string; date: string; desc: string; amount: number }
/** 세무조정: 가산 = 익금산입 · 손금불산입, 차감 = 손금산입 · 익금불산입. */
export interface TaxAdjust { id: string; year: string; kind: '가산' | '차감'; desc: string; amount: number }

export interface Books {
  accounts: CustomAccount[]; partners: Partner[]; funds: Fund[]; vouchers: Voucher[]; trades: Trade[]; invoices: TaxInvoice[];
  bankTx: BankTx[]; assets: Asset[]; expenses: Expense[]; contracts: Contract[];
  dailyWork: DailyWork[]; otherIncome: OtherIncome[]; filings: Filing[]; plans: PlanItem[];
  taxAdjust: TaxAdjust[]; carryLoss: Record<string, number>;
  advances: Advance[];
  /** 계정별 기초 잔액 (normal side) and 거래처별 기초 미수 · 미지급. */
  opening: Record<string, number>;
  partnerOpening: PartnerOpening[];
  /** 대손충당금 설정률 (%, of 외상매출금 + 미수금). */
  badDebtRate: number;
  loans: Loan[];
  /** 수출입 · 외화 거래 and the last period-end rates used for 외화환산. */
  fxDeals: FxDeal[];
  fxRates: Partial<Record<Currency, number>>;
  /** 증빙 첨부 (lib/attachments.ts). */
  attachments?: Attachment[];
  /** 법인세 세액감면 · 공제, and the 결정세액 of earlier years (for 중간예납). */
  corpCredits?: TaxCredit[];
  priorCorpTax?: Record<string, number>;
  /** 세무 일정 the user marked done by hand (key → date). */
  calendarDone?: Record<string, string>;
  /** 예산 (lib/budget.ts). */
  budgets?: Budget[];
  /** 회사 정보 for tax invoices and documents (lib/operations-report.ts). */
  company?: CompanyProfile;
  /** 가지급금 인정이자율 (%); 당좌대출이자율 by default. */
  deemedRate?: number;
}

export const emptyBooks = (): Books => ({
  accounts: [], partners: [], funds: [], vouchers: [], trades: [], invoices: [], bankTx: [], assets: [], expenses: [],
  contracts: [], dailyWork: [], otherIncome: [], filings: [], plans: [], taxAdjust: [], carryLoss: {}, advances: [], opening: {}, partnerOpening: [], badDebtRate: 1, loans: [], fxDeals: [], fxRates: {},
});

type Value = string | number | undefined;

const text = (v: Value, label: string) => {
  const s = String(v ?? '').trim();
  if (!s) throw Error(`${label}을(를) 입력해 주세요.`);
  return s;
};
const won = (v: Value, label = '금액', min = 1) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw Error(`${label}은(는) ${min.toLocaleString()}원 이상의 정수로 입력해 주세요.`);
  return n;
};
const day = (v: Value) => {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('날짜를 확인해 주세요.');
  return s;
};
const floor10 = (n: number) => Math.floor(n / 10) * 10;
export const monthOf = (d: string) => d.slice(0, 7);
export const lastDay = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};
export const addMonths = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/* ───────── Chart of accounts, partners and funds ───────── */

export const accountTypes = (state: ErpState): Record<string, AccountType> => ({
  ...ACCOUNTS,
  ...Object.fromEntries(state.books.accounts.map(a => [a.name, a.type])),
});

export const expenseAccounts = (state: ErpState) => [...EXPENSE_ACCOUNTS, ...state.books.accounts.filter(a => a.type === '비용').map(a => a.name)];
export const incomeAccounts = (state: ErpState) => [...INCOME_ACCOUNTS, ...state.books.accounts.filter(a => a.type === '수익').map(a => a.name)];
/** Every account a manual voucher may touch. */
export const allAccounts = (state: ErpState) => Object.keys(accountTypes(state));

export function addAccount(state: ErpState, f: { name: Value; type: Value; memo?: Value }) {
  const name = text(f.name, '계정 이름');
  if (name in accountTypes(state)) throw Error('이미 있는 계정이에요.');
  const type = f.type as AccountType;
  if (!['자산', '부채', '자본', '수익', '비용'].includes(type)) throw Error('계정 분류를 골라 주세요.');
  const a: CustomAccount = { name, type, memo: String(f.memo ?? '').trim() };
  state.books.accounts.push(a);
  return a;
}

export function addPartner(state: ErpState, f: { name: Value; bizNo?: Value; kind: Value; contact?: Value }) {
  const name = text(f.name, '거래처 이름');
  if (state.books.partners.some(p => p.name === name)) throw Error('이미 등록된 거래처예요.');
  const bizNo = String(f.bizNo ?? '').trim();
  if (bizNo && !/^\d{3}-\d{2}-\d{5}$/.test(bizNo)) throw Error('사업자등록번호는 000-00-00000 형식으로 입력해 주세요.');
  const p: Partner = { name, bizNo, kind: (['매출처', '매입처', '공통'].includes(String(f.kind)) ? f.kind : '공통') as PartnerKind, contact: String(f.contact ?? '').trim() };
  state.books.partners.push(p);
  return p;
}

/** Partner names from the master and from transactions, for input suggestions. */
/** Payment terms, credit limit, default discount and contact details for one partner (creates the partner when missing). */
export function setPartnerTerms(state: ErpState, name: string, f: { terms?: Value; creditLimit?: Value; discount?: Value; bizNo?: Value; contact?: Value }) {
  let p = state.books.partners.find(x => x.name === name);
  if (!p) { p = { name, bizNo: '', kind: '공통', contact: '' }; state.books.partners.push(p); }
  const terms = Number(f.terms || 0), limit = Number(f.creditLimit || 0), discount = Number(f.discount || 0);
  if (!(terms >= 0 && terms <= 180)) throw Error('결제 조건은 0~180일로 입력해 주세요.');
  if (!(limit >= 0)) throw Error('여신 한도를 확인해 주세요.');
  if (!(discount >= 0 && discount < 100)) throw Error('할인율을 확인해 주세요.');
  const bizNo = String(f.bizNo ?? p.bizNo).trim();
  if (bizNo && !/^\d{3}-\d{2}-\d{5}$/.test(bizNo)) throw Error('사업자등록번호는 000-00-00000 형식으로 입력해 주세요.');
  Object.assign(p, { bizNo, contact: String(f.contact ?? p.contact).trim(), terms: terms || undefined, creditLimit: limit || undefined, discount: discount || undefined });
  return p;
}

export function setPartnerPrice(state: ErpState, name: string, code: string, price: Value) {
  const p = state.books.partners.find(x => x.name === name) ?? setPartnerTerms(state, name, {});
  const n = Number(price || 0);
  p.prices ||= {};
  if (!n) delete p.prices[code];
  else if (!(n > 0)) throw Error('단가를 확인해 주세요.');
  else p.prices[code] = n;
}

/* ───────── 선수금 · 선급금 ───────── */

export function addAdvance(state: ErpState, f: { kind: Value; partner: Value; date: Value; amount: Value; fund: Value; memo?: Value }) {
  const kind = f.kind === '선급금' ? '선급금' : '선수금';
  const fund = fundById(state, String(f.fund));
  if (!fund || fund.kind === '카드') throw Error('계좌나 현금을 골라 주세요.');
  assertOpen(state, day(f.date));
  const a: Advance = { id: id(kind === '선수금' ? 'AR' : 'AP'), kind, partner: text(f.partner, '거래처'), date: day(f.date), amount: won(f.amount), applied: 0, fund: fund.id, memo: String(f.memo ?? '').trim() };
  state.books.advances.unshift(a);
  return a;
}

export const advanceLeft = (state: ErpState, kind: AdvanceKind, partner: string) =>
  state.books.advances.filter(a => a.kind === kind && a.partner === partner).reduce((t, a) => t + a.amount - a.applied, 0);

/**
 * Settles a receivable / payable: plain money, a discount (매출 · 매입할인), a bad-debt write-off (대손),
 * or an advance applied (선수금 · 선급금 대체, oldest advance first).
 */
export function settleDoc(state: ErpState, f: { kind: '수금' | '지급'; docId: string; amount: Value; method: string; date?: string; note?: string }) {
  if ((f.method === '매출할인' || f.method === '대손') && f.kind !== '수금') throw Error(`${f.method}은 받을 돈에만 쓸 수 있어요.`);
  if ((f.method === '매입할인' || f.method === '선급금 대체') && f.kind !== '지급') throw Error(`${f.method}은 줄 돈에만 쓸 수 있어요.`);
  if (f.method === '선수금 대체' && f.kind !== '수금') throw Error('선수금 대체는 받을 돈에만 쓸 수 있어요.');
  const p = recordPayment(state, { kind: f.kind, docId: f.docId, amount: f.amount ?? 0, method: f.method, date: f.date, note: f.note });
  if (f.method === '선수금 대체' || f.method === '선급금 대체') {
    const kind: AdvanceKind = f.method === '선수금 대체' ? '선수금' : '선급금';
    if (advanceLeft(state, kind, p.partner) < p.amount) throw Error(`${p.partner}의 남은 ${kind}이 ${advanceLeft(state, kind, p.partner).toLocaleString()}원뿐이에요.`);
    let need = p.amount;
    for (const a of [...state.books.advances].reverse().filter(x => x.kind === kind && x.partner === p.partner && x.amount > x.applied)) {
      const take = Math.min(need, a.amount - a.applied);
      a.applied += take;
      need -= take;
      if (!need) break;
    }
  }
  return p;
}

/* ───────── 기초 이월 ───────── */

/** Accounts whose opening balance comes from elsewhere (funds, items, sales · purchase documents). */
export const DERIVED_OPENING = ['현금', '보통예금', '외상매출금', '외상매입금', '재고자산', '미지급금', '미수금'];

export function setOpening(state: ErpState, account: string, amount: Value) {
  if (!(account in accountTypes(state))) throw Error('계정을 찾을 수 없어요.');
  if (DERIVED_OPENING.includes(account)) throw Error(`${account}의 기초 잔액은 다른 곳에서 정해져요. (계좌 · 카드, 품목, 거래처 기초)`);
  const n = Number(amount || 0);
  if (!Number.isFinite(n) || n < 0) throw Error('금액을 확인해 주세요.');
  if (n) state.books.opening[account] = n;
  else delete state.books.opening[account];
}

export function addPartnerOpening(state: ErpState, f: { partner: Value; side: Value; amount: Value; date?: Value }) {
  const o: PartnerOpening = { id: id('OB'), partner: text(f.partner, '거래처'), side: f.side === '채무' ? '채무' : '채권', amount: won(f.amount), paid: 0, date: String(f.date || date().slice(0, 4) + '-01-01') };
  state.books.partnerOpening.push(o);
  return o;
}

/** Receivables / payables outside sales and purchase orders: 외상 trades and partner opening balances. */
export function otherBalances(state: ErpState, side: '채권' | '채무') {
  const kind: TradeKind = side === '채권' ? '매출' : '매입';
  return [
    ...state.books.trades.filter(t => t.kind === kind && t.settle === '외상').map(t => ({ ref: t.id, partner: t.partner, desc: t.desc, date: t.date, total: t.supply + t.vat, paid: t.paid ?? 0 })),
    ...state.books.partnerOpening.filter(o => o.side === side).map(o => ({ ref: o.id, partner: o.partner, desc: '기초 이월 잔액', date: o.date, total: o.amount, paid: o.paid })),
  ].map(r => ({ ...r, left: r.total - r.paid }));
}

/** Collects / pays a 외상 trade or opening balance through a fund: books a voucher and tracks what is left. */
export function settleOther(state: ErpState, f: { ref: string; amount: Value; fund: Value; date: Value }) {
  const t = state.books.trades.find(x => x.id === f.ref);
  const o = state.books.partnerOpening.find(x => x.id === f.ref);
  if (!t && !o) throw Error('정산할 거래를 찾을 수 없어요.');
  const side = t ? (t.kind === '매출' ? '채권' : '채무') : o!.side;
  const left = t ? t.supply + t.vat - (t.paid ?? 0) : o!.amount - o!.paid;
  const amount = won(f.amount);
  if (amount > left) throw Error(`남은 금액 ${left.toLocaleString()}원을 넘을 수 없어요.`);
  addVoucher(state, { date: f.date, kind: side === '채권' ? '입금' : '출금', account: side === '채권' ? '미수금' : '미지급금', counter: f.fund, amount, desc: `${t ? t.desc : '기초 잔액'} ${side === '채권' ? '수금' : '지급'}`, partner: t?.partner ?? o!.partner });
  if (t) t.paid = (t.paid ?? 0) + amount;
  else o!.paid += amount;
}

export function partnerNames(state: ErpState) {
  return [...new Set([...state.books.partners.map(p => p.name), ...state.sales.map(s => s.customer), ...state.orders.map(o => o.vendor)])];
}

export const bizNoOf = (state: ErpState, name: string) => state.books.partners.find(p => p.name === name)?.bizNo || '';

export function addFund(state: ErpState, f: { kind: Value; name: Value; number?: Value; opening?: Value }) {
  const kind = f.kind as FundKind;
  if (!['계좌', '카드', '현금'].includes(kind)) throw Error('종류를 골라 주세요.');
  const name = text(f.name, '이름');
  const opening = kind === '카드' ? 0 : won(f.opening ?? 0, '기초 잔액', 0);
  const fund: Fund = { id: id(kind === '계좌' ? 'BANK' : kind === '카드' ? 'CARD' : 'CASH'), kind, name, number: String(f.number ?? '').trim(), opening };
  state.books.funds.push(fund);
  return fund;
}

/** The ledger account a fund moves: bank → 보통예금, cash → 현금, card → 미지급금 (unpaid card bill). */
export const fundAccount = (fund: Fund) => (fund.kind === '계좌' ? '보통예금' : fund.kind === '현금' ? '현금' : '미지급금');
export const fundById = (state: ErpState, fundId?: string) => state.books.funds.find(f => f.id === fundId);
export const fundName = (state: ErpState, settle: string) => (settle === '외상' ? '외상' : fundById(state, settle)?.name ?? settle);

/** settle '외상' books a 미수금 (sales) or 미지급금 (purchases); a fund books its own account, tagged with the fund. */
export function settleLine(state: ErpState, settle: string, side: TradeKind): { account: string; fund?: string } {
  if (settle === '외상') return { account: side === '매출' ? '미수금' : '미지급금' };
  const fund = fundById(state, settle);
  if (!fund) throw Error('결제 계좌 · 카드를 골라 주세요.');
  if (side === '매출' && fund.kind === '카드') throw Error('카드로는 받을 수 없어요. 계좌나 현금을 골라 주세요.');
  return { account: fundAccount(fund), fund: fund.id };
}

/* ───────── Manual vouchers (전표 입력) ───────── */

/**
 * 입금: fund ← account, 출금: account → fund, 대체: debit account ← credit account.
 * `counter` is a fund id for 입금 · 출금 and an account name for 대체.
 */
export function addVoucher(state: ErpState, f: { date: Value; kind: Value; account: Value; counter: Value; amount: Value; desc: Value; partner?: Value; dept?: Value; project?: Value; evidence?: Value }, origin: Voucher['origin'] = '전표 입력') {
  const kind = f.kind as VoucherKind;
  if (!['입금', '출금', '대체'].includes(kind)) throw Error('전표 구분을 골라 주세요.');
  const account = text(f.account, '계정');
  if (!(account in accountTypes(state))) throw Error('계정과목을 목록에서 골라 주세요.');
  const amount = won(f.amount);
  let lines: VoucherLine[];
  if (kind === '대체') {
    const counter = text(f.counter, '상대 계정');
    if (!(counter in accountTypes(state))) throw Error('상대 계정을 목록에서 골라 주세요.');
    if (counter === account) throw Error('차변과 대변 계정이 같아요.');
    lines = [{ account, debit: amount, credit: 0 }, { account: counter, debit: 0, credit: amount }];
  } else {
    const fund = fundById(state, String(f.counter));
    if (!fund) throw Error('계좌 · 카드 · 현금을 골라 주세요.');
    if (kind === '입금' && fund.kind === '카드') throw Error('카드로는 입금받을 수 없어요.');
    const money: VoucherLine = { account: fundAccount(fund), debit: 0, credit: 0, fund: fund.id };
    lines = kind === '입금'
      ? [{ ...money, debit: amount }, { account, debit: 0, credit: amount }]
      : [{ account, debit: amount, credit: 0 }, { ...money, credit: amount }];
  }
  assertOpen(state, day(f.date));
  const v: Voucher = { id: id('JV'), date: day(f.date), kind, desc: text(f.desc, '적요'), partner: String(f.partner ?? '').trim(), lines, origin, ...(f.dept && { dept: String(f.dept) }), ...tags(f) };
  state.books.vouchers.unshift(v);
  return v;
}

const tags = (f: { project?: Value; evidence?: Value }) => ({
  ...(String(f.project ?? '').trim() && { project: String(f.project).trim() }),
  ...((EVIDENCE as readonly string[]).includes(String(f.evidence)) && { evidence: f.evidence as Evidence }),
});

/** One line of a compound voucher. `account` may be `fund:<id>` for a bank account, cash box or card. */
export interface DraftLine { account: string; debit: Value; credit: Value }
export interface DraftVoucher { date: Value; desc: Value; partner?: Value; dept?: Value; project?: Value; evidence?: Value; lines: DraftLine[] }

function buildLines(state: ErpState, draft: DraftLine[]): VoucherLine[] {
  const types = accountTypes(state);
  const lines = draft
    .filter(l => String(l.account ?? '').trim() || Number(l.debit) || Number(l.credit))
    .map((l, i): VoucherLine => {
      const debit = Number(l.debit || 0), credit = Number(l.credit || 0);
      if (!Number.isInteger(debit) || !Number.isInteger(credit) || debit < 0 || credit < 0) throw Error(`${i + 1}번째 줄 금액을 확인해 주세요.`);
      if (!!debit === !!credit) throw Error(`${i + 1}번째 줄은 차변이나 대변 중 한쪽에만 금액을 넣어 주세요.`);
      const name = String(l.account ?? '').trim();
      if (name.startsWith('fund:')) {
        const fund = fundById(state, name.slice(5));
        if (!fund) throw Error(`${i + 1}번째 줄 계좌 · 카드를 골라 주세요.`);
        if (fund.kind === '카드' && debit) throw Error('카드는 대변(사용)에만 쓸 수 있어요. 카드 대금 결제는 계좌/카드에서 처리해 주세요.');
        return { account: fundAccount(fund), debit, credit, fund: fund.id };
      }
      if (!(name in types)) throw Error(`${i + 1}번째 줄 계정과목을 목록에서 골라 주세요.`);
      return { account: name, debit, credit };
    });
  if (lines.length < 2) throw Error('차변과 대변을 한 줄 이상씩 넣어 주세요.');
  const dr = lines.reduce((t, l) => t + l.debit, 0), cr = lines.reduce((t, l) => t + l.credit, 0);
  if (dr !== cr) throw Error(`차변 합계 ${dr.toLocaleString()}원과 대변 합계 ${cr.toLocaleString()}원이 달라요.`);
  return lines;
}

const kindOf = (lines: VoucherLine[]): VoucherKind => {
  const money = lines.filter(l => l.fund && l.account !== '미지급금');
  if (money.length && money.every(l => l.debit)) return '입금';
  if (money.length && money.every(l => l.credit)) return '출금';
  return '대체';
};

/** 복합 전표: any number of debit and credit lines, with 관리항목 and 증빙. */
export function addCompoundVoucher(state: ErpState, f: DraftVoucher) {
  const lines = buildLines(state, f.lines);
  const d = day(f.date);
  assertOpen(state, d);
  const v: Voucher = {
    id: id('JV'), date: d, kind: kindOf(lines), desc: text(f.desc, '적요'), partner: String(f.partner ?? '').trim(), lines, origin: '전표 입력',
    ...(String(f.dept ?? '').trim() && { dept: String(f.dept).trim() }), ...tags(f),
  };
  state.books.vouchers.unshift(v);
  return v;
}

const editable = (v: Voucher) => v.origin === '전표 입력' || v.origin === '수입비용';

/** 수정: only unapproved, hand-entered vouchers in open months. Approved ones are cancelled by 역분개 instead. */
export function updateVoucher(state: ErpState, voucherId: string, f: DraftVoucher) {
  const v = state.books.vouchers.find(x => x.id === voucherId);
  if (!v) throw Error('전표를 찾을 수 없어요.');
  if (!editable(v)) throw Error(v.origin === '계좌/카드' ? '계좌/카드에서 만든 전표는 지우고 다시 처리해 주세요.' : '결산 전표는 결산 화면에서 처리해 주세요.');
  if (v.approvedBy) throw Error('승인된 전표는 고칠 수 없어요. 역분개로 취소한 뒤 새로 입력해 주세요.');
  if (v.reversalOf || v.reversedBy) throw Error('역분개와 연결된 전표는 고칠 수 없어요.');
  assertOpen(state, v.date);
  const lines = buildLines(state, f.lines);
  const d = day(f.date);
  assertOpen(state, d);
  const dept = String(f.dept ?? '').trim();
  delete v.dept; delete v.project; delete v.evidence;
  Object.assign(v, { date: d, desc: text(f.desc, '적요'), partner: String(f.partner ?? '').trim(), lines, kind: kindOf(lines) }, dept ? { dept } : {}, tags(f));
  return v;
}

/** 역분개: books the mirror image on `when` so both stay in the history (the original month may already be closed). */
export function reverseVoucher(state: ErpState, voucherId: string, when: Value) {
  const v = state.books.vouchers.find(x => x.id === voucherId);
  if (!v) throw Error('전표를 찾을 수 없어요.');
  if (v.reversedBy) throw Error('이미 역분개한 전표예요.');
  if (v.reversalOf) throw Error('역분개 전표는 다시 역분개할 수 없어요. 원래 전표를 새로 입력해 주세요.');
  if (v.pair) throw Error('결산 정리 전표는 결산 화면에서 지워 주세요.');
  const d = day(when);
  if (d < v.date) throw Error('역분개 날짜는 원래 전표 날짜 이후여야 해요.');
  assertOpen(state, d);
  const { approvedBy: _a, approvedAt: _b, closing: _c, ...rest } = v;
  const r: Voucher = {
    ...rest, id: id('JV'), date: d, desc: `[역분개] ${v.desc}`, origin: '전표 입력', reversalOf: v.id,
    lines: v.lines.map(l => ({ ...l, debit: l.credit, credit: l.debit })), kind: v.kind === '입금' ? '출금' : v.kind === '출금' ? '입금' : '대체',
  };
  v.reversedBy = r.id;
  state.books.vouchers.unshift(r);
  return r;
}

/** 전표 승인: 경리 or 관리자 confirms a voucher; it can then only be cancelled by 역분개. */
export function approveVoucher(state: ErpState, voucherId: string, by: { name: string; role: string }, today = date()) {
  const v = state.books.vouchers.find(x => x.id === voucherId);
  if (!v) throw Error('전표를 찾을 수 없어요.');
  const need = approverFor(state, '전표', v.lines.reduce((t, l) => t + l.debit, 0));
  if (by.role !== '관리자' && by.role !== need) throw Error(`${need} 담당자나 관리자만 이 전표를 승인할 수 있어요.`);
  if (v.approvedBy) throw Error('이미 승인한 전표예요.');
  v.approvedBy = by.name;
  v.approvedAt = today;
  return v;
}

/** Spending over 3만 원 without 적격증빙: what the 증빙 filter flags. */
export function evidenceIssue(state: ErpState, v: Voucher): string | null {
  if (v.reversalOf || v.reversedBy || v.origin === '결산') return null;
  const types = accountTypes(state);
  const spend = v.lines.filter(l => l.debit && (types[l.account] === '비용' || l.account === '유형자산' || l.account === '재고자산')).reduce((t, l) => t + l.debit, 0);
  if (spend <= EVIDENCE_LIMIT) return null;
  const card = v.lines.some(l => l.credit && l.fund && fundById(state, l.fund)?.kind === '카드');
  const ev = v.evidence ?? (card ? '신용카드' : undefined);
  if (ev && QUALIFIED.includes(ev)) return null;
  if (v.lines.some(l => l.debit && l.account === '접대비')) return '접대비 3만 원 초과 · 적격증빙이 없으면 손금불산입';
  return `적격증빙 없음 · 증빙불비 가산세 ${Math.floor(spend * 0.02).toLocaleString()}원 (2%)`;
}

export function deleteVoucher(state: ErpState, voucherId: string) {
  const v = state.books.vouchers.find(x => x.id === voucherId);
  if (!v) throw Error('전표를 찾을 수 없어요.');
  if (v.approvedBy) throw Error('승인된 전표는 지울 수 없어요. 역분개로 취소해 주세요.');
  if (v.reversedBy) throw Error('역분개된 전표예요. 역분개 전표를 먼저 지워 주세요.');
  if (v.reversalOf) { const o = state.books.vouchers.find(x => x.id === v.reversalOf); if (o) delete o.reversedBy; }
  assertOpen(state, v.date);
  const pair = v.pair ? state.books.vouchers.find(x => x.id === v.pair) : undefined;
  if (pair) assertOpen(state, pair.date);
  state.books.vouchers = state.books.vouchers.filter(x => x.id !== voucherId && x.id !== v.pair);
  state.books.bankTx.forEach(t => { if (t.voucherId === voucherId) delete t.voucherId; });
  return v;
}

/* ───────── 매출매입 and tax invoices ───────── */

export function addTrade(state: ErpState, f: { kind: Value; date: Value; partner: Value; desc: Value; account: Value; supply: Value; settle: Value; invoice?: Value; contractId?: string; taxType?: Value; proof?: Value; nonDeductible?: Value; dept?: Value; project?: Value }) {
  const kind = f.kind as TradeKind;
  if (kind !== '매출' && kind !== '매입') throw Error('매출 · 매입을 골라 주세요.');
  const account = text(f.account, '계정');
  const allowed = kind === '매출' ? incomeAccounts(state) : [...expenseAccounts(state), '재고자산', '유형자산'];
  if (!allowed.includes(account)) throw Error('계정을 목록에서 골라 주세요.');
  const supply = won(f.supply, '공급가액');
  const settle = String(f.settle || '외상');
  settleLine(state, settle, kind);
  assertOpen(state, day(f.date));
  const taxType = ((TAX_TYPES as readonly string[]).includes(String(f.taxType)) ? f.taxType : '과세') as TaxType;
  const wantsInvoice = f.invoice === 'on' || f.invoice === 'true' || f.invoice === 1 || f.proof === '세금계산서' || f.proof === '계산서';
  const card = fundById(state, settle)?.kind === '카드';
  const proof: TradeProof = wantsInvoice ? (taxType === '면세' ? '계산서' : '세금계산서')
    : (TRADE_PROOFS as readonly string[]).includes(String(f.proof)) && f.proof !== '세금계산서' && f.proof !== '계산서' ? (f.proof as TradeProof) : card ? '신용카드' : '영수증 없음';
  const nonDeductible = kind === '매입' && taxType === '과세' && (NON_DEDUCTIBLE as readonly string[]).includes(String(f.nonDeductible)) ? (f.nonDeductible as NonDeductible) : undefined;
  const t: Trade = {
    id: id(kind === '매출' ? 'SL' : 'PU'), kind, date: day(f.date), partner: text(f.partner, '거래처'), desc: text(f.desc, '내용'),
    account, supply, vat: taxType === '과세' ? Math.round(supply * VAT_RATE) : 0, settle, ...(f.contractId && { contractId: f.contractId }),
    ...(taxType !== '과세' && { taxType }), proof, ...(nonDeductible && { nonDeductible }),
    ...(String(f.dept ?? '').trim() && { dept: String(f.dept).trim() }), ...(String(f.project ?? '').trim() && { project: String(f.project).trim() }),
  };
  if (wantsInvoice) {
    const inv: TaxInvoice = { id: id('TI'), kind, date: t.date, partner: t.partner, desc: t.desc, supply, vat: t.vat, ref: t.id, status: kind === '매출' ? '발행 대기' : '수취 완료', ...(taxType === '면세' && { type: '계산서' as const }) };
    state.books.invoices.unshift(inv);
    t.invoiceId = inv.id;
  }
  state.books.trades.unshift(t);
  return t;
}

export function deleteTrade(state: ErpState, tradeId: string) {
  const t = state.books.trades.find(x => x.id === tradeId);
  if (!t) throw Error('거래를 찾을 수 없어요.');
  const inv = state.books.invoices.find(i => i.id === t.invoiceId);
  if (inv && (inv.status === '발행 완료' || inv.status === '전송 완료')) throw Error('세금계산서를 발행한 거래는 지울 수 없어요. 수정세금계산서로 처리해 주세요.');
  assertOpen(state, t.date);
  state.books.trades = state.books.trades.filter(x => x.id !== tradeId);
  state.books.invoices = state.books.invoices.filter(i => i.id !== t.invoiceId);
  return t;
}

/** Supply amount already shipped (sales) or received (purchases), net of returns, that has no invoice yet. */
export function invoiceable(state: ErpState, kind: TradeKind, docId: string) {
  const doc = kind === '매출' ? state.sales.find(s => s.id === docId) : state.orders.find(o => o.id === docId);
  if (!doc) return 0;
  const done = kind === '매출' ? ('shipped' in doc ? doc.shipped : 0) : ('received' in doc ? doc.received : 0);
  const returned = state.returns.filter(r => r.ref === docId).reduce((t, r) => t + r.qty, 0);
  const supply = Math.round((done - returned) * doc.price);
  // A 공급가액 변동 amendment is a discount on what was shipped, not a reason to invoice again.
  const invoiced = state.books.invoices.filter(i => i.ref === docId && i.reason !== '공급가액 변동').reduce((t, i) => t + i.supply, 0);
  return Math.max(0, supply - invoiced);
}

/** Sales and purchase orders with shipped / received amounts not invoiced yet. */
export function invoiceTargets(state: ErpState) {
  return [
    ...state.sales.map(s => ({ kind: '매출' as TradeKind, docId: s.id, partner: s.customer, name: s.name, date: s.date.replace(/\./g, '-'), supply: invoiceable(state, '매출', s.id) })),
    ...state.orders.map(o => ({ kind: '매입' as TradeKind, docId: o.id, partner: o.vendor, name: o.name, date: o.date.replace(/\./g, '-'), supply: invoiceable(state, '매입', o.id) })),
  ].filter(t => t.supply > 0);
}

/** Writes an invoice for a sale (발행 대기) or records the supplier's invoice for a purchase (수취 완료). */
export function invoiceForDoc(state: ErpState, kind: TradeKind, docId: string, today = date()) {
  const supply = invoiceable(state, kind, docId);
  if (supply <= 0) throw Error('세금계산서를 만들 금액이 없어요. 출고 · 입고 수량을 확인해 주세요.');
  const doc = kind === '매출' ? state.sales.find(s => s.id === docId)! : state.orders.find(o => o.id === docId)!;
  assertOpen(state, today);
  const inv: TaxInvoice = {
    id: id('TI'), kind, date: today, partner: kind === '매출' ? (doc as { customer: string }).customer : (doc as { vendor: string }).vendor,
    desc: doc.name, supply, vat: Math.round(supply * VAT_RATE), ref: docId, status: kind === '매출' ? '발행 대기' : '수취 완료',
  };
  state.books.invoices.unshift(inv);
  return inv;
}

/** 발행 대기 → 발행 완료 → 전송 완료 (국세청). */
export function advanceInvoice(state: ErpState, invoiceId: string) {
  const inv = state.books.invoices.find(i => i.id === invoiceId);
  if (!inv || inv.kind !== '매출') throw Error('매출 세금계산서만 발행할 수 있어요.');
  if (inv.status === '발행 대기') {
    if (!bizNoOf(state, inv.partner)) throw Error(`${inv.partner}의 사업자등록번호가 없어요. 기초등록 › 거래처에서 먼저 등록해 주세요.`);
    inv.status = '발행 완료';
  } else if (inv.status === '발행 완료') inv.status = '전송 완료';
  else throw Error('이미 국세청에 전송한 세금계산서예요.');
  return inv;
}

/* ───────── 수정(세금)계산서 ───────── */

/**
 * Issues an amended invoice for `invoiceId`.
 * - 계약 해제 · 착오 이중발급: the whole amount comes off (−).
 * - 공급가액 변동: `supply` is the change (+ or −). 환입: `supply` is the returned amount (taken off).
 * - 기재사항 착오: a full (−) copy plus a corrected (+) invoice with `supply` as the right amount.
 * Trades get a matching adjustment trade; sales / purchase orders get a 매출 · 매입할인 for 공급가액 변동
 * (환입 goods come back through 반품, so only the invoice is needed).
 */
export function amendInvoice(state: ErpState, invoiceId: string, f: { reason: Value; supply?: Value; date: Value }) {
  const inv = state.books.invoices.find(i => i.id === invoiceId);
  if (!inv) throw Error('계산서를 찾을 수 없어요.');
  if (inv.amendOf) throw Error('수정분이 아닌 원래 계산서에서 다시 수정해 주세요.');
  if (inv.kind === '매출' && inv.status === '발행 대기') throw Error('아직 발행하지 않은 계산서는 지우고 다시 만들면 돼요.');
  const reason = String(f.reason) as AmendReason;
  if (!(AMEND_REASONS as readonly string[]).includes(reason)) throw Error('수정 사유를 골라 주세요.');
  const when = day(f.date);
  if (when < inv.date) throw Error('수정 발행일은 원래 작성일 이후여야 해요.');
  assertOpen(state, when);
  const net = inv.supply + state.books.invoices.filter(i => i.amendOf === inv.id).reduce((t, i) => t + i.supply, 0);
  const n = Number(f.supply ?? 0);
  let deltas: number[];
  if (reason === '계약 해제' || reason === '착오 이중발급') deltas = [-net];
  else if (reason === '기재사항 착오') {
    if (!Number.isInteger(n) || n < 1) throw Error('올바른 공급가액을 입력해 주세요.');
    deltas = [-net, n];
  } else {
    if (!Number.isInteger(n) || n === 0) throw Error('바뀐 공급가액을 원 단위로 입력해 주세요.');
    deltas = [reason === '환입' ? -Math.abs(n) : n];
  }
  if (net + deltas.reduce((t, d) => t + d, 0) < 0) throw Error(`남은 공급가액 ${net.toLocaleString()}원보다 많이 줄일 수 없어요.`);
  const trade = state.books.trades.find(t => t.id === inv.ref);
  if (!trade && reason !== '환입' && reason !== '공급가액 변동') throw Error('주문 건은 환입(반품 후)이나 공급가액 변동으로만 수정할 수 있어요.');
  if (!trade && reason === '공급가액 변동' && deltas[0] > 0) throw Error('주문 건의 공급가액 증가는 추가 출고 · 입고로 처리해 주세요.');
  const free = inv.type === '계산서' || inv.vat === 0;
  const made = deltas.map(delta => {
    const vat = free ? 0 : Math.round(delta * VAT_RATE);
    const amended: TaxInvoice = {
      id: id('TI'), kind: inv.kind, date: when, partner: inv.partner, desc: `[수정 · ${reason}] ${inv.desc}`, supply: delta, vat, ref: inv.ref,
      status: inv.kind === '매출' ? '발행 대기' : '수취 완료', amendOf: inv.id, reason, ...(inv.type && { type: inv.type }),
    };
    state.books.invoices.unshift(amended);
    if (trade) {
      state.books.trades.unshift({
        id: id(trade.kind === '매출' ? 'SL' : 'PU'), kind: trade.kind, date: when, partner: trade.partner, desc: amended.desc, account: trade.account,
        supply: delta, vat, settle: '외상', invoiceId: amended.id, amendOf: trade.id, proof: trade.proof,
        ...(trade.taxType && { taxType: trade.taxType }), ...(trade.nonDeductible && { nonDeductible: trade.nonDeductible }),
      });
    }
    return amended;
  });
  if (!trade && reason === '공급가액 변동') {
    const delta = deltas[0];
    recordPayment(state, { kind: inv.kind === '매출' ? '수금' : '지급', docId: inv.ref, amount: -delta + Math.round(-delta * VAT_RATE), method: inv.kind === '매출' ? '매출할인' : '매입할인', date: when, note: `수정세금계산서 (${reason})` });
  }
  return made;
}

/* ───────── Bank and card history (계좌/카드) ───────── */

export function addBankTx(state: ErpState, f: { fund: Value; date: Value; desc: Value; direction: Value; amount: Value }) {
  const fund = fundById(state, String(f.fund));
  if (!fund) throw Error('계좌 · 카드를 골라 주세요.');
  const amount = won(f.amount);
  const sign = f.direction === '입금' ? 1 : -1;
  const t: BankTx = { id: id('BT'), fund: fund.id, date: day(f.date), desc: text(f.desc, '내용'), amount: sign * amount };
  state.books.bankTx.unshift(t);
  return t;
}

/**
 * Turns one bank or card line into a voucher. `target` is an account name, or `fund:<id>` for a move
 * between own funds (cash withdrawal, paying the card bill).
 */
export function processBankTx(state: ErpState, txId: string, target: string, opts: { vat?: boolean; partner?: string } = {}) {
  const t = state.books.bankTx.find(x => x.id === txId);
  if (!t) throw Error('내역을 찾을 수 없어요.');
  if (isProcessed(t)) throw Error('이미 처리한 내역이에요.');
  const fund = fundById(state, t.fund)!;
  const amount = Math.abs(t.amount);
  const self: VoucherLine = { account: fundAccount(fund), debit: 0, credit: 0, fund: fund.id };
  let other: VoucherLine;
  if (target.startsWith('fund:')) {
    const to = fundById(state, target.slice(5));
    if (!to || to.id === fund.id) throw Error('상대 계좌 · 카드를 골라 주세요.');
    other = { account: fundAccount(to), debit: 0, credit: 0, fund: to.id };
  } else {
    if (!(target in accountTypes(state))) throw Error('계정과목을 골라 주세요.');
    other = { account: target, debit: 0, credit: 0 };
  }
  // Money in (or a card refund) debits the fund side; money out (or a card charge) credits it.
  let lines: VoucherLine[] = t.amount > 0 ? [{ ...self, debit: amount }, { ...other, credit: amount }] : [{ ...other, debit: amount }, { ...self, credit: amount }];
  // 매입세액 공제: a 과세 purchase paid by card or with a 현금영수증 carries 1/11 VAT.
  const splitVat = opts.vat && t.amount < 0 && !target.startsWith('fund:');
  if (splitVat) {
    const vat = Math.round(amount / 11);
    lines = [{ ...other, debit: amount - vat }, { account: '부가세대급금', debit: vat, credit: 0 }, { ...self, credit: amount }];
  }
  assertOpen(state, t.date);
  const v: Voucher = {
    id: id('JV'), date: t.date, kind: t.amount > 0 ? '입금' : '출금', desc: t.desc, partner: opts.partner?.trim() || '', lines, origin: '계좌/카드',
    ...(splitVat && { evidence: (fund.kind === '카드' ? '신용카드' : '현금영수증') as Evidence }),
  };
  state.books.vouchers.unshift(v);
  t.voucherId = v.id;
  return v;
}

export const isProcessed = (t: BankTx) => !!(t.voucherId || t.paymentId || t.expenseId);

/** Matches a deposit to an open sale (수금) or a withdrawal to an open purchase order (지급). */
export function matchBankTx(state: ErpState, txId: string, docId: string) {
  const t = state.books.bankTx.find(x => x.id === txId);
  if (!t || isProcessed(t)) throw Error('이미 처리한 내역이에요.');
  const fund = fundById(state, t.fund)!;
  if (fund.kind === '카드') throw Error('카드 내역은 수금 · 지급과 맞출 수 없어요.');
  const p = recordPayment(state, { kind: t.amount > 0 ? '수금' : '지급', docId, amount: Math.abs(t.amount), method: fund.kind === '현금' ? '현금' : '계좌이체', date: t.date, note: t.desc });
  p.fund = fund.id;
  t.paymentId = p.id;
  return p;
}

/** Card charge ↔ approved 법인카드 expense: the expense already booked the cost, so the line only gets marked. */
export function linkCardExpense(state: ErpState, txId: string, expenseId: string) {
  const t = state.books.bankTx.find(x => x.id === txId);
  const e = state.books.expenses.find(x => x.id === expenseId);
  if (!t || isProcessed(t)) throw Error('이미 처리한 내역이에요.');
  if (!e || e.method !== '법인카드' || e.bankTx) throw Error('연결할 수 있는 법인카드 경비가 아니에요.');
  if (e.status !== '승인 완료') throw Error('승인된 경비만 연결할 수 있어요.');
  if (Math.abs(t.amount) !== e.amount) throw Error('카드 사용 금액과 경비 금액이 달라요.');
  t.expenseId = e.id;
  e.bankTx = t.id;
}

/** Approved card expenses with the same card and amount, not yet matched, for a card line. */
export const cardExpenseCandidates = (state: ErpState, t: BankTx) =>
  state.books.expenses.filter(e => e.method === '법인카드' && e.card === t.fund && !e.bankTx && e.status === '승인 완료' && e.amount === Math.abs(t.amount));

/* ───────── Fixed assets (고정자산) ───────── */

/** Kept on the books after full depreciation (비망가액). */
export const MEMO_VALUE = 1000;

export function addAsset(state: ErpState, f: { name: Value; category: Value; date: Value; cost: Value; life: Value; settle: Value; method?: Value }) {
  const cost = won(f.cost, '취득가액', MEMO_VALUE + 1);
  const life = Number(f.life);
  if (!Number.isInteger(life) || life < 1 || life > 50) throw Error('내용연수는 1~50년으로 입력해 주세요.');
  const settle = String(f.settle || '외상');
  settleLine(state, settle, '매입');
  assertOpen(state, day(f.date));
  const a: Asset = { id: id('FA'), name: text(f.name, '자산 이름'), category: text(f.category, '분류'), date: day(f.date), cost, life, settle, ...(f.method === '정률법' && { method: '정률법' as const }) };
  state.books.assets.unshift(a);
  return a;
}

/** 정률법 상각률: 내용연수 끝에 취득가액의 5%가 남는 비율 (법인세법 시행규칙 별표 4와 같은 방식). */
export const decliningRate = (life: number) => 1 - Math.pow(0.05, 1 / life);

/** 취득가액 + 그 날짜까지의 자본적 지출. */
export const assetCost = (a: Asset, upTo = '9999-12-31') => a.cost + (a.capex ?? []).filter(c => c.date <= upTo).reduce((t, c) => t + c.amount, 0);

/**
 * Monthly depreciation from the acquisition month to `upTo` (inclusive), stopping at disposal or the end of life.
 * 정액법: what is left to depreciate spread over the months left (a 자본적 지출 raises it from its month on).
 * 정률법: the yearly rate on the book value at the start of each year of use, by month; the last month takes the rest.
 * 1,000원 (비망가액) always stays on the books.
 */
export function depreciation(a: Asset, upTo: string) {
  const months = a.life * 12;
  const start = monthOf(a.date);
  const stop = [monthOf(upTo), a.disposed ? monthOf(a.disposed) : '9999-12'].sort()[0];
  const rate = decliningRate(a.life);
  const rows: { month: string; amount: number }[] = [];
  let accumulated = 0, yearBook = 0;
  for (let i = 0, m = start; i < months && m <= stop; i++, m = addMonths(m, 1)) {
    const cost = assetCost(a, lastDay(m));
    const left = cost - MEMO_VALUE - accumulated;
    if (i % 12 === 0) yearBook = cost - accumulated;
    let amount: number;
    if (i === months - 1) amount = left;
    else if (a.method === '정률법') amount = Math.min(left, Math.floor((yearBook * rate) / 12));
    else amount = Math.floor(left / (months - i));
    amount = Math.max(0, amount);
    rows.push({ month: m, amount });
    accumulated += amount;
  }
  const cost = assetCost(a, a.disposed ?? upTo);
  return { monthly: rows[0]?.amount ?? 0, rows, accumulated, book: cost - accumulated, done: rows.length === months, cost };
}

/** 자본적 지출 (개량 · 증설): adds to the asset; depreciated over the rest of its life. */
export function addCapex(state: ErpState, assetId: string, f: { date: Value; amount: Value; desc: Value; settle: Value }) {
  const a = state.books.assets.find(x => x.id === assetId);
  if (!a || a.disposed) throw Error('보유 중인 자산에만 자본적 지출을 더할 수 있어요.');
  const d = day(f.date);
  if (d < a.date) throw Error('취득일 이후 날짜여야 해요.');
  const settle = String(f.settle || '외상');
  settleLine(state, settle, '매입');
  assertOpen(state, d);
  (a.capex ||= []).push({ date: d, amount: won(f.amount, '금액'), desc: text(f.desc, '내용'), settle });
  return a;
}

/** 처분: 폐기 (no price) or 매각 (price = 공급가, 부가세 10% on top, received into `fund`). */
export function disposeAsset(state: ErpState, assetId: string, when: Value, sale?: { price?: Value; fund?: Value }) {
  const a = state.books.assets.find(x => x.id === assetId);
  if (!a || a.disposed) throw Error('보유 중인 자산만 처분할 수 있어요.');
  const d = day(when);
  if (d < a.date) throw Error('처분일은 취득일 이후여야 해요.');
  assertOpen(state, d);
  const price = Number(sale?.price || 0);
  if (price) {
    if (!Number.isInteger(price) || price < 0) throw Error('매각 금액을 확인해 주세요.');
    const fund = fundById(state, String(sale?.fund));
    if (!fund || fund.kind === '카드') throw Error('매각 대금을 받은 계좌를 골라 주세요.');
    a.sale = { price, vat: Math.round(price * VAT_RATE), fund: fund.id };
  }
  a.disposed = d;
  return a;
}

/* ───────── Expense claims (비용관리) ───────── */

export function addExpense(state: ErpState, f: { date: Value; person: Value; dept: Value; account: Value; amount: Value; desc: Value; method: Value; card?: Value; project?: Value }) {
  const account = text(f.account, '계정');
  if (!expenseAccounts(state).includes(account)) throw Error('비용 계정을 골라 주세요.');
  const method = f.method === '법인카드' ? '법인카드' : '개인 결제';
  const card = method === '법인카드' ? fundById(state, String(f.card)) : undefined;
  if (method === '법인카드' && card?.kind !== '카드') throw Error('사용한 법인카드를 골라 주세요.');
  assertOpen(state, day(f.date));
  const e: Expense = {
    id: id('EX'), date: day(f.date), person: text(f.person, '청구자'), dept: String(f.dept ?? '').trim(), account,
    amount: won(f.amount), desc: text(f.desc, '사용 내용'), method, ...(card && { card: card.id }), status: '승인 대기',
    ...(String(f.project ?? '').trim() && { project: String(f.project).trim() }),
  };
  state.books.expenses.unshift(e);
  return e;
}

export function decideExpense(state: ErpState, expenseId: string, approved: boolean) {
  const e = state.books.expenses.find(x => x.id === expenseId);
  if (!e || e.status !== '승인 대기') throw Error('이미 처리한 경비예요.');
  assertOpen(state, e.date);
  e.status = approved ? '승인 완료' : '반려';
  return e;
}

/** Pays an approved personal expense back to the employee from the main account. */
export function payExpense(state: ErpState, expenseId: string, today = date()) {
  const e = state.books.expenses.find(x => x.id === expenseId);
  if (!e || e.status !== '승인 완료' || e.method !== '개인 결제') throw Error('승인된 개인 결제 경비만 지급할 수 있어요.');
  e.status = '지급 완료';
  assertOpen(state, today);
  e.paidAt = today;
  return e;
}

/* ───────── Contracts (계약관리 · 근로계약) ───────── */

export function addContract(state: ErpState, f: { title: Value; partner: Value; side: Value; category: Value; start: Value; end?: Value; amount: Value; cycle: Value; account?: Value }) {
  const side = f.side as ContractSide;
  if (!['매출', '매입', '근로'].includes(side)) throw Error('계약 구분을 골라 주세요.');
  const start = day(f.start);
  const end = f.end ? day(f.end) : '';
  if (end && end < start) throw Error('종료일은 시작일 이후여야 해요.');
  const account = side === '매출' ? '매출' : side === '근로' ? '급여' : text(f.account, '비용 계정');
  if (side === '매입' && !expenseAccounts(state).includes(account)) throw Error('비용 계정을 골라 주세요.');
  const c: Contract = {
    id: id(side === '근로' ? 'LC' : 'CT'), title: text(f.title, '계약명'), partner: text(f.partner, side === '근로' ? '근로자' : '거래처'), side,
    category: text(f.category, '유형'), start, end, amount: won(f.amount, side === '근로' ? '월 기본급' : '계약 금액'),
    cycle: side === '근로' || f.cycle === '월 정기' ? '월 정기' : '일시', account, sign: '작성', billed: [],
  };
  state.books.contracts.unshift(c);
  return c;
}

/** 작성 → 서명 요청 → 서명 완료 (the counterpart signs on the e-sign link). */
const signLog = (c: Contract, day: string, text: string) => { (c.signLog ||= []).push({ date: day, text }); };

export function advanceSign(state: ErpState, contractId: string, today = date()) {
  const c = state.books.contracts.find(x => x.id === contractId);
  if (!c) throw Error('계약을 찾을 수 없어요.');
  if (c.sign === '작성') return requestSign(state, contractId, c.signer || c.partner, today);
  if (c.sign !== '서명 요청') throw Error('이미 서명이 끝난 계약이에요.');
  c.sign = '서명 완료';
  c.signedAt = today;
  signLog(c, today, `${c.signer || c.partner} 서명 완료 · 계약 체결`);
  return c;
}

/** Sends (or re-sends after a cancel) the e-sign link to the counterpart's signer. */
export function requestSign(state: ErpState, contractId: string, signer: Value, today = date()) {
  const c = state.books.contracts.find(x => x.id === contractId);
  if (!c || c.sign !== '작성') throw Error('작성 상태의 계약만 서명을 요청할 수 있어요.');
  if (c.side !== '근로' && !c.approvedBy) throw Error('계약 결재가 끝나야 서명을 요청할 수 있어요. 결재함에서 승인받아 주세요.');
  c.signer = text(signer, '서명자 (이메일 · 휴대폰)');
  c.sign = '서명 요청';
  signLog(c, today, `${c.signer}에게 서명 요청`);
  return c;
}

export function remindSign(state: ErpState, contractId: string, today = date()) {
  const c = state.books.contracts.find(x => x.id === contractId);
  if (!c || c.sign !== '서명 요청') throw Error('서명 대기 중인 계약만 다시 보낼 수 있어요.');
  signLog(c, today, `${c.signer || c.partner}에게 서명 요청 재전송`);
  return c;
}

/** Withdraws a pending request so the contract can be edited and sent again. */
export function cancelSign(state: ErpState, contractId: string, today = date()) {
  const c = state.books.contracts.find(x => x.id === contractId);
  if (!c || c.sign !== '서명 요청') throw Error('서명 대기 중인 계약만 요청을 취소할 수 있어요.');
  c.sign = '작성';
  signLog(c, today, '서명 요청 취소');
  return c;
}

/** Yearly value used against the 계약 전결 한도: 12 months of a monthly contract, or the one-off amount. */
export const contractValue = (c: Pick<Contract, 'amount' | 'cycle'>) => (c.cycle === '월 정기' ? c.amount * 12 : c.amount);

export function decideContract(state: ErpState, contractId: string, approved: boolean, by: { name: string; role: string }, today = date()) {
  const c = state.books.contracts.find(x => x.id === contractId);
  if (!c || c.side === '근로' || c.sign !== '작성' || c.approvedBy) throw Error('결재 대기 중인 계약이 아니에요.');
  const need = approverFor(state, '계약', contractValue(c));
  if (by.role !== '관리자' && by.role !== need) throw Error(`${need} 담당자나 관리자만 승인할 수 있어요.`);
  if (approved) { c.approvedBy = by.name; c.approvedAt = today; delete c.rejectedAt; }
  else c.rejectedAt = today;
  signLog(c, today, approved ? `계약 결재 승인 (${by.name})` : `계약 결재 반려 (${by.name})`);
  return c;
}

/** 인지세 paid with an 전자수입인지: booked as 세금과공과 from a bank account. */
export function payStamp(state: ErpState, contractId: string, f: { amount: Value; date: Value; fund?: Value }) {
  const c = state.books.contracts.find(x => x.id === contractId);
  if (!c) throw Error('계약을 찾을 수 없어요.');
  if (c.stampPaid) throw Error('이미 인지세를 기록했어요.');
  const v = addVoucher(state, { date: f.date, kind: '출금', account: '세금과공과', counter: f.fund || 'BANK-1', amount: f.amount, desc: `인지세 · ${c.title}`, partner: c.partner });
  c.stampPaid = v.date;
  c.stampVoucher = v.id;
  return v;
}

export function deleteContract(state: ErpState, contractId: string) {
  const c = state.books.contracts.find(x => x.id === contractId);
  if (!c || c.sign === '서명 완료') throw Error('서명이 끝난 계약은 지울 수 없어요.');
  state.books.contracts = state.books.contracts.filter(x => x.id !== contractId);
  return c;
}

export type ContractPhase = '시작 전' | '진행 중' | '만료 예정' | '만료';
export function contractPhase(c: Contract, today = date()): ContractPhase {
  if (today < c.start) return '시작 전';
  if (c.end && today > c.end) return '만료';
  if (c.end && Date.parse(c.end) - Date.parse(today) <= 30 * 86400000) return '만료 예정';
  return '진행 중';
}

/** Bills a signed 매출 · 매입 contract once per month (or once, for one-off contracts) as a 매출매입 trade with a tax invoice. */
export function billContract(state: ErpState, contractId: string, month: string) {
  const c = state.books.contracts.find(x => x.id === contractId);
  if (!c || c.side === '근로') throw Error('매출 · 매입 계약만 청구할 수 있어요.');
  if (c.sign !== '서명 완료') throw Error('서명이 끝난 계약만 청구할 수 있어요.');
  const key = c.cycle === '일시' ? 'once' : month;
  if (c.billed.includes(key)) throw Error(c.cycle === '일시' ? '이미 청구한 계약이에요.' : `${month}분은 이미 처리했어요.`);
  if (c.cycle === '월 정기' && (month < monthOf(c.start) || (c.end && month > monthOf(c.end)))) throw Error('계약 기간 밖의 달이에요.');
  const when = c.cycle === '일시' ? date() : [lastDay(month), date()].sort()[0];
  const t = addTrade(state, {
    kind: c.side, date: when, partner: c.partner, desc: c.cycle === '일시' ? c.title : `${c.title} ${month}분`, account: c.account,
    supply: c.amount, settle: '외상', invoice: 'on', contractId: c.id,
  });
  c.billed.push(key);
  return t;
}

/* ───────── Daily workers and other income (원천세) ───────── */

/** 일용근로소득: (일당 − 15만 원) × 6% × (1 − 55% 세액공제), 1,000원 미만 소액부징수. Employment insurance 0.9%. */
export function dailyTax(w: Pick<DailyWork, 'days' | 'wage'>) {
  const gross = w.days * w.wage;
  const perDay = Math.max(0, w.wage - 150000) * 0.06 * 0.45;
  const raw = floor10(perDay * w.days);
  const tax = raw < 1000 ? 0 : raw;
  const local = floor10(tax * 0.1);
  const employment = floor10(gross * 0.009);
  return { gross, tax, local, employment, net: gross - tax - local - employment };
}

export function addDailyWork(state: ErpState, f: { name: Value; month: Value; days: Value; wage: Value }) {
  const month = String(f.month ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw Error('근무 월을 확인해 주세요.');
  const days = Number(f.days);
  if (!Number.isInteger(days) || days < 1 || days > 31) throw Error('근무일수는 1~31일로 입력해 주세요.');
  const w: DailyWork = { id: id('DW'), name: text(f.name, '이름'), month, days, wage: won(f.wage, '일당', 10000) };
  state.books.dailyWork.unshift(w);
  return w;
}

export function payDailyWork(state: ErpState, workId: string, today = date()) {
  const w = state.books.dailyWork.find(x => x.id === workId);
  if (!w || w.paidAt) throw Error('이미 지급했어요.');
  assertOpen(state, today);
  w.paidAt = today;
  return w;
}

/** 사업소득 3% (+지방 0.3%). 기타소득: 필요경비 60% 뒤 20% (+지방 2%), 기타소득금액 5만 원 이하는 과세최저한. */
export function otherIncomeTax(kind: OtherIncomeKind, gross: number) {
  // 사업 3%, 기타 (필요경비 60% 뒤 20%, 5만 원 이하 과세최저한), 이자 · 배당 14%.
  const tax = kind === '사업소득' ? floor10(gross * 0.03) : kind === '기타소득' ? (gross * 0.4 <= 50000 ? 0 : floor10(gross * 0.4 * 0.2)) : floor10(gross * 0.14);
  const local = floor10(tax * 0.1);
  return { tax, local, net: gross - tax - local };
}

export function addOtherIncome(state: ErpState, f: { date: Value; name: Value; kind: Value; gross: Value; desc: Value; account?: Value }) {
  const kind = (['기타소득', '이자소득', '배당소득'].includes(String(f.kind)) ? f.kind : '사업소득') as OtherIncomeKind;
  const account = String(f.account || (kind === '배당소득' ? '이월이익잉여금' : kind === '이자소득' ? '이자비용' : '지급수수료'));
  if (!expenseAccounts(state).includes(account) && account !== '이월이익잉여금') throw Error('비용 계정을 골라 주세요.');
  assertOpen(state, day(f.date));
  const o: OtherIncome = { id: id('OI'), date: day(f.date), name: text(f.name, '소득자'), kind, gross: won(f.gross, '지급액'), desc: text(f.desc, '지급 내용'), account };
  state.books.otherIncome.unshift(o);
  return o;
}

/* ───────── Cash plan items (자금계획) ───────── */

export function addPlan(state: ErpState, f: { date: Value; desc: Value; direction: Value; amount: Value }) {
  const p: PlanItem = { id: id('PL'), date: day(f.date), desc: text(f.desc, '내용'), amount: (f.direction === '입금' ? 1 : -1) * won(f.amount) };
  state.books.plans.push(p);
  return p;
}

export function removePlan(state: ErpState, planId: string) {
  state.books.plans = state.books.plans.filter(p => p.id !== planId);
}

/* ───────── 법인세 세무조정 ───────── */

export function addTaxAdjust(state: ErpState, f: { year: Value; kind: Value; desc: Value; amount: Value }) {
  const year = String(f.year ?? '');
  if (!/^\d{4}$/.test(year)) throw Error('사업연도를 확인해 주세요.');
  const a: TaxAdjust = { id: id('TA'), year, kind: f.kind === '차감' ? '차감' : '가산', desc: text(f.desc, '조정 내용'), amount: won(f.amount) };
  state.books.taxAdjust.push(a);
  return a;
}

export function removeTaxAdjust(state: ErpState, adjustId: string) {
  state.books.taxAdjust = state.books.taxAdjust.filter(a => a.id !== adjustId);
}

/** 이월결손금: losses from earlier years still available to deduct (entered by the user from past returns). */
export function setCarryLoss(state: ErpState, year: string, amount: Value) {
  state.books.carryLoss[year] = won(amount ?? 0, '이월결손금', 0);
}

/* ───────── Sample data ───────── */

/** Runs the sample records through the same rules the screens use, so balances stay consistent. */
export function seedBooks(state: ErpState, company: CompanyId) {
  const other = company === 'other';
  state.books = emptyBooks();
  const b = state.books;
  b.funds = [
    { id: 'BANK-1', kind: '계좌', name: '기업은행 보통예금', number: '123-456789-01-011', opening: 150000000 },
    { id: 'BANK-2', kind: '계좌', name: '국민은행 급여통장', number: '987-21-0456-789', opening: 20000000 },
    { id: 'CASH', kind: '현금', name: '현금 시재', number: '본사 금고', opening: 1500000 },
    { id: 'CARD-1', kind: '카드', name: '신한 법인카드', number: '4518-****-****-2201', opening: 0 },
  ];
  const [c1, c2] = other ? ['하늘 리빙', '모퉁이 상점'] : ['바른약국 체인', '온누리 드럭'];
  b.partners = [
    { name: c1, bizNo: '214-81-12345', kind: '매출처', contact: '02-555-0101' },
    { name: c2, bizNo: '120-86-55443', kind: '매출처', contact: '031-700-2200' },
    { name: '한빛 공급', bizNo: '133-81-22018', kind: '매입처', contact: '02-311-8080' },
    { name: '그린 파트너스', bizNo: '305-87-01234', kind: '매입처', contact: '042-610-3300' },
    { name: '성수 빌딩 관리', bizNo: '206-81-77001', kind: '매입처', contact: '02-462-1100' },
    { name: '클라우드웍스', bizNo: '220-88-10234', kind: '매입처', contact: '1588-0000' },
    { name: '오피스플러스', bizNo: '', kind: '매입처', contact: '' },
  ];
  b.accounts = [{ name: '도서인쇄비', type: '비용', memo: '도서 구입, 인쇄물' }];

  // Contracts first: the September rent is billed from the lease.
  const lease = addContract(state, { title: '본사 사무실 임대차', partner: '성수 빌딩 관리', side: '매입', category: '임대차', start: '2026-01-01', end: '2027-12-31', amount: 2500000, cycle: '월 정기', account: '임차료' });
  lease.sign = '서명 완료';
  lease.signedAt = '2025-12-20';
  billContract(state, lease.id, '2026-09');
  b.trades[0].settle = 'BANK-1';
  b.trades[0].date = '2026-09-30';
  b.invoices[0].date = '2026-09-30';
  const saas = addContract(state, { title: '그룹웨어 연간 이용', partner: '클라우드웍스', side: '매입', category: '용역', start: '2025-11-01', end: '2026-10-31', amount: 300000, cycle: '월 정기', account: '지급수수료' });
  saas.sign = '서명 완료';
  saas.signedAt = '2025-10-25';
  const consult = addContract(state, { title: '매장 진열 컨설팅', partner: c1, side: '매출', category: '용역', start: '2026-10-01', end: '2027-03-31', amount: 1200000, cycle: '월 정기' });
  consult.sign = '서명 요청';
  [['민서', '정규직', '2023-03-02', 4200000, true], ['김하늘', '정규직', '2024-01-15', 3600000, true], ['한도윤', '계약직', '2026-04-01', 3800000, false]].forEach(([name, cat, start, pay, signed]) => {
    const c = addContract(state, { title: `${name} 근로계약`, partner: name as string, side: '근로', category: cat as string, start: start as string, end: cat === '계약직' ? '2027-03-31' : '', amount: pay as number, cycle: '월 정기' });
    c.sign = signed ? '서명 완료' : '서명 요청';
    if (signed) c.signedAt = start as string;
  });

  addTrade(state, { kind: '매입', date: '2026-09-15', partner: '클라우드웍스', desc: '그룹웨어 9월 이용료', account: '지급수수료', supply: 300000, settle: 'CARD-1', invoice: 'on', contractId: saas.id });
  saas.billed.push('2026-09');
  addTrade(state, { kind: '매입', date: '2026-10-02', partner: '오피스플러스', desc: '복사용지 · 사무용품', account: '소모품비', supply: 180000, settle: '외상', invoice: 'on' });
  addTrade(state, { kind: '매입', date: '2026-10-05', partner: '한빛 공급', desc: '온라인 광고 대행 (10월)', account: '광고선전비', supply: 900000, settle: 'BANK-1', invoice: 'on' });

  // The August sale is invoiced and sent; the October shipment is waiting for an invoice.
  try {
    const inv = invoiceForDoc(state, '매출', 'SO-202608-014', '2026-08-31');
    inv.status = '전송 완료';
    invoiceForDoc(state, '매입', 'PO-202610-003', '2026-10-05');
  } catch {}

  addVoucher(state, { date: '2026-10-02', kind: '출금', account: '복리후생비', counter: 'CASH', amount: 45000, desc: '사무실 다과 구입', partner: '' });
  addVoucher(state, { date: '2026-10-06', kind: '입금', account: '잡이익', counter: 'CASH', amount: 20000, desc: '폐박스 매각', partner: '' });

  const fuel = addBankTx(state, { fund: 'CARD-1', date: '2026-09-30', desc: 'SK에너지 성수주유소', direction: '출금', amount: 65000 });
  processBankTx(state, fuel.id, '차량유지비', { vat: true, partner: 'SK에너지 성수주유소' });
  addBankTx(state, { fund: 'BANK-1', date: '2026-09-25', desc: '예금 결산 이자', direction: '입금', amount: 12340 });
  addBankTx(state, { fund: 'BANK-1', date: '2026-10-07', desc: 'KT 기업 통신요금', direction: '출금', amount: 88000 });
  addBankTx(state, { fund: 'CARD-1', date: '2026-10-05', desc: '스타벅스 성수점', direction: '출금', amount: 34500 });
  addBankTx(state, { fund: 'CARD-1', date: '2026-10-07', desc: '카카오T 택시', direction: '출금', amount: 18700 });

  addAsset(state, { name: other ? '배송용 1톤 트럭' : '포장 자동화 설비', category: other ? '차량운반구' : '기계장치', date: '2025-11-03', cost: other ? 32000000 : 38000000, life: other ? 5 : 8, settle: 'BANK-1' });
  addAsset(state, { name: '업무용 노트북 3대', category: '비품', date: '2026-03-10', cost: 6000000, life: 4, settle: 'BANK-1' });

  const e1 = addExpense(state, { date: '2026-09-26', person: '이서윤', dept: '물류팀', account: '소모품비', amount: 32000, desc: '포장 테이프 · 완충재', method: '개인 결제' });
  decideExpense(state, e1.id, true);
  payExpense(state, e1.id, '2026-09-30');
  const e2 = addExpense(state, { date: '2026-10-03', person: '박지호', dept: '구매팀', account: '접대비', amount: 156000, desc: '공급사 미팅 식대', method: '법인카드', card: 'CARD-1' });
  decideExpense(state, e2.id, true);
  addExpense(state, { date: '2026-10-06', person: '김하늘', dept: '운영팀', account: '여비교통비', amount: 48000, desc: '거래처 방문 KTX 왕복', method: '개인 결제' });

  // Bank and card lines that match an open receivable and the approved card expense, to show matching.
  addBankTx(state, { fund: 'CARD-1', date: '2026-10-03', desc: '한정식 진미 (공급사 미팅)', direction: '출금', amount: 156000 });
  const october = state.sales.find(x => x.id === 'SO-202610-003');
  if (october) {
    const left = october.shipped * october.price * 1.1;
    addBankTx(state, { fund: 'BANK-1', date: '2026-10-08', desc: `${october.customer} 입금`, direction: '입금', amount: Math.round(left) });
  }

  const d1 = addDailyWork(state, { name: '최현우', month: '2026-09', days: 12, wage: 130000 });
  payDailyWork(state, d1.id, '2026-09-30');
  addDailyWork(state, { name: '오지민', month: '2026-10', days: 5, wage: 180000 });

  addOtherIncome(state, { date: '2026-09-20', name: '강디자인 (프리랜서)', kind: '사업소득', gross: 1500000, desc: '패키지 디자인', account: '지급수수료' });
  addOtherIncome(state, { date: '2026-10-02', name: '윤서진 강사', kind: '기타소득', gross: 500000, desc: '사내 교육 강의', account: '지급수수료' });

  addPlan(state, { date: '2026-10-20', desc: '정부 R&D 지원금 입금', direction: '입금', amount: 5000000 });
  addPlan(state, { date: '2026-10-30', desc: '포장 설비 정기 유지보수', direction: '출금', amount: 1200000 });

  addVoucher(state, { date: '2026-10-05', kind: '출금', account: '광고선전비', counter: 'BANK-1', amount: 350000, desc: 'SNS 광고 집행', partner: '', dept: '상품팀' }, '수입비용');
  addVoucher(state, { date: '2026-09-18', kind: '입금', account: '이자수익', counter: 'BANK-1', amount: 48000, desc: '정기예금 이자', partner: '', dept: '경영지원팀' }, '수입비용');

  b.contracts.filter(c => c.side !== '근로' && c.sign !== '작성').forEach(c => Object.assign(c, { approvedBy: '민서', approvedAt: c.start < '2026-10-01' ? c.start : '2026-10-02' }));

  // E-sign history for the sample contracts.
  const signers: Record<string, string> = { '성수 빌딩 관리': 'lease@sungsu-bm.kr', 클라우드웍스: 'contract@cloudworks.io', [c1]: 'buyer@' + (other ? 'haneul' : 'bareun') + '.co.kr' };
  b.contracts.forEach(c => {
    c.signer = signers[c.partner] ?? `${c.partner} (휴대폰)`;
    // Signed samples were sent a few days before they were signed.
    const sent = c.signedAt ? new Date(Date.parse(c.signedAt) - 4 * 86400000).toISOString().slice(0, 10) : '2026-10-06';
    c.signLog = [{ date: sent, text: `${c.signer}에게 서명 요청` }];
    if (c.sign === '서명 완료') c.signLog.push({ date: c.signedAt!, text: `${c.signer} 서명 완료 · 계약 체결` });
  });

  // 부가세 신고 자료: a 면세 sale with a 계산서 and a card dinner whose VAT is not deductible.
  // October service revenue (no goods leave stock), invoiced and sent.
  const oem = addTrade(state, { kind: '매출', date: '2026-10-07', partner: c1, desc: other ? '오프라인 매장 VMD 용역 (10월)' : 'OEM 충전 · 포장 가공 용역 (10월 1차)', account: '매출', supply: 4_200_000, settle: '외상', proof: '세금계산서' });
  const oemInv = b.invoices.find(i => i.id === oem.invoiceId);
  if (oemInv) oemInv.status = '전송 완료';
  const exempt = addTrade(state, { kind: '매출', date: '2026-09-18', partner: c1, desc: '매장 직원 피부관리 교육 (면세 교육용역)', account: '매출', supply: 800000, settle: '외상', taxType: '면세', proof: '계산서' });
  const exemptInv = b.invoices.find(i => i.id === exempt.invoiceId);
  if (exemptInv) exemptInv.status = '전송 완료';
  addTrade(state, { kind: '매입', date: '2026-09-12', partner: '한우마을 성수점', desc: '거래처 접대 식사 (세금계산서 수취)', account: '접대비', supply: 180000, settle: 'BANK-1', proof: '세금계산서', nonDeductible: '접대비 관련' });

  // A working-capital loan repaid monthly, and money lent to the CEO (가지급금) partly returned.
  const loan = addLoan(state, { lender: '기업은행', desc: '운전자금 대출', principal: 60000000, rate: 4.8, start: '2026-02-10', months: 36, method: '원리금균등', fund: 'BANK-1' });
  while ((loanStatus(loan).next?.date ?? '9999') < '2026-10-01') repayLoan(state, loan.id);
  addVoucher(state, { date: '2026-04-15', kind: '출금', account: '가지급금', counter: 'BANK-1', amount: 10000000, desc: '대표이사 가지급 (개인 용도)', partner: '대표이사 민서' });
  addVoucher(state, { date: '2026-08-20', kind: '입금', account: '가지급금', counter: 'BANK-1', amount: 4000000, desc: '대표이사 가지급금 일부 반환', partner: '대표이사 민서' });

  // An export paid in two parts at different rates, and an import with customs still to be paid for.
  const ex = addFxDeal(state, { kind: '수출', date: '2026-08-12', partner: other ? 'Pacific Home LLC' : 'Glow Beauty Pte. Ltd.', desc: other ? '머그컵 수출 (FOB 부산)' : '모이스처 크림 수출 (FOB 인천)', currency: 'USD', amount: 12000, rate: 1385.5 });
  settleFx(state, ex.id, { date: '2026-09-05', amount: 7000, rate: 1392.3, fund: 'BANK-1' });
  const im = addFxDeal(state, { kind: '수입', date: '2026-09-22', partner: other ? 'Nordic Living AB' : 'Shiseido Materials Co.', desc: other ? '코튼 원단 수입' : '세라마이드 원료 수입', currency: other ? 'EUR' : 'JPY', amount: other ? 3500 : 850000, rate: other ? 1612.4 : 9.36, account: '재고자산', itemCode: other ? 'G-002' : 'RM-002', qty: other ? 400 : 120 });
  addCustoms(state, im.id, { date: '2026-09-25', duty: other ? 451000 : 636000, vat: other ? 609000 : 859000, fund: 'BANK-1' });

  b.calendarDone = { '주민세|2026': '2026-08-28' };
  // 2026 budgets and a tagged project, so 예산관리 and 프로젝트 손익 have something to show.
  b.budgets = [
    { id: 'BG-1', year: '2026', account: '매출', amount: 300_000_000 },
    { id: 'BG-2', year: '2026', account: '광고선전비', amount: 3_000_000 },
    { id: 'BG-3', year: '2026', account: '복리후생비', amount: 1_200_000 },
    { id: 'BG-4', year: '2026', account: '접대비', amount: 600_000 },
    { id: 'BG-5', year: '2026', account: '소모품비', amount: 1_000_000 },
    { id: 'BG-6', year: '2026', account: '광고선전비', dept: '상품팀', amount: 400_000 },
  ];
  b.vouchers.filter(v => v.desc === 'SNS 광고 집행').forEach(v => { v.project = '비베라 리뉴얼'; });
  b.trades.filter(t => t.desc === '온라인 광고 대행 (10월)').forEach(t => { t.project = '비베라 리뉴얼'; t.dept = '상품팀'; });

  // 경리 approved everything through September; October's vouchers still wait.
  b.vouchers.filter(v => v.date < '2026-10-01').forEach(v => Object.assign(v, { approvedBy: '정우진', approvedAt: '2026-10-02' }));
  b.vouchers.filter(v => v.desc === '폐박스 매각' || v.desc === 'SNS 광고 집행').forEach(v => { v.evidence = v.desc === 'SNS 광고 집행' ? '세금계산서' : '증빙 없음'; });

  addTaxAdjust(state, { year: '2026', kind: '가산', desc: '접대비 한도 초과액 (손금불산입)', amount: 56000 });
  addTaxAdjust(state, { year: '2026', kind: '가산', desc: '교통 과태료 (손금불산입)', amount: 40000 });
  return b;
}
