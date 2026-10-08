/* Employees, leave, social insurance, severance, year-end tax and pay statements. Sample rules for planning, not filings. */
import { addMonths, lastDay, monthOf } from './books';
import { assertOpen } from './admin';
import { date, id, type ErpState } from './flow-core';
import { payslips, type Payslip } from './payroll';
import type { Person } from './seed';

export type EmploymentType = '정규직' | '계약직' | '단시간';
export type PensionType = 'DB' | 'DC' | '없음';
export interface Employee {
  name: string; dept: string; role: string; type: EmploymentType; joined: string; left?: string; leftReason?: string;
  email: string; phone: string; bank: string; account: string; pension: PensionType;
  /** Sample "today" status and clock-in shown on attendance screens. */
  today: string; clockIn: string;
  history: { date: string; text: string }[];
}
export interface InsuranceReport { id: string; name: string; kind: '취득' | '상실'; date: string; status: '신고 대기' | '신고 완료' }
export interface Overtime { id: string; name: string; month: string; overtime: number; night: number; holiday: number }
export interface Bonus { id: string; name: string; month: string; amount: number; desc: string }
export interface Severance { name: string; date: string; years: number; amount: number; tax: number; local: number; paidAt?: string }
export interface YearEndInput { cardSpend: number; insurance: number; medical: number; education: number; donation: number; children: number; done?: string }
export interface Hr {
  insuranceReports: InsuranceReport[];
  insurancePaid: Record<string, { date: string; employee: number; employer: number; pensionEmployer: number }>;
  overtime: Overtime[]; bonuses: Bonus[]; severance: Severance[];
  yearEnd: Record<string, Record<string, YearEndInput>>;
  /** Pay statement submissions: key `${kind}|${period}` → date submitted. */
  statements: Record<string, string>;
  settings: { accidentRate: number; minWage: number; smallBusiness: boolean };
}

export const emptyHr = (): Hr => ({
  insuranceReports: [], insurancePaid: {}, overtime: [], bonuses: [], severance: [], yearEnd: {}, statements: {},
  settings: { accidentRate: 0.01, minWage: 10320, smallBusiness: false },
});

type Value = string | number | undefined;
const text = (v: Value, label: string) => {
  const s = String(v ?? '').trim();
  if (!s) throw Error(`${label}을(를) 입력해 주세요.`);
  return s;
};
const day = (v: Value) => {
  const s = String(v ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error('날짜를 확인해 주세요.');
  return s;
};
const num = (v: Value, label: string, min = 0) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < min) throw Error(`${label}을(를) 확인해 주세요.`);
  return n;
};
const floor10 = (n: number) => Math.floor(n / 10) * 10;

/* ───────── Employees ───────── */

export function seedEmployees(): Employee[] {
  const base = (name: string, dept: string, role: string, joined: string, today: string, clockIn: string, extra: Partial<Employee> = {}): Employee => ({
    name, dept, role, type: '정규직', joined, email: '', phone: '010-0000-0000', bank: '국민은행', account: '000000-00-000000', pension: 'DB',
    today, clockIn, history: [{ date: joined, text: `입사 · ${dept} ${role}` }], ...extra,
  });
  return [
    base('민서', '경영지원팀', '관리자', '2023-03-02', '근무 중', '09:00', { email: 'minseo@tessel.kr', account: '123456-01-111111' }),
    base('김하늘', '운영팀', '매니저', '2024-01-15', '근무 중', '08:57', { email: 'haneul@tessel.kr', pension: 'DC' }),
    base('박지호', '구매팀', '매니저', '2025-03-01', '외근', '09:12', { email: 'jiho@tessel.kr', bank: '신한은행' }),
    base('이서윤', '물류팀', '매니저', '2022-07-01', '근무 중', '08:50', { email: 'seoyun@tessel.kr', bank: '하나은행' }),
    base('정우진', '상품팀', '팀장', '2019-05-13', '휴가', '—', { email: 'woojin@tessel.kr', pension: 'DC' }),
    base('한도윤', '개발팀', '매니저', '2026-04-01', '근무 중', '09:05', { type: '계약직', email: 'doyun@tessel.kr', pension: '없음' }),
  ];
}

/** Is the employee on the payroll at any point in the month? */
export const activeIn = (e: Employee, month: string) => e.joined <= lastDay(month) && (!e.left || e.left >= `${month}-01`);
export const employed = (e: Employee, today = date()) => e.joined <= today && (!e.left || e.left >= today);

/** Current staff as the legacy [name, dept, role, status, clockIn] tuple the older screens use. */
export function staff(state: ErpState, today = date()): Person[] {
  return state.employees.filter(e => employed(e, today)).map(e => [e.name, e.dept, e.role, e.today, e.clockIn]);
}
export const depts = (state: ErpState) => [...new Set(state.employees.filter(e => !e.left).map(e => e.dept))];
export const employee = (state: ErpState, name: string) => state.employees.find(e => e.name === name);

export function hire(state: ErpState, f: Record<string, Value>) {
  const name = text(f.name, '이름');
  if (state.employees.some(e => e.name === name && !e.left)) throw Error('같은 이름의 재직자가 있어요. 구분할 수 있게 이름을 바꿔 주세요.');
  const joined = day(f.joined);
  const baseWage = num(f.base, '기본급', 1);
  const e: Employee = {
    name, dept: text(f.dept, '부서'), role: text(f.role, '직책'), type: (['정규직', '계약직', '단시간'].includes(String(f.type)) ? f.type : '정규직') as EmploymentType,
    joined, email: String(f.email ?? ''), phone: String(f.phone ?? ''), bank: String(f.bank ?? ''), account: String(f.account ?? ''),
    pension: (['DB', 'DC', '없음'].includes(String(f.pension)) ? f.pension : 'DB') as PensionType, today: '근무 중', clockIn: '—',
    history: [{ date: joined, text: `입사 · ${f.dept} ${f.role}` }],
  };
  state.employees = state.employees.filter(x => x.name !== name);
  state.employees.push(e);
  state.salaries = state.salaries.filter(s => s.name !== name);
  state.salaries.push({ name, base: baseWage, meal: 200000, allowance: num(f.allowance, '수당'), dependents: Math.max(1, num(f.dependents ?? 1, '부양가족')) });
  state.hr.insuranceReports.unshift({ id: id('IR'), name, kind: '취득', date: joined, status: '신고 대기' });
  return e;
}

export function updateEmployee(state: ErpState, name: string, f: Record<string, Value>, today = date()) {
  const e = employee(state, name);
  if (!e) throw Error('직원을 찾을 수 없어요.');
  const dept = text(f.dept, '부서'), role = text(f.role, '직책');
  if (dept !== e.dept || role !== e.role) e.history.push({ date: today, text: `발령 · ${e.dept} ${e.role} → ${dept} ${role}` });
  Object.assign(e, {
    dept, role, type: f.type || e.type, email: String(f.email ?? e.email), phone: String(f.phone ?? e.phone), bank: String(f.bank ?? e.bank),
    account: String(f.account ?? e.account), pension: f.pension || e.pension,
  });
  return e;
}

/** Records the leaving date, files 4대보험 상실, and computes severance for anyone with a year or more of service. */
export function retire(state: ErpState, name: string, f: { date: Value; reason: Value }) {
  const e = employee(state, name);
  if (!e || e.left) throw Error('재직 중인 직원만 퇴사 처리할 수 있어요.');
  const left = day(f.date);
  if (left < e.joined) throw Error('퇴사일은 입사일 이후여야 해요.');
  e.left = left;
  e.leftReason = text(f.reason, '퇴사 사유');
  e.today = '퇴사';
  e.history.push({ date: left, text: `퇴사 · ${e.leftReason}` });
  state.hr.insuranceReports.unshift({ id: id('IR'), name, kind: '상실', date: left, status: '신고 대기' });
  const s = severanceFor(state, name, left);
  if (s.amount > 0 && e.pension !== 'DC') state.hr.severance.unshift({ name, date: left, years: s.years, amount: s.amount, tax: s.tax, local: s.local });
  return e;
}

export function markInsuranceReport(state: ErpState, reportId: string) {
  const r = state.hr.insuranceReports.find(x => x.id === reportId);
  if (!r || r.status === '신고 완료') throw Error('이미 신고했어요.');
  r.status = '신고 완료';
  return r;
}

/** 취득 · 상실 신고 기한: the 15th of the following month. */
export const reportDue = (d: string) => `${addMonths(monthOf(d), 1)}-15`;

/* ───────── Annual leave (근로기준법 제60조, 입사일 기준) ───────── */

const monthsBetween = (from: string, to: string) => {
  const [fy, fm, fd] = from.split('-').map(Number), [ty, tm, td] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
};

/** Under one year: 1 day per full month (max 11). From one year: 15 days, +1 every two years, max 25. */
export function leaveBalance(state: ErpState, name: string, today = date()) {
  const e = employee(state, name);
  if (!e) return { granted: 0, used: 0, left: 0, since: today, years: 0, expires: today };
  const months = Math.max(0, monthsBetween(e.joined, today));
  const years = Math.floor(months / 12);
  const since = years ? `${Number(e.joined.slice(0, 4)) + years}${e.joined.slice(4)}` : e.joined;
  const granted = years ? Math.min(25, 15 + Math.floor((years - 1) / 2)) : Math.min(11, months);
  const used = state.leaves.filter(l => l.name === name && l.status === '승인 완료' && l.date >= since).reduce((t, l) => t + l.days, 0);
  const expires = `${Number(since.slice(0, 4)) + 1}${since.slice(4)}`;
  return { granted, used, left: granted - used, since, years, expires };
}

/* ───────── Overtime and bonus ───────── */

export function addOvertime(state: ErpState, f: { name: Value; month: Value; overtime: Value; night: Value; holiday: Value }) {
  const name = text(f.name, '직원');
  const month = String(f.month ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw Error('월을 확인해 주세요.');
  const o: Overtime = { id: id('OT'), name, month, overtime: num(f.overtime, '연장 시간'), night: num(f.night, '야간 시간'), holiday: num(f.holiday, '휴일 시간') };
  if (o.overtime > 52) throw Error('월 연장근로가 52시간을 넘어요. 주 12시간 한도를 확인해 주세요.');
  state.hr.overtime = state.hr.overtime.filter(x => !(x.name === name && x.month === month));
  state.hr.overtime.push(o);
  return o;
}

export function addBonus(state: ErpState, f: { name: Value; month: Value; amount: Value; desc: Value }) {
  const month = String(f.month ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw Error('월을 확인해 주세요.');
  const b: Bonus = { id: id('BN'), name: text(f.name, '직원'), month, amount: num(f.amount, '금액', 1), desc: text(f.desc, '내용') };
  state.hr.bonuses.push(b);
  return b;
}

export const removeBonus = (state: ErpState, bonusId: string) => { state.hr.bonuses = state.hr.bonuses.filter(b => b.id !== bonusId); };

/** 통상시급 = (기본급 + 고정수당) ÷ 209시간. */
export const hourlyWage = (base: number, allowance: number) => Math.round((base + allowance) / 209);

/** Premium pay: 연장 · 휴일 1.5배, 야간 0.5배 가산. Workplaces under 5 people skip the premiums. */
export function overtimePay(state: ErpState, name: string, month: string) {
  const s = state.salaries.find(x => x.name === name);
  const o = state.hr.overtime.find(x => x.name === name && x.month === month);
  if (!s || !o) return 0;
  const h = hourlyWage(s.base, s.allowance);
  const rate = state.hr.settings.smallBusiness ? 1 : 1.5;
  return Math.round(h * (o.overtime * rate + o.holiday * rate + (state.hr.settings.smallBusiness ? 0 : o.night * 0.5)));
}

export function minWageIssues(state: ErpState) {
  return state.salaries
    .filter(s => state.employees.some(e => e.name === s.name && !e.left))
    .map(s => ({ name: s.name, hourly: Math.floor(s.base / 209) }))
    .filter(x => x.hourly < state.hr.settings.minWage);
}

/* ───────── 4대보험 ───────── */

/** Employer-side rates on top of the employee rates in lib/payroll.ts (150인 미만 고용안정 0.25% 포함). */
export const EMPLOYER = { employment: 0.0115 };

export function insuranceFor(slips: Payslip[], accidentRate: number) {
  const rows = slips.map(p => {
    const employee = p.pension + p.health + p.longTermCare + p.employment;
    const employment = floor10(p.taxable * EMPLOYER.employment);
    const accident = floor10(p.taxable * accidentRate);
    const employer = p.pension + p.health + p.longTermCare + employment + accident;
    return { name: p.name, taxable: p.taxable, pension: p.pension, health: p.health + p.longTermCare, employment: p.employment, employerEmployment: employment, accident, employee, employer };
  });
  return { rows, employee: rows.reduce((t, r) => t + r.employee, 0), employer: rows.reduce((t, r) => t + r.employer, 0), pensionEmployer: rows.reduce((t, r) => t + r.pension, 0) };
}

/** Slips for a month: the confirmed run's own copy when there is one, otherwise today's calculation. */
export const slipsFor = (state: ErpState, month: string) => state.payrolls.find(r => r.month === month)?.slips ?? payslips(state, month);

export function insuranceMonth(state: ErpState, month: string) {
  const s = insuranceFor(slipsFor(state, month), state.hr.settings.accidentRate);
  return { ...s, month, due: `${addMonths(month, 1)}-10`, paid: state.hr.insurancePaid[month] };
}

export function payInsurance(state: ErpState, month: string, today = date()) {
  if (state.hr.insurancePaid[month]) throw Error('이미 납부한 달이에요.');
  if (!state.payrolls.some(r => r.month === month)) throw Error('급여를 확정한 달만 납부할 수 있어요.');
  const s = insuranceMonth(state, month);
  assertOpen(state, today);
  state.hr.insurancePaid[month] = { date: today, employee: s.employee, employer: s.employer, pensionEmployer: s.pensionEmployer };
  return s;
}

/* ───────── 퇴직금 · 퇴직소득세 ───────── */

const BASIC: [number, number, number][] = [
  [14_000_000, 0.06, 0], [50_000_000, 0.15, 1_260_000], [88_000_000, 0.24, 5_760_000], [150_000_000, 0.35, 15_440_000],
  [300_000_000, 0.38, 19_940_000], [500_000_000, 0.4, 25_940_000], [1_000_000_000, 0.42, 35_940_000], [Infinity, 0.45, 65_940_000],
];
/** 종합소득 기본세율 (누진공제 방식). */
export function basicTax(base: number) {
  if (base <= 0) return 0;
  const [, rate, minus] = BASIC.find(([limit]) => base <= limit)!;
  return Math.max(0, base * rate - minus);
}

/** 퇴직소득세: 근속연수공제 → 환산급여 → 환산급여공제 → 기본세율 × 근속연수 ÷ 12. */
export function retirementTax(amount: number, years: number) {
  if (amount <= 0 || years <= 0) return { tax: 0, local: 0 };
  const n = years;
  const service = n <= 5 ? 1_000_000 * n : n <= 10 ? 5_000_000 + 2_000_000 * (n - 5) : n <= 20 ? 15_000_000 + 2_500_000 * (n - 10) : 40_000_000 + 3_000_000 * (n - 20);
  const converted = Math.max(0, ((amount - service) * 12) / n);
  const c = converted;
  const convDeduct = c <= 8_000_000 ? c : c <= 70_000_000 ? 8_000_000 + (c - 8_000_000) * 0.6 : c <= 100_000_000 ? 45_200_000 + (c - 70_000_000) * 0.55 : c <= 300_000_000 ? 61_700_000 + (c - 100_000_000) * 0.45 : 151_700_000 + (c - 300_000_000) * 0.35;
  const tax = floor10((basicTax(c - convDeduct) * n) / 12);
  return { tax, local: floor10(tax * 0.1) };
}

/** 퇴직금 = 1일 평균임금(최근 3개월) × 30일 × 재직일수 ÷ 365. Needs a year of service. */
export function severanceFor(state: ErpState, name: string, asOf = date()) {
  const e = employee(state, name);
  const s = state.salaries.find(x => x.name === name);
  if (!e || !s) return { days: 0, years: 0, daily: 0, amount: 0, tax: 0, local: 0, eligible: false };
  const days = Math.round((Date.parse(asOf) - Date.parse(e.joined)) / 86400000) + 1;
  const months = [0, 1, 2].map(i => addMonths(monthOf(asOf), -i - 1));
  const wages = months.map(m => slipsFor(state, m).find(p => p.name === name)?.gross ?? s.base + s.meal + s.allowance);
  const span = months.reduce((t, m) => t + Number(lastDay(m).slice(8)), 0);
  const annualBonus = state.hr.bonuses.filter(b => b.name === name && b.month > addMonths(monthOf(asOf), -12)).reduce((t, b) => t + b.amount, 0);
  const daily = (wages.reduce((t, w) => t + w, 0) + (annualBonus * 3) / 12) / span;
  const eligible = days >= 365;
  const amount = eligible ? floor10((daily * 30 * days) / 365) : 0;
  const years = Math.ceil(days / 365);
  return { days, years, daily: Math.round(daily), amount, ...retirementTax(amount, years), eligible };
}

export function paySeverance(state: ErpState, name: string, today = date()) {
  const s = state.hr.severance.find(x => x.name === name && !x.paidAt);
  if (!s) throw Error('지급할 퇴직금이 없어요.');
  assertOpen(state, today);
  s.paidAt = today;
  return s;
}

/** DB · 퇴직연금 미가입자의 퇴직급여충당부채 = 오늘 모두 퇴직한다고 할 때의 퇴직금 합계. */
export const severanceLiability = (state: ErpState, asOf = date()) =>
  state.employees.filter(e => employed(e, asOf) && e.pension !== 'DC').reduce((t, e) => t + severanceFor(state, e.name, asOf).amount, 0);

/* ───────── 연말정산 ───────── */

export const emptyYearEnd = (): YearEndInput => ({ cardSpend: 0, insurance: 0, medical: 0, education: 0, donation: 0, children: 0 });

export function setYearEndInput(state: ErpState, year: string, name: string, f: Record<string, Value>) {
  const cur = state.hr.yearEnd[year]?.[name];
  if (cur?.done) throw Error('정산을 확정한 직원이에요. 확정을 취소한 뒤 고쳐 주세요.');
  const v: YearEndInput = {
    cardSpend: num(f.cardSpend, '카드 사용액'), insurance: num(f.insurance, '보장성 보험료'), medical: num(f.medical, '의료비'),
    education: num(f.education, '교육비'), donation: num(f.donation, '기부금'), children: Math.floor(num(f.children, '자녀 수')),
  };
  (state.hr.yearEnd[year] ||= {})[name] = v;
  return v;
}

/** Simplified year-end settlement: totals from the year's confirmed pay slips plus the employee's deduction inputs. */
export function yearEndCalc(state: ErpState, year: string, name: string) {
  const runs = state.payrolls.filter(r => r.month.startsWith(year));
  const slips = runs.map(r => (r.slips ?? payslips(state, r.month)).find(p => p.name === name)).filter((p): p is Payslip => !!p);
  const input = state.hr.yearEnd[year]?.[name] ?? emptyYearEnd();
  const dependents = state.salaries.find(s => s.name === name)?.dependents ?? 1;
  const sum = (k: keyof Payslip) => slips.reduce((t, p) => t + (p[k] as number), 0);
  const total = sum('taxable'); // 총급여 (비과세 제외)
  const g = total;
  const wageDeduct = Math.min(20_000_000, g <= 5_000_000 ? g * 0.7 : g <= 15_000_000 ? 3_500_000 + (g - 5_000_000) * 0.4 : g <= 45_000_000 ? 7_500_000 + (g - 15_000_000) * 0.15 : g <= 100_000_000 ? 12_000_000 + (g - 45_000_000) * 0.05 : 14_750_000 + (g - 100_000_000) * 0.02);
  const personal = dependents * 1_500_000;
  const pension = sum('pension');
  const insurance = sum('health') + sum('longTermCare') + sum('employment');
  const card = Math.min(3_000_000, Math.max(0, (input.cardSpend - g * 0.25) * 0.15));
  const base = Math.max(0, g - wageDeduct - personal - pension - insurance - card);
  const computed = basicTax(base);
  const wageCreditCap = g <= 33_000_000 ? 740_000 : g <= 70_000_000 ? Math.max(660_000, 740_000 - (g - 33_000_000) * 0.008) : Math.max(500_000, 660_000 - (g - 70_000_000) / 2);
  const wageCredit = Math.min(wageCreditCap, computed <= 1_300_000 ? computed * 0.55 : 715_000 + (computed - 1_300_000) * 0.3);
  const childCredit = input.children <= 0 ? 0 : input.children === 1 ? 250_000 : input.children === 2 ? 550_000 : 550_000 + (input.children - 2) * 400_000;
  const special = Math.min(input.insurance, 1_000_000) * 0.12 + Math.max(0, input.medical - g * 0.03) * 0.15 + input.education * 0.15 + input.donation * 0.15;
  const specialCredit = special > 130_000 ? special : 130_000; // 표준세액공제 13만 원과 비교
  const decided = floor10(Math.max(0, computed - wageCredit - childCredit - specialCredit));
  const paid = sum('incomeTax');
  return {
    name, months: slips.length, total, wageDeduct, personal, pension, insurance, card, base, computed, wageCredit, childCredit, specialCredit,
    decided, local: floor10(decided * 0.1), paid, paidLocal: sum('localTax'), diff: decided - paid, diffLocal: floor10(decided * 0.1) - sum('localTax'), input, done: input.done,
  };
}

export function confirmYearEnd(state: ErpState, year: string, name: string, today = date()) {
  const cur = ((state.hr.yearEnd[year] ||= {})[name] ||= emptyYearEnd());
  if (cur.done) throw Error('이미 확정했어요.');
  cur.done = today;
  return cur;
}
export function undoYearEnd(state: ErpState, year: string, name: string) {
  const cur = state.hr.yearEnd[year]?.[name];
  if (!cur?.done) throw Error('확정하지 않은 직원이에요.');
  delete cur.done;
}

/* ───────── 지급명세서 ───────── */

export type StatementKind = '근로소득' | '근로 간이' | '일용근로' | '사업소득 간이' | '사업소득' | '기타소득' | '이자 · 배당' | '퇴직소득';

/** Every statement the company owes for a year, with its due date and whether it was marked submitted. */
export function statementSchedule(state: ErpState, year: string) {
  const next = String(Number(year) + 1);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const rows: { kind: StatementKind; period: string; due: string; people: number; amount: number; key: string; submitted?: string }[] = [];
  const push = (kind: StatementKind, period: string, due: string, people: number, amount: number) => {
    if (!people) return;
    const key = `${kind}|${period}`;
    rows.push({ kind, period, due, people, amount, key, submitted: state.hr.statements[key] });
  };
  months.forEach(m => {
    const daily = state.books.dailyWork.filter(w => w.paidAt && monthOf(w.paidAt) === m);
    push('일용근로', m, lastDay(addMonths(m, 1)), new Set(daily.map(w => w.name)).size, daily.reduce((t, w) => t + w.days * w.wage, 0));
    const biz = state.books.otherIncome.filter(o => o.kind === '사업소득' && monthOf(o.date) === m);
    push('사업소득 간이', m, lastDay(addMonths(m, 1)), new Set(biz.map(o => o.name)).size, biz.reduce((t, o) => t + o.gross, 0));
  });
  [['상반기', months.slice(0, 6), `${year}-07-31`], ['하반기', months.slice(6), `${next}-01-31`]].forEach(([label, ms, due]) => {
    const runs = state.payrolls.filter(r => (ms as string[]).includes(r.month));
    push('근로 간이', `${year} ${label}`, due as string, Math.max(0, ...runs.map(r => r.headcount)), runs.reduce((t, r) => t + r.gross, 0));
  });
  const runs = state.payrolls.filter(r => r.month.startsWith(year));
  push('근로소득', year, `${next}-03-10`, new Set(runs.flatMap(r => (r.slips ?? []).map(p => p.name))).size || Math.max(0, ...runs.map(r => r.headcount)), runs.reduce((t, r) => t + r.gross, 0));
  const yearly = (kinds: string[]) => state.books.otherIncome.filter(o => kinds.includes(o.kind) && o.date.startsWith(year));
  push('사업소득', year, `${next}-03-10`, new Set(yearly(['사업소득']).map(o => o.name)).size, yearly(['사업소득']).reduce((t, o) => t + o.gross, 0));
  push('기타소득', year, `${next}-02-28`, new Set(yearly(['기타소득']).map(o => o.name)).size, yearly(['기타소득']).reduce((t, o) => t + o.gross, 0));
  push('이자 · 배당', year, `${next}-02-28`, new Set(yearly(['이자소득', '배당소득']).map(o => o.name)).size, yearly(['이자소득', '배당소득']).reduce((t, o) => t + o.gross, 0));
  const sev = state.hr.severance.filter(s => s.paidAt?.startsWith(year));
  push('퇴직소득', year, `${next}-03-10`, sev.length, sev.reduce((t, s) => t + s.amount, 0));
  return rows.sort((a, b) => a.due.localeCompare(b.due));
}

export function markStatement(state: ErpState, key: string, today = date()) {
  if (state.hr.statements[key]) throw Error('이미 제출로 표시했어요.');
  state.hr.statements[key] = today;
}

/* ───────── Sample data ───────── */

export function seedHr(state: ErpState) {
  state.hr = emptyHr();
  state.hr.overtime.push({ id: 'OT-SEED-1', name: '이서윤', month: '2026-09', overtime: 12, night: 2, holiday: 0 });
  state.hr.bonuses.push({ id: 'BN-SEED-1', name: '정우진', month: '2026-10', amount: 500000, desc: '분기 성과급' });
  state.hr.insuranceReports.push({ id: 'IR-SEED-1', name: '한도윤', kind: '취득', date: '2026-04-01', status: '신고 완료' });
  (state.hr.yearEnd['2026'] ||= {})['민서'] = { cardSpend: 18_000_000, insurance: 1_200_000, medical: 2_400_000, education: 0, donation: 300_000, children: 1 };
}
