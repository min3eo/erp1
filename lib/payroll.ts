/* Monthly payroll with Korean social insurance and withholding. Rates are sample assumptions for the demo. */
import type { ErpState } from './flow-core';

export interface Salary { name: string; base: number; meal: number; allowance: number; dependents: number }
/** A confirmed month keeps its own totals, so later salary edits never rewrite past books. */
export interface PayrollRun { month: string; confirmedAt: string; headcount: number; gross: number; deductions: number; net: number }

/** Sample employee-side rates. Check the current year's notices before using for real filings. */
export const RATES = {
  pension: 0.0475, // 국민연금
  health: 0.03595, // 건강보험
  longTermCare: 0.1314, // 장기요양 (건강보험료 대비)
  employment: 0.009, // 고용보험
  localTax: 0.1, // 지방소득세 (소득세 대비)
};
export const MEAL_TAX_FREE = 200000;

export function seedSalaries(): Salary[] {
  return [
    { name: '민서', base: 4200000, meal: 200000, allowance: 300000, dependents: 1 },
    { name: '김하늘', base: 3600000, meal: 200000, allowance: 100000, dependents: 1 },
    { name: '박지호', base: 3500000, meal: 200000, allowance: 150000, dependents: 2 },
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
  name: string; base: number; meal: number; allowance: number; gross: number; taxable: number;
  pension: number; health: number; longTermCare: number; employment: number; incomeTax: number; localTax: number;
  deductions: number; net: number;
}

export function payslip(s: Salary): Payslip {
  const gross = s.base + s.meal + s.allowance;
  const taxable = gross - Math.min(s.meal, MEAL_TAX_FREE);
  const pension = floor10(taxable * RATES.pension);
  const health = floor10(taxable * RATES.health);
  const longTermCare = floor10(health * RATES.longTermCare);
  const employment = floor10(taxable * RATES.employment);
  const tax = incomeTax(taxable, s.dependents);
  const localTax = floor10(tax * RATES.localTax);
  const deductions = pension + health + longTermCare + employment + tax + localTax;
  return { name: s.name, base: s.base, meal: s.meal, allowance: s.allowance, gross, taxable, pension, health, longTermCare, employment, incomeTax: tax, localTax, deductions, net: gross - deductions };
}

export const payslips = (state: ErpState) => state.salaries.map(payslip);

export function totals(list: Payslip[]) {
  const sum = (k: keyof Payslip) => list.reduce((t, p) => t + (p[k] as number), 0);
  return { gross: sum('gross'), deductions: sum('deductions'), net: sum('net'), insurance: sum('pension') + sum('health') + sum('longTermCare') + sum('employment'), tax: sum('incomeTax') + sum('localTax') };
}

export function confirmPayroll(state: ErpState, month: string, today: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw Error('귀속 월을 확인해 주세요.');
  if (state.payrolls.some(p => p.month === month)) throw Error(`${month} 급여는 이미 확정했어요.`);
  if (!state.salaries.length) throw Error('급여 대상자가 없어요.');
  const t = totals(payslips(state));
  const run: PayrollRun = { month, confirmedAt: today, headcount: state.salaries.length, gross: t.gross, deductions: t.deductions, net: t.net };
  state.payrolls.unshift(run);
  return run;
}

export function updateSalary(state: ErpState, name: string, f: { base: string | number; allowance: string | number; dependents: string | number }) {
  const s = state.salaries.find(x => x.name === name);
  if (!s) throw Error('대상자를 찾을 수 없어요.');
  const base = Number(f.base), allowance = Number(f.allowance), dependents = Number(f.dependents);
  if (!Number.isInteger(base) || base < 0) throw Error('기본급은 0 이상의 정수로 입력해 주세요.');
  if (!Number.isInteger(allowance) || allowance < 0) throw Error('수당은 0 이상의 정수로 입력해 주세요.');
  if (!Number.isInteger(dependents) || dependents < 1 || dependents > 11) throw Error('부양가족 수(본인 포함)는 1~11명으로 입력해 주세요.');
  Object.assign(s, { base, allowance, dependents });
  return s;
}
