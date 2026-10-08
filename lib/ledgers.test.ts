import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as A from './accounting';
import * as B from './books';
import * as M from './finance';
import * as L from './ledgers';
import { seed } from './seed';

const TODAY = '2026-10-08';

test('거래처원장: 거래처별 잔액 합계 = 채권 · 채무 계정 잔액', () => {
  for (const company of ['epure', 'other'] as const) {
    const s = seed(company);
    const entries = A.journal(s, TODAY);
    const tb = A.trialBalance(entries, B.accountTypes(s));
    const bal = (a: string) => tb.find(r => r.account === a)?.balance ?? 0;
    const balances = L.partnerBalances(entries);
    // Every 외상매출금 line comes from a sale or payment that names its customer.
    const ar = M.receivables(s);
    for (const b of ar) {
      const ledger = L.partnerLedger(entries, b.partner);
      assert.ok(ledger.rows.length > 0, `${company} ${b.partner} 원장`);
    }
    const tagged = entries.flatMap(e => e.lines.filter(l => l.account === '외상매출금' && (l.partner ?? e.partner)));
    assert.equal(tagged.reduce((t, l) => t + l.debit - l.credit, 0), bal('외상매출금'), `${company} 외상매출금은 모두 거래처가 있음`);
    const ap = entries.flatMap(e => e.lines.filter(l => l.account === '외상매입금' && (l.partner ?? e.partner)));
    assert.equal(ap.reduce((t, l) => t + l.credit - l.debit, 0), bal('외상매입금'), `${company} 외상매입금은 모두 거래처가 있음`);
    const one = balances[0];
    assert.equal(L.partnerLedger(entries, one.partner).close, one.net, '원장 기말 = 거래처 순잔액');
  }
});

test('현금출납장 · 현금흐름표: 기말 = 장부 잔액', () => {
  for (const company of ['epure', 'other'] as const) {
    const s = seed(company);
    const entries = A.journal(s, TODAY);
    const at = (to: string, accounts: string[]) => entries.filter(e => e.date <= to).reduce((t, e) => t + e.lines.filter(l => accounts.includes(l.account)).reduce((x, l) => x + l.debit - l.credit, 0), 0);
    const book = L.cashBook(entries, '2026-10-01', '2026-10-31');
    assert.equal(book.open, at('2026-09-30', ['현금']));
    assert.equal(book.close, at('2026-10-31', ['현금']));
    const cf = L.cashFlow(entries, '2026-01-01', '2026-12-31');
    assert.equal(cf.close, at('2026-12-31', ['현금', '보통예금']), `${company} 현금흐름표 기말 현금`);
    assert.ok(cf.open > 0, '기초 잔액은 흐름이 아니라 기초 현금');
    assert.equal(cf.sections.find(x => x.name === '투자활동')!.rows.some(r => r.label === '유형자산 취득'), true);
    const q = L.cashFlow(entries, '2026-10-01', '2026-10-31');
    assert.equal(q.open, at('2026-09-30', ['현금', '보통예금']));
  }
});
