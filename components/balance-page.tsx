'use client';

import { useState } from 'react';
import { journal } from '@/lib/accounting';
import { addAdvance, otherBalances, partnerNames, settleOther } from '@/lib/books';
import { FundOptions } from './books-ui';
import { Field, ModalForm, Select, Suggestions } from './form-kit';
import { useErp } from './erp-provider';
import { useOpenForm } from './forms';
import { Button, ButtonLink, Card, CellSub, DataTable, NameCell, PageHead, Pill, SearchInput, Stat, Stats, Tabs, Toolbar, cx } from './ui';
import { AGING_BUCKETS, agingBucket, payables, receivables, type Balance } from '@/lib/finance';
import { date } from '@/lib/flow-core';
import { money } from '@/lib/format';

type View = '미수금' | '미지급금' | '입출금 내역' | '선수금' | '선급금' | '거래처 원장' | '기타 채권' | '기타 채무';
const bucketColor: Record<string, string> = { '기한 내': 'var(--color-ok)', '1~30일': 'var(--color-warn)', '31~60일': 'var(--color-danger)', '61일 이상': 'var(--color-danger)' };

/** 채권관리 (side 채권) and 채무관리 (side 채무) share this screen. */
export function BalancePage({ side }: { side: '채권' | '채무' }) {
  const main: View = side === '채권' ? '미수금' : '미지급금';
  const advKind = side === '채권' ? '선수금' : '선급금';
  const otherView: View = side === '채권' ? '기타 채권' : '기타 채무';
  const views: View[] = [main, otherView, advKind, '거래처 원장', '입출금 내역'];
  const { state } = useErp();
  const others = otherBalances(state, side);
  const [settling, setSettling] = useState<(typeof others)[number] | null>(null);
  const openForm = useOpenForm();
  const [view, setView] = useState<View>(main);
  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [adding, setAdding] = useState(false);
  const [ledgerPartner, setLedgerPartner] = useState('');

  const ar = receivables(state);
  const ap = payables(state);
  const sum = (list: Balance[]) => list.reduce((s, b) => s + b.balance, 0);
  const kind = side === '채권' ? '수금' : '지급';
  const mine = side === '채권' ? ar : ap;
  const today = date();
  const weekLater = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
  const soon = mine.filter(b => b.balance > 0 && b.overdueDays === 0 && b.due <= weekLater);
  const thisMonth = state.payments.filter(p => p.kind === kind && p.date.slice(0, 7) === today.slice(0, 7));
  const list = (main === '미수금' ? ar : ap).filter(b => (!openOnly || b.balance > 0) && [b.partner, b.docId, b.name].join(' ').includes(query));

  // Partner totals for the side panel.
  const byPartner = Object.entries(
    (main === '미지급금' ? ap : ar).reduce<Record<string, number>>((acc, b) => ((acc[b.partner] = (acc[b.partner] ?? 0) + b.balance), acc), {}),
  ).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const byPartnerAll = [...new Set((main === '미지급금' ? ap : ar).map(b => b.partner))];
  const agingSource = main === '미지급금' ? ap : ar;
  const aging = AGING_BUCKETS.map(k => [k, agingSource.filter(b => b.balance > 0 && agingBucket(b) === k).reduce((s, b) => s + b.balance, 0)] as const);
  const agingTotal = aging.reduce((s, [, v]) => s + v, 0);

  return (
    <>
      <PageHead
        action={<Button onClick={() => setAdding(true)}>{advKind} {side === '채권' ? '받기' : '주기'}</Button>}
        title={side === '채권' ? '채권관리' : '채무관리'}
        sub={side === '채권' ? '출고하면 받을 돈(미수금)이 생겨요. 거래처별 잔액과 연체를 보고 수금을 기록하세요. 결제 조건은 거래처별 설정(기본 30일), 금액은 부가세 10% 포함입니다.' : '입고하면 줄 돈(미지급금)이 생겨요. 결제 기한이 다가오는 순서로 확인하고 지급을 기록하세요. 결제 조건은 거래처별 설정(기본 30일), 금액은 부가세 10% 포함입니다.'}
      />
      <Stats>
        <Stat label={main} value={money(sum(mine))} unit="" foot={`${mine.filter(b => b.balance > 0).length}건 · ${side === '채권' ? '받을 돈' : '줄 돈'}`} tone="info" />
        <Stat label={`연체 ${main}`} value={money(sum(mine.filter(b => b.overdueDays > 0)))} unit="" foot={`${mine.filter(b => b.overdueDays > 0).length}건 · 결제 기한 지남`} tone={mine.some(b => b.overdueDays > 0) ? 'danger' : undefined} />
        <Stat label="7일 안에 기한" value={money(sum(soon))} unit="" foot={`${soon.length}건`} tone={soon.length ? 'warn' : undefined} />
        <Stat label={`이번 달 ${kind}`} value={money(thisMonth.reduce((s, p) => s + p.amount, 0))} unit="" foot={`${thisMonth.length}건`} tone="ok" />
      </Stats>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <Toolbar>
            <Tabs options={views} value={view} onChange={setView} />
            <div className="flex items-center gap-3">
              {view !== '입출금 내역' && (
                <label className="flex items-center gap-1.5 text-caption text-muted">
                  <input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} className="size-3.5 accent-accent" />
                  남은 금액만
                </label>
              )}
              <SearchInput value={query} onChange={setQuery} placeholder="거래처, 문서 번호 검색" />
            </div>
          </Toolbar>
          {view === otherView ? (
            <DataTable
              headers={['거래처', '내용', '일자', '청구 금액', side === '채권' ? '받은 금액' : '보낸 금액', '남은 금액', '처리']}
              rows={others.filter(r => (!openOnly || r.left > 0) && [r.partner, r.desc].join(' ').includes(query)).map(r => [
                <strong key="p" className="font-medium text-ink">{r.partner}</strong>, r.desc, r.date, money(r.total), money(r.paid),
                <strong key="l" className={r.left ? 'text-ink' : 'text-subtle'}>{money(r.left)}</strong>,
                r.left > 0 ? <Button key="a" variant="primary" onClick={() => setSettling(r)}>{side === '채권' ? '수금' : '지급'}</Button> : <Pill key="a">정산 완료</Pill>,
              ])}
            />
          ) : view === advKind ? (
            <DataTable
              headers={['받은 · 준 날', '거래처', '금액', '대체한 금액', '남은 금액', '메모']}
              rows={state.books.advances.filter(a => a.kind === advKind && [a.partner, a.memo].join(' ').includes(query)).map(a => [
                a.date, <strong key="p" className="font-medium text-ink">{a.partner}</strong>, money(a.amount), money(a.applied),
                <strong key="l" className={a.amount - a.applied ? 'text-ink' : 'text-subtle'}>{money(a.amount - a.applied)}</strong>, a.memo || '—',
              ])}
            />
          ) : view === '거래처 원장' ? (
            <PartnerLedger side={side} partner={ledgerPartner || byPartnerAll[0] || ''} partners={byPartnerAll} onPartner={setLedgerPartner} />
          ) : view === '입출금 내역' ? (
            <DataTable
              headers={['일자', '구분', '거래처', '관련 문서', '결제 수단', '금액', '메모']}
              rows={state.payments
                .filter(p => p.kind === (side === '채권' ? '수금' : '지급') && [p.partner, p.docId, p.note].join(' ').includes(query))
                .map(p => [
                  p.date,
                  <Pill key="k" tone={p.kind === '수금' ? 'ok' : 'info'}>{p.kind}</Pill>,
                  p.partner,
                  <span key="d" className="font-mono text-caption">{p.docId}</span>,
                  p.method,
                  <strong key="a" className={p.kind === '수금' ? 'text-ok' : 'text-ink'}>{p.kind === '수금' ? '+' : '−'}{money(p.amount)}</strong>,
                  p.note || '—',
                ])}
            />
          ) : (
            <DataTable
              headers={['거래처', view === '미수금' ? '판매 주문' : '구매 발주', '거래일 · 기한', '청구 금액', view === '미수금' ? '받은 금액' : '보낸 금액', '남은 금액', '연체', '처리']}
              rows={list.map(b => [
                <strong key="p" className="font-medium text-ink">{b.partner}</strong>,
                <NameCell key="d" name={<span className="font-mono text-caption">{b.docId}</span>} sub={b.name} />,
                <>{b.docDate}<CellSub className={b.overdueDays ? 'text-danger' : ''}>기한 {b.due}</CellSub></>,
                money(b.billed),
                money(b.settled),
                <strong key="b" className={cx(b.balance ? 'text-ink' : 'text-subtle')}>{money(b.balance)}</strong>,
                b.balance ? <Pill key="g">{agingBucket(b)}</Pill> : <Pill key="g">정산 완료</Pill>,
                <span key="a" className="flex gap-1.5">
                  {view === '미수금' && <ButtonLink href={`/print/statement/${b.docId}`}>명세서</ButtonLink>}
                  {view === '미지급금' && <ButtonLink href={`/print/order/${b.docId}`}>발주서</ButtonLink>}
                  {b.balance > 0 && <Button variant="primary" onClick={() => openForm(view === '미수금' ? 'collect' : 'pay', b.docId)}>{view === '미수금' ? '수금' : '지급'}</Button>}
                </span>,
              ])}
            />
          )}
        </Card>

        <aside className="flex flex-col gap-3">
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-3 text-caption text-muted">{main} 연령 분석</h2>
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
              {aging.map(([k, v]) => (v ? <span key={k} title={`${k} ${money(v)}`} style={{ width: `${(v / agingTotal) * 100}%`, background: bucketColor[k] }} /> : null))}
            </div>
            <ul className="mt-3 flex flex-col gap-1.5 text-caption">
              {aging.map(([k, v]) => (
                <li key={k} className="flex items-center gap-2 text-muted">
                  <i className="size-2 rounded-full" style={{ background: bucketColor[k] }} />
                  {k}
                  <strong className="ml-auto font-medium text-ink">{money(v)}</strong>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-card border border-line bg-surface p-4">
            <h2 className="mb-3 text-caption text-muted">거래처별 잔액</h2>
            {byPartner.length ? (
              <ul className="flex flex-col gap-2 text-body">
                {byPartner.map(([p, v]) => (
                  <li key={p} className="flex items-center justify-between gap-2">
                    <span className="truncate">{p}</span>
                    <strong className="shrink-0 font-medium">{money(v)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-body text-subtle">남은 금액이 없어요.</p>
            )}
          </section>
        </aside>
      </div>
      {settling && (
        <ModalForm open onClose={() => setSettling(null)} title={`${settling.partner} ${side === '채권' ? '수금' : '지급'}`} submitLabel="기록" done="정산을 기록하고 장부에 반영했어요." run={(d, f) => settleOther(d, { ref: settling.ref, amount: f.amount, fund: f.fund, date: f.date })}>
          <p className="mb-2 text-caption text-muted">{settling.desc} · 남은 금액 {money(settling.left)}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field name="amount" label="금액 (원)" type="number" defaultValue={settling.left} max={settling.left} />
            <Field name="date" label="일자" type="date" defaultValue={today} />
          </div>
          <Select name="fund" label={side === '채권' ? '받은 계좌' : '보낸 계좌 · 카드'}><FundOptions funds={state.books.funds} kinds={side === '채권' ? ['계좌', '현금'] : ['계좌', '현금', '카드']} /></Select>
        </ModalForm>
      )}
      <ModalForm open={adding} onClose={() => setAdding(false)} title={`${advKind} ${side === '채권' ? '받기' : '주기'}`} submitLabel="기록" done={`${advKind}을 기록했어요. 나중에 ${side === '채권' ? '수금' : '지급'}할 때 차감할 수 있어요.`} run={(d, f) => addAdvance(d, { kind: advKind, partner: f.partner, date: f.date, amount: f.amount, fund: f.fund, memo: f.memo })}>
        <Field name="partner" label="거래처" list="adv-partners" />
        <Suggestions id="adv-partners" values={partnerNames(state)} />
        <div className="grid grid-cols-2 gap-3">
          <Field name="date" label="일자" type="date" defaultValue={today} />
          <Field name="amount" label="금액 (원)" type="number" />
        </div>
        <Select name="fund" label={side === '채권' ? '받은 계좌' : '보낸 계좌'}><FundOptions funds={state.books.funds} kinds={['계좌', '현금']} /></Select>
        <Field name="memo" label="메모" optional placeholder="예) 계약금 30%" />
      </ModalForm>
    </>
  );
}

/** 거래처 원장: every bill, receipt and payment with one partner, with the running balance. */
function PartnerLedger({ side, partner, partners, onPartner }: { side: '채권' | '채무'; partner: string; partners: string[]; onPartner: (p: string) => void }) {
  const { state } = useErp();
  const account = side === '채권' ? '외상매출금' : '외상매입금';
  const docs = new Set((side === '채권' ? state.sales.filter(s => s.customer === partner) : state.orders.filter(o => o.vendor === partner)).map(d => d.id));
  let running = 0;
  const rows = journal(state)
    .filter(e => docs.has(e.ref) && e.lines.some(l => l.account === account))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => {
      const amt = e.lines.filter(l => l.account === account).reduce((t, l) => t + (side === '채권' ? l.debit - l.credit : l.credit - l.debit), 0);
      running += amt;
      return [e.date, e.desc, <span key="r" className="font-mono text-caption">{e.ref}</span>, amt > 0 ? money(amt) : '', amt < 0 ? money(-amt) : '', <strong key="b" className="font-medium text-ink">{money(running)}</strong>];
    });
  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-caption text-muted">
        거래처
        <select value={partner} onChange={e => onPartner(e.target.value)} className="h-8 rounded-md border border-line bg-surface px-2 text-body text-ink">{partners.map(p => <option key={p}>{p}</option>)}</select>
      </div>
      <DataTable headers={['일자', '적요', '문서', side === '채권' ? '청구 금액' : '청구 금액', side === '채권' ? '받은 금액' : '보낸 금액', '잔액']} rows={rows} />
    </>
  );
}
