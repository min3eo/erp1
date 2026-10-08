/* Monthly payroll with Korean social insurance and withholding. Rates are sample assumptions for the demo. */
import { lastDay } from './books';
import { date, type ErpState } from './flow-core';
import { activeIn, overtimePay } from './hr';

/** car · childcare: 비과세 자가운전보조금 · 육아수당 (각 월 20만 원 한도). */
export interface Salary { name: string; base: number; meal: number; allowance: number; dependents: number; car?: number; childcare?: number }
/** A confirmed month keeps its own totals and slips, so later salary edits never rewrite past books. */
export interface PayrollRun {
  month: string; confirmedAt: string; headcount: number; gross: number; deductions: number; net: number;
  /** Withheld income tax and local tax, for the 원천세 report. Absent on runs confirmed before it was kept. */
  incomeTax?: number; localTax?: number;
  slips?: Payslip[];
}

/** Sample employee-side rates. Check the current year's notices before using for real filings. */
export const RATES = {
  pension: 0.0475, // 국민연금
  health: 0.03595, // 건강보험
  longTermCare: 0.1314, // 장기요양 (건강보험료 대비)
  employment: 0.009, // 고용보험
  localTax: 0.1, // 지방소득세 (소득세 대비)
};
export const MEAL_TAX_FREE = 200000;
export const NON_TAX_LIMIT = 200000;

export function seedSalaries(): Salary[] {
  return [
    { name: '민서', base: 4200000, meal: 200000, allowance: 300000, dependents: 1 },
    { name: '김하늘', base: 3600000, meal: 200000, allowance: 100000, dependents: 1, childcare: 200000 },
    { name: '박지호', base: 3500000, meal: 200000, allowance: 150000, dependents: 2, car: 200000 },
    { name: '이서윤', base: 3400000, meal: 200000, allowance: 100000, dependents: 1 },
    { name: '정우진', base: 4500000, meal: 200000, allowance: 400000, dependents: 3 },
    { name: '한도윤', base: 3800000, meal: 200000, allowance: 100000, dependents: 1 },
  ];
}

const floor10 = (n: number) => Math.floor(n / 10) * 10;

/**
 * Simplified monthly income tax: progressive rates on taxable pay after a flat
 * earned-income deduction and 150,000 KRW per dependent. An approximation of the NTS table, not a substitute.
 */
export function incomeTax(taxable: number, dependents: number) {
  const annual = taxable * 12;
  const deduction = Math.min(annual * 0.3, 15000000) + dependents * 1500000;
  const base = Math.max(0, annual - deduction);
  const brackets: [number, number][] = [[14000000, 0.06], [50000000, 0.15], [88000000, 0.24], [150000000, 0.35], [Infinity, 0.38]];
  let tax = 0, prev = 0;
  for (const [limit, rate] of brackets) {
    if (base <= prev) break;
    tax += (Math.min(base, limit) - prev) * rate;
    prev = limit;
  }
  const credit = Math.min(tax * 0.55, 740000);
  return floor10(Math.max(0, tax - credit) / 12);
}

export interface Payslip {
  name: string; base: number; meal: number; allowance: number; car: number; childcare: number; overtime: number; bonus: number;
  gross: number; nonTax: number; taxable: number;
  pension: number; health: number; longTermCare: number; employment: number; incomeTax: number; localTax: number;
  deductions: number; net: number;
  /** Worked days / calendar days when someone joins or leaves mid-month. */
  days?: { worked: number; total: number };
}

export interface PayContext { days?: { worked: number; total: number }; overtime?: number; bonus?: number }

export function payslip(s: Salary, ctx: PayContext = {}): Payslip {
  const ratio = ctx.days ? ctx.days.worked / ctx.days.total : 1;
  const pro = (n: number) => floor10(n * ratio);
  const base = pro(s.base), allowance = pro(s.allowance), meal = pro(s.meal), car = pro(s.car ?? 0), childcare = pro(s.childcare ?? 0);
  const overtime = ctx.overtime ?? 0, bonus = ctx.bonus ?? 0;
  const gross = base + meal + allowance + car + childcare + overtime + bonus;
  const nonTax = Math.min(meal, MEAL_TAX_FREE) + Math.min(car, NON_TAX_LIMIT) + Math.min(childcare, NON_TAX_LIMIT);
  const taxable = gross - nonTax;
  const pension = floor10(taxable * RATES.pension);
  const health = floor10(taxable * RATES.health);
  const longTermCare = floor10(health * RATES.longTermCare);
  const employment = floor10(taxable * RATES.employment);
  const tax = incomeTax(taxable, s.dependents);
  const localTax = floor10(tax * RATES.localTax);
  const deductions = pension + health + longTermCare + employment + tax + localTax;
  return {
    name: s.name, base, meal, allowance, car, childcare, overtime, bonus, gross, nonTax, taxable, pension, health, longTermCare, employment,
    incomeTax: tax, localTax, deductions, net: gross - deductions, ...(ctx.days && { days: ctx.days }),
  };
}

/** Pay slips for everyone on the payroll in the month, with proration, overtime and bonuses for that month. */
export function payslips(state: ErpState, month = date().slice(0, 7)) {
  const total = Number(lastDay(month).slice(8));
  const employees = state.employees ?? [];
  return state.salaries
    .filter(s => {
      const e = employees.find(x => x.name === s.name);
      return !e || activeIn(e, month);
    })
    .map(s => {
      const e = employees.find(x => x.name === s.name);
      const from = e && e.joined > `${month}-01` ? Number(e.joined.slice(8)) : 1;
      const to = e?.left && e.left < lastDay(month) ? Number(e.left.slice(8)) : total;
      const worked = to - from + 1;
      const bonus = (state.hr?.bonuses ?? []).filter(b => b.name === s.name && b.month === month).reduce((t, b) => t + b.amount, 0);
      return payslip(s, { ...(worked < total && { days: { worked, total } }), overtime: state.hr ? overtimePay(state, s.name, month) : 0, bonus });
    });
}

export function totals(list: Payslip[]) {
  const sum = (k: keyof Payslip) => list.reduce((t, p) => t + (p[k] as number), 0);
  return { gross: sum('gross'), deductions: sum('deductions'), net: sum('net'), insurance: sum('pension') + sum('health') + sum('longTermCare') + sum('employment'), tax: sum('incomeTax') + sum('localTax') };
}

export function confirmPayroll(state: ErpState, month: string, today: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw Error('귀속 월을 확인해 주세요.');
  if (state.admin?.closedThrough && month <= state.admin.closedThrough) throw Error(`${state.admin.closedThrough}까지 마감됐어요.`);
  if (state.payrolls.some(p => p.month === month)) throw Error(`${month} 급여는 이미 확정했어요.`);
  const list = payslips(state, month);
  if (!list.length) throw Error('급여 대상자가 없어요.');
  const t = totals(list);
  const run: PayrollRun = {
    month, confirmedAt: today, headcount: list.length, gross: t.gross, deductions: t.deductions, net: t.net,
    incomeTax: list.reduce((s, p) => s + p.incomeTax, 0), localTax: list.reduce((s, p) => s + p.localTax, 0), slips: list,
  };
  state.payrolls.unshift(run);
  return run;
}

export function updateSalary(state: ErpState, name: string, f: { base: string | number; allowance: string | number; dependents: string | number; car?: string | number; childcare?: string | number }) {
  const s = state.salaries.find(x => x.name === name);
  if (!s) throw Error('대상자를 찾을 수 없어요.');
  const base = Number(f.base), allowance = Number(f.allowance), dependents = Number(f.dependents), car = Number(f.car ?? s.car ?? 0), childcare = Number(f.childcare ?? s.childcare ?? 0);
  if (!Number.isInteger(base) || base < 0) throw Error('기본급은 0 이상의 정수로 입력해 주세요.');
  if (!Number.isInteger(allowance) || allowance < 0) throw Error('수당은 0 이상의 정수로 입력해 주세요.');
  if (!Number.isInteger(dependents) || dependents < 1 || dependents > 11) throw Error('부양가족 수(본인 포함)는 1~11명으로 입력해 주세요.');
  if (![car, childcare].every(v => Number.isInteger(v) && v >= 0)) throw Error('비과세 수당은 0 이상의 정수로 입력해 주세요.');
  Object.assign(s, { base, allowance, dependents, car, childcare });
  return s;
}

/** Bank transfer list for a confirmed month (CSV for the bank's bulk transfer upload). */
export function transferCsv(state: ErpState, month: string) {
  const run = state.payrolls.find(r => r.month === month);
  const slips = run?.slips ?? payslips(state, month);
  const lines = [['이름', '은행', '계좌번호', '이체 금액', '적요'], ...slips.map(p => {
    const e = state.employees.find(x => x.name === p.name);
    return [p.name, e?.bank ?? '', e?.account ?? '', String(p.net), `${month} 급여`];
  })];
  return lines.map(l => l.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
