'use client';

import { useState } from 'react';
import { useErp } from '@/components/erp-provider';
import { useOpenForm } from '@/components/forms';
import { Button, ButtonLink, Card, CellSub, DataTable, NameCell, PageHead, Pill, SearchInput, Stat, Stats, Tabs, Toolbar, cx } from '@/components/ui';
import { AGING_BUCKETS, agingBucket, payables, receivables, type Balance } from '@/lib/finance';
import { money } from '@/lib/format';

const views = ['미수금', '미지급금', '입출금 내역'] as const;
type View = (typeof views)[number];
const bucketColor: Record<string, string> = { '기한 내': 'var(--color-ok)', '1~30일': 'var(--color-warn)', '31~60일': 'var(--color-danger)', '61일 이상': 'var(--color-danger)' };

export default function ReceivablesPage() {
  const { state } = useErp();
  const openForm = useOpenForm();
  const [view, setView] = useState<View>('미수금');
  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useState(true);

  const ar = receivables(state);
  const ap = payables(state);
  const sum = (list: Balance[]) => list.reduce((s, b) => s + b.balance, 0);
  const thisMonth = state.payments.filter(p => p.kind === '수금' && p.date.slice(0, 7) === new Date().toISOString().slice(0, 7));
  const list = (view === '미수금' ? ar : ap).filter(b => (!openOnly || b.balance > 0) && [b.partner, b.docId, b.name].join(' ').includes(query));

  // Partner totals for the side panel.
  const byPartner = Object.entries(
    (view === '미지급금' ? ap : ar).reduce<Record<string, number>>((acc, b) => ((acc[b.partner] = (acc[b.partner] ?? 0) + b.balance), acc), {}),
  ).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const agingSource = view === '미지급금' ? ap : ar;
  const aging = AGING_BUCKETS.map(k => [k, agingSource.filter(b => b.balance > 0 && agingBucket(b) === k).reduce((s, b) => s + b.balance, 0)] as const);
  const agingTotal = aging.reduce((s, [, v]) => s + v, 0);

  return (
    <>
      <PageHead title="채권 · 채무" sub="출고하면 미수금, 입고하면 미지급금이 생겨요. 결제 조건은 거래일로부터 30일, 금액은 부가세 10% 포함입니다." />
      <Stats>
        <Stat label="미수금" value={money(sum(ar))} unit="" foot={`${ar.filter(b => b.balance > 0).length}건 · 받을 돈`} tone="info" />
        <Stat label="연체 미수금" value={money(sum(ar.filter(b => b.overdueDays > 0)))} unit="" foot={`${ar.filter(b => b.overdueDays > 0).length}건 · 결제 기한 지남`} tone={ar.some(b => b.overdueDays > 0) ? 'danger' : undefined} />
        <Stat label="미지급금" value={money(sum(ap))} unit="" foot={`${ap.filter(b => b.balance > 0).length}건 · 줄 돈`} />
        <Stat label="이번 달 수금" value={money(thisMonth.reduce((s, p) => s + p.amount, 0))} unit="" foot={`${thisMonth.length}건 입금`} tone="ok" />
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
          {view === '입출금 내역' ? (
            <DataTable
              headers={['일자', '구분', '거래처', '관련 문서', '결제 수단', '금액', '메모']}
              rows={state.payments
                .filter(p => [p.partner, p.docId, p.note].join(' ').includes(query))
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
            <h2 className="mb-3 text-caption text-muted">{view === '미지급금' ? '미지급금' : '미수금'} 연령 분석</h2>
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
    </>
  );
}
