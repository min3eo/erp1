'use client';

import { useState } from 'react';
import { FundOptions, Options, ToolbarField, bareSelect } from '@/components/books-ui';
import { useErp } from '@/components/erp-provider';
import { Field, ModalForm, Select, useAction } from '@/components/form-kit';
import { Button, Card, DataTable, Hint, PageHead, Pill, SearchInput, Tabs, Toolbar, cx } from '@/components/ui';
import { fundBalances } from '@/lib/accounting';
import { addBankTx, allAccounts, cardExpenseCandidates, fundById, isProcessed, linkCardExpense, matchBankTx, processBankTx, type BankTx } from '@/lib/books';
import { payables, receivables } from '@/lib/finance';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';

const views = ['미처리', '처리 완료', '전체'] as const;

export default function FundsPage() {
  const { state } = useErp();
  const [view, setView] = useState<(typeof views)[number]>('미처리');
  const [fund, setFund] = useState('전체');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const balances = fundBalances(state);
  const pending = state.books.bankTx.filter(t => !isProcessed(t));

  const list = state.books.bankTx
    .filter(t => (view === '전체' || (view === '미처리') === !isProcessed(t)) && (fund === '전체' || t.fund === fund) && t.desc.includes(query))
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      <PageHead
        title="계좌/카드"
        sub="통장 입출금과 법인카드 사용 내역을 모아 계정만 골라 전표로 처리해요. 처리한 내역은 바로 장부와 잔액에 반영됩니다."
        action={<Button variant="primary" onClick={() => setOpen(true)}>내역 추가</Button>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {balances.map(({ fund: f, balance }) => {
          const waiting = pending.filter(t => t.fund === f.id).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFund(fund === f.id ? '전체' : f.id)}
              aria-pressed={fund === f.id}
              className={cx('rounded-card border bg-surface p-4 text-left transition-colors', fund === f.id ? 'border-ink' : 'border-line hover:border-line-strong')}
            >
              <div className="flex items-center justify-between gap-2 text-caption text-muted">
                <span className="truncate">{f.name}</span>
                <Pill tone="neutral">{f.kind}</Pill>
              </div>
              <div className="mt-2 text-[22px] leading-tight font-medium tracking-tight">{money(balance)}</div>
              <div className="mt-1 flex justify-between text-tiny text-subtle">
                <span className="font-mono">{f.number}</span>
                <span className={waiting ? 'text-warn' : ''}>{f.kind === '카드' ? '미결제 · ' : ''}미처리 {waiting}건</span>
              </div>
            </button>
          );
        })}
      </div>

      <Card>
        <Toolbar>
          <Tabs options={views} value={view} onChange={setView} />
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarField label="계좌 · 카드">
              <select value={fund} onChange={e => setFund(e.target.value)} className={bareSelect}>
                <option value="전체">전체</option>
                <FundOptions funds={state.books.funds} />
              </select>
            </ToolbarField>
            <SearchInput value={query} onChange={setQuery} placeholder="내용 검색" />
          </div>
        </Toolbar>
        <DataTable
          headers={['일자', '계좌 · 카드', '내용', '입금 금액', '출금 금액', '계정 처리']}
          rows={list.map(t => [
            t.date,
            fundById(state, t.fund)?.name ?? t.fund,
            <strong key="d" className="font-medium text-ink">{t.desc}</strong>,
            t.amount > 0 ? <span key="i" className="text-ok">{money(t.amount)}</span> : '',
            t.amount < 0 ? money(-t.amount) : '',
            <ProcessCell key="p" tx={t} />,
          ])}
        />
      </Card>
      <Hint className="mt-4">
        입금이 미수금과 금액이 같으면 ✓로 먼저 골라 둬요. 카드 사용이 승인된 경비와 같으면 경비와 연결해 비용이 두 번 잡히지 않게 해요. 내 계좌끼리 오간 돈은 상대 계좌 · 카드를 고르세요.
      </Hint>

      <ModalForm open={open} onClose={() => setOpen(false)} title="입출금 · 카드 내역 추가" submitLabel="추가" done="내역을 추가했어요. 계정을 골라 전표로 처리하세요." run={(d, f) => addBankTx(d, { fund: f.fund, date: f.date, desc: f.desc, direction: f.direction, amount: f.amount })}>
        <Select name="fund" label="계좌 · 카드"><FundOptions funds={state.books.funds} /></Select>
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="거래일" type="date" defaultValue={date()} />
          <Select name="direction" label="구분" defaultValue="출금"><Options values={['출금', '입금']} /></Select>
        </div>
        <Field name="desc" label="적요 (가맹점 · 받는 분)" />
        <Field name="amount" label="금액 (원)" type="number" />
      </ModalForm>
    </>
  );
}

/**
 * One unprocessed line: match it to an open receivable / payable, link it to an approved card expense,
 * or book it to an account (or another own fund). Processed lines show what they became.
 */
function ProcessCell({ tx }: { tx: BankTx }) {
  const { state } = useErp();
  const act = useAction();
  const fund = fundById(state, tx.fund)!;
  const docs = fund.kind === '카드' ? [] : (tx.amount > 0 ? receivables(state) : payables(state)).filter(b => b.balance > 0);
  const exact = docs.find(b => b.balance === Math.abs(tx.amount));
  const cards = fund.kind === '카드' ? cardExpenseCandidates(state, tx) : [];
  const [vat, setVat] = useState(fund.kind === '카드');
  const [target, setTarget] = useState(exact ? 'doc:' + exact.docId : cards[0] ? 'exp:' + cards[0].id : fund.kind === '카드' ? '복리후생비' : tx.amount > 0 ? '잡이익' : '지급수수료');
  if (tx.paymentId) {
    const p = state.payments.find(x => x.id === tx.paymentId);
    return <span className="flex items-center gap-2"><Pill>처리 완료</Pill><span className="text-caption text-muted">{p?.kind} · {p?.docId}</span></span>;
  }
  if (tx.expenseId) {
    const e = state.books.expenses.find(x => x.id === tx.expenseId);
    return <span className="flex items-center gap-2"><Pill>처리 완료</Pill><span className="text-caption text-muted">경비 · {e?.person} {e?.desc}</span></span>;
  }
  if (tx.voucherId) {
    const v = state.books.vouchers.find(x => x.id === tx.voucherId);
    const line = v?.lines.find(l => l.fund !== tx.fund);
    return <span className="flex items-center gap-2"><Pill>처리 완료</Pill><span className="text-caption text-muted">{line ? (line.fund ? fundById(state, line.fund)?.name : line.account) : ''}</span></span>;
  }
  const others = state.books.funds.filter(f => f.id !== fund.id);
  const toAccount = !target.startsWith('doc:') && !target.startsWith('exp:') && !target.startsWith('fund:');
  const canSplit = toAccount && tx.amount < 0 && Math.abs(tx.amount) >= 11;
  const run = () => {
    if (target.startsWith('doc:')) return act(d => matchBankTx(d, tx.id, target.slice(4)), `${tx.amount > 0 ? '수금' : '지급'}으로 맞췄어요. 채권 · 채무에 반영됐어요.`);
    if (target.startsWith('exp:')) return act(d => linkCardExpense(d, tx.id, target.slice(4)), '경비 청구와 연결했어요. 비용은 경비 승인 때 이미 들어갔어요.');
    act(d => processBankTx(d, tx.id, target, { vat: canSplit && vat && target !== '접대비' }), canSplit && vat ? '전표로 처리했어요. 부가세 1/11은 매입세액 공제로 잡았어요.' : '전표로 처리했어요.');
  };
  return (
    // Fixed columns (method · 부가세 slot · button) so 처리 lines up at the right edge on every row.
    <span className="grid grid-cols-[12rem_6.5rem_auto] items-center gap-2">
      <select value={target} onChange={e => setTarget(e.target.value)} aria-label="처리 방법" className="h-8 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-caption">
        {docs.length > 0 && (
          <optgroup label={tx.amount > 0 ? '판매 미수금 수금' : '구매 미지급 지급'}>
            {docs.map(b => <option key={b.docId} value={'doc:' + b.docId}>{b.partner} · {b.docId} · 남은 {b.balance.toLocaleString()}{b.balance === Math.abs(tx.amount) ? ' ✓' : ''}</option>)}
          </optgroup>
        )}
        {cards.length > 0 && <optgroup label="법인카드 경비와 연결">{cards.map(e => <option key={e.id} value={'exp:' + e.id}>{e.person} · {e.desc} ✓</option>)}</optgroup>}
        <optgroup label="계정과목">{allAccounts(state).filter(a => !['보통예금', '현금', '미지급금'].includes(a)).map(a => <option key={a} value={a}>{a}</option>)}</optgroup>
        <optgroup label="내 계좌 · 카드 사이 이동">{others.map(f => <option key={f.id} value={'fund:' + f.id}>{f.name}</option>)}</optgroup>
      </select>
      {canSplit ? (
        <label className="flex items-center gap-1 text-caption whitespace-nowrap text-muted" title="과세 사업자에게 카드 · 현금영수증으로 산 것이면 부가세를 공제받아요. 접대비 · 비영업용 승용차는 불공제예요.">
          <input type="checkbox" checked={vat && target !== '접대비'} disabled={target === '접대비'} onChange={e => setVat(e.target.checked)} className="size-3.5 accent-accent" />
          부가세 공제
        </label>
      ) : <span />}
      <Button variant="primary" onClick={run} className="justify-self-end px-3">처리</Button>
    </span>
  );
}
