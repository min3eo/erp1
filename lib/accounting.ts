/* Journal entries derived from transactions (never stored), plus trial balance and income summary. */
import type { ErpState, Movement } from './flow-core';
import { withVat } from './finance';

export type AccountType = '자산' | '부채' | '자본' | '수익' | '비용';
export const ACCOUNTS: Record<string, AccountType> = {
  보통예금: '자산', 외상매출금: '자산', 재고자산: '자산', 재공품: '자산', 부가세대급금: '자산',
  외상매입금: '부채', 부가세예수금: '부채', 예수금: '부채', 미지급급여: '부채',
  기초자본: '자본',
  매출: '수익', 재고조정이익: '수익',
  매출원가: '비용', 급여: '비용', 재고자산감모손실: '비용',
};

export type Source = '기초' | '판매' | '구매' | '재고' | '생산' | '수금' | '지급' | '급여';
export interface JournalLine { account: string; debit: number; credit: number }
export interface JournalEntry { id: string; date: string; source: Source; desc: string; ref: string; lines: JournalLine[] }

/** Builds balanced lines from signed amounts: positive = the side given, negative flips it. */
function lines(...pairs: [string, string, number][]): JournalLine[] {
  return pairs
    .filter(([, , v]) => Math.round(v) !== 0)
    .flatMap(([dr, cr, v]) => {
      const a = Math.round(Math.abs(v));
      return v > 0 ? [{ account: dr, debit: a, credit: 0 }, { account: cr, debit: 0, credit: a }] : [{ account: cr, debit: a, credit: 0 }, { account: dr, debit: 0, credit: a }];
    });
}

function fromMovement(state: ErpState, m: Movement): JournalEntry | null {
  const cost = (state.items.find(i => i[0] === m.code)?.[6] ?? 0) * m.qty;
  const base = { id: 'J-' + m.id, date: m.date, ref: m.ref };
  const order = state.orders.find(o => o.id === m.ref);
  const sale = state.sales.find(s => s.id === m.ref);

  switch (m.type) {
    case '기초 재고':
      return { ...base, source: '기초', desc: `${m.name} 기초 재고`, lines: lines(['재고자산', '기초자본', cost]) };
    case '구매 입고':
    case '입고 취소':
    case '구매 반품': {
      if (!order) return null;
      const v = withVat(Math.abs(m.qty) * order.price);
      const sign = m.qty > 0 ? 1 : -1;
      return {
        ...base, source: '구매', desc: `${order.vendor} · ${m.name} ${m.type}`,
        lines: [...lines(['재고자산', '외상매입금', sign * v.supply]), ...lines(['부가세대급금', '외상매입금', sign * v.vat])],
      };
    }
    case '판매 출고':
    case '출고 취소':
    case '판매 반품': {
      if (!sale) return null;
      const units = -m.qty; // shipments are negative stock moves
      const v = withVat(Math.abs(units) * sale.price);
      const sign = units > 0 ? 1 : -1;
      return {
        ...base, source: '판매', desc: `${sale.customer} · ${m.name} ${m.type}`,
        lines: [
          ...lines(['외상매출금', '매출', sign * v.supply]),
          ...lines(['외상매출금', '부가세예수금', sign * v.vat]),
          ...lines(['매출원가', '재고자산', -cost]),
        ],
      };
    }
    case '재고 조정':
      return { ...base, source: '재고', desc: `${m.name} 실사 조정`, lines: cost >= 0 ? lines(['재고자산', '재고조정이익', cost]) : lines(['재고자산감모손실', '재고자산', -cost]) };
    case '생산 출고':
      return { ...base, source: '생산', desc: `${m.name} 생산 투입`, lines: lines(['재공품', '재고자산', -cost]) };
    case '생산 입고':
      return { ...base, source: '생산', desc: `${m.name} 생산 완료`, lines: lines(['재고자산', '재공품', cost]) };
    default:
      return null;
  }
}

export function journal(state: ErpState): JournalEntry[] {
  const fromStock = state.movements.map(m => fromMovement(state, m)).filter((e): e is JournalEntry => !!e && e.lines.length > 0);
  const fromPay: JournalEntry[] = state.payments.map(p => ({
    id: 'J-' + p.id, date: p.date, source: p.kind, ref: p.docId, desc: `${p.partner} ${p.kind} (${p.method})`,
    lines: p.kind === '수금' ? lines(['보통예금', '외상매출금', p.amount]) : lines(['외상매입금', '보통예금', p.amount]),
  }));
  // Receipts finished before the demo started live in opening stock without a movement; book their payable as an opening balance.
  const fromOpening: JournalEntry[] = state.orders.flatMap(o => {
    const moved = state.movements.filter(m => m.ref === o.id && (m.type === '구매 입고' || m.type === '입고 취소')).reduce((t, m) => t + m.qty, 0);
    const before = o.received - moved;
    if (before <= 0) return [];
    const v = withVat(before * o.price);
    return [{ id: 'J-OPEN-' + o.id, date: o.date.replace(/\./g, '-'), source: '기초' as Source, ref: o.id, desc: `${o.vendor} 기초 미지급 (시안 시작 전 입고)`, lines: lines(['기초자본', '외상매입금', v.total]) }];
  });
  const fromPayroll: JournalEntry[] = state.payrolls.map(r => ({
    id: 'J-PAY-' + r.month, date: `${r.month}-25`, source: '급여', ref: r.month, desc: `${r.month} 급여 확정 (${r.headcount}명)`,
    lines: [{ account: '급여', debit: r.gross, credit: 0 }, { account: '예수금', debit: 0, credit: r.deductions }, { account: '미지급급여', debit: 0, credit: r.net }],
  }));
  return [...fromOpening, ...fromStock, ...fromPay, ...fromPayroll].sort((a, b) => b.date.localeCompare(a.date));
}

export interface TrialRow { account: string; type: AccountType; debit: number; credit: number; balance: number }

/** Balance is shown on the account's normal side (assets/expenses: debit − credit). */
export function trialBalance(entries: JournalEntry[]): TrialRow[] {
  const map = new Map<string, { debit: number; credit: number }>();
  entries.forEach(e => e.lines.forEach(l => {
    const r = map.get(l.account) ?? { debit: 0, credit: 0 };
    r.debit += l.debit;
    r.credit += l.credit;
    map.set(l.account, r);
  }));
  const order = Object.keys(ACCOUNTS);
  return [...map.entries()]
    .map(([account, r]) => {
      const type = ACCOUNTS[account] ?? '비용';
      const debitNormal = type === '자산' || type === '비용';
      return { account, type, ...r, balance: debitNormal ? r.debit - r.credit : r.credit - r.debit };
    })
    .sort((a, b) => order.indexOf(a.account) - order.indexOf(b.account));
}

export function incomeSummary(rows: TrialRow[]) {
  const bal = (a: string) => rows.find(r => r.account === a)?.balance ?? 0;
  const revenue = bal('매출');
  const cogs = bal('매출원가');
  const gross = revenue - cogs;
  const sga = bal('급여');
  const operating = gross - sga;
  const other = bal('재고조정이익') - bal('재고자산감모손실');
  return { revenue, cogs, gross, sga, operating, other, net: operating + other, margin: revenue ? gross / revenue : 0 };
}
