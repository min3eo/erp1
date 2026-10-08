/* Journal entries derived from transactions (never stored), plus trial balance and income summary. */
import { ACCOUNTS, NON_OPERATING, TAX_EXPENSE, depreciation, dailyTax, fundAccount, lastDay, otherIncomeTax, settleLine, type AccountType, type Fund } from './books';
import { date, type ErpState, type Movement } from './flow-core';
import { withVat } from './finance';
import { yearEndCalc } from './hr';
import { loanEntries } from './loans';
import { fxEntries } from './forex';
import { costLedger } from './inventory';

export { ACCOUNTS, type AccountType } from './books';

export type Source = '기초' | '판매' | '구매' | '재고' | '생산' | '수금' | '지급' | '급여' | '전표' | '매출매입' | '자산' | '경비' | '세무' | '결산';
/** fund: the bank account, card or cash box a 보통예금 · 현금 · 미지급금 line moves. */
export interface JournalLine { account: string; debit: number; credit: number; fund?: string; partner?: string }
/** partner: the 거래처 the entry is with (a line's own partner wins), for the 거래처원장. */
export interface JournalEntry { id: string; date: string; source: Source; desc: string; ref: string; lines: JournalLine[]; partner?: string; dept?: string; project?: string }

/** Builds balanced lines from signed amounts: positive = the side given, negative flips it. */
function lines(...pairs: [string, string, number][]): JournalLine[] {
  return pairs
    .filter(([, , v]) => Math.round(v) !== 0)
    .flatMap(([dr, cr, v]) => {
      const a = Math.round(Math.abs(v));
      return v > 0 ? [{ account: dr, debit: a, credit: 0 }, { account: cr, debit: 0, credit: a }] : [{ account: cr, debit: a, credit: 0 }, { account: dr, debit: 0, credit: a }];
    });
}
const dr = (account: string, amount: number, fund?: string): JournalLine => ({ account, debit: amount, credit: 0, ...(fund && { fund }) });
const cr = (account: string, amount: number, fund?: string): JournalLine => ({ account, debit: 0, credit: amount, ...(fund && { fund }) });

/** `cost` is the movement's value from the moving-average cost ledger (signed like the quantity). */
function fromMovement(state: ErpState, m: Movement, cost: number): JournalEntry | null {
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
        ...base, source: '구매', partner: order.vendor, desc: `${order.vendor} · ${m.name} ${m.type}`,
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
        ...base, source: '판매', partner: sale.customer, desc: `${sale.customer} · ${m.name} ${m.type}`,
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
    {
      // 가공비 applied to the order moves out of expenses (가공비배부) into 재공품, then into the product with the materials.
      const wo = state.workOrders.find(w => w.id === m.ref);
      const conversion = Math.round((wo?.conversion ?? 0) * m.qty);
      return { ...base, source: '생산', desc: `${m.name} 생산 완료`, lines: [...lines(['재공품', '가공비배부', conversion]), ...lines(['재고자산', '재공품', cost])] };
    }
    default:
      return null;
  }
}

/** The money account a receipt or payment moves, by payment method. */
function paymentAccount(kind: '수금' | '지급', method: string) {
  if (method === '현금') return '현금';
  if (method === '매출할인') return '매출할인';
  if (method === '매입할인') return '매입할인';
  if (method === '선수금 대체') return '선수금';
  if (method === '선급금 대체') return '선급금';
  return '보통예금';
}

/** Entries from the 회계 · 자금 · 세무 records in state.books. */
function fromBooks(state: ErpState, today: string): JournalEntry[] {
  const b = state.books;
  const out: JournalEntry[] = [];
  const push = (e: JournalEntry) => { if (e.lines.length) out.push(e); };

  b.funds.filter(f => f.kind !== '카드' && f.opening > 0).forEach(f => push({
    id: 'J-FUND-' + f.id, date: '2026-01-01', source: '기초', ref: f.id, desc: `${f.name} 기초 잔액`,
    lines: [dr(fundAccount(f), f.opening, f.id), cr('기초자본', f.opening)],
  }));

  // 기초 이월: account openings on their normal side, plus partner opening AR / AP, balanced into 이월이익잉여금.
  const types = { ...ACCOUNTS, ...Object.fromEntries(b.accounts.map(a => [a.name, a.type])) };
  const opening: JournalLine[] = [
    ...Object.entries(b.opening ?? {}).map(([account, amount]) => (types[account] === '자산' || types[account] === '비용' ? dr(account, amount) : cr(account, amount))),
    ...(b.partnerOpening ?? []).map(o => ({ ...(o.side === '채권' ? dr('미수금', o.amount) : cr('미지급금', o.amount)), partner: o.partner })),
  ];
  if (opening.length) {
    const diff = opening.reduce((t, l) => t + l.debit - l.credit, 0);
    if (diff) opening.push(diff > 0 ? cr('이월이익잉여금', diff) : dr('이월이익잉여금', -diff));
    push({ id: 'J-OPENING', date: today.slice(0, 4) + '-01-01', source: '기초', ref: 'OPENING', desc: '전기 이월 기초 잔액', lines: opening });
  }

  b.advances.forEach(a => {
    const fund = b.funds.find(f => f.id === a.fund);
    if (!fund) return;
    push({
      id: 'J-' + a.id, date: a.date, source: a.kind === '선수금' ? '수금' : '지급', ref: a.id, partner: a.partner, desc: `${a.partner} ${a.kind}${a.memo ? ' · ' + a.memo : ''}`,
      lines: a.kind === '선수금' ? [dr(fundAccount(fund), a.amount, fund.id), cr('선수금', a.amount)] : [dr('선급금', a.amount), cr(fundAccount(fund), a.amount, fund.id)],
    });
  });

  loanEntries(b).forEach(push);
  fxEntries(b).forEach(push);

  b.vouchers.forEach(v => push({ id: 'J-' + v.id, date: v.date, source: v.origin === '결산' ? '결산' : '전표', ref: v.id, ...(v.partner && { partner: v.partner }), ...(v.dept && { dept: v.dept }), ...(v.project && { project: v.project }), desc: v.desc + (v.partner ? ` · ${v.partner}` : ''), lines: v.lines }));

  b.trades.forEach(t => {
    const s = settleLine(state, t.settle, t.kind);
    const total = t.supply + t.vat;
    // 불공제 매입세액 joins the cost. Amendments may be negative: a negative line flips to the other side.
    const cost = t.nonDeductible ? total : t.supply, input = t.nonDeductible ? 0 : t.vat;
    const raw: JournalLine[] = t.kind === '매출'
      ? [dr(s.account, total, s.fund), cr(t.account, t.supply), ...(t.vat ? [cr('부가세예수금', t.vat)] : [])]
      : [dr(t.account, cost), ...(input ? [dr('부가세대급금', input)] : []), cr(s.account, total, s.fund)];
    push({
      id: 'J-' + t.id, date: t.date, source: '매출매입', ref: t.id, partner: t.partner, desc: `${t.partner} · ${t.desc}`, ...(t.dept && { dept: t.dept }), ...(t.project && { project: t.project }),
      lines: raw.map(l => (l.debit < 0 || l.credit < 0 ? { ...l, debit: -l.credit, credit: -l.debit } : l)),
    });
  });

  b.assets.forEach(a => {
    const s = settleLine(state, a.settle, '매입');
    push({ id: 'J-' + a.id, date: a.date, source: '자산', ref: a.id, desc: `${a.name} 취득`, lines: [dr('유형자산', a.cost), cr(s.account, a.cost, s.fund)] });
    const dep = depreciation(a, a.disposed ?? today);
    dep.rows.forEach(r => push({
      id: `J-${a.id}-${r.month}`, date: [lastDay(r.month), a.disposed ?? '9999'].sort()[0], source: '자산', ref: a.id, desc: `${a.name} ${r.month} 감가상각`,
      lines: [dr('감가상각비', r.amount), cr('감가상각누계액', r.amount)],
    }));
    (a.capex ?? []).forEach((c, i) => {
      const cs = settleLine(state, c.settle, '매입');
      push({ id: `J-${a.id}-CX${i}`, date: c.date, source: '자산', ref: a.id, desc: `${a.name} 자본적 지출 · ${c.desc}`, lines: [dr('유형자산', c.amount), cr(cs.account, c.amount, cs.fund)] });
    });
    if (a.disposed) {
      // 매각: cash + VAT in, book value out; the difference is 처분이익 or 처분손실. 폐기: the whole book value is a loss.
      const price = a.sale?.price ?? 0, vat = a.sale?.vat ?? 0;
      const fund = a.sale ? b.funds.find(f => f.id === a.sale!.fund) : undefined;
      const gain = price - dep.book;
      push({
        id: `J-${a.id}-OUT`, date: a.disposed, source: '자산', ref: a.id, desc: `${a.name} ${a.sale ? `매각 (${price.toLocaleString()}원)` : '처분 (폐기)'}`,
        lines: [
          ...(fund ? [dr(fundAccount(fund), price + vat, fund.id)] : []),
          dr('감가상각누계액', dep.accumulated),
          ...(gain < 0 ? [dr('유형자산처분손실', -gain)] : []),
          cr('유형자산', dep.cost),
          ...(vat ? [cr('부가세예수금', vat)] : []),
          ...(gain > 0 ? [cr('유형자산처분이익', gain)] : []),
        ].filter(l => l.debit || l.credit),
      });
    }
  });

  b.expenses.filter(e => e.status === '승인 완료' || e.status === '지급 완료').forEach(e => {
    push({ id: 'J-' + e.id, date: e.date, source: '경비', ref: e.id, desc: `${e.person} · ${e.desc}`, ...(e.dept && { dept: e.dept }), ...(e.project && { project: e.project }), lines: [dr(e.account, e.amount), cr('미지급금', e.amount, e.card)] });
    if (e.paidAt) push({ id: `J-${e.id}-PAY`, date: e.paidAt, source: '경비', ref: e.id, desc: `${e.person} 경비 지급`, lines: [dr('미지급금', e.amount), cr('보통예금', e.amount)] });
  });

  b.dailyWork.filter(w => w.paidAt).forEach(w => {
    const t = dailyTax(w);
    const withheld = t.tax + t.local + t.employment;
    push({ id: 'J-' + w.id, date: w.paidAt!, source: '급여', ref: w.month, desc: `${w.name} ${w.month} 일용 노임 (${w.days}일)`, lines: [dr('잡급', t.gross), ...(withheld ? [cr('예수금', withheld)] : []), cr('보통예금', t.net)] });
  });

  b.otherIncome.forEach(o => {
    const t = otherIncomeTax(o.kind, o.gross);
    push({ id: 'J-' + o.id, date: o.date, source: '지급', ref: o.id, desc: `${o.name} ${o.kind} · ${o.desc}`, lines: [dr(o.account, o.gross), ...(t.tax ? [cr('예수금', t.tax + t.local)] : []), cr('보통예금', t.net)] });
  });

  b.filings.forEach(f => {
    if (f.kind === '중간예납') return push({ id: 'J-' + f.id, date: f.date, source: '세무', ref: f.period, desc: `${f.period} 법인세 중간예납`, lines: [dr('선납세금', f.amount), cr('보통예금', f.amount)] });
    if (f.kind === '원천세') return push({ id: 'J-' + f.id, date: f.date, source: '세무', ref: f.period, desc: `${f.period} 원천세 납부`, lines: [dr('예수금', f.amount), cr('보통예금', f.amount)] });
    const output = f.output ?? 0, input = f.input ?? 0;
    push({
      id: 'J-' + f.id, date: f.date, source: '세무', ref: f.period, desc: `${f.period} 부가세 신고 · ${f.amount >= 0 ? '납부' : '환급 신청'}`,
      lines: [
        ...(output ? [dr('부가세예수금', output)] : []),
        ...(f.amount < 0 ? [dr('미수금', -f.amount)] : []),
        ...(input ? [cr('부가세대급금', input)] : []),
        ...(f.amount > 0 ? [cr('보통예금', f.amount)] : []),
      ],
    });
  });
  return out;
}

export function journal(state: ErpState, today = date()): JournalEntry[] {
  const { byMovement } = costLedger(state);
  const fromStock = state.movements.map(m => fromMovement(state, m, byMovement.get(m.id)?.amount ?? 0)).filter((e): e is JournalEntry => !!e && e.lines.length > 0);
  const fromPay: JournalEntry[] = state.payments.map(p => {
    // 대손: the VAT part comes back off 부가세예수금 (대손세액공제), the rest is 대손상각비.
    if (p.method === '대손') {
      const vat = Math.round(p.amount / 11);
      return { id: 'J-' + p.id, date: p.date, source: p.kind, ref: p.docId, partner: p.partner, desc: `${p.partner} 대손 처리`, lines: [dr('대손상각비', p.amount - vat), dr('부가세예수금', vat), cr('외상매출금', p.amount)] };
    }
    // 매출 · 매입할인 (에누리) lowers the 과세표준 too: 1/11 of it comes off the VAT.
    if (p.method === '매출할인' || p.method === '매입할인') {
      const vat = Math.round(p.amount / 11);
      return {
        id: 'J-' + p.id, date: p.date, source: p.kind, ref: p.docId, partner: p.partner, desc: `${p.partner} ${p.method}`,
        lines: p.method === '매출할인'
          ? [dr('매출할인', p.amount - vat), dr('부가세예수금', vat), cr('외상매출금', p.amount)]
          : [dr('외상매입금', p.amount), cr('매입할인', p.amount - vat), cr('부가세대급금', vat)],
      };
    }
    const money = paymentAccount(p.kind, p.method);
    return {
      id: 'J-' + p.id, date: p.date, source: p.kind, ref: p.docId, partner: p.partner, desc: `${p.partner} ${p.kind} (${p.method})`,
      lines: (p.kind === '수금' ? lines([money, '외상매출금', p.amount]) : lines(['외상매입금', money, p.amount])).map(l => (p.fund && l.account === money ? { ...l, fund: p.fund } : l)),
    };
  });
  // Receipts finished before the demo started live in opening stock without a movement; book their payable as an opening balance.
  const fromOpening: JournalEntry[] = state.orders.flatMap(o => {
    const moved = state.movements.filter(m => m.ref === o.id && (m.type === '구매 입고' || m.type === '입고 취소')).reduce((t, m) => t + m.qty, 0);
    const before = o.received - moved;
    if (before <= 0) return [];
    const v = withVat(before * o.price);
    return [{ id: 'J-OPEN-' + o.id, date: o.date.replace(/\./g, '-'), source: '기초' as Source, ref: o.id, partner: o.vendor, desc: `${o.vendor} 기초 미지급 (시안 시작 전 입고)`, lines: [...lines(['기초자본', '외상매입금', v.supply]), ...lines(['부가세대급금', '외상매입금', v.vat])] }];
  });
  const fromPayroll: JournalEntry[] = state.payrolls.flatMap(r => [
    {
      id: 'J-PAY-' + r.month, date: `${r.month}-25`, source: '급여' as Source, ref: r.month, desc: `${r.month} 급여 확정 (${r.headcount}명)`,
      lines: [{ account: '급여', debit: r.gross, credit: 0 }, { account: '예수금', debit: 0, credit: r.deductions }, { account: '미지급급여', debit: 0, credit: r.net }],
    },
    { id: 'J-PAYOUT-' + r.month, date: `${r.month}-25`, source: '급여' as Source, ref: r.month, desc: `${r.month} 급여 이체`, lines: lines(['미지급급여', '보통예금', r.net]) },
  ]);
  return [...fromOpening, ...fromStock, ...fromPay, ...fromPayroll, ...fromHr(state), ...fromBooks(state, today)].sort((a, b) => b.date.localeCompare(a.date));
}

/** HR money flows: DC pension contributions, 4대보험 payments, severance and 연말정산 settlements. */
function fromHr(state: ErpState): JournalEntry[] {
  const out: JournalEntry[] = [];
  const dc = new Set((state.employees ?? []).filter(e => e.pension === 'DC').map(e => e.name));
  state.payrolls.forEach(r => {
    const amount = (r.slips ?? []).filter(p => dc.has(p.name)).reduce((t, p) => t + Math.round(p.gross / 12), 0);
    if (amount) out.push({ id: 'J-DC-' + r.month, date: `${r.month}-25`, source: '급여', ref: r.month, desc: `${r.month} 퇴직연금(DC) 부담금`, lines: lines(['퇴직급여', '보통예금', amount]) });
  });
  Object.entries(state.hr?.insurancePaid ?? {}).forEach(([month, p]) => out.push({
    id: 'J-INS-' + month, date: p.date, source: '세무', ref: month, desc: `${month} 4대보험 납부`,
    lines: [
      { account: '예수금', debit: p.employee, credit: 0 },
      { account: '세금과공과', debit: p.pensionEmployer, credit: 0 },
      { account: '복리후생비', debit: p.employer - p.pensionEmployer, credit: 0 },
      { account: '보통예금', debit: 0, credit: p.employee + p.employer },
    ].filter(l => l.debit || l.credit),
  }));
  (state.hr?.severance ?? []).filter(s => s.paidAt).forEach(s => out.push({
    id: `J-SEV-${s.name}-${s.date}`, date: s.paidAt!, source: '급여', ref: s.name, desc: `${s.name} 퇴직금 지급`,
    lines: [{ account: '퇴직급여', debit: s.amount, credit: 0 }, ...(s.tax ? [{ account: '예수금', debit: 0, credit: s.tax + s.local }] : []), { account: '보통예금', debit: 0, credit: s.amount - s.tax - s.local }],
  }));
  Object.entries(state.hr?.yearEnd ?? {}).forEach(([year, people]) => Object.entries(people).filter(([, v]) => v.done).forEach(([name, v]) => {
    const c = yearEndCalc(state, year, name);
    const diff = c.diff + c.diffLocal; // + 추가 징수 (employee pays), − 환급
    if (diff) out.push({ id: `J-YE-${year}-${name}`, date: v.done!, source: '급여', ref: year, desc: `${name} ${year} 연말정산 ${diff > 0 ? '추가 징수' : '환급'}`, lines: lines(['보통예금', '예수금', diff]) });
  }));
  return out;
}

export interface TrialRow { account: string; type: AccountType; debit: number; credit: number; balance: number }

const debitNormal = (type: AccountType) => type === '자산' || type === '비용';

/** Balance is shown on the account's normal side (assets/expenses: debit − credit). */
export function trialBalance(entries: JournalEntry[], types: Record<string, AccountType> = ACCOUNTS): TrialRow[] {
  const map = new Map<string, { debit: number; credit: number }>();
  entries.forEach(e => e.lines.forEach(l => {
    const r = map.get(l.account) ?? { debit: 0, credit: 0 };
    r.debit += l.debit;
    r.credit += l.credit;
    map.set(l.account, r);
  }));
  const order = Object.keys(types);
  return [...map.entries()]
    .map(([account, r]) => {
      const type = types[account] ?? '비용';
      return { account, type, ...r, balance: debitNormal(type) ? r.debit - r.credit : r.credit - r.debit };
    })
    .sort((a, b) => order.indexOf(a.account) - order.indexOf(b.account));
}

export function incomeSummary(rows: TrialRow[]) {
  const bal = (a: string) => rows.find(r => r.account === a)?.balance ?? 0;
  const sum = (pick: (r: TrialRow) => boolean) => rows.filter(pick).reduce((t, r) => t + r.balance, 0);
  const revenue = bal('매출') + bal('매출할인'); // 매출할인 carries a debit (negative) balance
  const cogs = bal('매출원가');
  const gross = revenue - cogs;
  const sga = sum(r => r.type === '비용' && r.account !== '매출원가' && r.account !== TAX_EXPENSE && !NON_OPERATING.includes(r.account));
  const operating = gross - sga;
  const other = sum(r => r.type === '수익' && r.account !== '매출' && r.account !== '매출할인') - sum(r => r.type === '비용' && NON_OPERATING.includes(r.account));
  const net = operating + other; // 법인세차감전 순이익
  const taxExpense = bal(TAX_EXPENSE);
  return { revenue, cogs, gross, sga, operating, other, net, taxExpense, after: net - taxExpense, margin: revenue ? gross / revenue : 0 };
}

/** One account's entries, oldest first, with the running balance on its normal side. */
export function accountLedger(entries: JournalEntry[], account: string, type: AccountType) {
  let running = 0;
  return [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap(e => e.lines.filter(l => l.account === account).map(l => {
      running += debitNormal(type) ? l.debit - l.credit : l.credit - l.debit;
      return { date: e.date, source: e.source, desc: e.desc, ref: e.ref, debit: l.debit, credit: l.credit, balance: running };
    }));
}

/** Which fund a line belongs to: tagged lines as tagged; untagged 보통예금 · 현금 fall to the first account of that kind. */
function lineFund(funds: Fund[], l: JournalLine) {
  if (l.fund) return l.fund;
  if (l.account === '보통예금') return funds.find(f => f.kind === '계좌')?.id;
  if (l.account === '현금') return funds.find(f => f.kind === '현금')?.id;
  return undefined;
}

/** Book balance per bank account and cash box; for cards, the charges not paid yet. */
export function fundBalances(state: ErpState, entries = journal(state)) {
  const funds = state.books.funds;
  return funds.map(f => {
    let balance = 0;
    entries.forEach(e => e.lines.forEach(l => {
      if (l.account !== fundAccount(f) || lineFund(funds, l) !== f.id) return;
      balance += f.kind === '카드' ? l.credit - l.debit : l.debit - l.credit;
    }));
    return { fund: f, balance };
  });
}
